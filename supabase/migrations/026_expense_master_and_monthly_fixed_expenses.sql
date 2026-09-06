-- ============================================================================
-- Migration 026: Expense Master & Monthly Fixed Expense System
-- ============================================================================

-- 1. Create Expense Heads Table
CREATE TABLE IF NOT EXISTS public.expense_heads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name_en TEXT NOT NULL,
  name_hi TEXT NOT NULL,
  expense_group TEXT NOT NULL CHECK (expense_group IN ('monthly_fixed', 'variable_production')),
  calculation_mode TEXT NOT NULL CHECK (calculation_mode IN ('manual', 'automatic')),
  default_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (default_amount >= 0),
  due_day INTEGER NOT NULL DEFAULT 5 CHECK (due_day BETWEEN 1 AND 31),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Enhance Expenses Table
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS expense_head_id UUID REFERENCES public.expense_heads(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS expense_month TEXT; -- Format: 'YYYY-MM', e.g. '2026-09'
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS corrected_from_expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS idempotency_key TEXT UNIQUE;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS is_monthly_fixed BOOLEAN NOT NULL DEFAULT false;

-- 3. Indexes for fast query performance
CREATE INDEX IF NOT EXISTS idx_expense_heads_group ON public.expense_heads(expense_group);
CREATE INDEX IF NOT EXISTS idx_expense_heads_active ON public.expense_heads(is_active, is_archived);
CREATE INDEX IF NOT EXISTS idx_expenses_month ON public.expenses(expense_month);
CREATE INDEX IF NOT EXISTS idx_expenses_head_id ON public.expenses(expense_head_id);

-- 4. Enable RLS
ALTER TABLE public.expense_heads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "Public full access expense_heads" ON public.expense_heads;
  CREATE POLICY "Public full access expense_heads" ON public.expense_heads FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
END $$;

-- 5. Seed Authoritative Default Expense Heads
INSERT INTO public.expense_heads (
  id, code, name_en, name_hi, expense_group, calculation_mode, default_amount, due_day, start_date, notes, is_active, is_archived, sort_order
) VALUES
  ('e1000000-0000-0000-0000-000000000001', 'EXP-RENT-01', 'Shop/Factory/Warehouse Rent', 'दुकान/कारखाना/गोदाम का किराया', 'monthly_fixed', 'manual', 15000.00, 5, CURRENT_DATE, 'Monthly lease for factory and warehouse', true, false, 1),
  ('e1000000-0000-0000-0000-000000000002', 'EXP-PERM-SAL-02', 'Permanent Employee Salary', 'स्थायी कर्मचारियों की salary', 'monthly_fixed', 'manual', 25000.00, 7, CURRENT_DATE, 'Monthly wages for permanent factory workers', true, false, 2),
  ('e1000000-0000-0000-0000-000000000003', 'EXP-OWNER-SAL-03', 'Owner/Manager Salary', 'Owner/Manager salary', 'monthly_fixed', 'manual', 20000.00, 10, CURRENT_DATE, 'Managerial compensation', true, false, 3),
  ('e1000000-0000-0000-0000-000000000004', 'EXP-INGR-PKG-04', 'Ingredients & Packaging', 'कच्चा माल व पैकेजिंग', 'variable_production', 'automatic', 0.00, 1, CURRENT_DATE, 'Auto-calculated from batch recipe consumption', true, false, 4),
  ('e1000000-0000-0000-0000-000000000005', 'EXP-LPG-ENERGY-05', 'LPG & Energy Consumption', 'LPG गैस व ऊर्जा', 'variable_production', 'automatic', 0.00, 1, CURRENT_DATE, 'Auto-calculated from cylinder readings and production', true, false, 5),
  ('e1000000-0000-0000-0000-000000000006', 'EXP-WATER-CLEAN-06', 'Water & Cleaning', 'पानी व सफाई', 'variable_production', 'manual', 1000.00, 15, CURRENT_DATE, 'Water supply and cleaning supplies', true, false, 6),
  ('e1000000-0000-0000-0000-000000000007', 'EXP-TEMP-LAB-07', 'Temporary Labour', 'अस्थायी मजदूरी', 'variable_production', 'manual', 0.00, 1, CURRENT_DATE, 'Daily / temporary packaging & helper wages', true, false, 7)
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_hi = EXCLUDED.name_hi,
  expense_group = EXCLUDED.expense_group,
  calculation_mode = EXCLUDED.calculation_mode,
  notes = EXCLUDED.notes;

-- 6. RPC: Delete or Archive Expense Head
CREATE OR REPLACE FUNCTION delete_or_archive_expense_head(
  p_head_id UUID,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_head RECORD;
  v_usage_count INTEGER;
  v_user_uuid UUID := NULL;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  SELECT * INTO v_head FROM expense_heads WHERE id = p_head_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense head not found';
  END IF;

  -- Check if referenced in expenses
  SELECT COUNT(*) INTO v_usage_count FROM expenses WHERE expense_head_id = p_head_id;

  IF v_usage_count = 0 THEN
    -- Completely unused -> Hard delete
    DELETE FROM expense_heads WHERE id = p_head_id;

    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
    VALUES (
      'expense_heads',
      p_head_id,
      'DELETE_EXPENSE_HEAD',
      row_to_json(v_head)::jsonb,
      NULL,
      'Unused expense head permanently deleted',
      v_user_uuid
    );

    RETURN jsonb_build_object('success', true, 'action', 'deleted', 'message', 'Expense head permanently deleted');
  ELSE
    -- Referenced by expenses -> Archive (soft deactivate)
    UPDATE expense_heads
    SET is_archived = true,
        is_active = false,
        updated_at = NOW()
    WHERE id = p_head_id;

    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
    VALUES (
      'expense_heads',
      p_head_id,
      'ARCHIVE_EXPENSE_HEAD',
      row_to_json(v_head)::jsonb,
      jsonb_build_object('is_archived', true, 'is_active', false),
      'Expense head archived because it has past transactions',
      v_user_uuid
    );

    RETURN jsonb_build_object('success', true, 'action', 'archived', 'message', 'Expense head archived because it has past transactions');
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RPC: Correct Paid Expense (Void Old Record & Create Linked Replacement)
CREATE OR REPLACE FUNCTION correct_paid_expense(
  p_expense_id UUID,
  p_new_amount NUMERIC,
  p_new_payment_method TEXT,
  p_new_date DATE,
  p_new_description TEXT,
  p_reason TEXT,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_old_expense RECORD;
  v_new_expense_id UUID;
  v_user_uuid UUID := NULL;
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'A valid correction reason is required.';
  END IF;

  IF p_new_amount <= 0 THEN
    RAISE EXCEPTION 'Expense amount must be greater than zero.';
  END IF;

  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  SELECT * INTO v_old_expense FROM expenses WHERE id = p_expense_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense not found';
  END IF;

  -- 1. Void old expense
  UPDATE expenses
  SET status = 'voided',
      void_reason = 'Correction: ' || p_reason,
      updated_at = NOW()
  WHERE id = p_expense_id;

  -- 2. Insert corrected replacement expense
  INSERT INTO expenses (
    expense_date,
    category,
    amount,
    payment_method,
    description,
    vendor_name,
    status,
    expense_head_id,
    expense_month,
    due_date,
    corrected_from_expense_id,
    is_monthly_fixed,
    created_by
  ) VALUES (
    COALESCE(p_new_date, v_old_expense.expense_date),
    v_old_expense.category,
    p_new_amount,
    COALESCE(p_new_payment_method::payment_method, v_old_expense.payment_method),
    COALESCE(p_new_description, v_old_expense.description),
    v_old_expense.vendor_name,
    'active',
    v_old_expense.expense_head_id,
    v_old_expense.expense_month,
    v_old_expense.due_date,
    p_expense_id,
    v_old_expense.is_monthly_fixed,
    v_user_uuid
  ) RETURNING id INTO v_new_expense_id;

  -- 3. Audit Log
  INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, reason, performed_by)
  VALUES (
    'expenses',
    v_new_expense_id,
    'CORRECT_EXPENSE',
    row_to_json(v_old_expense)::jsonb,
    jsonb_build_object('id', v_new_expense_id, 'amount', p_new_amount, 'corrected_from', p_expense_id),
    p_reason,
    v_user_uuid
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_expense_id', p_expense_id,
    'new_expense_id', v_new_expense_id,
    'amount', p_new_amount,
    'message', 'Expense corrected and replacement recorded'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. RPC: Copy Previous Month Fixed Expenses
CREATE OR REPLACE FUNCTION copy_previous_month_fixed_expenses(
  p_source_month TEXT,
  p_target_month TEXT,
  p_user_id TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_rec RECORD;
  v_copied_count INTEGER := 0;
  v_user_uuid UUID := NULL;
  v_target_due_date DATE;
BEGIN
  IF p_user_id IS NOT NULL AND p_user_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    v_user_uuid := p_user_id::UUID;
  END IF;

  -- Loop through active fixed expense heads
  FOR v_rec IN 
    SELECT 
      eh.id AS head_id,
      eh.code,
      eh.name_en,
      eh.name_hi,
      eh.due_day,
      eh.default_amount,
      COALESCE(prev_exp.amount, eh.default_amount) AS amount_to_copy,
      COALESCE(prev_exp.payment_method, 'cash'::payment_method) AS payment_method,
      COALESCE(prev_exp.vendor_name, eh.name_en) AS vendor_name
    FROM expense_heads eh
    LEFT JOIN (
      SELECT DISTINCT ON (expense_head_id) *
      FROM expenses
      WHERE expense_month = p_source_month AND status = 'active'
      ORDER BY expense_head_id, created_at DESC
    ) prev_exp ON prev_exp.expense_head_id = eh.id
    WHERE eh.expense_group = 'monthly_fixed' AND eh.is_active = true AND eh.is_archived = false
  LOOP
    -- Calculate due date in target month (e.g. '2026-09-05')
    BEGIN
      v_target_due_date := TO_DATE(p_target_month || '-' || LPAD(v_rec.due_day::TEXT, 2, '0'), 'YYYY-MM-DD');
    EXCEPTION WHEN OTHERS THEN
      v_target_due_date := TO_DATE(p_target_month || '-01', 'YYYY-MM-DD');
    END;

    -- Only insert if not already confirmed/active for target month
    IF NOT EXISTS (
      SELECT 1 FROM expenses 
      WHERE expense_head_id = v_rec.head_id AND expense_month = p_target_month AND status = 'active'
    ) THEN
      INSERT INTO expenses (
        expense_date,
        category,
        amount,
        payment_method,
        description,
        vendor_name,
        status,
        expense_head_id,
        expense_month,
        due_date,
        is_monthly_fixed,
        created_by
      ) VALUES (
        v_target_due_date,
        'other'::expense_category,
        v_rec.amount_to_copy,
        v_rec.payment_method,
        v_rec.name_hi || ' (' || p_target_month || ')',
        v_rec.vendor_name,
        'active',
        v_rec.head_id,
        p_target_month,
        v_target_due_date,
        true,
        v_user_uuid
      );
      v_copied_count := v_copied_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'copied_count', v_copied_count,
    'target_month', p_target_month
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Grants & Reload Cache
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
