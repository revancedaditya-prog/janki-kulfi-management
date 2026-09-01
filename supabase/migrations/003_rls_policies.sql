-- Janki Kulfi Management Migration 003
-- Row Level Security (RLS) & Helper Security Functions

-- Helper: Get role of currently authenticated user
CREATE OR REPLACE FUNCTION get_auth_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: Get seller_id of currently authenticated user if they are a seller
CREATE OR REPLACE FUNCTION get_auth_seller_id()
RETURNS UUID AS $$
  SELECT id FROM sellers WHERE user_profile_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: Check if current user is Owner
CREATE OR REPLACE FUNCTION is_owner()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT role = 'owner' FROM profiles WHERE id = auth.uid()), false);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: Check if current user is Production Worker or Owner
CREATE OR REPLACE FUNCTION is_production_or_owner()
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT role IN ('owner', 'production_worker') FROM profiles WHERE id = auth.uid()), false);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sellers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_issue_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE seller_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_closings ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. Profiles Policies
CREATE POLICY "Users can view their own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR is_owner());

CREATE POLICY "Owners can manage all profiles"
  ON profiles FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- 2. Products Policies
CREATE POLICY "Authenticated users can view products"
  ON products FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owners can manage products"
  ON products FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- 3. Product Prices Policies
CREATE POLICY "Authenticated users can view prices"
  ON product_prices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owners can manage product prices"
  ON product_prices FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- 4. Carts Policies
CREATE POLICY "Authenticated users can view carts"
  ON carts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Owners can manage carts"
  ON carts FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- 5. Sellers Policies
CREATE POLICY "Authenticated users can view sellers"
  ON sellers FOR SELECT
  TO authenticated
  USING (is_owner() OR user_profile_id = auth.uid());

CREATE POLICY "Owners can manage sellers"
  ON sellers FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- 6. Stock Locations Policies
CREATE POLICY "Authenticated users can view stock locations"
  ON stock_locations FOR SELECT
  TO authenticated
  USING (is_production_or_owner() OR seller_id = get_auth_seller_id());

CREATE POLICY "Owners can manage stock locations"
  ON stock_locations FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- 7. Production Batches & Items Policies
CREATE POLICY "Production workers and owners can view batches"
  ON production_batches FOR SELECT
  TO authenticated
  USING (is_production_or_owner());

CREATE POLICY "Production workers and owners can insert/update batches"
  ON production_batches FOR ALL
  TO authenticated
  USING (is_production_or_owner())
  WITH CHECK (is_production_or_owner());

CREATE POLICY "Production workers and owners can view production items"
  ON production_items FOR SELECT
  TO authenticated
  USING (is_production_or_owner());

CREATE POLICY "Production workers and owners can manage production items"
  ON production_items FOR ALL
  TO authenticated
  USING (is_production_or_owner())
  WITH CHECK (is_production_or_owner());

-- 8. Seller Issues & Items Policies
CREATE POLICY "Owners and respective sellers can view issues"
  ON seller_issues FOR SELECT
  TO authenticated
  USING (is_owner() OR seller_id = get_auth_seller_id());

CREATE POLICY "Owners can manage issues"
  ON seller_issues FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

CREATE POLICY "Owners and respective sellers can view issue items"
  ON seller_issue_items FOR SELECT
  TO authenticated
  USING (
    is_owner() OR 
    seller_issue_id IN (SELECT id FROM seller_issues WHERE seller_id = get_auth_seller_id())
  );

CREATE POLICY "Owners can manage issue items"
  ON seller_issue_items FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- 9. Seller Settlements & Settlement Items Policies
CREATE POLICY "Owners and respective sellers can view settlements"
  ON seller_settlements FOR SELECT
  TO authenticated
  USING (is_owner() OR seller_id = get_auth_seller_id());

CREATE POLICY "Sellers can submit settlements and owners can manage"
  ON seller_settlements FOR INSERT
  TO authenticated
  WITH CHECK (is_owner() OR seller_id = get_auth_seller_id());

CREATE POLICY "Owners can update settlements"
  ON seller_settlements FOR UPDATE
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

CREATE POLICY "Owners and respective sellers can view settlement items"
  ON settlement_items FOR SELECT
  TO authenticated
  USING (
    is_owner() OR 
    settlement_id IN (SELECT id FROM seller_settlements WHERE seller_id = get_auth_seller_id())
  );

CREATE POLICY "Sellers can insert settlement items and owners can manage"
  ON settlement_items FOR INSERT
  TO authenticated
  WITH CHECK (
    is_owner() OR 
    settlement_id IN (SELECT id FROM seller_settlements WHERE seller_id = get_auth_seller_id())
  );

CREATE POLICY "Owners can update settlement items"
  ON settlement_items FOR UPDATE
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- 10. Expenses Policies (Owners Only)
CREATE POLICY "Only owners can view expenses"
  ON expenses FOR SELECT
  TO authenticated
  USING (is_owner());

CREATE POLICY "Only owners can manage expenses"
  ON expenses FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- 11. Stock Movements Policies
CREATE POLICY "Staff can view relevant stock movements"
  ON stock_movements FOR SELECT
  TO authenticated
  USING (
    is_production_or_owner() OR
    source_location_id IN (SELECT id FROM stock_locations WHERE seller_id = get_auth_seller_id()) OR
    destination_location_id IN (SELECT id FROM stock_locations WHERE seller_id = get_auth_seller_id())
  );

CREATE POLICY "Only authorized operations can insert movements"
  ON stock_movements FOR INSERT
  TO authenticated
  WITH CHECK (is_production_or_owner());

-- 12. Daily Closings Policies (Owners Only)
CREATE POLICY "Only owners can view daily closings"
  ON daily_closings FOR SELECT
  TO authenticated
  USING (is_owner());

CREATE POLICY "Only owners can manage daily closings"
  ON daily_closings FOR ALL
  TO authenticated
  USING (is_owner())
  WITH CHECK (is_owner());

-- 13. Audit Logs Policies (Owners Only)
CREATE POLICY "Only owners can view audit logs"
  ON audit_logs FOR SELECT
  TO authenticated
  USING (is_owner());

CREATE POLICY "System can insert audit logs"
  ON audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);
