import { Database, UserRole, ExpenseCategory, PaymentMethod, CommissionType } from './database.types';

export type { UserRole, ExpenseCategory, PaymentMethod, CommissionType };
export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Product = Database['public']['Tables']['products']['Row'];
export type ProductPrice = Database['public']['Tables']['product_prices']['Row'];
export type Cart = Database['public']['Tables']['carts']['Row'];
export type Seller = Database['public']['Tables']['sellers']['Row'];
export type StockLocation = Database['public']['Tables']['stock_locations']['Row'];
export type ProductionBatch = Database['public']['Tables']['production_batches']['Row'];
export type ProductionItem = Database['public']['Tables']['production_items']['Row'];
export type SellerIssue = Database['public']['Tables']['seller_issues']['Row'];
export type SellerIssueItem = Database['public']['Tables']['seller_issue_items']['Row'];
export type SellerSettlement = Database['public']['Tables']['seller_settlements']['Row'];
export type SettlementItem = Database['public']['Tables']['settlement_items']['Row'];
export type Expense = Database['public']['Tables']['expenses']['Row'];
export type StockMovement = Database['public']['Tables']['stock_movements']['Row'];
export type DailyClosing = Database['public']['Tables']['daily_closings']['Row'];
export type AuditLog = Database['public']['Tables']['audit_logs']['Row'];

export interface ProductWithPrice extends Product {
  current_price?: number;
  commission_type?: CommissionType;
  commission_value?: number;
  available_quantity?: number;
}

export interface ProductionBatchWithItems extends ProductionBatch {
  items: (ProductionItem & { product?: Product })[];
}

export interface SellerIssueWithDetails extends SellerIssue {
  seller?: Seller;
  cart?: Cart;
  items: (SellerIssueItem & { product?: Product })[];
  settlements?: SellerSettlement[];
}

export interface SellerSettlementWithDetails extends SellerSettlement {
  seller?: Seller;
  issue?: SellerIssue;
  items: (SettlementItem & { product?: Product })[];
}

export interface DashboardSummary {
  today_date: string;
  total_produced: number;
  total_issued: number;
  total_sold: number;
  total_returned: number;
  total_damaged: number;
  total_complimentary: number;
  gross_sales: number;
  total_commission: number;
  net_sales: number;
  cash_received: number;
  upi_received: number;
  credit_sales: number;
  total_received: number;
  outstanding_collection: number;
  today_expenses: number;
  estimated_profit: number;
  closing_stock_value: number;
  is_day_closed: boolean;
  unsettled_issues_count: number;
  pending_approvals_count: number;
  low_stock_products: ProductWithPrice[];
  seven_day_sales: { date: string; gross_sales: number; net_sales: number; pieces_sold: number }[];
}

// Offline Draft Store
export interface OfflineDraft {
  id: string; // Idempotency key / client UUID
  type: 'production_batch' | 'seller_issue' | 'seller_settlement' | 'expense';
  payload: any;
  created_at: string;
  status: 'pending' | 'syncing' | 'failed';
  error_message?: string;
  retry_count: number;
}

// --- Backup Center Types ---
export type BackupType = 'complete' | 'date_range' | 'expense_bills';

export interface BackupHistory {
  id: string;
  backup_type: BackupType;
  format_version: string;
  date_from: string | null;
  date_to: string | null;
  status: 'success' | 'failed';
  file_name: string;
  table_counts: Record<string, number>;
  checksum_summary: Record<string, string>;
  error_summary: string | null;
  created_by: string;
  created_at: string;
}

export interface BackupManifest {
  application_name: string;
  backup_format_version: string;
  database_schema_version: string;
  supabase_project_ref: string;
  created_at_iso: string;
  created_at_kolkata: string;
  created_by_user_id: string;
  backup_type: 'complete' | 'date_range';
  date_range?: { from: string; to: string } | null;
  tables: string[];
  row_counts: Record<string, number>;
  file_checksums: Record<string, string>;
  exported_files: string[];
}

