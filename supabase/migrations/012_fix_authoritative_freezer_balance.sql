-- Migration: 012_fix_authoritative_freezer_balance.sql
-- Description: Authoritative Freezer Stock Calculation and Reversal Isolation

-- 1. Recreate authoritative View: v_freezer_stock with resilient product & location matching
CREATE OR REPLACE VIEW v_freezer_stock AS
SELECT 
  p.id AS product_id,
  p.name_en,
  p.name_hi,
  p.sku,
  p.is_active,
  GREATEST(0,
    COALESCE(
      (
        SELECT SUM(sm.quantity)
        FROM stock_movements sm
        LEFT JOIN stock_locations dl ON sm.destination_location_id = dl.id
        WHERE (sm.product_id = p.id OR sm.product_id::text = p.sku OR sm.product_id::text = p.id::text)
          AND (dl.location_type = 'main_freezer' OR sm.destination_location_id::text IN ('loc-freezer', 'loc-freezer-01') OR dl.name ILIKE '%freezer%')
      ), 0
    ) - COALESCE(
      (
        SELECT SUM(sm.quantity)
        FROM stock_movements sm
        LEFT JOIN stock_locations sl ON sm.source_location_id = sl.id
        WHERE (sm.product_id = p.id OR sm.product_id::text = p.sku OR sm.product_id::text = p.id::text)
          AND (sl.location_type = 'main_freezer' OR sm.source_location_id::text IN ('loc-freezer', 'loc-freezer-01') OR sl.name ILIKE '%freezer%')
      ), 0
    )
  ) AS available_quantity
FROM products p;

-- 2. Stored Procedure to get authoritative available stock for a specific product
CREATE OR REPLACE FUNCTION get_available_freezer_stock(p_product_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_qty INTEGER;
BEGIN
  SELECT available_quantity INTO v_qty
  FROM v_freezer_stock
  WHERE product_id = p_product_id;
  
  RETURN COALESCE(v_qty, 0);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 3. Stored Procedure to get all freezer balances as a JSON map
CREATE OR REPLACE FUNCTION get_freezer_balances()
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_object_agg(product_id::text, available_quantity)
  INTO v_result
  FROM v_freezer_stock;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
