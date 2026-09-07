import { describe, it, expect, beforeEach } from 'vitest';
import { mockStore } from '../lib/mockStore';
import { formatLpgDuration } from '../lib/formatters';
import { api } from '../lib/api';

describe('Simple LPG Cylinder Register System Tests', () => {
  beforeEach(() => {
    (mockStore as any).loadState();
  });

  it('1. C-1 to C-4 are seeded by default and are not duplicated', () => {
    const cylinders = mockStore.getSimpleLpgCylinders(true);
    expect(cylinders.length).toBeGreaterThanOrEqual(4);

    const codes = cylinders.map((c) => c.cylinder_code);
    expect(codes).toContain('C-1');
    expect(codes).toContain('C-2');
    expect(codes).toContain('C-3');
    expect(codes).toContain('C-4');

    // Verify uniqueness of seeded cylinder codes
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('2. Owner can add C-5 with continuing sequence', () => {
    const c5Code = `C-5-TEST-${Date.now().toString().slice(-4)}`;
    const added = mockStore.addSimpleLpgCylinder(
      {
        cylinder_code: c5Code,
        status: 'full',
        supplier_name: 'Bharat Gas Agency',
        starting_date: '2026-09-01',
        notes: 'Added extra cylinder for festival rush',
      },
      'usr-owner-001'
    );

    expect(added.cylinder.cylinder_code).toBe(c5Code);
    expect(added.cylinder.status).toBe('full');
    expect(added.movement.movement_type).toBe('cylinder_added');

    const found = mockStore.getSimpleLpgCylinderById(added.cylinder.id);
    expect(found).toBeDefined();
    expect(found?.cylinder_code).toBe(c5Code);
  });

  it('3. Duplicate cylinder code is rejected', () => {
    expect(() => {
      mockStore.addSimpleLpgCylinder(
        {
          cylinder_code: 'C-1', // Already exists
          status: 'full',
        },
        'usr-owner-001'
      );
    }).toThrow(/already exists|पहले से मौजूद है/i);
  });

  it('4. Full cylinder can be connected to a bhatti', () => {
    // Find or create a full cylinder
    let fullCyl = mockStore.getSimpleLpgCylinders().find((c) => c.status === 'full');
    if (!fullCyl) {
      const added = mockStore.addSimpleLpgCylinder(
        { cylinder_code: `C-TEST-FULL-${Date.now()}`, status: 'full' },
        'usr-owner-001'
      );
      fullCyl = added.cylinder;
    }

    const result = mockStore.recordSimpleLpgMovement(
      {
        cylinder_id: fullCyl.id,
        movement_type: 'connected',
        movement_date: '2026-09-05',
        movement_time: '08:00',
        bhatti_place: 'Kulfi Bhatti 1',
        notes: 'Connected for morning production',
      },
      'usr-owner-001'
    );

    expect(result.cylinder.status).toBe('connected');
    expect(result.cylinder.current_place).toBe('Kulfi Bhatti 1');
    expect(result.cylinder.connected_at).toBeDefined();
    expect(result.movement.movement_type).toBe('connected');
  });

  it('5. Connected cylinder cannot connect again (blocked transition)', () => {
    const connectedCyl = mockStore.getSimpleLpgCylinders().find((c) => c.status === 'connected' || c.status === 'in_use');
    expect(connectedCyl).toBeDefined();

    if (connectedCyl) {
      expect(() => {
        mockStore.recordSimpleLpgMovement(
          {
            cylinder_id: connectedCyl.id,
            movement_type: 'connected',
            movement_date: '2026-09-06',
            movement_time: '10:00',
            bhatti_place: 'Kulfi Bhatti 2',
          },
          'usr-owner-001'
        );
      }).toThrow(/Only Full cylinders can be connected|केवल भरा हुआ|already connected/i);
    }
  });

  it('6. Empty/Removed time automatically calculates running duration', () => {
    // Add a fresh cylinder for duration test
    const testCode = `C-DUR-${Date.now().toString().slice(-4)}`;
    const added = mockStore.addSimpleLpgCylinder(
      { cylinder_code: testCode, status: 'full' },
      'usr-owner-001'
    );

    // Connect it on 2026-09-01 08:00
    mockStore.recordSimpleLpgMovement(
      {
        cylinder_id: added.cylinder.id,
        movement_type: 'connected',
        movement_date: '2026-09-01',
        movement_time: '08:00',
        bhatti_place: 'Kulfi Bhatti 1',
      },
      'usr-owner-001'
    );

    // Mark it empty on 2026-09-05 14:00 (4 days + 6 hours = 6120 minutes)
    const emptyRes = mockStore.recordSimpleLpgMovement(
      {
        cylinder_id: added.cylinder.id,
        movement_type: 'empty_removed',
        movement_date: '2026-09-05',
        movement_time: '14:00',
        notes: 'Gas finished during evening batch',
      },
      'usr-owner-001'
    );

    expect(emptyRes.cylinder.status).toBe('empty');
    expect(emptyRes.cylinder.connected_at).toBeNull(); // reset
    expect(emptyRes.movement.running_duration_minutes).toBe(6120);
    expect(emptyRes.movement.running_duration_display).toContain('4 दिन');
    expect(emptyRes.movement.running_duration_display).toContain('6 घंटे');
  });

  it('7. Connected cylinder cannot be removed or archived', () => {
    const connectedCyl = mockStore.getSimpleLpgCylinders().find((c) => c.status === 'connected' || c.status === 'in_use');
    expect(connectedCyl).toBeDefined();

    if (connectedCyl) {
      expect(() => {
        mockStore.deleteOrArchiveSimpleLpgCylinder(
          {
            cylinder_id: connectedCyl.id,
            reason: 'Try to delete connected',
          },
          'usr-owner-001'
        );
      }).toThrow(/connected|भट्टी पर लगा/i);
    }
  });

  it('8. Unused cylinder with no operational movements can be permanently deleted', () => {
    const tempCode = `C-UNUSED-${Date.now().toString().slice(-4)}`;
    const added = mockStore.addSimpleLpgCylinder(
      { cylinder_code: tempCode, status: 'full' },
      'usr-owner-001'
    );

    const deleteRes = mockStore.deleteOrArchiveSimpleLpgCylinder(
      {
        cylinder_id: added.cylinder.id,
        reason: 'Duplicate mistakenly added',
      },
      'usr-owner-001'
    );

    expect(deleteRes.deleted).toBe(true);
    expect(deleteRes.archived).toBe(false);

    const check = mockStore.getSimpleLpgCylinderById(added.cylinder.id);
    expect(check).toBeUndefined();
  });

  it('9. Used cylinder with operational history is safely archived instead of deleted', () => {
    const usedCode = `C-USED-${Date.now().toString().slice(-4)}`;
    const added = mockStore.addSimpleLpgCylinder(
      { cylinder_code: usedCode, status: 'full' },
      'usr-owner-001'
    );

    // Add operational movements
    mockStore.recordSimpleLpgMovement(
      {
        cylinder_id: added.cylinder.id,
        movement_type: 'connected',
        movement_date: '2026-08-01',
        movement_time: '08:00',
        bhatti_place: 'Kulfi Bhatti 1',
      },
      'usr-owner-001'
    );
    mockStore.recordSimpleLpgMovement(
      {
        cylinder_id: added.cylinder.id,
        movement_type: 'empty_removed',
        movement_date: '2026-08-05',
        movement_time: '12:00',
      },
      'usr-owner-001'
    );

    const archiveRes = mockStore.deleteOrArchiveSimpleLpgCylinder(
      {
        cylinder_id: added.cylinder.id,
        reason: 'Old damaged cylinder replaced',
      },
      'usr-owner-001'
    );

    expect(archiveRes.deleted).toBe(false);
    expect(archiveRes.archived).toBe(true);

    const cyl = mockStore.getSimpleLpgCylinderById(added.cylinder.id);
    expect(cyl).toBeDefined();
    expect(cyl?.is_active).toBe(false);
    expect(cyl?.status).toBe('inactive');

    // 10. Verify history remains visible
    const movements = mockStore.getSimpleLpgMovements(added.cylinder.id);
    expect(movements.length).toBeGreaterThanOrEqual(3); // cylinder_added, connected, empty_removed, archived
    expect(movements.some((m) => m.movement_type === 'archived')).toBe(true);
  });

  it('11. Archived cylinder can be reactivated by Owner', () => {
    // Ensure we have an inactive cylinder
    let inactiveCyl = mockStore.getSimpleLpgCylinders(true).find((c) => c.status === 'inactive' || c.is_active === false);
    if (!inactiveCyl) {
      const added = mockStore.addSimpleLpgCylinder(
        { cylinder_code: `C-TO-ARCH-${Date.now().toString().slice(-4)}`, status: 'empty' },
        'usr-owner-001'
      );
      // Give it an operational movement so it archives
      mockStore.recordSimpleLpgMovement(
        { cylinder_id: added.cylinder.id, movement_type: 'refill_sent' },
        'usr-owner-001'
      );
      mockStore.deleteOrArchiveSimpleLpgCylinder(
        { cylinder_id: added.cylinder.id, reason: 'Archiving for test' },
        'usr-owner-001'
      );
      inactiveCyl = mockStore.getSimpleLpgCylinderById(added.cylinder.id);
    }

    expect(inactiveCyl).toBeDefined();

    if (inactiveCyl) {
      const reactivated = mockStore.reactivateSimpleLpgCylinder(
        inactiveCyl.id,
        'Brought back into rotation',
        'usr-owner-001'
      );

      expect(reactivated.cylinder.is_active).toBe(true);
      expect(reactivated.cylinder.status).toBe('empty');

      const movs = mockStore.getSimpleLpgMovements(inactiveCyl.id);
      expect(movs.some((m) => m.movement_type === 'reactivated')).toBe(true);
    }
  });

  it('12. Wrong movement is corrected with history and audit preserved', () => {
    const testCode = `C-CORR-${Date.now().toString().slice(-4)}`;
    const added = mockStore.addSimpleLpgCylinder(
      { cylinder_code: testCode, status: 'full' },
      'usr-owner-001'
    );

    const mov = mockStore.recordSimpleLpgMovement(
      {
        cylinder_id: added.cylinder.id,
        movement_type: 'connected',
        movement_date: '2026-09-02',
        movement_time: '09:00',
        bhatti_place: 'Wrong Bhatti Place',
      },
      'usr-owner-001'
    );

    const corrRes = mockStore.correctSimpleLpgMovement(
      {
        movement_id: mov.movement.id,
        reason: 'Corrected place to Kulfi Bhatti 2',
        corrected_movement_type: 'connected',
        corrected_date: '2026-09-02',
        corrected_time: '09:00',
        corrected_bhatti_place: 'Kulfi Bhatti 2',
        corrected_notes: 'Correction done',
      },
      'usr-owner-001'
    );

    expect(corrRes.correction_movement.movement_type).toBe('correction');
    expect(corrRes.cylinder.current_place).toBe('Kulfi Bhatti 2');

    // Ensure original movement is still preserved
    const allMovs = mockStore.getSimpleLpgMovements(added.cylinder.id);
    expect(allMovs.some((m) => m.id === mov.movement.id)).toBe(true);
    expect(allMovs.some((m) => m.movement_type === 'correction')).toBe(true);
  });

  it('13. Duration formatting utility handles various intervals accurately', () => {
    expect(formatLpgDuration(null)).toBeNull();
    expect(formatLpgDuration(0)).toBe('0 मिनट');
    expect(formatLpgDuration(45)).toBe('45 मिनट');
    expect(formatLpgDuration(60)).toBe('1 घंटे');
    expect(formatLpgDuration(90)).toBe('1 घंटे 30 मिनट');
    expect(formatLpgDuration(1440)).toBe('1 दिन');
    expect(formatLpgDuration(6120)).toBe('4 दिन 6 घंटे');
  });

  it('14. Full lifecycle workflow: Add -> Connect -> Empty -> Send Refill -> Receive Full', () => {
    const cycleCode = `C-CYCLE-${Date.now().toString().slice(-4)}`;
    
    // 1. Add
    const added = mockStore.addSimpleLpgCylinder(
      { cylinder_code: cycleCode, status: 'full', supplier_name: 'Bharat Gas Agency' },
      'usr-owner-001'
    );
    expect(added.cylinder.status).toBe('full');

    // 2. Connect
    const conn = mockStore.recordSimpleLpgMovement(
      {
        cylinder_id: added.cylinder.id,
        movement_type: 'connected',
        movement_date: '2026-09-01',
        movement_time: '06:00',
        bhatti_place: 'Kulfi Bhatti 1',
      },
      'usr-owner-001'
    );
    expect(conn.cylinder.status).toBe('connected');

    // 3. Mark Empty (Sept 1 06:00 to Sept 4 18:00 = 84 hours = 5040 minutes)
    const emp = mockStore.recordSimpleLpgMovement(
      {
        cylinder_id: added.cylinder.id,
        movement_type: 'empty_removed',
        movement_date: '2026-09-04',
        movement_time: '18:00',
      },
      'usr-owner-001'
    );
    expect(emp.cylinder.status).toBe('empty');
    expect(emp.movement.running_duration_minutes).toBe(5040);

    // 4. Send for Refill
    const refillSent = mockStore.recordSimpleLpgMovement(
      {
        cylinder_id: added.cylinder.id,
        movement_type: 'refill_sent',
        movement_date: '2026-09-05',
        supplier_name: 'Bharat Gas Agency',
        bill_number: 'CHALLAN-901',
      },
      'usr-owner-001'
    );
    expect(refillSent.cylinder.status).toBe('sent_for_refill');

    // 5. Receive Full
    const refillRcv = mockStore.recordSimpleLpgMovement(
      {
        cylinder_id: added.cylinder.id,
        movement_type: 'refill_received',
        movement_date: '2026-09-07',
        supplier_name: 'Bharat Gas Agency',
        bill_number: 'INV-4820',
        notes: 'Full cylinder returned',
      },
      'usr-owner-001'
    );
    expect(refillRcv.cylinder.status).toBe('full');
  });

  it('15. Summary KPIs calculate correct counts for each status', () => {
    const kpis = mockStore.getLpgSummaryKPIs();
    expect(kpis.totalActive).toBeGreaterThanOrEqual(4);
    expect(kpis.full! + kpis.connected! + kpis.empty! + kpis.sentForRefill!).toBe(kpis.totalActive);
  });

  it('16. Complete lifecycle via api Service: Add -> Connect -> Empty (auto duration) -> Refill -> Archive -> Reactivate', async () => {
    const code = `C-SVC-${Date.now().toString().slice(-4)}`;

    // 1. Add cylinder
    const addRes = await api.addSimpleLpgCylinder(
      {
        cylinder_code: code,
        status: 'full',
        supplier_name: 'Bharat Gas Agency',
        starting_date: '2026-09-01',
      },
      'usr-owner-001'
    );
    expect(addRes.success).toBe(true);
    expect(addRes.cylinder.cylinder_code).toBe(code);
    expect(addRes.cylinder.status).toBe('full');

    const cylId = addRes.cylinder.id;

    // 2. Connect to Kulfi Bhatti
    const connRes = await api.recordSimpleLpgMovement(
      {
        cylinder_id: cylId,
        movement_type: 'connected',
        movement_date: '2026-09-02',
        movement_time: '07:00',
        bhatti_place: 'Kulfi Bhatti 1',
        notes: 'Connected for batch',
      },
      'usr-owner-001'
    );
    expect(connRes.cylinder.status).toBe('connected');
    expect(connRes.cylinder.current_place).toBe('Kulfi Bhatti 1');

    // 3. Mark Empty/Removed (Auto Duration Calculation: Sept 2 07:00 to Sept 6 13:00 = 4 days 6 hours)
    const empRes = await api.recordSimpleLpgMovement(
      {
        cylinder_id: cylId,
        movement_type: 'empty_removed',
        movement_date: '2026-09-06',
        movement_time: '13:00',
        notes: 'Empty and removed',
      },
      'usr-owner-001'
    );
    expect(empRes.cylinder.status).toBe('empty');
    expect(empRes.movement.running_duration_minutes).toBe(6120);

    // 4. Send for Refill
    const sentRes = await api.recordSimpleLpgMovement(
      {
        cylinder_id: cylId,
        movement_type: 'refill_sent',
        movement_date: '2026-09-06',
        supplier_name: 'Bharat Gas Agency',
        bill_number: 'CH-9921',
      },
      'usr-owner-001'
    );
    expect(sentRes.cylinder.status).toBe('sent_for_refill');

    // 5. Receive Full
    const rcvRes = await api.recordSimpleLpgMovement(
      {
        cylinder_id: cylId,
        movement_type: 'refill_received',
        movement_date: '2026-09-07',
        supplier_name: 'Bharat Gas Agency',
        bill_number: 'INV-3829',
        notes: 'Full cylinder returned',
      },
      'usr-owner-001'
    );
    expect(rcvRes.cylinder.status).toBe('full');

    // 6. Safe Archive used cylinder
    const archRes = await api.deleteOrArchiveSimpleLpgCylinder(
      {
        cylinder_id: cylId,
        reason: 'Rotated out of season',
      },
      'usr-owner-001'
    );
    expect(archRes.success).toBe(true);
    expect(archRes.action).toBe('archived');

    // 7. Reactivate cylinder
    const reactRes = await api.reactivateSimpleLpgCylinder(
      {
        cylinder_id: cylId,
        reason: 'Restored to production line',
      },
      'usr-owner-001'
    );
    expect(reactRes.success).toBe(true);
    expect(reactRes.cylinder.status).toBe('empty');
    expect(reactRes.cylinder.is_active).toBe(true);
  });

  it('17. Correct movement preserving history via api Service', async () => {
    const code = `C-CORR-SVC-${Date.now().toString().slice(-4)}`;
    const addRes = await api.addSimpleLpgCylinder({ cylinder_code: code, status: 'full' }, 'usr-owner-001');
    const connRes = await api.recordSimpleLpgMovement(
      {
        cylinder_id: addRes.cylinder.id,
        movement_type: 'connected',
        movement_date: '2026-09-03',
        bhatti_place: 'Old Bhatti',
      },
      'usr-owner-001'
    );

    const corrRes = await api.correctSimpleLpgMovement(
      {
        movement_id: connRes.movement.id,
        reason: 'Wrong bhatti selected',
        corrected_movement_type: 'connected',
        corrected_bhatti_place: 'Rabdi Bhatti',
      },
      'usr-owner-001'
    );

    expect(corrRes.success).toBe(true);
    expect(corrRes.correction_movement.movement_type).toBe('correction');
    expect(corrRes.cylinder.current_place).toBe('Rabdi Bhatti');

    const movs = await api.getSimpleLpgMovements(addRes.cylinder.id);
    expect(movs.length).toBeGreaterThanOrEqual(3); // cylinder_added, connected, correction
  });

  it('18. isRpcMissingError correctly detects PGRST202 and missing schema cache errors', async () => {
    const { isRpcMissingError } = await import('../lib/api');
    expect(isRpcMissingError({ code: 'PGRST202', message: 'Could not find the function public.add_lpg_cylinder_transaction in the schema cache' })).toBe(true);
    expect(isRpcMissingError({ code: '42883', message: 'function does not exist' })).toBe(true);
    expect(isRpcMissingError(new Error('Could not find the function public.add_lpg_cylinder_transaction(...) in the schema cache'))).toBe(true);
    expect(isRpcMissingError({ code: '23505', message: 'duplicate key value' })).toBe(false);
    expect(isRpcMissingError(null)).toBe(false);
  });
});
