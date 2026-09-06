-- Migration 023: Canonical current_raw_material_stock view
-- Authoritative real-time aggregation from raw_material_movements

CREATE OR REPLACE VIEW public.current_raw_material_stock AS
SELECT
  i.id,
  i.id AS ingredient_id,
  i.code,
  i.name_en,
  i.name_hi,
  i.category,
  i.base_unit,
  i.purchase_unit,
  i.conversion_factor,
  i.current_rate,
  i.current_rate AS latest_purchase_rate,
  i.rate_unit,
  i.min_stock_level,
  i.reorder_quantity,
  i.preferred_supplier_id,
  i.preferred_supplier_name,
  i.storage_location,
  i.track_expiry,
  i.track_lots,
  i.track_inventory,
  i.is_active,
  COALESCE(SUM(rmm.quantity), 0) AS available_quantity,
  COALESCE(SUM(rmm.quantity), 0) AS current_stock,
  COALESCE(SUM(rmm.quantity), 0) AS available_base_quantity,
  COALESCE(SUM(rmm.quantity), 0) * COALESCE(i.current_rate, 0) AS stock_value,
  COALESCE(SUM(rmm.quantity), 0) * COALESCE(i.current_rate, 0) AS total_value,
  CASE 
    WHEN COALESCE(SUM(rmm.quantity), 0) <= 0 THEN 'out_of_stock'
    WHEN COALESCE(SUM(rmm.quantity), 0) <= i.min_stock_level THEN 'low_stock'
    ELSE 'adequate'
  END AS stock_status
FROM public.ingredients i
LEFT JOIN public.raw_material_movements rmm
  ON rmm.ingredient_id = i.id
GROUP BY
  i.id;

-- Keep v_raw_material_stock aliased for 100% backward compatibility
CREATE OR REPLACE VIEW public.v_raw_material_stock AS
SELECT * FROM public.current_raw_material_stock;
