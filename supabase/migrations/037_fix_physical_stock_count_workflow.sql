-- ============================================================================
-- Migration 037: Fix Physical Stock Count Workflow
-- Safely creates canonical physical_stock_counts and physical_stock_count_items
-- tables, constraints, indexes, RLS policies, and atomic draft / approval RPCs.
-- ============================================================================

-- 1. Canonical Table: public.physical_stock_counts
CREATE TABLE IF NOT EXISTS public.physical_stock_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_number TEXT UNIQUE NOT NULL,
  count_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected')),
  counted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  notes TEXT,
  idempotency_key UUID UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all columns exist safely if table already partially existed
ALTER TABLE public.physical_stock_counts
  ADD COLUMN IF NOT EXISTS count_number TEXT,
  ADD COLUMN IF NOT EXISTS count_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS counted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS idempotency_key UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'physical_stock_counts_status_check'
  ) THEN
    ALTER TABLE public.physical_stock_counts
      ADD CONSTRAINT physical_stock_counts_status_check CHECK (status IN ('draft', 'approved', 'rejected'));
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_physical_stock_counts_idempotency_key'
  ) THEN
    ALTER TABLE public.physical_stock_counts
      ADD CONSTRAINT uq_physical_stock_counts_idempotency_key UNIQUE (idempotency_key);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Canonical Table: public.physical_stock_count_items
CREATE TABLE IF NOT EXISTS public.physical_stock_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count_id UUID NOT NULL REFERENCES public.physical_stock_counts(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  app_stock NUMERIC(12,3) NOT NULL DEFAULT 0.000,
  physical_stock NUMERIC(12,3) NOT NULL CHECK (physical_stock >= 0),
  difference_quantity NUMERIC(12,3) NOT NULL DEFAULT 0.000,
  base_unit TEXT NOT NULL DEFAULT 'kg',
  unit_cost_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  difference_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure all columns exist safely
ALTER TABLE public.physical_stock_count_items
  ADD COLUMN IF NOT EXISTS count_id UUID REFERENCES public.physical_stock_counts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS ingredient_id UUID REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS app_stock NUMERIC(12,3) NOT NULL DEFAULT 0.000,
  ADD COLUMN IF NOT EXISTS physical_stock NUMERIC(12,3) NOT NULL DEFAULT 0.000,
  ADD COLUMN IF NOT EXISTS difference_quantity NUMERIC(12,3) NOT NULL DEFAULT 0.000,
  ADD COLUMN IF NOT EXISTS base_unit TEXT NOT NULL DEFAULT 'kg',
  ADD COLUMN IF NOT EXISTS unit_cost_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN IF NOT EXISTS difference_value NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_physical_stock_count_items_count_ingredient'
  ) THEN
    ALTER TABLE public.physical_stock_count_items
      ADD CONSTRAINT uq_physical_stock_count_items_count_ingredient UNIQUE (count_id, ingredient_id);
  END IF;
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_physical_stock_counts_date ON public.physical_stock_counts(count_date DESC);
CREATE INDEX IF NOT EXISTS idx_physical_stock_counts_status ON public.physical_stock_counts(status);
CREATE INDEX IF NOT EXISTS idx_physical_stock_counts_counted_by ON public.physical_stock_counts(counted_by);
CREATE INDEX IF NOT EXISTS idx_physical_stock_count_items_count_id ON public.physical_stock_count_items(count_id);
CREATE INDEX IF NOT EXISTS idx_physical_stock_count_items_ingredient_id ON public.physical_stock_count_items(ingredient_id);

-- 4. Row Level Security (RLS)
ALTER TABLE public.physical_stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_stock_count_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can select physical stock counts" ON public.physical_stock_counts;
DROP POLICY IF EXISTS "Owners can manage physical stock counts" ON public.physical_stock_counts;
DROP POLICY IF EXISTS "Authenticated users can select physical stock count items" ON public.physical_stock_count_items;
DROP POLICY IF EXISTS "Owners can manage physical stock count items" ON public.physical_stock_count_items;

CREATE POLICY "Authenticated users can select physical stock counts"
  ON public.physical_stock_counts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_active = true
        AND profiles.role IN ('owner', 'production_worker')
    )
  );

CREATE POLICY "Owners can manage physical stock counts"
  ON public.physical_stock_counts
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_active = true
        AND profiles.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_active = true
        AND profiles.role = 'owner'
    )
  );

CREATE POLICY "Authenticated users can select physical stock count items"
  ON public.physical_stock_count_items
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_active = true
        AND profiles.role IN ('owner', 'production_worker')
    )
  );

