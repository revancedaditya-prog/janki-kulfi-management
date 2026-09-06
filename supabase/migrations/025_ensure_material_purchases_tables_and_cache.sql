-- Migration 025: Ensure material_purchases, material_purchase_items, inventory_lots, and RLS permissions exist
-- Run this script in your Supabase Dashboard -> SQL Editor to resolve PGRST205 (table not found in schema cache)

-- 1. Ensure Table: material_purchases
CREATE TABLE IF NOT EXISTS public.material_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_number TEXT UNIQUE NOT NULL,
  purchase_date DATE NOT NULL DEFAULT CURRENT_DATE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  invoice_number TEXT,
  payment_method TEXT NOT NULL DEFAULT 'cash',
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (paid_amount >= 0),
  credit_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (credit_amount >= 0),
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
  bill_image_url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('draft', 'received', 'cancelled', 'reversed')),
  expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  reversal_reason TEXT,
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES public.profiles(id),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Ensure Table: material_purchase_items
CREATE TABLE IF NOT EXISTS public.material_purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id UUID NOT NULL REFERENCES public.material_purchases(id) ON DELETE CASCADE,
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  purchased_quantity NUMERIC(12,3) NOT NULL CHECK (purchased_quantity > 0),
  purchase_unit TEXT NOT NULL,
  free_quantity NUMERIC(12,3) NOT NULL DEFAULT 0.000 CHECK (free_quantity >= 0),
  total_received_quantity NUMERIC(12,3) NOT NULL CHECK (total_received_quantity > 0),
  base_quantity NUMERIC(12,3) NOT NULL CHECK (base_quantity > 0),
  base_unit TEXT NOT NULL,
  unit_price NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),
  item_price NUMERIC(12,2) NOT NULL CHECK (item_price >= 0),
  discount NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (discount >= 0),
  tax NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (tax >= 0),
  allocated_charge NUMERIC(12,2) NOT NULL DEFAULT 0.00 CHECK (allocated_charge >= 0),
  net_item_cost NUMERIC(12,2) NOT NULL CHECK (net_item_cost >= 0),
  unit_acquisition_cost NUMERIC(12,4) NOT NULL CHECK (unit_acquisition_cost >= 0),
  lot_number TEXT,
  manufacturing_date DATE,
  expiry_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Ensure Table: inventory_lots
CREATE TABLE IF NOT EXISTS public.inventory_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  lot_number TEXT NOT NULL,
  purchase_item_id UUID REFERENCES public.material_purchase_items(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  initial_quantity NUMERIC(12,3) NOT NULL CHECK (initial_quantity > 0),
  remaining_quantity NUMERIC(12,3) NOT NULL CHECK (remaining_quantity >= 0),
  base_unit TEXT NOT NULL,
  unit_cost NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  manufacturing_date DATE,
  expiry_date DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'exhausted', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Ensure Table: raw_material_movements columns
CREATE TABLE IF NOT EXISTS public.raw_material_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id UUID NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  movement_type TEXT NOT NULL,
  quantity NUMERIC(12,3) NOT NULL,
  base_unit TEXT NOT NULL,
  unit_cost_snapshot NUMERIC(12,4) NOT NULL DEFAULT 0.0000,
  total_value_snapshot NUMERIC(12,2) NOT NULL DEFAULT 0.00,
  source_location TEXT,
  destination_location TEXT,
  reference_table TEXT,
  reference_id UUID,
  lot_id UUID REFERENCES public.inventory_lots(id) ON DELETE SET NULL,
  reason TEXT,
  reversal_of_movement_id UUID REFERENCES public.raw_material_movements(id) ON DELETE SET NULL,
  performed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Enable RLS and Grant Permissions
ALTER TABLE public.material_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_material_movements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  -- Permissive policies for material_purchases
  DROP POLICY IF EXISTS "Public full access material_purchases" ON public.material_purchases;
  CREATE POLICY "Public full access material_purchases" ON public.material_purchases FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

  -- Permissive policies for material_purchase_items
  DROP POLICY IF EXISTS "Public full access material_purchase_items" ON public.material_purchase_items;
  CREATE POLICY "Public full access material_purchase_items" ON public.material_purchase_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

  -- Permissive policies for inventory_lots
  DROP POLICY IF EXISTS "Public full access inventory_lots" ON public.inventory_lots;
  CREATE POLICY "Public full access inventory_lots" ON public.inventory_lots FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

  -- Permissive policies for raw_material_movements
  DROP POLICY IF EXISTS "Public full access raw_material_movements" ON public.raw_material_movements;
  CREATE POLICY "Public full access raw_material_movements" ON public.raw_material_movements FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
END $$;

-- 6. Grant table permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role;

-- 7. Notify PostgREST schema cache reload
NOTIFY pgrst, 'reload schema';
