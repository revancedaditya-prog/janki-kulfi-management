-- Janki Kulfi Management Migration 004
-- Supabase Storage Configuration for Expense Receipts

-- Create expense-bills bucket if not exists
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'expense-bills',
  'expense-bills',
  false,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
CREATE POLICY "Authenticated owners can upload expense bills"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'expense-bills' AND
  (SELECT role = 'owner' FROM profiles WHERE id = auth.uid())
);

CREATE POLICY "Authenticated owners can view expense bills"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'expense-bills' AND
  (SELECT role = 'owner' FROM profiles WHERE id = auth.uid())
);
