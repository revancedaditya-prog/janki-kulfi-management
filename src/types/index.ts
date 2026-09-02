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
export type UnitType = 'kg' | 'g' | 'litre' | 'ml' | 'piece' | 'pack';
export type IngredientCategory =
  | 'dairy'
  | 'sweetener'
  | 'dry_fruit'
  | 'spice'
  | 'flavoring'
  | 'packaging'
  | 'other';

export interface Ingredient {
  id: string;
  code: string;
  name_en: string;
  name_hi: string;
  category: IngredientCategory;
  base_unit: UnitType;
  current_rate: number;
  rate_unit: UnitType;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
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



