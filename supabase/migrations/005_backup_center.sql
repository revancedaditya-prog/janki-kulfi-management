-- Janki Kulfi Management Schema Migration 005
-- Backup Center: Backup History, RLS & Secure Audit

-- 1. Backup History Table
CREATE TABLE IF NOT EXISTS backup_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  backup_type TEXT NOT NULL CHECK (backup_type IN ('complete', 'date_range', 'expense_bills')),
  format_version TEXT NOT NULL DEFAULT '1.0.0',
  date_from TIMESTAMPTZ,
  date_to TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed')),
  file_name TEXT NOT NULL,
  table_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_summary TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_backup_history_created_at ON backup_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_history_type ON backup_history(backup_type);
CREATE INDEX IF NOT EXISTS idx_backup_history_status ON backup_history(status);

-- 2. Row Level Security
ALTER TABLE backup_history ENABLE ROW LEVEL SECURITY;

-- Only Owners can select backup history
CREATE POLICY "Only owners can view backup history"
  ON backup_history FOR SELECT
  TO authenticated
  USING (is_owner());

-- Only Owners can record backup history
CREATE POLICY "Only owners can insert backup history"
  ON backup_history FOR INSERT
  TO authenticated
  WITH CHECK (is_owner());

-- 3. Stored Procedure to Log Backup Operations into Audit Log
CREATE OR REPLACE FUNCTION log_backup_operation(
  p_backup_type TEXT,
  p_file_name TEXT,
  p_table_counts JSONB,
  p_checksums JSONB,
  p_status TEXT,
  p_error_summary TEXT,
  p_user_id UUID
)
RETURNS UUID AS $$
DECLARE
  v_history_id UUID;
BEGIN
  -- Verify Owner permission
  IF NOT (SELECT role = 'owner' FROM profiles WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Access Denied: Only Owner role is authorized to perform or record backups.';
  END IF;

  INSERT INTO backup_history (
    backup_type,
    file_name,
    table_counts,
    checksum_summary,
    status,
    error_summary,
    created_by,
    created_at
  ) VALUES (
    p_backup_type,
    p_file_name,
    p_table_counts,
    p_checksums,
    p_status,
    p_error_summary,
    p_user_id,
    NOW()
  ) RETURNING id INTO v_history_id;

  -- Add audit log entry
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    new_values,
    change_reason,
    user_id,
    created_at
  ) VALUES (
    'backup_history',
    v_history_id,
    'CREATE_BACKUP',
    jsonb_build_object(
      'backup_type', p_backup_type,
      'file_name', p_file_name,
      'status', p_status,
      'tables', p_table_counts
    ),
    'Manual offline backup generated and verified',
    p_user_id,
    NOW()
  );

  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
