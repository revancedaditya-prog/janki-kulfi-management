-- Migration: 015_canonical_current_location_stock.sql
-- Description: Create canonical current_location_stock view and grant select permissions

-- Ensure default Main Freezer location exists with standard UUID
INSERT INTO public.stock_locations (id, location_type, name, is_active)
VALUES ('a0000000-0000-0000-0000-000000000002', 'main_freezer', 'Main Cold Storage Freezer', true)
ON CONFLICT (id) DO NOTHING;

-- 1. Canonical View: current_location_stock
-- Direction calculated strictly from source_location_id and destination_location_id
CREATE OR REPLACE VIEW public.current_location_stock AS
WITH stock_deltas AS (
  SELECT
    destination_location_id AS location_id,
    product_id,
    quantity::numeric AS quantity_delta
  FROM public.stock_movements
  WHERE destination_location_id IS NOT NULL

  UNION ALL

  SELECT
    source_location_id AS location_id,
    product_id,
    -quantity::numeric AS quantity_delta
  FROM public.stock_movements
  WHERE source_location_id IS NOT NULL
)
SELECT
  location_id,
  product_id,
  COALESCE(SUM(quantity_delta), 0) AS quantity
FROM stock_deltas
GROUP BY location_id, product_id;

-- 2. Grant SELECT permissions on the view to authenticated and anon roles
GRANT SELECT ON public.current_location_stock TO authenticated, anon;

-- 3. Point v_freezer_stock to the canonical current_location_stock view for Main Freezer
CREATE OR REPLACE VIEW public.v_freezer_stock AS
SELECT 
  p.id AS product_id,
  p.name_en,
  p.name_hi,
  p.sku,
  p.is_active,
  COALESCE(cls.quantity, 0) AS available_quantity
FROM public.products p
LEFT JOIN public.current_location_stock cls 
  ON cls.product_id = p.id 
  AND cls.location_id = 'a0000000-0000-0000-0000-000000000002'::uuid;

GRANT SELECT ON public.v_freezer_stock TO authenticated, anon;

-- 4. Stored Procedure to get authoritative available stock for a product from canonical view
CREATE OR REPLACE FUNCTION public.get_available_freezer_stock(p_product_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_qty NUMERIC;
BEGIN
  SELECT quantity INTO v_qty
  FROM public.current_location_stock
  WHERE location_id = 'a0000000-0000-0000-0000-000000000002'::uuid
    AND product_id = p_product_id;
  
  RETURN COALESCE(v_qty::integer, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_available_freezer_stock(UUID) TO authenticated, anon;

-- 5. Stored Procedure to get all freezer balances as a JSON map
CREATE OR REPLACE FUNCTION public.get_freezer_balances()
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_object_agg(p.id::text, COALESCE(cls.quantity, 0))
  INTO v_result
  FROM public.products p
  LEFT JOIN public.current_location_stock cls
    ON cls.product_id = p.id
    AND cls.location_id = 'a0000000-0000-0000-0000-000000000002'::uuid;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_freezer_balances() TO authenticated, anon;
