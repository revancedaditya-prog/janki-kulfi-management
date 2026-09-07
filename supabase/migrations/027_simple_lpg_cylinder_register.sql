-- ============================================================================
-- Migration 027: Simple LPG Cylinder Register & Movement Ledger
-- ============================================================================

-- 1. Extend lpg_cylinders table with simplified operational columns
ALTER TABLE public.lpg_cylinders ADD COLUMN IF NOT EXISTS current_place TEXT;
ALTER TABLE public.lpg_cylinders ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;
ALTER TABLE public.lpg_cylinders ADD COLUMN IF NOT EXISTS last_movement_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.lpg_cylinders ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

DO $$ BEGIN
  ALTER TABLE public.lpg_cylinders ALTER COLUMN tare_weight DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.lpg_cylinders ALTER COLUMN full_gross_weight DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.lpg_cylinders ALTER COLUMN current_gross_weight DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.lpg_cylinders ALTER COLUMN cylinder_type DROP NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- 2. Create lpg_cylinder_movements table for chronological movement register
CREATE TABLE IF NOT EXISTS public.lpg_cylinder_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cylinder_id UUID NOT NULL REFERENCES public.lpg_cylinders(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL CHECK (movement_type IN (
    'cylinder_added', 'connected', 'empty_removed', 'refill_sent', 'refill_received', 'correction'
  )),
  movement_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  place TEXT,
  connected_at TIMESTAMPTZ,
  empty_removed_at TIMESTAMPTZ,
  running_duration_hours NUMERIC(10,2),
  running_duration_display TEXT,
  supplier_name TEXT,
  bill_number TEXT,
  notes TEXT,
  corrected_from_movement_id UUID REFERENCES public.lpg_cylinder_movements(id) ON DELETE SET NULL,
  idempotency_key UUID UNIQUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Indexes for fast querying
CREATE INDEX IF NOT EXISTS idx_lpg_movements_cylinder_id ON public.lpg_cylinder_movements(cylinder_id);
CREATE INDEX IF NOT EXISTS idx_lpg_movements_date ON public.lpg_cylinder_movements(movement_date);
CREATE INDEX IF NOT EXISTS idx_lpg_cylinders_status ON public.lpg_cylinders(status);
CREATE INDEX IF NOT EXISTS idx_lpg_cylinders_active ON public.lpg_cylinders(is_active);

-- 4. Enable RLS on lpg_cylinder_movements
ALTER TABLE public.lpg_cylinder_movements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Public full access lpg_cylinder_movements" ON public.lpg_cylinder_movements;
  CREATE POLICY "Public full access lpg_cylinder_movements" ON public.lpg_cylinder_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
END $$;

-- 5. Seed default 4 cylinders (C-1 to C-4) only when no cylinders already exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lpg_cylinders WHERE cylinder_code IN ('C-1', 'C-2', 'C-3', 'C-4')) THEN
    -- If no cylinders exist, insert C-1 to C-4
    IF NOT EXISTS (SELECT 1 FROM public.lpg_cylinders LIMIT 1) THEN
      INSERT INTO public.lpg_cylinders (
        id, cylinder_code, status, current_place, is_active, notes, sort_order, connected_at, last_movement_at
      ) VALUES
        ('30000000-0000-0000-0000-000000000001', 'C-1', 'connected', 'भट्टी 1 (Rabri Bhatti)', true, 'Standard commercial cylinder', 1, NOW() - INTERVAL '2 days 4 hours', NOW() - INTERVAL '2 days 4 hours'),
        ('30000000-0000-0000-0000-000000000002', 'C-2', 'full', 'Kitchen Store', true, 'Backup full cylinder', 2, NULL, NOW() - INTERVAL '5 days'),
        ('30000000-0000-0000-0000-000000000003', 'C-3', 'empty', 'Empty Yard', true, 'Ready for refill', 3, NULL, NOW() - INTERVAL '1 day'),
        ('30000000-0000-0000-0000-000000000004', 'C-4', 'sent_for_refill', 'Gas Agency', true, 'Sent to agency', 4, NULL, NOW() - INTERVAL '6 hours')
      ON CONFLICT (cylinder_code) DO NOTHING;

      -- Seed initial movements
      INSERT INTO public.lpg_cylinder_movements (
        cylinder_id, movement_type, movement_date, place, notes
      ) VALUES
        ('30000000-0000-0000-0000-000000000001', 'connected', NOW() - INTERVAL '2 days 4 hours', 'भट्टी 1 (Rabri Bhatti)', 'Connected to Rabri Bhatti'),
        ('30000000-0000-0000-0000-000000000002', 'cylinder_added', NOW() - INTERVAL '5 days', 'Kitchen Store', 'Added as Full cylinder'),
        ('30000000-0000-0000-0000-000000000003', 'empty_removed', NOW() - INTERVAL '1 day', 'Empty Yard', 'Emptied and removed from burner'),
        ('30000000-0000-0000-0000-000000000004', 'refill_sent', NOW() - INTERVAL '6 hours', 'Gas Agency', 'Sent for refill')
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;

