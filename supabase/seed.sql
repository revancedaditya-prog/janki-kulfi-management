-- Janki Kulfi Management Seed Data
-- Initial Master Data: Products, Prices, Locations, Carts, Demo Sellers & Profiles

-- 1. Default Stock Locations
INSERT INTO stock_locations (id, location_type, name, is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'production', 'Production Floor', true),
  ('a0000000-0000-0000-0000-000000000002', 'main_freezer', 'Main Cold Storage Freezer', true),
  ('a0000000-0000-0000-0000-000000000003', 'returned', 'Returned Stock Holding', true),
  ('a0000000-0000-0000-0000-000000000004', 'damaged', 'Damaged & Melted Waste', true),
  ('a0000000-0000-0000-0000-000000000005', 'complimentary', 'Complimentary / Tasting Stock', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Initial Products (Sada Kulfi ₹10, Rabri Kulfi ₹20, Premium Kulfi ₹40)
INSERT INTO products (id, name_en, name_hi, sku, description, is_active) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Sada Kulfi', 'सादा कुल्फी', 'JK-SADA-01', 'Classic traditional stick kulfi with cardamom and malai', true),
  ('b0000000-0000-0000-0000-000000000002', 'Rabri Kulfi', 'रबड़ी कुल्फी', 'JK-RABRI-02', 'Thick reduced milk rabri kulfi with almond and pistachio flakes', true),
  ('b0000000-0000-0000-0000-000000000003', 'Premium Kulfi', 'प्रीमियम कुल्फी', 'JK-PREM-03', 'Special saffron-infused royal kulfi with cashews, almonds & pistachios', true)
ON CONFLICT (sku) DO NOTHING;

-- 3. Initial Product Prices and Commissions
INSERT INTO product_prices (id, product_id, selling_price, commission_type, commission_value, effective_from) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 10.00, 'fixed', 2.00, '2026-01-01 00:00:00+05:30'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002', 20.00, 'fixed', 4.00, '2026-01-01 00:00:00+05:30'),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003', 40.00, 'fixed', 8.00, '2026-01-01 00:00:00+05:30')
ON CONFLICT (id) DO NOTHING;

-- 4. Initial Carts
INSERT INTO carts (id, cart_code, cart_name, location, is_active) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'CART-01', 'Mirehchi Chowk Cart (ठेला 1)', 'Mirehchi Main Market Chauraha', true),
  ('d0000000-0000-0000-0000-000000000002', 'CART-02', 'Bus Stand Mobile Cart (ठेला 2)', 'Etah Road Bus Stand Point', true)
ON CONFLICT (cart_code) DO NOTHING;

-- 5. Initial Sellers
INSERT INTO sellers (id, seller_code, full_name, phone, address, default_cart_id, is_active, opening_balance) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'SLR-001', 'Ramesh Kumar (रमेश कुमार)', '9876543210', 'Ward 4, Mirehchi, Etah', 'd0000000-0000-0000-0000-000000000001', true, 0.00),
  ('e0000000-0000-0000-0000-000000000002', 'SLR-002', 'Suresh Chandra (सुरेश चन्द्र)', '9876543211', 'Station Road, Mirehchi, Etah', 'd0000000-0000-0000-0000-000000000002', true, 0.00)
ON CONFLICT (seller_code) DO NOTHING;

-- 6. Stock Locations for initial sellers
INSERT INTO stock_locations (id, location_type, name, seller_id, cart_id, is_active) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'seller', 'Ramesh Kumar Cart Stock', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', true),
  ('f0000000-0000-0000-0000-000000000002', 'seller', 'Suresh Chandra Cart Stock', 'e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', true)
ON CONFLICT (id) DO NOTHING;
