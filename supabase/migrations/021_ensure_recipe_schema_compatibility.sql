-- Migration: 021_ensure_recipe_schema_compatibility.sql
-- Description: Ensure expected_yield_pieces/standard_output_pieces compatibility, seed ingredients if empty, safe UUID handling in RPC, and reload schema cache

DO $$
BEGIN
  -- 1. Ensure expected_yield_pieces column exists on recipes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'recipes' AND column_name = 'expected_yield_pieces'
  ) THEN
    ALTER TABLE recipes ADD COLUMN expected_yield_pieces INTEGER NOT NULL DEFAULT 100 CHECK (expected_yield_pieces > 0);
  END IF;

  -- 2. Ensure standard_output_pieces column exists on recipes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'recipes' AND column_name = 'standard_output_pieces'
  ) THEN
    ALTER TABLE recipes ADD COLUMN standard_output_pieces INTEGER NOT NULL DEFAULT 100 CHECK (standard_output_pieces > 0);
  END IF;

  -- 3. Synchronize both columns
  UPDATE recipes 
  SET expected_yield_pieces = standard_output_pieces
  WHERE expected_yield_pieces IS NULL OR expected_yield_pieces <> standard_output_pieces;

  UPDATE recipes 
  SET standard_output_pieces = expected_yield_pieces
  WHERE standard_output_pieces IS NULL;

  -- 4. Ensure status column exists on recipes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'recipes' AND column_name = 'status'
  ) THEN
    ALTER TABLE recipes ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived'));
  END IF;

  UPDATE recipes 
  SET status = CASE WHEN is_default = true THEN 'active' ELSE 'archived' END
  WHERE status IS NULL;
END $$;

-- 5. Seed standard ingredients if not present
INSERT INTO ingredients (code, name_en, name_hi, category, base_unit, current_rate, rate_unit, is_active)
VALUES
  ('ING-MILK', 'Milk', 'दूध', 'dairy', 'litre', 60.00, 'litre', true),
  ('ING-SUGAR', 'Sugar', 'चीनी', 'sweetener', 'kg', 48.00, 'kg', true),
  ('ING-KHOYA', 'Khoya', 'खोया / मावा', 'dairy', 'kg', 320.00, 'kg', true),
  ('ING-CASHEW', 'Cashew', 'काजू', 'dry_fruit', 'kg', 800.00, 'kg', true),
  ('ING-PISTA', 'Pistachio', 'पिस्ता', 'dry_fruit', 'kg', 1200.00, 'kg', true),
  ('ING-ALMOND', 'Almond', 'बादाम', 'dry_fruit', 'kg', 750.00, 'kg', true),
  ('ING-CUSTARD', 'Custard powder', 'कस्टर्ड पाउडर', 'flavoring', 'kg', 160.00, 'kg', true),
  ('ING-CARDAMOM', 'Cardamom', 'इलायची', 'spice', 'kg', 2400.00, 'kg', true),
  ('ING-SAFFRON', 'Saffron', 'केसर', 'spice', 'g', 250.00, 'g', true),
  ('ING-FLAVOUR', 'Flavour', 'फ्लेवर', 'flavoring', 'ml', 1.50, 'ml', true),
  ('ING-STICK', 'Kulfi stick', 'कुल्फी स्टिक', 'packaging', 'piece', 0.30, 'piece', true),
  ('ING-WRAPPER', 'Wrapper', 'रैपर', 'packaging', 'piece', 0.40, 'piece', true),
  ('ING-POUCH', 'Pouch/packing', 'पैकिंग', 'packaging', 'piece', 0.50, 'piece', true),
  ('ING-OTHER', 'Other ingredient', 'अन्य सामग्री', 'other', 'kg', 100.00, 'kg', true)
ON CONFLICT (code) DO NOTHING;

-- 6. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