-- 6. Helper function to format running duration into clean Hindi/English text
CREATE OR REPLACE FUNCTION format_lpg_duration(p_hours NUMERIC)
RETURNS TEXT AS $$
DECLARE
  v_days INTEGER;
  v_rem_hours INTEGER;
BEGIN
  IF p_hours IS NULL OR p_hours <= 0 THEN
    RETURN '0 घंटे';
  END IF;

  v_days := FLOOR(p_hours / 24.0);
  v_rem_hours := ROUND(p_hours - (v_days * 24));

  IF v_days > 0 THEN
    IF v_rem_hours > 0 THEN
      RETURN v_days || ' दिन ' || v_rem_hours || ' घंटे';
    ELSE
      RETURN v_days || ' दिन';
    END IF;
  ELSE
    RETURN GREATEST(1, v_rem_hours) || ' घंटे';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 7. RPC 1: add_lpg_cylinder_transaction
DROP FUNCTION IF EXISTS add_lpg_cylinder_transaction(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS add_lpg_cylinder_transaction(TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION add_lpg_cylinder_transaction(
  p_cylinder_code TEXT,
  p_status TEXT DEFAULT 'full',
  p_supplier_id TEXT DEFAULT NULL,
  p_supplier_name TEXT DEFAULT NULL,
  p_place TEXT DEFAULT NULL,
  p_starting_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_clean_code TEXT;
  v_cyl_id UUID;
  v_user_uuid UUID := NULL;
  v_supplier_uuid UUID := NULL;
  v_initial_movement_type TEXT;
  v_initial_place TEXT;
  v_eff_date TIMESTAMPTZ;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  IF p_supplier_id IS NOT NULL AND p_supplier_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_supplier_uuid := p_supplier_id::UUID;
  END IF;

  v_clean_code := UPPER(TRIM(p_cylinder_code));
  IF v_clean_code IS NULL OR length(v_clean_code) < 1 THEN
    RAISE EXCEPTION 'Cylinder ID/Code is required.';
  END IF;

  v_eff_date := COALESCE(p_starting_date::TIMESTAMPTZ, NOW());

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT cylinder_id INTO v_cyl_id FROM lpg_cylinder_movements WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'cylinder_id', v_cyl_id,
        'cylinder_code', v_clean_code,
        'message', 'Cylinder already created (idempotent replay).'
      );
    END IF;
  END IF;

  -- Unique code check
  IF EXISTS (SELECT 1 FROM lpg_cylinders WHERE UPPER(TRIM(cylinder_code)) = v_clean_code) THEN
    RAISE EXCEPTION 'Cylinder code "%" already exists. Please choose a unique code.', v_clean_code;
  END IF;

  v_initial_place := COALESCE(p_place, CASE WHEN p_status = 'connected' THEN 'भट्टी 1' ELSE 'Main Store' END);

  -- 1. Insert cylinder
  INSERT INTO lpg_cylinders (
    cylinder_code, status, current_place, supplier_id, supplier_name,
    notes, is_active, connected_at, last_movement_at
  ) VALUES (
    v_clean_code,
    COALESCE(p_status, 'full'),
    v_initial_place,
    v_supplier_uuid,
    p_supplier_name,
    p_notes,
    true,
    CASE WHEN p_status = 'connected' THEN v_eff_date ELSE NULL END,
    v_eff_date
  ) RETURNING id INTO v_cyl_id;

  -- 2. Initial movement entry
  v_initial_movement_type := CASE WHEN p_status = 'connected' THEN 'connected' ELSE 'cylinder_added' END;

  INSERT INTO lpg_cylinder_movements (
    cylinder_id, movement_type, movement_date, place, supplier_name,
    notes, idempotency_key, created_by
  ) VALUES (
    v_cyl_id,
    v_initial_movement_type,
    v_eff_date,
    v_initial_place,
    p_supplier_name,
    COALESCE(p_notes, 'Initial cylinder registration'),
    p_idempotency_key,
    v_user_uuid
  );

  -- 3. Audit log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'lpg_cylinders',
    v_cyl_id,
    'ADD_LPG_CYLINDER',
    NULL,
    jsonb_build_object('id', v_cyl_id, 'code', v_clean_code, 'status', p_status),
    'New cylinder registered: ' || v_clean_code,
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'cylinder_id', v_cyl_id,
    'cylinder_code', v_clean_code,
    'status', p_status,
    'message', 'सिलेंडर सफलतापूर्वक जोड़ा गया'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RPC 2: record_lpg_cylinder_movement_transaction
DROP FUNCTION IF EXISTS record_lpg_cylinder_movement_transaction(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS record_lpg_cylinder_movement_transaction(UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION record_lpg_cylinder_movement_transaction(
  p_cylinder_id UUID,
  p_movement_type TEXT,
  p_movement_date TIMESTAMPTZ DEFAULT NOW(),
  p_movement_time TEXT DEFAULT NULL,
  p_place TEXT DEFAULT NULL,
  p_bhatti_place TEXT DEFAULT NULL,
  p_supplier_name TEXT DEFAULT NULL,
  p_bill_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_cyl RECORD;
  v_user_uuid UUID := NULL;
  v_mov_id UUID;
  v_connected_at TIMESTAMPTZ := NULL;
  v_empty_at TIMESTAMPTZ := NULL;
  v_duration_hours NUMERIC(10,2) := NULL;
  v_duration_display TEXT := NULL;
  v_target_place TEXT;
  v_new_status TEXT;
  v_eff_date TIMESTAMPTZ;
  v_input_place TEXT;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  v_eff_date := COALESCE(p_movement_date, NOW());
  v_input_place := COALESCE(p_bhatti_place, p_place);

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_mov_id FROM lpg_cylinder_movements WHERE idempotency_key = p_idempotency_key LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'movement_id', v_mov_id,
        'message', 'Movement already processed (idempotent replay).'
      );
    END IF;
  END IF;

  -- Lock cylinder record
  SELECT * INTO v_cyl FROM lpg_cylinders WHERE id = p_cylinder_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cylinder not found';
  END IF;

  IF NOT v_cyl.is_active THEN
    RAISE EXCEPTION 'Cannot record movement on an inactive/archived cylinder.';
  END IF;

  -- State Transition Rules
  IF p_movement_type = 'connected' THEN
    IF v_cyl.status = 'connected' THEN
      RAISE EXCEPTION 'Cylinder % is already connected to %.', v_cyl.cylinder_code, COALESCE(v_cyl.current_place, 'bhatti');
    END IF;

    v_new_status := 'connected';
    v_target_place := COALESCE(v_input_place, v_cyl.current_place, 'भट्टी 1');
    v_connected_at := v_eff_date;

    UPDATE lpg_cylinders
    SET status = 'connected',
        current_place = v_target_place,
        connected_at = v_eff_date,
        last_movement_at = v_eff_date,
        updated_at = NOW()
    WHERE id = p_cylinder_id;

  ELSIF p_movement_type = 'empty_removed' THEN
    v_new_status := 'empty';
    v_target_place := COALESCE(v_input_place, 'Empty Storage');
    v_empty_at := v_eff_date;
    v_connected_at := v_cyl.connected_at;

    IF v_connected_at IS NOT NULL AND v_empty_at >= v_connected_at THEN
      v_duration_hours := ROUND(EXTRACT(EPOCH FROM (v_empty_at - v_connected_at)) / 3600.0, 2);
      v_duration_display := format_lpg_duration(v_duration_hours);
    END IF;

    UPDATE lpg_cylinders
    SET status = 'empty',
        current_place = v_target_place,
        connected_at = NULL,
        last_movement_at = v_eff_date,
        updated_at = NOW()
    WHERE id = p_cylinder_id;

  ELSIF p_movement_type = 'refill_sent' THEN
    IF v_cyl.status = 'connected' THEN
      RAISE EXCEPTION 'Cannot send a connected cylinder for refill. Please mark it Empty/Removed first.';
    END IF;

    v_new_status := 'sent_for_refill';
    v_target_place := COALESCE(v_input_place, 'Gas Agency');

    UPDATE lpg_cylinders
    SET status = 'sent_for_refill',
        current_place = v_target_place,
        supplier_name = COALESCE(p_supplier_name, v_cyl.supplier_name),
        last_movement_at = v_eff_date,
        updated_at = NOW()
    WHERE id = p_cylinder_id;

  ELSIF p_movement_type = 'refill_received' THEN
    v_new_status := 'full';
    v_target_place := COALESCE(v_input_place, 'Main Store');

    UPDATE lpg_cylinders
    SET status = 'full',
        current_place = v_target_place,
        supplier_name = COALESCE(p_supplier_name, v_cyl.supplier_name),
        last_movement_at = v_eff_date,
        updated_at = NOW()
    WHERE id = p_cylinder_id;

  ELSE
    RAISE EXCEPTION 'Invalid movement type: %', p_movement_type;
  END IF;

  -- Insert movement record
  INSERT INTO lpg_cylinder_movements (
    cylinder_id, movement_type, movement_date, place,
    connected_at, empty_removed_at, running_duration_hours, running_duration_display,
    supplier_name, bill_number, notes, idempotency_key, created_by
  ) VALUES (
    p_cylinder_id,
    p_movement_type,
    v_eff_date,
    v_target_place,
    v_connected_at,
    v_empty_at,
    v_duration_hours,
    v_duration_display,
    p_supplier_name,
    p_bill_number,
    p_notes,
    p_idempotency_key,
    v_user_uuid
  ) RETURNING id INTO v_mov_id;

  -- Audit log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'lpg_cylinder_movements',
    v_mov_id,
    'LPG_MOVEMENT_' || UPPER(p_movement_type),
    jsonb_build_object('prev_status', v_cyl.status, 'prev_place', v_cyl.current_place),
    jsonb_build_object('new_status', v_new_status, 'place', v_target_place, 'duration', v_duration_display),
    COALESCE(p_notes, 'Cylinder movement: ' || p_movement_type),
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'movement_id', v_mov_id,
    'cylinder_id', p_cylinder_id,
    'cylinder_code', v_cyl.cylinder_code,
    'new_status', v_new_status,
    'running_duration_display', v_duration_display,
    'message', 'मूवमेंट सफलतापूर्वक दर्ज हुआ'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. RPC 3: correct_lpg_cylinder_movement_transaction
DROP FUNCTION IF EXISTS correct_lpg_cylinder_movement_transaction(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS correct_lpg_cylinder_movement_transaction(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION correct_lpg_cylinder_movement_transaction(
  p_movement_id UUID,
  p_reason TEXT,
  p_corrected_movement_type TEXT DEFAULT NULL,
  p_corrected_date TIMESTAMPTZ DEFAULT NULL,
  p_corrected_time TEXT DEFAULT NULL,
  p_corrected_place TEXT DEFAULT NULL,
  p_corrected_bhatti_place TEXT DEFAULT NULL,
  p_corrected_supplier_name TEXT DEFAULT NULL,
  p_corrected_bill_number TEXT DEFAULT NULL,
  p_corrected_notes TEXT DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_old_mov RECORD;
  v_cyl RECORD;
  v_user_uuid UUID := NULL;
  v_new_mov_id UUID;
  v_latest_mov RECORD;
  v_corr_place TEXT;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A valid correction reason is required (min 3 characters).';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  v_corr_place := COALESCE(p_corrected_bhatti_place, p_corrected_place);

  SELECT * INTO v_old_mov FROM lpg_cylinder_movements WHERE id = p_movement_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movement record not found';
  END IF;

  SELECT * INTO v_cyl FROM lpg_cylinders WHERE id = v_old_mov.cylinder_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Associated cylinder not found';
  END IF;

  -- 1. Insert correction movement linking to old movement
  INSERT INTO lpg_cylinder_movements (
    cylinder_id,
    movement_type,
    movement_date,
    place,
    supplier_name,
    bill_number,
    notes,
    corrected_from_movement_id,
    idempotency_key,
    created_by
  ) VALUES (
    v_old_mov.cylinder_id,
    'correction',
    COALESCE(p_corrected_date, NOW()),
    COALESCE(v_corr_place, v_old_mov.place),
    COALESCE(p_corrected_supplier_name, v_old_mov.supplier_name),
    COALESCE(p_corrected_bill_number, v_old_mov.bill_number),
    'Correction: ' || p_reason || ' | ' || COALESCE(p_corrected_notes, ''),
    p_movement_id,
    p_idempotency_key,
    v_user_uuid
  ) RETURNING id INTO v_new_mov_id;

  -- 2. Recalculate status from the latest valid non-correction movement
  SELECT * INTO v_latest_mov
  FROM lpg_cylinder_movements
  WHERE cylinder_id = v_old_mov.cylinder_id AND id <> p_movement_id
  ORDER BY movement_date DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    UPDATE lpg_cylinders
    SET status = CASE 
          WHEN v_latest_mov.movement_type = 'connected' THEN 'connected'
          WHEN v_latest_mov.movement_type = 'empty_removed' THEN 'empty'
          WHEN v_latest_mov.movement_type = 'refill_sent' THEN 'sent_for_refill'
          ELSE 'full'
        END,
        current_place = COALESCE(v_corr_place, v_latest_mov.place, 'Main Store'),
        last_movement_at = NOW(),
        updated_at = NOW()
    WHERE id = v_old_mov.cylinder_id;
  END IF;

  -- 3. Audit log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'lpg_cylinder_movements',
    v_new_mov_id,
    'CORRECT_LPG_MOVEMENT',
    row_to_json(v_old_mov)::jsonb,
    jsonb_build_object('corrected_by_id', v_new_mov_id, 'reason', p_reason),
    p_reason,
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'corrected_movement_id', v_new_mov_id,
    'old_movement_id', p_movement_id,
    'message', 'मूवमेंट सुधार दर्ज हुआ और सिलेंडर स्थिति पुनः अपडेट हुई'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. RPC 4: delete_or_archive_lpg_cylinder_transaction
DROP FUNCTION IF EXISTS delete_or_archive_lpg_cylinder_transaction(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION delete_or_archive_lpg_cylinder_transaction(
  p_cylinder_id UUID,
  p_reason TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_cyl RECORD;
  v_user_uuid UUID := NULL;
  v_op_count INTEGER;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  SELECT * INTO v_cyl FROM lpg_cylinders WHERE id = p_cylinder_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cylinder not found';
  END IF;

  -- Rule: Connected cylinder cannot be removed/archived
  IF v_cyl.status = 'connected' THEN
    RAISE EXCEPTION 'Cannot remove a connected cylinder. Please mark it Empty/Removed first before archiving.';
  END IF;

  -- Check if cylinder has operational movements beyond initial creation
  SELECT COUNT(*) INTO v_op_count 
  FROM lpg_cylinder_movements 
  WHERE cylinder_id = p_cylinder_id 
    AND movement_type NOT IN ('cylinder_added');

  IF v_op_count = 0 THEN
    -- Completely unused -> Permanent Delete
    DELETE FROM lpg_cylinder_movements WHERE cylinder_id = p_cylinder_id;
    DELETE FROM lpg_cylinders WHERE id = p_cylinder_id;

    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
    VALUES (
      'lpg_cylinders',
      p_cylinder_id,
      'DELETE_LPG_CYLINDER',
      row_to_json(v_cyl)::jsonb,
      NULL,
      COALESCE(p_reason, 'Unused cylinder permanently deleted'),
      v_user_uuid
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'deleted',
      'message', 'अउपयोगी सिलेंडर स्थायी रूप से हटाया गया (Permanently Deleted)'
    );
  ELSE
    -- Has operational history -> Archive (soft deactivate)
    UPDATE lpg_cylinders
    SET is_active = false,
        status = 'inactive',
        updated_at = NOW()
    WHERE id = p_cylinder_id;

    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
    VALUES (
      'lpg_cylinders',
      p_cylinder_id,
      'ARCHIVE_LPG_CYLINDER',
      row_to_json(v_cyl)::jsonb,
      jsonb_build_object('is_active', false, 'status', 'inactive'),
      COALESCE(p_reason, 'Cylinder archived to preserve movement history'),
      v_user_uuid
    );

    RETURN jsonb_build_object(
      'success', true,
      'action', 'archived',
      'message', 'सिलेंडर सुरक्षित रूप से संग्रहित (Archived) किया गया'
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. RPC 5: reactivate_lpg_cylinder_transaction
DROP FUNCTION IF EXISTS reactivate_lpg_cylinder_transaction(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION reactivate_lpg_cylinder_transaction(
  p_cylinder_id UUID,
  p_status TEXT DEFAULT 'full',
  p_reason TEXT DEFAULT NULL,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_cyl RECORD;
  v_user_uuid UUID := NULL;
  v_clean_status TEXT;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  v_clean_status := COALESCE(p_status, 'full');

  SELECT * INTO v_cyl FROM lpg_cylinders WHERE id = p_cylinder_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cylinder not found';
  END IF;

  UPDATE lpg_cylinders
  SET is_active = true,
      status = v_clean_status,
      updated_at = NOW()
  WHERE id = p_cylinder_id;

  INSERT INTO lpg_cylinder_movements (
    cylinder_id, movement_type, movement_date, place, notes, created_by
  ) VALUES (
    p_cylinder_id,
    'cylinder_added',
    NOW(),
    v_cyl.current_place,
    COALESCE(p_reason, 'Reactivated from archive as ' || v_clean_status),
    v_user_uuid
  );

  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'lpg_cylinders',
    p_cylinder_id,
    'REACTIVATE_LPG_CYLINDER',
    row_to_json(v_cyl)::jsonb,
    jsonb_build_object('is_active', true, 'status', v_clean_status),
    'Cylinder reactivated from archive',
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'cylinder_id', p_cylinder_id,
    'status', v_clean_status,
    'message', 'सिलेंडर पुनः सक्रिय किया गया (Reactivated)'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Permissions & Cache Reload
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

