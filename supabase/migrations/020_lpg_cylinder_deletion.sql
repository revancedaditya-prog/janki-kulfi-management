-- Migration: 020_lpg_cylinder_deletion.sql
-- Description: LPG cylinder management RLS policies and safe deletion transactional RPC

-- 1. Ensure Owners can manage LPG cylinders (INSERT, UPDATE, DELETE)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Owners can manage LPG cylinders" ON lpg_cylinders;
  CREATE POLICY "Owners can manage LPG cylinders"
    ON lpg_cylinders FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'owner'
      )
    );

  DROP POLICY IF EXISTS "Owners can manage LPG readings" ON lpg_cylinder_readings;
  CREATE POLICY "Owners can manage LPG readings"
    ON lpg_cylinder_readings FOR ALL TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM profiles 
        WHERE profiles.id = auth.uid() 
        AND profiles.role = 'owner'
      )
    );
END $$;

-- 2. Transactional RPC to Delete LPG Cylinder Safely
CREATE OR REPLACE FUNCTION delete_lpg_cylinder_transaction(
  p_cylinder_id UUID,
  p_user_id UUID DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cyl RECORD;
  v_deleted_code TEXT;
BEGIN
  -- 1. Find cylinder
  SELECT * INTO v_cyl FROM lpg_cylinders WHERE id = p_cylinder_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'LPG Cylinder with ID % not found', p_cylinder_id;
  END IF;

  v_deleted_code := v_cyl.cylinder_code;

  -- 2. Delete linked readings first (if CASCADE is not triggered)
  DELETE FROM lpg_cylinder_readings WHERE cylinder_id = p_cylinder_id;

  -- 3. Delete cylinder record
  DELETE FROM lpg_cylinders WHERE id = p_cylinder_id;

  -- 4. Return success response
  RETURN jsonb_build_object(
    'success', true,
    'cylinder_id', p_cylinder_id,
    'cylinder_code', v_deleted_code,
    'message', format('LPG cylinder %s deleted successfully', v_deleted_code)
  );
END;
$$;

-- 3. Grant execute permissions
GRANT EXECUTE ON FUNCTION delete_lpg_cylinder_transaction(UUID, UUID) TO authenticated, anon;