CREATE POLICY "Owners can manage physical stock count items"
  ON public.physical_stock_count_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_active = true
        AND profiles.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.is_active = true
        AND profiles.role = 'owner'
    )
  );

-- 5. Drop outdated / legacy function signatures to prevent ambiguity
DROP FUNCTION IF EXISTS public.create_physical_stock_count_transaction(DATE, TEXT, JSONB, UUID);
DROP FUNCTION IF EXISTS public.create_physical_stock_count_transaction(DATE, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.approve_physical_stock_count_transaction(UUID, TEXT);
DROP FUNCTION IF EXISTS public.approve_physical_stock_count_transaction(UUID, UUID);
DROP FUNCTION IF EXISTS public.approve_physical_stock_count_transaction(UUID);
DROP FUNCTION IF EXISTS public.reject_physical_stock_count_transaction(UUID, TEXT);
DROP FUNCTION IF EXISTS public.reject_physical_stock_count_transaction(UUID);

-- 6. Atomic Draft RPC: create_physical_stock_count_transaction
CREATE OR REPLACE FUNCTION public.create_physical_stock_count_transaction(
  p_count_date DATE,
  p_notes TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB,
  p_idempotency_key UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_user_uuid UUID;
  v_count_id UUID;
  v_count_number TEXT;
  v_item JSONB;
  v_ing_id UUID;
  v_ing RECORD;
  v_physical_stock NUMERIC(12,3);
  v_app_stock NUMERIC(12,3);
  v_diff_qty NUMERIC(12,3);
  v_rate NUMERIC(12,4);
  v_diff_val NUMERIC(12,2);
  v_base_unit TEXT;
  v_reason TEXT;
  v_item_id UUID;
  v_existing_id UUID := NULL;
  v_existing_number TEXT := NULL;
  v_existing_status TEXT := NULL;
  v_items_summary JSONB := '[]'::JSONB;
  v_summary_item JSONB;
BEGIN
  -- Strict search path
  SET search_path = public, extensions, pg_temp;

  -- 1. Require authenticated Owner
  v_user_uuid := auth.uid();
  IF v_user_uuid IS NULL THEN
    RAISE EXCEPTION 'Authentication required: auth.uid() is null (प्रमाणीकरण आवश्यक है)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = v_user_uuid 
      AND role = 'owner' 
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only active Owner can record physical stock count (केवल स्वामी स्टॉक सत्यापन दर्ज कर सकते हैं)';
  END IF;

  -- 2. Check idempotency: If this count was already recorded with this key, return it safely
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id, count_number, status INTO v_existing_id, v_existing_number, v_existing_status
    FROM public.physical_stock_counts
    WHERE idempotency_key = p_idempotency_key;

    IF v_existing_id IS NOT NULL THEN
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', i.id,
          'count_id', i.count_id,
          'ingredient_id', i.ingredient_id,
          'app_stock', i.app_stock,
          'physical_stock', i.physical_stock,
          'difference_quantity', i.difference_quantity,
          'base_unit', i.base_unit,
          'unit_cost_snapshot', i.unit_cost_snapshot,
          'difference_value', i.difference_value,
          'reason', i.reason
        )
      ) INTO v_items_summary
      FROM public.physical_stock_count_items i
      WHERE i.count_id = v_existing_id;

      RETURN jsonb_build_object(
        'success', true,
        'idempotent_duplicate', true,
        'count_id', v_existing_id,
        'count_number', v_existing_number,
        'status', v_existing_status,
        'items', COALESCE(v_items_summary, '[]'::JSONB),
        'message', 'स्टॉक सत्यापन पहले ही दर्ज किया जा चुका है (Idempotent replay)'
      );
    END IF;
  END IF;

  -- 3. Validate items array
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one ingredient count item is required (कम से कम एक सामग्री की गिनती आवश्यक है)';
  END IF;

  -- 4. Generate unique count number
  v_count_number := 'PSC-' || TO_CHAR(COALESCE(p_count_date, CURRENT_DATE), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
  WHILE EXISTS (SELECT 1 FROM public.physical_stock_counts WHERE count_number = v_count_number) LOOP
    v_count_number := 'PSC-' || TO_CHAR(COALESCE(p_count_date, CURRENT_DATE), 'YYYYMMDD') || '-' || LPAD(FLOOR(RANDOM() * 9000 + 1000)::TEXT, 4, '0');
  END LOOP;

  -- 5. Create the count header in draft status (leaves inventory unchanged)
  INSERT INTO public.physical_stock_counts (
    count_number,
    count_date,
    status,
    counted_by,
    notes,
    idempotency_key,
    created_at,
    updated_at
  ) VALUES (
    v_count_number,
    COALESCE(p_count_date, CURRENT_DATE),
    'draft',
    v_user_uuid,
    p_notes,
    p_idempotency_key,
    NOW(),
    NOW()
  ) RETURNING id INTO v_count_id;

  -- 6. For every submitted ingredient:
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    IF (v_item->>'ingredient_id') IS NULL OR NOT ((v_item->>'ingredient_id') ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'Invalid ingredient ID format: %', (v_item->>'ingredient_id');
    END IF;
    v_ing_id := (v_item->>'ingredient_id')::UUID;

    -- Validate ingredient exists and is active; lock the ingredient row
    SELECT * INTO v_ing 
    FROM public.ingredients 
    WHERE id = v_ing_id 
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ingredient % does not exist (सामग्री नहीं मिली)', v_ing_id;
    END IF;

    IF v_ing.is_active IS FALSE THEN
      RAISE EXCEPTION 'Ingredient % (%) is inactive (सामग्री निष्क्रिय है)', v_ing.name_hi, v_ing_id;
    END IF;

    -- Accept physical_stock
    v_physical_stock := COALESCE((v_item->>'physical_stock')::NUMERIC, 0.000);
    IF v_physical_stock < 0 THEN
      RAISE EXCEPTION 'Physical stock cannot be negative for ingredient % (%)', v_ing.name_hi, v_physical_stock;
    END IF;

    -- Calculate current app stock from SUM(raw_material_movements.quantity)
    SELECT COALESCE(SUM(quantity), 0.000) INTO v_app_stock
    FROM public.raw_material_movements
    WHERE ingredient_id = v_ing_id;

    -- Calculate difference_quantity = physical_stock - app_stock
    v_diff_qty := v_physical_stock - v_app_stock;

    -- Copy base_unit and current_rate from ingredients
    v_base_unit := COALESCE(v_ing.base_unit, 'kg');
    v_rate := COALESCE(v_ing.current_rate, 0.0000);

    -- Calculate difference_value
    v_diff_val := ROUND(v_diff_qty * v_rate, 2);

    -- Extract reason
    v_reason := NULLIF(TRIM(COALESCE(v_item->>'reason', '')), '');

    -- Insert complete count item
    INSERT INTO public.physical_stock_count_items (
      count_id,
      ingredient_id,
      app_stock,
      physical_stock,
      difference_quantity,
      base_unit,
      unit_cost_snapshot,
      difference_value,
      reason,
      created_at
    ) VALUES (
      v_count_id,
      v_ing_id,
      v_app_stock,
      v_physical_stock,
      v_diff_qty,
      v_base_unit,
      v_rate,
      v_diff_val,
      v_reason,
      NOW()
    ) RETURNING id INTO v_item_id;

    v_summary_item := jsonb_build_object(
      'id', v_item_id,
      'count_id', v_count_id,
      'ingredient_id', v_ing_id,
      'ingredient_name_hi', v_ing.name_hi,
      'ingredient_name_en', v_ing.name_en,
      'app_stock', v_app_stock,
      'physical_stock', v_physical_stock,
      'difference_quantity', v_diff_qty,
      'base_unit', v_base_unit,
      'unit_cost_snapshot', v_rate,
      'difference_value', v_diff_val,
      'reason', v_reason
    );

    v_items_summary := v_items_summary || jsonb_build_array(v_summary_item);
  END LOOP;

  -- 7. Record audit log
  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    reason,
    performed_by
  ) VALUES (
    'physical_stock_counts',
    v_count_id,
    'CREATE_PHYSICAL_COUNT_DRAFT',
    NULL,
    jsonb_build_object(
      'count_number', v_count_number,
      'count_date', COALESCE(p_count_date, CURRENT_DATE),
      'status', 'draft',
      'item_count', jsonb_array_length(p_items)
    ),
    'Created draft physical stock count ' || v_count_number,
    v_user_uuid
  );

  -- 8. Return count ID, count number and item summary
  RETURN jsonb_build_object(
    'success', true,
    'count_id', v_count_id,
    'count_number', v_count_number,
    'status', 'draft',
    'items', v_items_summary,
    'message', 'ड्राफ्ट भौतिक स्टॉक सत्यापन सफलतापूर्वक सहेजा गया'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Correct Approval RPC: approve_physical_stock_count_transaction
CREATE OR REPLACE FUNCTION public.approve_physical_stock_count_transaction(
  p_count_id UUID,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_user_uuid UUID;
  v_count RECORD;
  v_item RECORD;
  v_ing RECORD;
  v_live_balance NUMERIC(12,3);
  v_correction NUMERIC(12,3);
  v_rate NUMERIC(12,4);
  v_total_cost NUMERIC(12,2);
  v_movements_created INT := 0;
  v_items_summary JSONB := '[]'::JSONB;
BEGIN
  -- Strict search path
  SET search_path = public, extensions, pg_temp;

  -- 1. Require authenticated Owner
  v_user_uuid := auth.uid();
  IF v_user_uuid IS NULL THEN
    RAISE EXCEPTION 'Authentication required: auth.uid() is null (प्रमाणीकरण आवश्यक है)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = v_user_uuid 
      AND role = 'owner' 
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only active Owner can approve physical stock count (केवल स्वामी स्टॉक सत्यापन स्वीकृत कर सकते हैं)';
  END IF;

  -- 2. Lock the count header
  SELECT * INTO v_count 
  FROM public.physical_stock_counts 
  WHERE id = p_count_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Physical stock count record not found (स्टॉक सत्यापन रिकॉर्ड नहीं मिला)';
  END IF;

  -- 3. Return success without duplicating movements if already approved
  IF v_count.status = 'approved' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_approved', true,
      'count_id', p_count_id,
      'count_number', v_count.count_number,
      'status', 'approved',
      'message', 'स्टॉक सत्यापन पहले ही स्वीकृत हो चुका है (Already approved)'
    );
  END IF;

  -- 4. Refuse rejected counts
  IF v_count.status = 'rejected' THEN
    RAISE EXCEPTION 'Cannot approve rejected stock count % (अस्वीकृत स्टॉक गणना को स्वीकृत नहीं किया जा सकता)', v_count.count_number;
  END IF;

  -- 5. Lock item rows and apply corrections
  FOR v_item IN 
    SELECT * FROM public.physical_stock_count_items 
    WHERE count_id = p_count_id 
    FOR UPDATE
  LOOP
    -- Lock ingredient row
    SELECT * INTO v_ing 
    FROM public.ingredients 
    WHERE id = v_item.ingredient_id 
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Ingredient % not found for count item', v_item.ingredient_id;
    END IF;

    -- Recalculate live app balance for each ingredient
    SELECT COALESCE(SUM(quantity), 0.000) INTO v_live_balance
    FROM public.raw_material_movements
    WHERE ingredient_id = v_item.ingredient_id;

    -- Calculate correction as physical_stock minus current live balance
    v_correction := v_item.physical_stock - v_live_balance;

    -- Snapshot rate
    v_rate := COALESCE(v_ing.current_rate, v_item.unit_cost_snapshot, 0.0000);

    -- Update item row with live app_stock and latest difference at approval time
    UPDATE public.physical_stock_count_items
    SET app_stock = v_live_balance,
        difference_quantity = v_correction,
        unit_cost_snapshot = v_rate,
        difference_value = ROUND(v_correction * v_rate, 2)
    WHERE id = v_item.id;

    -- Create exactly one signed raw_material_movements entry per non-zero correction
    IF v_correction <> 0 THEN
      v_total_cost := ROUND(ABS(v_correction) * v_rate, 2);

      INSERT INTO public.raw_material_movements (
        ingredient_id,
        movement_date,
        source_location,
        destination_location,
        quantity,
        base_unit,
        movement_type,
        reference_table,
        reference_id,
        unit_cost_snapshot,
        total_value_snapshot,
        reason,
        performed_by,
        created_by,
        created_at
      ) VALUES (
        v_item.ingredient_id,
        NOW(),
        CASE WHEN v_correction > 0 THEN 'Physical Stock Count Surplus' ELSE COALESCE(v_ing.storage_location, 'Main Raw Material Store') END,
        CASE WHEN v_correction > 0 THEN COALESCE(v_ing.storage_location, 'Main Raw Material Store') ELSE 'Physical Stock Count Deficit' END,
        v_correction, -- Signed: positive for surplus, negative for deficit
        COALESCE(v_item.base_unit, v_ing.base_unit, 'kg'),
        'physical_count_correction',
        'physical_stock_counts',
        p_count_id,
        v_rate,
        v_total_cost,
        'Physical count correction for ' || v_count.count_number || CASE WHEN v_item.reason IS NOT NULL AND TRIM(v_item.reason) <> '' THEN ': ' || TRIM(v_item.reason) ELSE '' END,
        v_user_uuid,
        v_user_uuid,
        NOW()
      );

      v_movements_created := v_movements_created + 1;
    END IF;

    v_items_summary := v_items_summary || jsonb_build_array(
      jsonb_build_object(
        'ingredient_id', v_item.ingredient_id,
        'physical_stock', v_item.physical_stock,
        'app_stock_at_approval', v_live_balance,
        'correction_applied', v_correction
      )
    );
  END LOOP;

  -- 6. Mark the count approved only after every movement succeeds
  UPDATE public.physical_stock_counts
  SET status = 'approved',
      approved_by = v_user_uuid,
      approved_at = NOW(),
      updated_at = NOW(),
      notes = CASE 
        WHEN p_notes IS NOT NULL AND TRIM(p_notes) <> '' 
        THEN COALESCE(notes || E'\n[Approval Note]: ' || TRIM(p_notes), TRIM(p_notes))
        ELSE notes 
      END
  WHERE id = p_count_id;

  -- 7. Record audit_logs using audit_logs.performed_by
  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    reason,
    performed_by
  ) VALUES (
    'physical_stock_counts',
    p_count_id,
    'APPROVE_PHYSICAL_COUNT',
    row_to_json(v_count)::jsonb,
    jsonb_build_object(
      'status', 'approved',
      'approved_by', v_user_uuid,
      'approved_at', NOW(),
      'corrections_applied', v_movements_created,
      'items', v_items_summary
    ),
    'Approved physical stock count ' || v_count.count_number || ' with ' || v_movements_created || ' ledger corrections',
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'count_id', p_count_id,
    'count_number', v_count.count_number,
    'status', 'approved',
    'corrections_applied', v_movements_created,
    'message', 'भौतिक स्टॉक सत्यापन स्वीकृत हो गया व लेजर में सुधार दर्ज हो गया'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Reject RPC: reject_physical_stock_count_transaction
CREATE OR REPLACE FUNCTION public.reject_physical_stock_count_transaction(
  p_count_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_user_uuid UUID;
  v_count RECORD;
BEGIN
  -- Strict search path
  SET search_path = public, extensions, pg_temp;

  -- 1. Require authenticated Owner
  v_user_uuid := auth.uid();
  IF v_user_uuid IS NULL THEN
    RAISE EXCEPTION 'Authentication required: auth.uid() is null (प्रमाणीकरण आवश्यक है)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = v_user_uuid 
      AND role = 'owner' 
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Only active Owner can reject physical stock count (केवल स्वामी स्टॉक सत्यापन अस्वीकृत कर सकते हैं)';
  END IF;

  -- 2. Lock count header
  SELECT * INTO v_count 
  FROM public.physical_stock_counts 
  WHERE id = p_count_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Physical stock count record not found (स्टॉक सत्यापन रिकॉर्ड नहीं मिला)';
  END IF;

  IF v_count.status = 'approved' THEN
    RAISE EXCEPTION 'Cannot reject an already approved physical stock count % (स्वीकृत स्टॉक गणना को अस्वीकृत नहीं किया जा सकता)', v_count.count_number;
  END IF;

  -- 3. Update status to rejected
  UPDATE public.physical_stock_counts
  SET status = 'rejected',
      updated_at = NOW(),
      notes = CASE 
        WHEN p_reason IS NOT NULL AND TRIM(p_reason) <> '' 
        THEN COALESCE(notes || E'\n[Rejection Reason]: ' || TRIM(p_reason), TRIM(p_reason))
        ELSE notes 
      END
  WHERE id = p_count_id;

  -- 4. Record audit log
  INSERT INTO public.audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    reason,
    performed_by
  ) VALUES (
    'physical_stock_counts',
    p_count_id,
    'REJECT_PHYSICAL_COUNT',
    row_to_json(v_count)::jsonb,
    jsonb_build_object(
      'status', 'rejected',
      'rejected_by', v_user_uuid,
      'rejection_reason', p_reason
    ),
    'Rejected physical stock count ' || v_count.count_number || COALESCE(': ' || p_reason, ''),
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'count_id', p_count_id,
    'count_number', v_count.count_number,
    'status', 'rejected',
    'message', 'स्टॉक सत्यापन अस्वीकृत कर दिया गया'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Grants & PostgREST Schema Reload
GRANT SELECT, INSERT, UPDATE, DELETE ON public.physical_stock_counts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.physical_stock_count_items TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_physical_stock_count_transaction(DATE, TEXT, JSONB, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_physical_stock_count_transaction(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_physical_stock_count_transaction(UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