export interface ExpenseBillsManifest {
  application_name: string;
  backup_format_version: string;
  created_at_kolkata: string;
  created_by_user_id: string;
  total_files_found: number;
  total_bytes: number;
  mapped_expenses: {
    expense_id: string;
    expense_date: string;
    amount: number;
    category: string;
    vendor_name?: string | null;
    description: string;
    bill_path: string;
    file_name: string;
    file_size: number;
    sha256: string;
    status: 'found' | 'missing';
  }[];
  orphaned_files: string[];
  missing_files: string[];
  file_checksums: Record<string, string>;
}

export interface BackupValidationResult {
  isValid: boolean;
  manifest: BackupManifest | null;
  checksumResults: { file: string; expected: string; actual: string; match: boolean }[];
  tableCounts: Record<string, number>;
  missingFiles: string[];
  unsupportedVersion?: string;
  errors: string[];
  warnings: string[];
}

export interface RevisionRecord {
  id: string;
  version_number: number;
  status: string;
  date: string;
  created_at: string;
  corrected_at?: string | null;
  corrected_by_name?: string | null;
  correction_reason?: string | null;
  is_current_version: boolean;
  correction_of_id?: string | null;
  superseded_by_id?: string | null;
  summary_text: string;
  details: any;
  financial_effect?: {
    gross_sales?: number;
    total_received?: number;
    cost?: number;
    shortage?: number;
  };
  stock_effect?: {
    produced?: number;
    issued?: number;
    returned?: number;
    damaged?: number;
    sold?: number;
  };
}

// --- Recipe & Costing Calculator Types ---
export type UnitType =
  | 'kg'
  | 'g'
  | 'litre'
  | 'ml'
  | 'piece'
  | 'pack'
  | 'packet'
  | 'box'
  | 'bottle'
  | 'cylinder';

export type IngredientCategory =
  | 'dairy'
  | 'sweetener'
  | 'dry_fruit'
  | 'spice'
  | 'flavoring'
  | 'packaging'
  | 'fuel'
  | 'consumable'
  | 'other';

export type RawMaterialMovementType =
  | 'opening_stock'
  | 'purchase_received'
  | 'production_consumption'
  | 'wastage'
  | 'damage_spillage'
  | 'supplier_return'
  | 'internal_use'
  | 'free_sample'
  | 'stock_transfer'
  | 'physical_count_correction'
  | 'purchase_reversal'
  | 'production_reversal'
  | 'adjustment_reversal';

export type LpgCylinderType = 'commercial_19kg' | 'domestic_14kg' | 'other';
export type LpgCylinderStatus =
  | 'full'
  | 'in_use'
  | 'partially_used'
  | 'empty'
  | 'sent_for_refill'
  | 'damaged_inactive';

