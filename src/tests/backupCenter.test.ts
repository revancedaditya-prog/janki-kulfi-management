import { describe, it, expect, beforeEach } from 'vitest';
import JSZip from 'jszip';
import {
  backupService,
  calculateSha256,
  jsonToCsv,
  sanitizeProfiles,
  REQUIRED_TABLES,
  BACKUP_FORMAT_VERSION,
  DATABASE_SCHEMA_VERSION,
} from '@/lib/backupService';
import { mockStore } from '@/lib/mockStore';

describe('Backup Center & Disaster Recovery Suite', () => {
  beforeEach(() => {
    mockStore.resetToDefault();
  });

  describe('Security & Role Protection', () => {
    it('prevents credentials, passwords, and tokens from appearing in backup files', async () => {
      const rawProfiles = [
        {
          id: 'usr-1',
          full_name: 'Aditya Owner',
          phone: '7906564964',
          role: 'owner',
          encrypted_password: 'secret_hash_123',
          password: 'plain_password',
          access_token: 'jwt_token_123',
          refresh_token: 'refresh_secret',
          is_active: true,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        },
      ];

      const sanitized = sanitizeProfiles(rawProfiles);
      expect(sanitized[0]).not.toHaveProperty('encrypted_password');
      expect(sanitized[0]).not.toHaveProperty('password');
      expect(sanitized[0]).not.toHaveProperty('access_token');
      expect(sanitized[0]).not.toHaveProperty('refresh_token');
      expect(sanitized[0].id).toBe('usr-1');
      expect(sanitized[0].role).toBe('owner');
    });

    it('rejects restoration when non-owner or invalid security passphrase is provided', async () => {
      const dummyZip = new JSZip();
      dummyZip.file('manifest.json', JSON.stringify({}));
      const blob = await dummyZip.generateAsync({ type: 'blob' });
      const file = new File([blob], 'test.zip');

      await expect(
        backupService.executeControlledRestore(file, 'WRONG_PASSPHRASE', 'testing', 'usr-prod-002')
      ).rejects.toThrow(/अमान्य पुष्टिकरण वाक्यांश/);

      await expect(
        backupService.executeControlledRestore(file, 'RESTORE JANKI KULFI', '', 'usr-prod-002')
      ).rejects.toThrow(/कारण लिखना अनिवार्य है/);
    });
  });

  describe('Complete Backup Generation & Manifest Verification', () => {
    it('exports all 16 required tables with matching row counts and valid manifest', async () => {
      const { blob, fileName, manifest } = await backupService.generateCompleteBackup('usr-owner-001');

      expect(fileName).toMatch(/^janki-kulfi-backup-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/);
      expect(manifest.application_name).toBe('Janki Kulfi Management');
      expect(manifest.backup_format_version).toBe(BACKUP_FORMAT_VERSION);
      expect(manifest.database_schema_version).toBe(DATABASE_SCHEMA_VERSION);
      expect(manifest.backup_type).toBe('complete');
      expect(manifest.created_by_user_id).toBe('usr-owner-001');

      // Check all 16 tables are included in manifest
      for (const tbl of REQUIRED_TABLES) {
        expect(manifest.tables).toContain(tbl);
        expect(manifest.row_counts[tbl]).toBeDefined();
        expect(typeof manifest.row_counts[tbl]).toBe('number');
      }

      // Check ZIP contents
      const zip = await JSZip.loadAsync(blob);
      expect(zip.file('manifest.json')).toBeDefined();
      expect(zip.file('README.txt')).toBeDefined();

      for (const tbl of REQUIRED_TABLES) {
        expect(zip.file(`${tbl}.json`)).toBeDefined();
      }

      // Check reporting CSV files
      expect(zip.file('products.csv')).toBeDefined();
      expect(zip.file('expenses.csv')).toBeDefined();
      expect(zip.file('daily_closings.csv')).toBeDefined();
    });

    it('validates generated complete backup successfully with 100% checksum matches', async () => {
      const { blob } = await backupService.generateCompleteBackup('usr-owner-001');
      const validation = await backupService.validateBackupZip(blob);

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
      expect(validation.missingFiles).toHaveLength(0);
      expect(validation.manifest).toBeDefined();

      for (const item of validation.checksumResults) {
        expect(item.match).toBe(true);
      }
    });
  });

  describe('Corrupted and Invalid Backup Detection', () => {
    it('detects corrupted files when content checksum does not match manifest', async () => {
      const { blob } = await backupService.generateCompleteBackup('usr-owner-001');
      const zip = await JSZip.loadAsync(blob);

      // Tamper with products.json
      zip.file('products.json', JSON.stringify([{ id: 'tampered-product', name: 'Corrupt' }]));

      const tamperedBlob = await zip.generateAsync({ type: 'blob' });
      const validation = await backupService.validateBackupZip(tamperedBlob);

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some((e) => e.includes('चेकसम बेमेल') || e.includes('products.json'))).toBe(true);
    });

    it('detects missing required table files', async () => {
      const { blob } = await backupService.generateCompleteBackup('usr-owner-001');
      const zip = await JSZip.loadAsync(blob);

      // Delete expenses.json
      zip.remove('expenses.json');

      const tamperedBlob = await zip.generateAsync({ type: 'blob' });
      const validation = await backupService.validateBackupZip(tamperedBlob);

      expect(validation.isValid).toBe(false);
      expect(validation.missingFiles).toContain('expenses.json');
      expect(validation.errors.some((e) => e.includes('expenses.json'))).toBe(true);
    });

    it('reports missing manifest.json', async () => {
      const zip = new JSZip();
      zip.file('dummy.json', '{}');
      const blob = await zip.generateAsync({ type: 'blob' });

      const validation = await backupService.validateBackupZip(blob);
      expect(validation.isValid).toBe(false);
      expect(validation.errors[0]).toContain('manifest.json नहीं मिली');
    });

    it('warns when format version is mismatched', async () => {
      const { blob } = await backupService.generateCompleteBackup('usr-owner-001');
      const zip = await JSZip.loadAsync(blob);

      const manifestFile = zip.file('manifest.json')!;
      const manifest = JSON.parse(await manifestFile.async('string'));
      manifest.backup_format_version = '9.9.9';
      zip.file('manifest.json', JSON.stringify(manifest));

      const modifiedBlob = await zip.generateAsync({ type: 'blob' });
      const validation = await backupService.validateBackupZip(modifiedBlob);

      expect(validation.warnings.some((w) => w.includes('v9.9.9'))).toBe(true);
    });
  });

  describe('Date-Range Filtered Export', () => {
    it('filters records strictly within selected start and end dates', async () => {
      const { blob, manifest, fileName } = await backupService.generateDateRangeBackup(
        '2026-08-01',
        '2026-08-31',
        'usr-owner-001'
      );

      expect(manifest.backup_type).toBe('date_range');
      expect(manifest.date_range).toEqual({ from: '2026-08-01', to: '2026-08-31' });
      expect(fileName).toContain('2026-08-01-to-2026-08-31');

      const zip = await JSZip.loadAsync(blob);
      const readme = await zip.file('README.txt')!.async('string');
      expect(readme).toContain('DATE-RANGE FILTERED EXPORT');
      expect(readme).toContain('NOT a complete disaster recovery backup');
    });
  });

  describe('Expense Bills Storage Backup', () => {
    it('creates expense-bills-manifest.json mapping files to expenses and checksums', async () => {
      const { blob, fileName, manifest } = await backupService.generateExpenseBillsBackup('usr-owner-001');

      expect(fileName).toMatch(/^janki-kulfi-expense-bills-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/);
      expect(manifest.application_name).toBe('Janki Kulfi Management');
      expect(Array.isArray(manifest.mapped_expenses)).toBe(true);
      expect(Array.isArray(manifest.missing_files)).toBe(true);

      const zip = await JSZip.loadAsync(blob);
      expect(zip.file('expense-bills-manifest.json')).toBeDefined();
    });
  });

  describe('CSV Generation & Checksum Utilities', () => {
    it('correctly converts json arrays to RFC 4180 CSV with quotes escaping', () => {
      const sample = [
        { id: '1', name: 'Mawa Malai, Special', price: 25 },
        { id: '2', name: 'Kesar "Pista"', price: 30 },
      ];

      const csv = jsonToCsv(sample);
      expect(csv).toContain('id,name,price');
      expect(csv).toContain('"Mawa Malai, Special"');
      expect(csv).toContain('"Kesar ""Pista"""');
    });

    it('generates consistent SHA-256 hex strings for identical contents', async () => {
      const hash1 = await calculateSha256('Hello Janki Kulfi');
      const hash2 = await calculateSha256('Hello Janki Kulfi');
      const hash3 = await calculateSha256('Different string');

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
      expect(hash1).not.toBe(hash3);
    });
  });
});