export type InventoryWastageType =
  | 'spillage'
  | 'expired'
  | 'damaged_packaging'
  | 'cleaning_test'
  | 'personal_internal'
  | 'sample_production'
  | 'other';

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  gst_number?: string | null;
  is_active: boolean;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface Ingredient {
  id: string;
  code: string;
  name_en: string;
  name_hi: string;
  category: IngredientCategory;
  base_unit: UnitType;
  purchase_unit?: UnitType;
  conversion_factor?: number;
  current_rate: number;
  rate_unit: UnitType;
  min_stock_level?: number;
  reorder_quantity?: number;
  track_expiry?: boolean;
  track_lots?: boolean;
  preferred_supplier_id?: string | null;
  preferred_supplier_name?: string;
  storage_location?: string;
  is_active: boolean;
  available_base_quantity?: number;
  weighted_average_rate?: number;
  total_stock_value?: number;
  stock_status?: 'in_stock' | 'low_stock' | 'out_of_stock' | 'expiring_soon' | 'expired';
  last_movement_date?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MaterialPurchaseItem {
  id: string;
  purchase_id: string;
  ingredient_id: string;
  ingredient?: Ingredient;
  purchased_quantity: number;
  purchase_unit: UnitType;
  free_quantity: number;
  total_received_quantity: number;
  base_quantity: number;
  base_unit: UnitType;
  unit_price: number;
  item_price: number;
  discount: number;
  tax: number;
  allocated_charge: number;
  net_item_cost: number;
  unit_acquisition_cost: number;
  lot_number?: string | null;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  created_at?: string;
}

export interface MaterialPurchase {
  id: string;
  purchase_number: string;
  purchase_date: string;
  supplier_id?: string | null;
  supplier?: Supplier;
  invoice_number?: string | null;
  payment_method: 'cash' | 'upi' | 'bank_transfer' | 'credit';
  paid_amount: number;
  credit_amount: number;
  total_amount: number;
  bill_image_url?: string | null;
  notes?: string | null;
  status: 'draft' | 'received' | 'cancelled' | 'reversed';
  expense_id?: string | null;
  reversal_reason?: string | null;
  reversed_at?: string | null;
  reversed_by?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface MaterialPurchaseWithItems extends MaterialPurchase {
  items: MaterialPurchaseItem[];
}

export interface InventoryLot {
  id: string;
  ingredient_id: string;
  ingredient?: Ingredient;
  lot_number: string;
  purchase_item_id?: string | null;
  supplier_id?: string | null;
  initial_quantity: number;
  remaining_quantity: number;
  base_unit: UnitType;
  unit_cost: number;
  manufacturing_date?: string | null;
  expiry_date?: string | null;
  status: 'active' | 'exhausted' | 'expired';
  created_at?: string;
  updated_at?: string;
}

export interface RawMaterialMovement {
  id: string;
  ingredient_id: string;
  ingredient?: Ingredient;
  movement_date: string;
  source_location: string;
  destination_location: string;
  quantity: number; // Signed: positive incoming, negative outgoing
  base_unit: UnitType;
  movement_type: RawMaterialMovementType;
  reference_table?: string | null;
  reference_id?: string | null;
  lot_id?: string | null;
  unit_cost_snapshot: number;
  total_value_snapshot: number;
  reason?: string | null;
  reversal_of_movement_id?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface PhysicalStockCountItem {
  id?: string;
  count_id?: string;
  ingredient_id: string;
  ingredient?: Ingredient;
  app_stock: number;
  physical_stock: number;
  difference_quantity: number;
  base_unit: UnitType;
  unit_cost_snapshot: number;
  difference_value: number;
  reason?: string | null;
}

export interface PhysicalStockCount {
  id: string;
  count_number: string;
  count_date: string;
  status: 'draft' | 'approved' | 'rejected';
  counted_by?: string | null;
  approved_by?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PhysicalStockCountWithItems extends PhysicalStockCount {
  items: PhysicalStockCountItem[];
}

export interface LpgCylinder {
  id: string;
  cylinder_code: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  cylinder_type: LpgCylinderType;
  rated_gas_capacity: number; // e.g. 19.00 kg
  tare_weight: number; // TW printed on cylinder e.g. 15.20 kg
  full_gross_weight: number; // e.g. 34.20 kg
  current_gross_weight: number; // e.g. 28.50 kg
  calculated_remaining_gas: number; // e.g. 13.30 kg
  remaining_percentage: number; // e.g. 70%
  status: LpgCylinderStatus;
  refill_date?: string | null;
  refill_cost: number;
  connected_date?: string | null;
  empty_date?: string | null;
  storage_location?: string | null;
  notes?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LpgCylinderReading {
  id: string;
  cylinder_id: string;
  reading_date: string;
  reading_type: 'weighed' | 'estimated_batch_use' | 'refill_in' | 'empty_out';
  gross_weight: number;
  tare_weight: number;
  remaining_gas_kg: number;
  gas_consumed_kg: number;
  batch_id?: string | null;
  notes?: string | null;
  recorded_by?: string | null;
  created_at?: string;
}

export interface InventoryWastage {
  id: string;
  wastage_number: string;
  wastage_date: string;
  ingredient_id: string;
  ingredient?: Ingredient;
  lot_id?: string | null;
  quantity: number;
  base_unit: UnitType;
  unit_cost: number;
  total_loss_value: number;
  wastage_type: InventoryWastageType;
  reason: string;
  photo_url?: string | null;
  recorded_by?: string | null;
  approved_by?: string | null;
  created_at?: string;
}

export interface SupplierReturn {
  id: string;
  return_number: string;
  return_date: string;
  supplier_id?: string | null;
  supplier?: Supplier;
  purchase_id?: string | null;
  ingredient_id: string;
  ingredient?: Ingredient;
  lot_id?: string | null;
  returned_quantity: number;
  base_unit: UnitType;
  unit_cost: number;
  total_refund_amount: number;
  actual_refund_received: number;
  reason: string;
  status: 'pending' | 'completed' | 'cancelled';
  created_by?: string | null;
  created_at?: string;
}

export interface ReorderItem {
  id: string;
  ingredient_id: string;
  ingredient?: Ingredient;
  suggested_quantity: number;
  base_unit: UnitType;
  supplier_id?: string | null;
  supplier?: Supplier;
  status: 'needed' | 'ordered' | 'received';
  ordered_at?: string | null;
  notes?: string | null;
  updated_at?: string;
}

export interface RawMaterialDashboardKPIs {
  total_stock_value: number;
  low_stock_count: number;
  out_of_stock_count: number;
  expiring_soon_count: number;
  lpg_full_count: number;
  lpg_in_use_count: number;
  lpg_empty_count: number;
  total_lpg_remaining_kg: number;
  purchases_this_month: number;
  consumption_this_month: number;
  wastage_this_month: number;
  pending_physical_count: boolean;
}

export interface IngredientPrice {
  id: string;
  ingredient_id: string;
  rate: number;
  unit: UnitType;
  effective_from: string;
  effective_to?: string | null;
  created_by?: string;
  created_at?: string;
}

export interface AdditionalOverheads {
  electricity: number;
  generator_fuel: number;
  gas: number;
  direct_labour: number;
  water: number;
  packaging_extra: number;
  transport: number;
  other: number;
}

export interface RecipeItem {
  id?: string;
  recipe_id?: string;
  ingredient_id: string;
  quantity: number;
  unit: UnitType;
  is_optional?: boolean;
  sort_order?: number;
  ingredient?: Ingredient;
}

export interface Recipe {
  id: string;
  product_id: string;
  version_number: number;
  name: string;
  standard_output_pieces: number;
  default_overheads: AdditionalOverheads;
  notes?: string | null;
  is_default: boolean;
  effective_from: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface RecipeWithItems extends Recipe {
  items: (RecipeItem & { ingredient?: Ingredient })[];
  product?: Product;
}

export interface CostingIngredientRow {
  ingredient_id: string;
  name_en: string;
  name_hi: string;
  category: IngredientCategory;
  is_selected: boolean;
  quantity: number;
  unit: UnitType;
  rate: number;
  rate_unit: UnitType;
  calculated_cost: number;
  save_rate_to_master?: boolean;
  is_custom?: boolean;
}

export interface ProductionBatchIngredient {
  id: string;
  batch_id: string;
  ingredient_id?: string | null;
  ingredient_name: string;
  quantity_used: number;
  unit: UnitType;
  converted_base_quantity: number;
  rate_snapshot: number;
  rate_unit: UnitType;
  calculated_cost: number;
  is_packaging: boolean;
  created_at?: string;
}

export interface CostCalculationBreakdown {
  milk_cost: number;
  sugar_cost: number;
  khoya_cost: number;
  cashew_cost: number;
  pistachio_cost: number;
  almond_cost: number;
  custard_cost: number;
  cardamom_cost: number;
  saffron_cost: number;
  flavour_cost: number;
  sticks_cost: number;
  wrappers_cost: number;
  packing_cost: number;
  other_ingredient_cost: number;
  total_ingredient_cost: number;
  total_packaging_cost: number;
  electricity_fuel_cost: number;
  labour_cost: number;
  other_overheads_cost: number;
  total_overheads_cost: number;
  total_batch_cost: number;
  actual_pieces_produced: number;
  damaged_pieces: number;
  saleable_pieces: number;
  cost_per_saleable_kulfi: number;
  selling_price_per_kulfi: number;
  estimated_profit_per_kulfi: number;
  expected_total_sales: number;
  estimated_total_gross_profit: number;
  gross_margin_percentage: number;
  missing_rate_ingredients: string[];
}

export interface ProductionScalingResult {
  required_quantity: number;
  standard_output: number;
  scale_factor: number;
  required_batches: number;
  scaled_ingredients: {
    name_en: string;
    name_hi: string;
    quantity: number;
    unit: UnitType;
    estimated_cost: number;
  }[];
  scaled_overheads: AdditionalOverheads;
  estimated_total_cost: number;
  estimated_cost_per_piece: number;
}



