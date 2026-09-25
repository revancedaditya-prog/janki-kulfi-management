Warning: truncated output (original token count: 71661)
Total output lines: 7152

import {
  Profile,
  Product,
  ProductPrice,
  ProductWithPrice,
  CommissionType,
  Cart,
  Seller,
  StockLocation,
  ProductionBatchWithItems,
  SellerIssueWithDetails,
  SellerSettlementWithDetails,
  Expense,
  StockMovement,
  DailyClosing,
  AuditLog,
  DashboardSummary,
  BackupHistory,
  RevisionRecord,
  Ingredient,
  IngredientPrice,
  Recipe,
  RecipeItem,
  RecipeWithItems,
  ProductionBatchIngredient,
  AdditionalOverheads,
  UnitType,
  Supplier,
  MaterialPurchase,
  MaterialPurchaseItem,
  MaterialPurchaseWithItems,
  InventoryLot,
  RawMaterialMovement,
  PhysicalStockCount,
  PhysicalStockCountItem,
  PhysicalStockCountWithItems,
  LpgCylinder,
  LpgCylinderReading,
  SimpleLpgCylinder,
  SimpleLpgMovement,
  SimpleLpgCylinderStatus,
  SimpleLpgMovementType,
  LpgSummaryKPIs,
  InventoryWastage,
  SupplierReturn,
  ReorderItem,
  RawMaterialDashboardKPIs,
  ExpenseHead,
  MonthlyExpenseItem,
  MonthlyExpenseSummary,
  ProfitLossReport,
} from '@/types';
import {
  calculateSaleableProduction,
  calculateSettlementSummary,
  calculateEstimatedDailyProfit,
} from './calculations';
import {
  convertQuantity,
  calculateWeightedAverageRate,
  getExpiryStatus,
} from './inventoryService';
import { generateId } from './utils';
import { getTodayDateString, formatLpgDuration } from './formatters';

const STORAGE_KEY = 'janki_local_store_v1';

interface LocalStoreState {
  profiles: Profile[];
  products: Product[];
  product_prices: ProductPrice[];
  carts: Cart[];
  sellers: Seller[];
  stock_locations: StockLocation[];
  production_batches: ProductionBatchWithItems[];
  seller_issues: SellerIssueWithDetails[];
  seller_settlements: SellerSettlementWithDetails[];
  expenses: Expense[];
  stock_movements: StockMovement[];
  daily_closings: DailyClosing[];
  audit_logs: AuditLog[];
  backup_history: BackupHistory[];
  revision_records: RevisionRecord[];
  ingredients?: Ingredient[];
  ingredient_prices?: IngredientPrice[];
  recipes?: Recipe[];
  recipe_items?: RecipeItem[];
  production_batch_ingredients?: ProductionBatchIngredient[];
  suppliers?: Supplier[];
  material_purchases?: MaterialPurchase[];
  material_purchase_items?: MaterialPurchaseItem[];
  inventory_lots?: InventoryLot[];
  raw_material_movements?: RawMaterialMovement[];
  physical_stock_counts?: PhysicalStockCount[];
  physical_stock_count_items?: PhysicalStockCountItem[];
  lpg_cylinders?: SimpleLpgCylinder[];
  lpg_cylinder_movements?: SimpleLpgMovement[];
  lpg_cylinder_readings?: LpgCylinderReading[];
  inventory_wastage?: InventoryWastage[];
  supplier_returns?: SupplierReturn[];
  reorder_list?: ReorderItem[];
  expense_heads?: ExpenseHead[];
}

const DEFAULT_STATE: LocalStoreState = {
  backup_history: [],
  revision_records: [],
  profiles: [
    {
      id: 'usr-owner-001',
      full_name: 'Aditya Kumar (मालिक)',
      phone: '7906564964',
      role: 'owner',
      preferred_language: 'hi',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'usr-prod-002',
      full_name: 'Ram Niwas (कारखाना प्रभारी)',
      phone: '9876500002',
      role: 'production_worker',
      preferred_language: 'hi',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'usr-seller-003',
      full_name: 'Ramesh Kumar (ठेला 1)',
      phone: '9876543210',
      role: 'seller',
      preferred_language: 'hi',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'usr-seller-004',
      full_name: 'Suresh Chandra (ठेला 2)',
      phone: '9876543211',
      role: 'seller',
      preferred_language: 'hi',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  products: [
    {
      id: 'prod-sada-01',
      name_en: 'Sada Kulfi',
      name_hi: 'सादा कुल्फी',
      sku: 'JK-SADA-01',
      description: 'Classic traditional stick kulfi with cardamom and malai',
      is_active: true,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'prod-rabri-02',
      name_en: 'Rabri Kulfi',
      name_hi: 'रबड़ी कुल्फी',
      sku: 'JK-RABRI-02',
      description: 'Thick reduced milk rabri kulfi with almond and pistachio flakes',
      is_active: true,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'prod-prem-03',
      name_en: 'Premium Kulfi',
      name_hi: 'प्रीमियम कुल्फी',
      sku: 'JK-PREM-03',
      description: 'Special saffron-infused royal kulfi with cashews, almonds & pistachios',
      is_active: true,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ],
  product_prices: [
    {
      id: 'price-sada-01',
      product_id: 'prod-sada-01',
      selling_price: 10.0,
      commission_type: 'fixed',
      commission_value: 2.0,
      effective_from: '2026-01-01T00:00:00.000Z',
      effective_to: null,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'price-rabri-02',
      product_id: 'prod-rabri-02',
      selling_price: 20.0,
      commission_type: 'fixed',
      commission_value: 4.0,
      effective_from: '2026-01-01T00:00:00.000Z',
      effective_to: null,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'price-prem-03',
      product_id: 'prod-prem-03',
      selling_price: 40.0,
      commission_type: 'fixed',
      commission_value: 8.0,
      effective_from: '2026-01-01T00:00:00.000Z',
      effective_to: null,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ],
  carts: [
    {
      id: 'cart-01',
      cart_code: 'CART-01',
      cart_name: 'Mirehchi Chowk Cart (ठेला 1)',
      location: 'Mirehchi Main Market Chauraha',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'cart-02',
      cart_code: 'CART-02',
      cart_name: 'Bus Stand Mobile Cart (ठेला 2)',
      location: 'Etah Road Bus Stand Point',
      is_active: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ],
  sellers: [
    {
      id: 'slr-001',
      seller_code: 'SLR-001',
      full_name: 'Ramesh Kumar (रमेश कुमार)',
      phone: '9876543210',
      address: 'Ward 4, Mirehchi, Etah',
      user_profile_id: 'usr-seller-003',
      default_cart_id: 'cart-01',
      is_active: true,
      opening_balance: 0.0,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'slr-002',
      seller_code: 'SLR-002',
      full_name: 'Suresh Chandra (सुरेश चन्द्र)',
      phone: '9876543211',
      address: 'Station Road, Mirehchi, Etah',
      user_profile_id: 'usr-seller-004',
      default_cart_id: 'cart-02',
      is_active: true,
      opening_balance: 0.0,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ],
  stock_locations: [
    {
      id: 'loc-prod',
      location_type: 'production',
      name: 'Production Floor',
      seller_id: null,
      cart_id: null,
      is_active: true,
    },
    {
      id: 'loc-freezer',
      location_type: 'main_freezer',
      name: 'Main Cold Storage Freezer',
      seller_id: null,
      cart_id: null,
      is_active: true,
    },
    {
      id: 'loc-returned',
      location_type: 'returned',
      name: 'Returned Stock Holding',
      seller_id: null,
      cart_id: null,
      is_active: true,
    },
    {
      id: 'loc-damaged',
      location_type: 'damaged',
      name: 'Damaged & Melted Waste',
      seller_id: null,
      cart_id: null,
      is_active: true,
    },
    {
      id: 'loc-comp',
      location_type: 'complimentary',
      name: 'Complimentary / Tasting Stock',
      seller_id: null,
      cart_id: null,
      is_active: true,
    },
    {
      id: 'loc-seller-01',
      location_type: 'seller',
      name: 'Ramesh Kumar Cart Stock',
      seller_id: 'slr-001',
      cart_id: 'cart-01',
      is_active: true,
    },
    {
      id: 'loc-seller-02',
      location_type: 'seller',
      name: 'Suresh Chandra Cart Stock',
      seller_id: 'slr-002',
      cart_id: 'cart-02',
      is_active: true,
    },
  ],
  production_batches: [],
  seller_issues: [],
  seller_settlements: [],
  expenses: [],
  stock_movements: [],
  daily_closings: [],
  audit_logs: [],
  suppliers: [
    {
      id: 'sup-dairy-01',
      name: 'Shri Shyam Dairy & Khoya Bhandar',
      contact_person: 'Rakesh Yadav',
      phone: '9876543210',
      email: 'shyamdairy.etah@gmail.com',
      address: 'Main Market, Mirehchi, Etah',
      gst_number: '09AAAFJ1234K1Z5',
      is_active: true,
      notes: 'Fresh Buffalo Milk & Pure Khoya Supplier',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'sup-sugar-02',
      name: 'Garg Sugar & Dry Fruits Agency',
      contact_person: 'Manoj Garg',
      phone: '9876501234',
      email: 'gargagency@gmail.com',
      address: 'Galla Mandi, Etah',
      gst_number: '09AAACG5678L1Z2',
      is_active: true,
      notes: 'Wholesale Sugar, Almonds, Cashew, Pista, Cardamom, Saffron',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'sup-gas-03',
      name: 'Bharat Gas Agency Mirehchi',
      contact_person: 'Sanjay Sharma',
      phone: '9876512345',
      email: 'bharatgas.mirehchi@gmail.com',
      address: 'Station Road, Mirehchi',
      is_active: true,
      notes: '19kg Commercial LPG Cylinder Supplier',
      created_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'sup-pack-04',
      name: 'Agra Packaging & Plastics',
      contact_person: 'Deepak Agrawal',
      phone: '9876598765',
      email: 'agrapackaging@gmail.com',
      address: 'Transport Nagar, Agra',
      is_active: true,
      notes: 'Kulfi Sticks, Food-grade Wrappers, Cartons & Pouches',
      created_at: '2026-01-01T00:00:00.000Z',
    },
  ],
  ingredients: [
    { id: 'ing-milk-01', code: 'ING-MILK', name_en: 'Milk', name_hi: 'दूध', category: 'dairy', base_unit: 'litre', purchase_unit: 'litre', conversion_factor: 1, min_stock_level: 20, reorder_quantity: 50, current_rate: 60.0, rate_unit: 'litre', preferred_supplier_id: 'sup-dairy-01', preferred_supplier_name: 'Shri Shyam Dairy & Khoya Bhandar', storage_location: 'Cold Storage Room', track_expiry: true, track_lots: true, is_active: true },
    { id: 'ing-sug-02', code: 'ING-SUGAR', name_en: 'Sugar', name_hi: 'चीनी', category: 'sweetener', base_unit: 'kg', purchase_unit: 'kg', conversion_factor: 1, min_stock_level: 10, reorder_quantity: 50, current_rate: 48.0, rate_unit: 'kg', preferred_supplier_id: 'sup-sugar-02', preferred_supplier_name: 'Garg Sugar & Dry Fruits Agency', storage_location: 'Dry Goods Store', track_expiry: false, track_lots: true, is_active: true },
    { id: 'ing-khoy-03', code: 'ING-KHOYA', name_en: 'Khoya', name_hi: 'खोया / मावा', category: 'dairy', base_unit: 'kg', purchase_unit: 'kg', conversion_factor: 1, min_stock_level: 5, reorder_quantity: 20, current_rate: 320.0, rate_unit: 'kg', preferred_supplier_id: 'sup-dairy-01', preferred_supplier_name: 'Shri Shyam Dairy & Khoya Bhandar', storage_location: 'Cold Storage Room', track_expiry: true, track_lots: true, is_active: true },
    { id: 'ing-cash-04', code: 'ING-CASHEW', name_en: 'Cashew', name_hi: 'काजू', category: 'dry_fruit', base_unit: 'kg', purchase_unit: 'kg', conversion_factor: 1, min_stock_level: 2, reorder_quantity: 5, current_rate: 800.0, rate_unit: 'kg', preferred_supplier_id: 'sup-sugar-02', preferred_supplier_name: 'Garg Sugar & Dry Fruits Agency', storage_location: 'Dry Goods Store', track_expiry: true, track_lots: true, is_active: true },
    { id: 'ing-pist-05', code: 'ING-PISTA', name_en: 'Pistachio', name_hi: 'पिस्ता', category: 'dry_fruit', base_unit: 'kg', purchase_unit: 'kg', conversion_factor: 1, min_stock_level: 1, reorder_quantity: 3, current_rate: 1200.0, rate_unit: 'kg', preferred_supplier_id: 'sup-sugar-02', preferred_supplier_name: 'Garg Sugar & Dry Fruits Agency', storage_location: 'Dry Goods Store', track_expiry: true, track_lots: true, is_active: true },
    { id: 'ing-almd-06', code: 'ING-ALMOND', name_en: 'Almond', name_hi: 'बादाम', category: 'dry_fruit', base_unit: 'kg', purchase_unit: 'kg', conversion_factor: 1, min_stock_level: 2, reorder_quantity: 5, current_rate: 750.0, rate_unit: 'kg', preferred_supplier_id: 'sup-sugar-02', preferred_supplier_name: 'Garg Sugar & Dry Fruits Agency', storage_location: 'Dry Goods Store', track_expiry: true, track_lots: true, is_active: true },
    { id: 'ing-cust-07', code: 'ING-CUSTARD', name_en: 'Custard powder', name_hi: 'कस्टर्ड पाउडर', category: 'flavoring', base_unit: 'kg', purchase_unit: 'kg', conversion_factor: 1, min_stock_level: 2, reorder_quantity: 5, current_rate: 160.0, rate_unit: 'kg', preferred_supplier_id: 'sup-sugar-02', preferred_supplier_name: 'Garg Sugar & Dry Fruits Agency', storage_location: 'Dry Goods Store', track_expiry: true, track_lots: true, is_active: true },
    { id: 'ing-card-08', code: 'ING-CARDAMOM', name_en: 'Cardamom', name_hi: 'इलायची', category: 'spice', base_unit: 'kg', purchase_unit: 'kg', conversion_factor: 1, min_stock_level: 0.5, reorder_quantity: 1, current_rate: 2400.0, rate_unit: 'kg', preferred_supplier_id: 'sup-sugar-02', preferred_supplier_name: 'Garg Sugar & Dry Fruits Agency', storage_location: 'Spices Safe', track_expiry: true, track_lots: true, is_active: true },
    { id: 'ing-saff-09', code: 'ING-SAFFRON', name_en: 'Saffron', name_hi: 'केसर', category: 'spice', base_unit: 'g', purchase_unit: 'g', conversion_factor: 1, min_stock_level: 10, reorder_quantity: 25, current_rate: 250.0, rate_unit: 'g', preferred_supplier_id: 'sup-sugar-02', preferred_supplier_name: 'Garg Sugar & Dry Fruits Agency', storage_location: 'Spices Safe', track_expiry: true, track_lots: true, is_active: true },
    { id: 'ing-flav-10', code: 'ING-FLAVOUR', name_en: 'Flavour', name_hi: 'फ्लेवर', category: 'flavoring', base_unit: 'ml', purchase_unit: 'bottle', conversion_factor: 500, min_stock_level: 200, reorder_quantity: 1000, current_rate: 1.5, rate_unit: 'ml', preferred_supplier_id: 'sup-sugar-02', preferred_supplier_name: 'Garg Sugar & Dry Fruits Agency', storage_location: 'Dry Goods Store', track_expiry: true, track_lots: true, is_active: true },
    { id: 'ing-stk-11', code: 'ING-STICK', name_en: 'Kulfi stick', name_hi: 'कुल्फी स्टिक', category: 'packaging', base_unit: 'piece', purchase_unit: 'box', conversion_factor: 1000, min_stock_level: 1000, reorder_quantity: 5000, current_rate: 0.3, rate_unit: 'piece', preferred_supplier_id: 'sup-pack-04', preferred_supplier_name: 'Agra Packaging & Plastics', storage_location: 'Packaging Area', track_expiry: false, track_lots: false, is_active: true },
    { id: 'ing-wrp-12', code: 'ING-WRAPPER', name_en: 'Wrapper', name_hi: 'रैपर', category: 'packaging', base_unit: 'piece', purchase_unit: 'packet', conversion_factor: 500, min_stock_level: 1000, reorder_quantity: 5000, current_rate: 0.4, rate_unit: 'piece', preferred_supplier_id: 'sup-pack-04', preferred_supplier_name: 'Agra Packaging & Plastics', storage_location: 'Packaging Area', track_expiry: false, track_lots: false, is_active: true },
    { id: 'ing-pck-13', code: 'ING-POUCH', name_en: 'Pouch/packing', name_hi: 'पैकिंग', category: 'packaging', base_unit: 'piece', purchase_unit: 'packet', conversion_factor: 500, min_stock_level: 1000, reorder_quantity: 5000, current_rate: 0.5, rate_unit: 'piece', preferred_supplier_id: 'sup-pack-04', preferred_supplier_name: 'Agra Packaging & Plastics', storage_location: 'Packaging Area', track_expiry: false, track_lots: false, is_active: true },
    { id: 'ing-lpg-15', code: 'ING-LPG', name_en: 'LPG Gas', name_hi: 'एलपीजी गैस', category: 'fuel', base_unit: 'kg', purchase_unit: 'cylinder', conversion_factor: 19, min_stock_level: 19, reorder_quantity: 38, current_rate: 94.74, rate_unit: 'kg', preferred_supplier_id: 'sup-gas-03', preferred_supplier_name: 'Bharat Gas Agency Mirehchi', storage_location: 'Kitchen Burner Area', track_expiry: false, track_lots: false, is_active: true },
    { id: 'ing-oth-14', code: 'ING-OTHER', name_en: 'Other ingredient', name_hi: 'अन्य सामग्री', category: 'other', base_unit: 'kg', purchase_unit: 'kg', conversion_factor: 1, min_stock_level: 5, reorder_quantity: 10, current_rate: 100.0, rate_unit: 'kg', storage_location: 'General Store', track_expiry: false, track_lots: false, is_active: true },
  ],
  lpg_cylinders: [
    {
      id: 'cyl-01',
      cylinder_code: 'C-1',
      status: 'connected',
      current_place: 'Kulfi Bhatti 1',
      connected_at: '2026-09-05T08:00:00.000Z',
      last_movement_at: '2026-09-05T08:00:00.000Z',
      supplier_name: 'Bharat Gas Agency',
      is_active: true,
      sort_order: 1,
      notes: 'Initial operational cylinder',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-05T08:00:00.000Z',
    },
    {
      id: 'cyl-02',
      cylinder_code: 'C-2',
      status: 'full',
      current_place: 'Cylinder Storage Yard',
      connected_at: null,
      last_movement_at: '2026-09-06T10:00:00.000Z',
      supplier_name: 'Bharat Gas Agency',
      is_active: true,
      sort_order: 2,
      notes: 'Standby full cylinder',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-06T10:00:00.000Z',
    },
    {
      id: 'cyl-03',
      cylinder_code: 'C-3',
      status: 'sent_for_refill',
      current_place: 'Bharat Gas Agency',
      connected_at: null,
      last_movement_at: '2026-09-06T15:30:00.000Z',
      supplier_name: 'Bharat Gas Agency',
      is_active: true,
      sort_order: 3,
      notes: 'Sent via Challan #4401',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-06T15:30:00.000Z',
    },
    {
      id: 'cyl-04',
      cylinder_code: 'C-4',
      status: 'empty',
      current_place: 'Empty Yard',
      connected_at: null,
      last_movement_at: '2026-09-04T12:00:00.000Z',
      supplier_name: 'Bharat Gas Agency',
      is_active: true,
      sort_order: 4,
      notes: 'Removed from Bhatti 2',
      created_at: '2026-09-01T00:00:00.000Z',
      updated_at: '2026-09-04T12:00:00.000Z',
    },
  ],
  lpg_cylinder_movements: [
    {
      id: 'mov-01',
      cylinder_id: 'cyl-01',
      movement_date: '2026-09-05',
      movement_type: 'connected',
      previous_status: 'full',
      new_status: 'connected',
      bhatti_place: 'Kulfi Bhatti 1',
      connected_at: '2026-09-05T08:00:00.000Z',
      empty_removed_at: null,
      running_duration_text: null,
      running_duration_minutes: null,
      supplier_name: 'Bharat Gas Agency',
      bill_number: null,
      notes: 'Connected to Kulfi Bhatti 1',
      is_correction: false,
      corrected_movement_id: null,
      created_by: 'usr-owner-001',
      created_by_name: 'Aditya Kumar (मालिक)',
      created_at: '2026-09-05T08:00:00.000Z',
    },
    {
      id: 'mov-02',
      cylinder_id: 'cyl-02',
      movement_date: '2026-09-06',
      movement_type: 'refill_received',
      previous_status: 'sent_for_refill',
      new_status: 'full',
      bhatti_place: null,
      connected_at: null,
      empty_removed_at: null,
      running_duration_text: null,
      running_duration_minutes: null,
      supplier_name: 'Bharat Gas Agency',
      bill_number: 'BGA-9921',
      notes: 'Full refill received',
      is_correction: false,
      corrected_movement_id: null,
      created_by: 'usr-owner-001',
      created_by_name: 'Aditya Kumar (मालिक)',
      created_at: '2026-09-06T10:00:00.000Z',
    },
    {
      id: 'mov-03',
      cylinder_id: 'cyl-03',
      movement_date: '2026-09-06',
      movement_type: 'refill_sent',
      previous_status: 'empty',
      new_status: 'sent_for_refill',
      bhatti_place: null,
      connected_at: null,
      empty_removed_at: null,
      running_duration_text: null,
      running_duration_minutes: null,
      supplier_name: 'Bharat Gas Agency',
      bill_number: 'CH-4401',
      notes: 'Sent to agency for refill',
      is_correction: false,
      corrected_movement_id: null,
      created_by: 'usr-owner-001',
      created_by_name: 'Aditya Kumar (मालिक)',
      created_at: '2026-09-06T15:30:00.000Z',
    },
    {
      id: 'mov-04',
      cylinder_id: 'cyl-04',
      movement_date: '2026-09-04',
      movement_type: 'empty_removed',
      previous_status: 'connected',
      new_status: 'empty',
      bhatti_place: 'Kulfi Bhatti 2',
      connected_at: '2026-08-30T09:00:00.000Z',
      empty_removed_at: '2026-09-04T12:00:00.000Z',
      running_duration_text: '5 दिन 3 घंटे (5 days 3 hrs)',
      running_duration_minutes: 7380,
      supplier_name: 'Bharat Gas Agency',
      bill_number: null,
      notes: 'Gas depleted during rabdi boiling',
      is_correction: false,
      corrected_movement_id: null,
      created_by: 'usr-owner-001',
      created_by_name: 'Aditya Kumar (मालिक)',
      created_at: '2026-09-04T12:00:00.000Z',
    },
  ],
  raw_material_movements: [
    { id: 'rmm-01', ingredient_id: 'ing-milk-01', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Cold Storage Room', quantity: 50, base_unit: 'litre', movement_type: 'opening_stock', unit_cost_snapshot: 60.0, total_value_snapshot: 3000.0, reason: 'Initial Opening Stock' },
    { id: 'rmm-02', ingredient_id: 'ing-sug-02', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Dry Goods Store', quantity: 40, base_unit: 'kg', movement_type: 'opening_stock', unit_cost_snapshot: 48.0, total_value_snapshot: 1920.0, reason: 'Initial Opening Stock' },
    { id: 'rmm-03', ingredient_id: 'ing-khoy-03', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Cold Storage Room', quantity: 15, base_unit: 'kg', movement_type: 'opening_stock', unit_cost_snapshot: 320.0, total_value_snapshot: 4800.0, reason: 'Initial Opening Stock' },
    { id: 'rmm-04', ingredient_id: 'ing-cash-04', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Dry Goods Store', quantity: 5, base_unit: 'kg', movement_type: 'opening_stock', unit_cost_snapshot: 800.0, total_value_snapshot: 4000.0, reason: 'Initial Opening Stock' },
    { id: 'rmm-05', ingredient_id: 'ing-pist-05', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Dry Goods Store', quantity: 3, base_unit: 'kg', movement_type: 'opening_stock', unit_cost_snapshot: 1200.0, total_value_snapshot: 3600.0, reason: 'Initial Opening Stock' },
    { id: 'rmm-06', ingredient_id: 'ing-almd-06', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Dry Goods Store', quantity: 5, base_unit: 'kg', movement_type: 'opening_stock', unit_cost_snapshot: 750.0, total_value_snapshot: 3750.0, reason: 'Initial Opening Stock' },
    { id: 'rmm-07', ingredient_id: 'ing-cust-07', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Dry Goods Store', quantity: 5, base_unit: 'kg', movement_type: 'opening_stock', unit_cost_snapshot: 160.0, total_value_snapshot: 800.0, reason: 'Initial Opening Stock' },
    { id: 'rmm-08', ingredient_id: 'ing-card-08', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Spices Safe', quantity: 1, base_unit: 'kg', movement_type: 'opening_stock', unit_cost_snapshot: 2400.0, total_value_snapshot: 2400.0, reason: 'Initial Opening Stock' },
    { id: 'rmm-09', ingredient_id: 'ing-saff-09', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Spices Safe', quantity: 50, base_unit: 'g', movement_type: 'opening_stock', unit_cost_snapshot: 250.0, total_value_snapshot: 12500.0, reason: 'Initial Opening Stock' },
    { id: 'rmm-10', ingredient_id: 'ing-flav-10', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Dry Goods Store', quantity: 1000, base_unit: 'ml', movement_type: 'opening_stock', unit_cost_snapshot: 1.5, total_value_snapshot: 1500.0, reason: 'Initial Opening Stock' },
    { id: 'rmm-11', ingredient_id: 'ing-stk-11', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Packaging Area', quantity: 5000, base_unit: 'piece', movement_type: 'opening_stock', unit_cost_snapshot: 0.3, total_value_snapshot: 1500.0, reason: 'Initial Opening Stock' },
    { id: 'rmm-12', ingredient_id: 'ing-wrp-12', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Packaging Area', quantity: 5000, base_unit: 'piece', movement_type: 'opening_stock', unit_cost_snapshot: 0.4, total_value_snapshot: 2000.0, reason: 'Initial Opening Stock' },
    { id: 'rmm-13', ingredient_id: 'ing-pck-13', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Packaging Area', quantity: 5000, base_unit: 'piece', movement_type: 'opening_stock', unit_cost_snapshot: 0.5, total_value_snapshot: 2500.0, reason: 'Initial Opening Stock' },
    { id: 'rmm-14', ingredient_id: 'ing-lpg-15', movement_date: '2026-01-01T00:00:00.000Z', source_location: 'Opening Balance', destination_location: 'Kitchen Burner Area', quantity: 33.3, base_unit: 'kg', movement_type: 'opening_stock', unit_cost_snapshot: 94.74, total_value_snapshot: 3154.84, reason: 'Initial Opening Stock' },
  ],
  material_purchases: [],
  material_purchase_items: [],
  inventory_lots: [],
  physical_stock_counts: [],
  physical_stock_count_items: [],
  lpg_cylinder_readings: [],
  inventory_wastage: [],
  supplier_returns: [],
  reorder_list: [],
  expense_heads: [
    {
      id: 'e1000000-0000-0000-0000-000000000001',
      code: 'EXP-RENT-01',
      name_en: 'Shop/Factory/Warehouse Rent',
      name_hi: 'दुकान/कारखाना/गोदाम का किराया',
      expense_group: 'monthly_fixed',
      calculation_mode: 'manual',
      default_amount: 15000,
      due_day: 5,
      start_date: '2026-01-01',
      end_date: null,
      notes: 'Monthly lease for factory and warehouse',
      is_active: true,
      is_archived: false,
      sort_order: 1,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'e1000000-0000-0000-0000-000000000002',
      code: 'EXP-PERM-SAL-02',
      name_en: 'Permanent Employee Salary',
      name_hi: 'स्थायी कर्मचारियों की salary',
      expense_group: 'monthly_fixed',
      calculation_mode: 'manual',
      default_amount: 25000,
      due_day: 7,
      start_date: '2026-01-01',
      end_date: null,
      notes: 'Monthly wages for permanent factory workers',
      is_active: true,
      is_archived: false,
      sort_order: 2,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'e1000000-0000-0000-0000-000000000003',
      code: 'EXP-OWNER-SAL-03',
      name_en: 'Owner/Manager Salary',
      name_hi: 'Owner/Manager salary',
      expense_group: 'monthly_fixed',
      calculation_mode: 'manual',
      default_amount: 20000,
      due_day: 10,
      start_date: '2026-01-01',
      end_date: null,
      notes: 'Managerial compensation',
      is_active: true,
      is_archived: false,
      sort_order: 3,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'e1000000-0000-0000-0000-000000000004',
      code: 'EXP-INGR-PKG-04',
      name_en: 'Ingredients & Packaging',
      name_hi: 'कच्चा माल व पैकेजिंग',
      expense_group: 'variable_production',
      calculation_mode: 'automatic',
      default_amount: 0,
      due_day: 1,
      start_date: '2026-01-01',
      end_date: null,
      notes: 'Auto-calculated from batch recipe consumption',
      is_active: true,
      is_archived: false,
      sort_order: 4,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'e1000000-0000-0000-0000-000000000005',
      code: 'EXP-LPG-ENERGY-05',
      name_en: 'LPG & Energy Consumption',
      name_hi: 'LPG गैस व ऊर्जा',
      expense_group: 'variable_production',
      calculation_mode: 'automatic',
      default_amount: 0,
      due_day: 1,
      start_date: '2026-01-01',
      end_date: null,
      notes: 'Auto-calculated from cylinder readings and production',
      is_active: true,
      is_archived: false,
      sort_order: 5,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'e1000000-0000-0000-0000-000000000006',
      code: 'EXP-WATER-CLEAN-06',
      name_en: 'Water & Cleaning',
      name_hi: 'पानी व सफाई',
      expense_group: 'variable_production',
      calculation_mode: 'manual',
      default_amount: 1000,
      due_day: 15,
      start_date: '2026-01-01',
      end_date: null,
      notes: 'Water supply and cleaning supplies',
      is_active: true,
      is_archived: false,
      sort_order: 6,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'e1000000-0000-0000-0000-000000000007',
      code: 'EXP-TEMP-LAB-07',
      name_en: 'Temporary Labour',
      name_hi: 'अस्थायी मजदूरी',
      expense_group: 'variable_production',
      calculation_mode: 'manual',
      default_amount: 0,
      due_day: 1,
      start_date: '2026-01-01',
      end_date: null,
      notes: 'Daily / temporary packaging & helper wages',
      is_active: true,
      is_archived: false,
      sort_order: 7,
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ],
  ingredient_prices: [
    { id: 'ip-01', ingredient_id: 'ing-milk-01', rate: 60.0, unit: 'litre', effective_from: '2026-01-01T00:00:00.000Z' },
    { id: 'ip-02', ingredient_id: 'ing-sug-02', rate: 48.0, unit: 'kg', effective_from: '2026-01-01T00:00:00.000Z' },
    { id: 'ip-03', ingredient_id: 'ing-khoy-03', rate: 320.0, unit: 'kg', effective_from: '2026-01-01T00:00:00.000Z' },
    { id: 'ip-04', ingredient_id: 'ing-cash-04', rate: 800.0, unit: 'kg', effective_from: '2026-01-01T00:00:00.000Z' },
    { id: 'ip-05', ingredient_id: 'ing-pist-05', rate: 1200.0, unit: 'kg', effective_from: '2026-01-01T00:00:00.000Z' },
    { id: 'ip-06', ingredient_id: 'ing-almd-06', rate: 750.0, unit: 'kg', effective_from: '2026-01-01T00:00:00.000Z' },
    { id: 'ip-07', ingredient_id: 'ing-cust-07', rate: 160.0, unit: 'kg', effective_from: '2026-01-01T00:00:00.000Z' },
    { id: 'ip-08', ingredient_id: 'ing-card-08', rate: 2400.0, unit: 'kg', effective_from: '2026-01-01T00:00:00.000Z' },
    { id: 'ip-09', ingredient_id: 'ing-saff-09', rate: 250.0, unit: 'g', effective_from: '2026-01-01T00:00:00.000Z' },
    { id: 'ip-10', ingredient_id: 'ing-flav-10', rate: 1.5, unit: 'ml', effective_from: '2026-01-01T00:00:00.000Z' },
    { id: 'ip-11', ingredient_id: 'ing-stk-11', rate: 0.3, unit: 'piece', effective_from: '2026-01-01T00:00:00.000Z' },
    { id: 'ip-12', ingredient_id: 'ing-wrp-12', rate: 0.4, unit: 'piece', effective_from: '2026-01-01T00:00:00.000Z' },
    { id: 'ip-13', ingredient_id: 'ing-pck-13', rate: 0.5, unit: 'piece', effective_from: '2026-01-01T00:00:00.000Z' },
    { id: 'ip-14', ingredient_id: 'ing-oth-14', rate: 100.0, unit: 'kg', effective_from: '2026-01-01T00:00:00.000Z' },
  ],
  recipes: [
    {
      id: 'rec-sada-01',
      product_id: 'prod-sada-01',
      version_number: 1,
      name: '₹10 Sada Kulfi Standard Recipe',
      standard_output_pieces: 100,
      expected_yield_pieces: 100,
      default_overheads: {
        electricity: 30,
        generator_fuel: 0,
        gas: 50,
        direct_labour: 60,
        water: 0,
        packaging_extra: 0,
        transport: 10,
        other: 10,
      },
      notes: 'Classic standard stick kulfi with pure milk and cardamom',
      status: 'active',
      is_default: true,
      effective_from: '2026-01-01T00:00:00.000Z',
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'rec-rabri-02',
      product_id: 'prod-rabri-02',
      version_number: 1,
      name: '₹20 Rabri Kulfi Standard Recipe',
      standard_output_pieces: 100,
      expected_yield_pieces: 100,
      default_overheads: {
        electricity: 50,
        generator_fuel: 0,
        gas: 90,
        direct_labour: 100,
        water: 0,
        packaging_extra: 0,
        transport: 20,
        other: 20,
      },
      notes: 'Rich rabri kulfi with crushed almonds and pistachios',
      status: 'active',
      is_default: true,
      effective_from: '2026-01-01T00:00:00.000Z',
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'rec-prem-03',
      product_id: 'prod-prem-03',
      version_number: 1,
      name: '₹40 Premium Kulfi Standard Recipe',
      standard_output_pieces: 100,
      expected_yield_pieces: 100,
      default_overheads: {
        electricity: 70,
        generator_fuel: 0,
        gas: 130,
        direct_labour: 150,
        water: 0,
        packaging_extra: 0,
        transport: 30,
        other: 30,
      },
      notes: 'Royal saffron-infused kulfi loaded with cashews, pistachios and almonds',
      status: 'active',
      is_default: true,
      effective_from: '2026-01-01T00:00:00.000Z',
      created_by: 'usr-owner-001',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ],
  recipe_items: [
    // ₹10 Sada Kulfi
    { id: 'rit-sada-01', recipe_id: 'rec-sada-01', ingredient_id: 'ing-milk-01', quantity: 10, unit: 'litre', sort_order: 1 },
    { id: 'rit-sada-02', recipe_id: 'rec-sada-01', ingredient_id: 'ing-sug-02', quantity: 1.2, unit: 'kg', sort_order: 2 },
    { id: 'rit-sada-03', recipe_id: 'rec-sada-01', ingredient_id: 'ing-khoy-03', quantity: 0.5, unit: 'kg', sort_order: 3 },
    { id: 'rit-sada-04', recipe_id: 'rec-sada-01', ingredient_id: 'ing-card-08', quantity: 15, unit: 'g', sort_order: 4 },
    { id: 'rit-sada-05', recipe_id: 'rec-sada-01', ingredient_id: 'ing-stk-11', quantity: 100, unit: 'piece', sort_order: 5 },
    { id: 'rit-sada-06', recipe_id: 'rec-sada-01', ingredient_id: 'ing-wrp-12', quantity: 100, unit: 'piece', sort_order: 6 },

    // ₹20 Rabri Kulfi
    { id: 'rit-rabri-01', recipe_id: 'rec-rabri-02', ingredient_id: 'ing-milk-01', quantity: 18, unit: 'litre', sort_order: 1 },
    { id: 'rit-rabri-02', recipe_id: 'rec-rabri-02', ingredient_id: 'ing-sug-02', quantity: 1.8, unit: 'kg', sort_order: 2 },
    { id: 'rit-rabri-03', recipe_id: 'rec-rabri-02', ingredient_id: 'ing-khoy-03', quantity: 1.5, unit: 'kg', sort_order: 3 },
    { id: 'rit-rabri-04', recipe_id: 'rec-rabri-02', ingredient_id: 'ing-almd-06', quantity: 200, unit: 'g', sort_order: 4 },
    { id: 'rit-rabri-05', recipe_id: 'rec-rabri-02', ingredient_id: 'ing-pist-05', quantity: 100, unit: 'g', sort_order: 5 },
    { id: 'rit-rabri-06', recipe_id: 'rec-rabri-02', ingredient_id: 'ing-card-08', quantity: 25, unit: 'g', sort_order: 6 },
    { id: 'rit-rabri-07', recipe_id: 'rec-rabri-02', ingredient_id: 'ing-stk-11', quantity: 100, unit: 'piece', sort_order: 7 },
    { id: 'rit-rabri-08', recipe_id: 'rec-rabri-02', ingredient_id: 'ing-wrp-12', quantity: 100, unit: 'piece', sort_order: 8 },
    { id: 'rit-rabri-09', recipe_id: 'rec-rabri-02', ingredient_id: 'ing-pck-13', quantity: 100, unit: 'piece', sort_order: 9 },

    // ₹40 Premium Kulfi
    { id: 'rit-prem-01', recipe_id: 'rec-prem-03', ingredient_id: 'ing-milk-01', quantity: 25, unit: 'litre', sort_order: 1 },
    { id: 'rit-prem-02', recipe_id: 'rec-prem-03', ingredient_id: 'ing-sug-02', quantity: 2.5, unit: 'kg', sort_order: 2 },
    { id: 'rit-prem-03', recipe_id: 'rec-prem-03', ingredient_id: 'ing-khoy-03', quantity: 3.0, unit: 'kg', sort_order: 3 },
    { id: 'rit-prem-04', recipe_id: 'rec-prem-03', ingredient_id: 'ing-cash-04', quantity: 300, unit: 'g', sort_order: 4 },
    { id: 'rit-prem-05', recipe_id: 'rec-prem-03', ingredient_id: 'ing-pist-05', quantity: 250, unit: 'g', sort_order: 5 },
    { id: 'rit-prem-06', recipe_id: 'rec-prem-03', ingredient_id: 'ing-almd-06', quantity: 300, unit: 'g', sort_order: 6 },
    { id: 'rit-prem-07', recipe_id: 'rec-prem-03', ingredient_id: 'ing-saff-09', quantity: 2, unit: 'g', sort_order: 7 },
    { id: 'rit-prem-08', recipe_id: 'rec-prem-03', ingredient_id: 'ing-card-08', quantity: 40, unit: 'g', sort_order: 8 },
    { id: 'rit-prem-09', recipe_id: 'rec-prem-03', ingredient_id: 'ing-stk-11', quantity: 100, unit: 'piece', sort_order: 9 },
    { id: 'rit-prem-10', recipe_id: 'rec-prem-03', ingredient_id: 'ing-wrp-12', quantity: 100, unit: 'piece', sort_order: 10 },
    { id: 'rit-prem-11', recipe_id: 'rec-prem-03', ingredient_id: 'ing-pck-13', quantity: 100, unit: 'piece', sort_order: 11 },
  ],
  production_batch_ingredients: [],
};

class MockStore {
  private state: LocalStoreState;

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): LocalStoreState {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: LocalStoreState = JSON.parse(saved);
        const owner = parsed.profiles?.find((p) => p.id === 'usr-owner-001');
        if (owner && owner.phone !== '7906564964') {
          owner.phone = '7906564964';
        }
        if (!parsed.ingredients || parsed.ingredients.length === 0) {
          parsed.ingredients = JSON.parse(JSON.stringify(DEFAULT_STATE.ingredients));
        } else {
          // Auto-heal legacy corrupted rate_unit for standard kg/litre ingredients
          parsed.ingredients.forEach((ing) => {
            if (
              (ing.base_unit === 'kg' || ing.base_unit === 'litre') &&
              (ing.rate_unit === 'g' || ing.rate_unit === 'ml') &&
              ing.code !== 'ING-SAFFRON'
            ) {
              ing.rate_unit = ing.base_unit;
            }
          });
        }
        if (!parsed.recipes || parsed.recipes.length === 0) {
          parsed.recipes = JSON.parse(JSON.stringify(DEFAULT_STATE.recipes));
        }
        if (!parsed.recipe_items || parsed.recipe_items.length === 0) {
          parsed.recipe_items = JSON.parse(JSON.stringify(DEFAULT_STATE.recipe_items));
        }
        if (!parsed.ingredient_prices || parsed.ingredient_prices.length === 0) {
          parsed.ingredient_prices = JSON.parse(JSON.stringify(DEFAULT_STATE.ingredient_prices || []));
        }
        if (!parsed.production_batch_ingredients) {
          parsed.production_batch_ingredients = [];
        }
        if (!parsed.suppliers || parsed.suppliers.length === 0) {
          parsed.suppliers = JSON.parse(JSON.stringify(DEFAULT_STATE.suppliers || []));
        }
        if (!parsed.lpg_cylinders || parsed.lpg_cylinders.length === 0) {
          parsed.lpg_cylinders = JSON.parse(JSON.stringify(DEFAULT_STATE.lpg_cylinders || []));
        }
        if (!parsed.lpg_cylinder_movements || parsed.lpg_cylinder_movements.length === 0) {
          parsed.lpg_cylinder_movements = JSON.parse(JSON.stringify(DEFAULT_STATE.lpg_cylinder_movements || []));
        }
        if (!parsed.raw_material_movements || parsed.raw_material_movements.length === 0) {
          parsed.raw_material_movements = JSON.parse(JSON.stringify(DEFAULT_STATE.raw_material_movements || []));
        }
        if (!parsed.material_purchases) parsed.material_purchases = [];
        if (!parsed.material_purchase_items) parsed.material_purchase_items = [];
        if (!parsed.inventory_lots) parsed.inventory_lots = [];
        if (!parsed.physical_stock_counts) parsed.physical_stock_counts = [];
        if (!parsed.physical_stock_count_items) parsed.physical_stock_count_items = [];
        if (!parsed.lpg_cylinder_readings) parsed.lpg_cylinder_readings = [];
        if (!parsed.inventory_wastage) parsed.inventory_wastage = [];
        if (!parsed.supplier_returns) parsed.supplier_returns = [];
        if (!parsed.reorder_list) parsed.reorder_list = [];
        if (!parsed.expense_heads || parsed.expense_heads.length === 0) {
          parsed.expense_heads = JSON.parse(JSON.stringify(DEFAULT_STATE.expense_heads || []));
        }
        return parsed;
      }
    } catch {
      // Fallback
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
  }

  private saveState(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // ignore
    }
  }

  public resetToDefault(): void {
    this.state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    this.saveState();
  }

  public getState() {
    return this.state;
  }

  // --- Auth & Profiles ---
  public getProfiles(): Profile[] {
    return this.state.profiles;
  }

  public getProfileById(id: string): Profile | undefined {
    return this.state.profiles.find((p) => p.id === id);
  }

  public updateProfile(id: string, updates: Partial<Profile>): Profile {
    const idx = this.state.profiles.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error('Profile not found');
    this.state.profiles[idx] = {
      ...this.state.profiles[idx],
      ...updates,
      updated_at: new Date().toISOString(),
    };
    this.saveState();
    return this.state.profiles[idx];
  }

  // --- Products & Prices ---
  public getProducts(): ProductWithPrice[] {
    return this.state.products.map((p) => {
      const price = this.getActivePrice(p.id);
      const available = this.getAvailableFreezerStock(p.id);
      return {
        ...p,
        current_price: price?.selling_price || 0,
        commission_type: (price?.commission_type as CommissionType) || 'fixed',
        commission_value: price?.commission_value || 0,
        available_quantity: available,
      };
    });
  }

  public getActivePrice(productId: string): ProductPrice | undefined {
    return this.state.product_prices
      .filter((pr) => pr.product_id === productId)
      .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())[0];
  }

  public getPriceHistory(productId: string): ProductPrice[] {
    return this.state.product_prices
      .filter((pr) => pr.product_id === productId)
      .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
  }

  public addProduct(
    product: Omit<Product, 'id' | 'created_at' | 'updated_at'>,
    sellingPrice: number,
    commissionType: 'fixed' | 'percentage',
    commissionValue: number,
    userId: string
  ): Product {
    const id = `prod-${generateId().slice(0, 8)}`;
    const now = new Date().toISOString();
    const newProduct: Product = {
      ...product,
      id,
      created_by: userId,
      created_at: now,
      updated_at: now,
    };
    this.state.products.push(newProduct);

    // Add price
    const priceId = `price-${generateId().slice(0, 8)}`;
    this.state.product_prices.push({
      id: priceId,
      product_id: id,
      selling_price: sellingPrice,
      commission_type: commissionType,
      commission_value: commissionValue,
      effective_from: now,
      effective_to: null,
      created_by: userId,
      created_at: now,
    });

    this.logAudit('products', id, 'CREATE_PRODUCT', null, newProduct, 'Created product with initial price', userId);
    this.saveState();
    return newProduct;
  }

  public updateProductPrice(
    productId: string,
    sellingPrice: number,
    commissionType: 'fixed' | 'percentage',
    commissionValue: number,
    userId: string
  ): ProductPrice {
    const now = new Date().toISOString();
    // Close existing price
    const currentPrice = this.getActivePrice(productId);
    if (currentPrice) {
      currentPrice.effective_to = now;
    }

    const newPrice: ProductPrice = {
      id: `price-${generateId().slice(0, 8)}`,
      product_id: productId,
      selling_price: sellingPrice,
      commission_type: commissionType,
      commission_value: commissionValue,
      effective_from: now,
      effective_to: null,
      created_by: userId,
      created_at: now,
    };

    this.state.product_prices.push(newPrice);
    this.logAudit('product_prices', newPrice.id, 'UPDATE_PRICE', currentPrice, newPrice, 'Price & commission updated', userId);
    this.saveState();
    return newPrice;
  }

  public updateProduct(
    productId: string,
    data: {
      name_en?: string;
      name_hi?: string;
      sku?: string;
      description?: string;
      selling_price?: number;
      commission_type?: 'fixed' | 'percentage';
      commission_value?: number;
      is_active?: boolean;
    },
    userId: string = 'usr-owner-001'
  ): ProductWithPrice {
    const product = this.state.products.find((p) => p.id === productId);
    if (!product) throw new Error('Product not found');

    if (data.name_en !== undefined) product.name_en = data.name_en;
    if (data.name_hi !== undefined) product.name_hi = data.name_hi;
    if (data.sku !== undefined) product.sku = data.sku;
    if (data.description !== undefined) product.description = data.description;
    if (data.is_active !== undefined) product.is_active = data.is_active;

    if (data.selling_price !== undefined) {
      this.updateProductPrice(
        productId,
        data.selling_price,
        data.commission_type || 'fixed',
        data.commission_value || 0,
        userId
      );
    }

    this.logAudit('products', productId, 'UPDATE_PRODUCT', null, product, 'Updated product details', userId);
    this.saveState();

    const activePrice = this.getActivePrice(productId);
    return {
      ...product,
      current_price: activePrice?.selling_price || 0,
      commission_type: (activePrice?.commission_type as CommissionType) || 'fixed',
      commission_value: activePrice?.commission_value || 0,
      available_quantity: this.getAvailableFreezerStock(productId),
    };
  }

  // --- Carts & Sellers ---
  public getCarts(): Cart[] {
    return this.state.carts;
  }

  public addCart(cart: Omit<Cart, 'id' | 'created_at' | 'updated_at'>, userId: string = 'usr-owner-001'): Cart {
    const id = `cart-${generateId().slice(0, 8)}`;
    const now = new Date().toISOString();
    const newCart: Cart = { ...cart, id, created_at: now, updated_at: now };
    this.state.carts.push(newCart);
    this.logAudit('carts', id, 'CREATE_CART', null, newCart, `Added cart ${newCart.cart_name}`, userId);
    this.saveState();
    return newCart;
  }

  public updateCart(
    id: string,
    updates: Partial<Pick<Cart, 'cart_code' | 'cart_name' | 'location' | 'is_active'>>,
    userId: string = 'usr-owner-001'
  ): Cart {
    const cart = this.state.carts.find((c) => c.id === id);
    if (!cart) throw new Error('Cart not found');
    const old = { ...cart };
    Object.assign(cart, updates, { updated_at: new Date().toISOString() });

    this.logAudit('carts', id, 'UPDATE_CART', old, cart, `Updated cart ${cart.cart_name}`, userId);
    this.saveState();
    return cart;
  }

  public deleteCart(id: string, userId: string = 'usr-owner-001'): { success: boolean; deactivated: boolean; message: string } {
    const cart = this.state.carts.find((c) => c.id === id);
    if (!cart) throw new Error('Cart not found');

    const isAssigned = this.state.sellers.some((s) => s.default_cart_id === id && s.is_active);
    const hasIssues = this.state.seller_issues.some((i) => i.cart_id === id);

    if (hasIssues || isAssigned) {
      const old = { ...cart };
      cart.is_active = false;
      cart.updated_at = new Date().toISOString();
      this.logAudit('carts', id, 'DEACTIVATE_CART', old, cart, 'Deactivated cart due to existing assignments/issues', userId);
      this.saveState();
      return { success: true, deactivated: true, message: 'ठेला निष्क्रिय कर दिया गया है ताकि पुराना रिकॉर्ड सुरक्षित रहे।' };
    } else {
      const old = { ...cart };
      this.state.carts = this.state.carts.filter((c) => c.id !== id);
      for (const s of this.state.sellers) {
        if (s.default_cart_id === id) s.default_cart_id = null;
      }
      this.logAudit('carts', id, 'DELETE_CART', old, null, 'Deleted unused cart', userId);
      this.saveState();
      return { success: true, deactivated: false, message: 'ठेला सफलतापूर्वक हटा दिया गया।' };
    }
  }

  public getSellers(): (Seller & { default_cart?: Cart; current_held_stock?: number })[] {
    return this.state.sellers.map((s) => {
      const cart = this.state.carts.find((c) => c.id === s.default_cart_id);
      const held = this.getSellerHeldStock(s.id);
      return {
        ...s,
        default_cart: cart,
        current_held_stock: held,
      };
    });
  }

  public addSeller(seller: Omit<Seller, 'id' | 'created_at' | 'updated_at'>, userId: string): Seller {
    const id = `slr-${generateId().slice(0, 8)}`;
    const now = new Date().toISOString();
    const newSeller: Seller = { ...seller, id, created_by: userId, created_at: now, updated_at: now };
    this.state.sellers.push(newSeller);

    // Create stock location for seller
    this.state.stock_locations.push({
      id: `loc-seller-${id}`,
      location_type: 'seller',
      name: `${seller.full_name} Cart Stock`,
      seller_id: id,
      cart_id: seller.default_cart_id,
      is_active: true,
    });

    this.logAudit('sellers', id, 'CREATE_SELLER', null, newSeller, `Added seller ${newSeller.full_name}`, userId);
    this.saveState();
    return newSeller;
  }

  public updateSeller(
    id: string,
    updates: Partial<Pick<Seller, 'seller_code' | 'full_name' | 'phone' | 'address' | 'default_cart_id' | 'is_active' | 'opening_balance'>>,
    userId: string = 'usr-owner-001'
  ): Seller {
    const seller = this.state.sellers.find((s) => s.id === id);
    if (!seller) throw new Error('Seller not found');
    const old = { ...seller };
    Object.assign(seller, updates, { updated_at: new Date().toISOString() });

    // Update corresponding stock location if name or cart changed
    const loc = this.state.stock_locations.find((l) => l.location_type === 'seller' && l.seller_id === id);
    if (loc) {
      if (updates.full_name) loc.name = `${updates.full_name} Cart Stock`;
      if (updates.default_cart_id !== undefined) loc.cart_id = updates.default_cart_id;
      if (updates.is_active !== undefined) loc.is_active = updates.is_active;
    }

    this.logAudit('sellers', id, 'UPDATE_SELLER', old, seller, `Updated seller ${seller.full_name}`, userId);
    this.saveState();
    return seller;
  }

  public deleteSeller(id: string, userId: string = 'usr-owner-001'): { success: boolean; deactivated: boolean; message: string } {
    const seller = this.state.sellers.find((s) => s.id === id);
    if (!seller) throw new Error('Seller not found');

    const hasIssues = this.state.seller_issues.some((i) => i.seller_id === id);
    const hasMovements = this.state.stock_movements.some((m) => {
      const loc = this.state.stock_locations.find((l) => l.seller_id === id);
      return loc && (m.source_location_id === loc.id || m.destination_location_id === loc.id);
    });

    if (hasIssues || hasMovements) {
      // Historical references exist: safely deactivate
      const old = { ...seller };
      seller.is_active = false;
      seller.updated_at = new Date().toISOString();
      const loc = this.state.stock_locations.find((l) => l.seller_id === id);
      if (loc) loc.is_active = false;
      this.logAudit('sellers', id, 'DEACTIVATE_SELLER', old, seller, 'Deactivated seller due to existing transaction history', userId);
      this.saveState();
      return { success: true, deactivated: true, message: 'विक्रेता निष्क्रिय कर दिया गया है ताकि पुराना हिसाब व स्टॉक इतिहास सुरक्षित रहे।' };
    } else {
      // Unused seller: delete cleanly
      const old = { ...seller };
      this.state.sellers = this.state.sellers.filter((s) => s.id !== id);
      this.state.stock_locations = this.state.stock_locations.filter((l) => l.seller_id !== id);
      this.logAudit('sellers', id, 'DELETE_SELLER', old, null, 'Deleted unused seller', userId);
      this.saveState();
      return { success: true, deactivated: false, message: 'विक्रेता सफलतापूर्वक हटा दिया गया।' };
    }
  }

  // --- Authoritative Stock Ledger Balances (Canonical current_location_stock) ---
  public getCurrentLocationStock(locationId?: string): { location_id: string; product_id: string; quantity: number }[] {
    const deltas: Record<string, Record<string, number>> = {};

    for (const m of this.state.stock_movements) {
      const qty = Number(m.quantity) || 0;
      if (m.destination_location_id) {
        if (!deltas[m.destination_location_id]) deltas[m.destination_location_id] = {};
        deltas[m.destination_location_id][m.product_id] = (deltas[m.destination_location_id][m.product_id] || 0) + qty;
      }
      if (m.source_location_id) {
        if (!deltas[m.source_location_id]) deltas[m.source_location_id] = {};
        deltas[m.source_location_id][m.product_id] = (deltas[m.source_location_id][m.product_id] || 0) - qty;
      }
    }

    const results: { location_id: string; product_id: string; quantity: number }[] = [];
    for (const loc of Object.keys(deltas)) {
      if (!locationId || loc === locationId) {
        for (const pid of Object.keys(deltas[loc])) {
          results.push({
            location_id: loc,
            product_id: pid,
            quantity: deltas[loc][pid],
          });
        }
      }
    }
    return results;
  }

  public getAvailableFreezerStock(productId: string): number {
    const balances = this.getFreezerBalances();
    const product = this.state.products.find(
      (p) => p.id === productId || p.sku === productId || p.name_en === productId || p.name_hi === productId
    );
    const pid = product ? product.id : productId;
    return balances[pid] || 0;
  }

  public getFreezerBalances(): Record<string, number> {
    const freezerLocIds = new Set<string>([
      'a0000000-0000-0000-0000-000000000002',
      'loc-freezer',
      'loc-freezer-01',
    ]);
    for (const loc of this.state.stock_locations) {
      if (loc.location_type === 'main_freezer') {
        freezerLocIds.add(loc.id);
      }
    }

    const balances: Record<string, number> = {};
    for (const p of this.state.products) {
      balances[p.id] = 0;
    }

    const stockRows = this.getCurrentLocationStock();
    for (const row of stockRows) {
      if (freezerLocIds.has(row.location_id)) {
        const prod = this.state.products.find(
          (p) => p.id === row.product_id || p.sku === row.product_id || p.name_en === row.product_id
        );
        const pid = prod ? prod.id : row.product_id;
        balances[pid] = (balances[pid] || 0) + row.quantity;
      }
    }

    return balances;
  }

  public reconcileFreezerStock(): {
    success: boolean;
    synced_batch_items: number;
    synced_issue_items: number;
    healed_reversals: number;
    healed_deficits: number;
    freezer_balances: Record<string, number>;
    message: string;
  } {
    let syncedBatches = 0;
    let syncedIssues = 0;
    let healedReversals = 0;
    let healedDeficits = 0;

    const prodLoc = this.state.stock_locations.find((l) => l.location_type === 'production') || {
      id: 'loc-prod-01',
      name: 'Production Floor',
      location_type: 'production' as const,
      seller_id: null,
      cart_id: null,
      is_active: true,
    };
    const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer') || {
      id: 'a0000000-0000-0000-0000-000000000002',
      name: 'Main Cold Storage Freezer',
      location_type: 'main_freezer' as const,
      seller_id: null,
      cart_id: null,
      is_active: true,
    };
    const adjLoc = this.state.stock_locations.find((l) => l.location_type === 'damaged') || prodLoc;

    // 1. Scan completed batches
    for (const batch of this.state.production_batches) {
      if (batch.status === 'completed' && batch.is_current_version !== false) {
        for (const it of batch.items) {
          if (it.saleable_quantity > 0) {
            const exists = this.state.stock_movements.some(
              (m) =>
                m.reference_table === 'production_batches' &&
                m.reference_id === batch.id &&
                (m.product_id === it.product_id ||
                  (it.product && m.product_id === it.product.sku) ||
                  (it.product && m.product_id === it.product.id)) &&
                m.movement_type === 'production_completed'
            );
            if (!exists) {
              this.state.stock_movements.push({
                id: `mv-${generateId().slice(0, 8)}`,
                movement_date: batch.completed_at || batch.production_date || new Date().toISOString(),
                product_id: it.product_id,
                source_location_id: prodLoc.id,
                destination_location_id: freezerLoc.id,
                quantity: it.saleable_quantity,
                movement_type: 'production_completed',
                reference_table: 'production_batches',
                reference_id: batch.id,
                notes: `Auto-Synced from Batch: ${batch.batch_number}`,
                created_by: batch.created_by || 'usr-owner-001',
                created_at: batch.completed_at || new Date().toISOString(),
              });
              syncedBatches++;
            }
          }
        }
      }
    }

    // 2. Heal Orphan Production Reversals
    // If a reversal exists for a deleted batch that lacked production_completed, insert the base completed movement so net is 0
    const reversals = this.state.stock_movements.filter(
      (m) => m.movement_type === 'production_reversal' && m.reference_table === 'production_batches' && m.reference_id
    );
    for (const rev of reversals) {
      const hasCompleted = this.state.stock_movements.some(
        (m) =>
          m.reference_table === 'production_batches' &&
          m.reference_id === rev.reference_id &&
          (m.product_id === rev.product_id || m.product…41661 tokens truncated…or('Settlement is already approved');

    const now = new Date().toISOString();
    const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer')!;
    const sellerLoc = this.state.stock_locations.find(
      (l) => l.location_type === 'seller' && l.seller_id === settlement.seller_id
    )!;
    const damagedLoc = this.state.stock_locations.find((l) => l.location_type === 'damaged')!;
    const compLoc = this.state.stock_locations.find((l) => l.location_type === 'complimentary')!;

    for (const it of settlement.items) {
      if (it.returned_quantity > 0) {
        this.state.stock_movements.push({
          id: `mv-${generateId().slice(0, 8)}`,
          movement_date: now,
          product_id: it.product_id,
          source_location_id: sellerLoc.id,
          destination_location_id: freezerLoc.id,
          quantity: it.returned_quantity,
          movement_type: 'seller_returned',
          reference_table: 'seller_settlements',
          reference_id: settlementId,
          notes: `Returned to freezer: ${settlement.settlement_number}`,
          created_by: userId,
          created_at: now,
        });
      }
      if (it.damaged_quantity > 0) {
        this.state.stock_movements.push({
          id: `mv-${generateId().slice(0, 8)}`,
          movement_date: now,
          product_id: it.product_id,
          source_location_id: sellerLoc.id,
          destination_location_id: damagedLoc.id,
          quantity: it.damaged_quantity,
          movement_type: 'damaged',
          reference_table: 'seller_settlements',
          reference_id: settlementId,
          notes: `Damaged stock: ${it.damage_reason || ''}`,
          created_by: userId,
          created_at: now,
        });
      }
      if (it.complimentary_quantity > 0) {
        this.state.stock_movements.push({
          id: `mv-${generateId().slice(0, 8)}`,
          movement_date: now,
          product_id: it.product_id,
          source_location_id: sellerLoc.id,
          destination_location_id: compLoc.id,
          quantity: it.complimentary_quantity,
          movement_type: 'complimentary',
          reference_table: 'seller_settlements',
          reference_id: settlementId,
          notes: `Complimentary stock: ${it.complimentary_reason || ''}`,
          created_by: userId,
          created_at: now,
        });
      }
    }

    settlement.status = 'approved';
    settlement.approved_by = userId;
    settlement.approved_at = now;
    settlement.updated_at = now;

    const issue = this.state.seller_issues.find((i) => i.id === settlement.seller_issue_id);
    if (issue) {
      issue.status = 'settled';
      issue.updated_at = now;
    }

    this.logAudit('seller_settlements', settlementId, 'APPROVE_SETTLEMENT', null, settlement, 'Owner approved settlement', userId);
    this.saveState();
    return settlement;
  }

  public updatePendingSettlement(
    settlementId: string,
    items: {
      issue_item_id: string;
      returned_quantity: number;
      damaged_quantity: number;
      complimentary_quantity: number;
      damage_reason?: string;
      complimentary_reason?: string;
    }[],
    cashReceived: number,
    upiReceived: number,
    creditAmount: number,
    notes: string,
    userId: string
  ): SellerSettlementWithDetails {
    const settlement = this.state.seller_settlements.find((s) => s.id === settlementId);
    if (!settlement) throw new Error('Settlement not found');
    if (settlement.status !== 'pending_approval' && settlement.status !== 'draft') {
      throw new Error('Only pending or draft settlements can be updated before approval');
    }

    const user = this.state.profiles.find((p) => p.id === userId);
    if (user && user.role === 'seller' && settlement.submitted_by && settlement.submitted_by !== userId) {
      throw new Error('Sellers can edit only their own pending settlement submission');
    }

    const issue = this.state.seller_issues.find((i) => i.id === settlement.seller_issue_id);
    if (!issue) throw new Error('Linked stock issue not found');

    const calculationItems = items.map((it) => {
      const issueItem = issue.items.find((ii) => ii.id === it.issue_item_id);
      if (!issueItem) throw new Error(`Issue item ${it.issue_item_id} not found`);

      return {
        issued_quantity: issueItem.issued_quantity,
        returned_quantity: it.returned_quantity,
        damaged_quantity: it.damaged_quantity,
        complimentary_quantity: it.complimentary_quantity,
        unit_selling_price: issueItem.unit_selling_price_snapshot,
        commission_type: issueItem.commission_type_snapshot as any,
        commission_value: issueItem.commission_value_snapshot,
        damage_reason: it.damage_reason,
        complimentary_reason: it.complimentary_reason,
      };
    });

    const summary = calculateSettlementSummary(calculationItems, cashReceived, upiReceived, creditAmount);

    const settlementItems = items.map((it, idx) => {
      const issueItem = issue.items.find((ii) => ii.id === it.issue_item_id)!;
      const cItem = calculationItems[idx];
      const sold = cItem.issued_quantity - (cItem.returned_quantity + cItem.damaged_quantity + cItem.complimentary_quantity);
      const gross = sold * issueItem.unit_selling_price_snapshot;
      const comm =
        issueItem.commission_type_snapshot === 'percentage'
          ? Number(((gross * issueItem.commission_value_snapshot) / 100).toFixed(2))
          : sold * issueItem.commission_value_snapshot;

      return {
        id: `sitem-${generateId().slice(0, 8)}`,
        settlement_id: settlementId,
        seller_issue_item_id: it.issue_item_id,
        product_id: issueItem.product_id,
        issued_quantity_snapshot: issueItem.issued_quantity,
        returned_quantity: it.returned_quantity,
        damaged_quantity: it.damaged_quantity,
        complimentary_quantity: it.complimentary_quantity,
        sold_quantity: sold,
        selling_price_snapshot: issueItem.unit_selling_price_snapshot,
        gross_sales: gross,
        commission_amount: comm,
        damage_reason: it.damage_reason || null,
        complimentary_reason: it.complimentary_reason || null,
        product: issueItem.product,
      };
    });

    const oldSettlement = { ...settlement };
    settlement.cash_received = summary.cash_received;
    settlement.upi_received = summary.upi_received;
    settlement.credit_amount = summary.credit_amount;
    settlement.gross_sales = summary.gross_sales;
    settlement.total_commission = summary.total_commission;
    settlement.expected_collection = summary.expected_collection;
    settlement.total_received = summary.total_received;
    settlement.outstanding_amount = summary.outstanding_amount;
    settlement.shortage_amount = summary.shortage_amount;
    settlement.notes = notes || null;
    settlement.items = settlementItems;
    settlement.updated_at = new Date().toISOString();

    this.logAudit('seller_settlements', settlementId, 'EDIT_PENDING', oldSettlement, settlement, 'Pending settlement edited', userId);
    this.saveState();
    return settlement;
  }

  public correctApprovedSettlement(
    settlementId: string,
    settlementDate: string,
    cashReceived: number,
    upiReceived: number,
    creditAmount: number,
    items: {
      issue_item_id: string;
      returned_quantity: number;
      damaged_quantity: number;
      complimentary_quantity: number;
      damage_reason?: string;
      complimentary_reason?: string;
    }[],
    notes: string,
    reason: string,
    userId: string
  ): SellerSettlementWithDetails {
    const user = this.state.profiles.find((p) => p.id === userId);
    if (user && user.role !== 'owner') {
      throw new Error('Access Denied: Only Owners can correct approved settlements.');
    }

    if (!reason || reason.trim().length < 5) {
      throw new Error('A valid correction reason of at least 5 characters is required.');
    }

    const oldSettlement = this.state.seller_settlements.find((s) => s.id === settlementId);
    if (!oldSettlement) throw new Error('Settlement record not found');
    if (oldSettlement.is_current_version === false) {
      throw new Error('Only current version of settlement can be corrected.');
    }

    // Check closed business day
    const closing = this.state.daily_closings.find((c) => c.business_date === oldSettlement.settlement_date);
    if (closing && closing.status === 'closed') {
      throw new Error(`Business day (${oldSettlement.settlement_date}) is closed. Please reopen the business day first.`);
    }

    const issue = this.state.seller_issues.find((i) => i.id === oldSettlement.seller_issue_id);
    if (!issue) throw new Error('Linked stock issue not found');

    const now = new Date().toISOString();
    const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer')!;
    const sellerLoc = this.state.stock_locations.find(
      (l) => l.location_type === 'seller' && l.seller_id === oldSettlement.seller_id
    )!;
    const damagedLoc = this.state.stock_locations.find((l) => l.location_type === 'damaged')!;
    const compLoc = this.state.stock_locations.find((l) => l.location_type === 'complimentary')!;

    // Reverse old stock movements from previous approved settlement
    const oldMovements = this.state.stock_movements.filter(
      (m) => m.reference_table === 'seller_settlements' && m.reference_id === settlementId
    );

    for (const om of oldMovements) {
      this.state.stock_movements.push({
        id: `mv-${generateId().slice(0, 8)}`,
        movement_date: now,
        product_id: om.product_id,
        source_location_id: om.destination_location_id,
        destination_location_id: om.source_location_id,
        quantity: om.quantity,
        movement_type: 'settlement_reversal',
        reference_table: 'seller_settlements',
        reference_id: settlementId,
        reversal_of_movement_id: om.id,
        notes: `Reversal for settlement correction: ${reason}`,
        created_by: userId,
        created_at: now,
      });
    }

    // Recalculate totals
    const calculationItems = items.map((it) => {
      const issueItem = issue.items.find((ii) => ii.id === it.issue_item_id);
      if (!issueItem) throw new Error(`Issue item ${it.issue_item_id} not found`);

      return {
        issued_quantity: issueItem.issued_quantity,
        returned_quantity: it.returned_quantity,
        damaged_quantity: it.damaged_quantity,
        complimentary_quantity: it.complimentary_quantity,
        unit_selling_price: issueItem.unit_selling_price_snapshot,
        commission_type: issueItem.commission_type_snapshot as any,
        commission_value: issueItem.commission_value_snapshot,
        damage_reason: it.damage_reason,
        complimentary_reason: it.complimentary_reason,
      };
    });

    const summary = calculateSettlementSummary(calculationItems, cashReceived, upiReceived, creditAmount);

    const newVersion = (oldSettlement.version_number || 1) + 1;
    const newSettlementId = `st-${generateId().slice(0, 8)}`;
    const baseSettlementNumber = oldSettlement.settlement_number.replace(/-V\d+$/, '');
    const newSettlementNumber = `${baseSettlementNumber}-V${newVersion}`;

    const newSettlementItems = items.map((it, idx) => {
      const issueItem = issue.items.find((ii) => ii.id === it.issue_item_id)!;
      const cItem = calculationItems[idx];
      const sold = cItem.issued_quantity - (cItem.returned_quantity + cItem.damaged_quantity + cItem.complimentary_quantity);
      const gross = sold * issueItem.unit_selling_price_snapshot;
      const comm =
        issueItem.commission_type_snapshot === 'percentage'
          ? Number(((gross * issueItem.commission_value_snapshot) / 100).toFixed(2))
          : sold * issueItem.commission_value_snapshot;

      if (it.returned_quantity > 0) {
        this.state.stock_movements.push({
          id: `mv-${generateId().slice(0, 8)}`,
          movement_date: now,
          product_id: issueItem.product_id,
          source_location_id: sellerLoc.id,
          destination_location_id: freezerLoc.id,
          quantity: it.returned_quantity,
          movement_type: 'seller_returned',
          reference_table: 'seller_settlements',
          reference_id: newSettlementId,
          notes: `Returned to freezer: ${newSettlementNumber}`,
          created_by: userId,
          created_at: now,
        });
      }

      if (it.damaged_quantity > 0) {
        this.state.stock_movements.push({
          id: `mv-${generateId().slice(0, 8)}`,
          movement_date: now,
          product_id: issueItem.product_id,
          source_location_id: sellerLoc.id,
          destination_location_id: damagedLoc.id,
          quantity: it.damaged_quantity,
          movement_type: 'damaged',
          reference_table: 'seller_settlements',
          reference_id: newSettlementId,
          notes: `Seller damaged: ${it.damage_reason || ''}`,
          created_by: userId,
          created_at: now,
        });
      }

      if (it.complimentary_quantity > 0) {
        this.state.stock_movements.push({
          id: `mv-${generateId().slice(0, 8)}`,
          movement_date: now,
          product_id: issueItem.product_id,
          source_location_id: sellerLoc.id,
          destination_location_id: compLoc.id,
          quantity: it.complimentary_quantity,
          movement_type: 'complimentary',
          reference_table: 'seller_settlements',
          reference_id: newSettlementId,
          notes: `Complimentary stock: ${it.complimentary_reason || ''}`,
          created_by: userId,
          created_at: now,
        });
      }

      return {
        id: `sitem-${generateId().slice(0, 8)}`,
        settlement_id: newSettlementId,
        seller_issue_item_id: it.issue_item_id,
        product_id: issueItem.product_id,
        issued_quantity_snapshot: issueItem.issued_quantity,
        returned_quantity: it.returned_quantity,
        damaged_quantity: it.damaged_quantity,
        complimentary_quantity: it.complimentary_quantity,
        sold_quantity: sold,
        selling_price_snapshot: issueItem.unit_selling_price_snapshot,
        gross_sales: gross,
        commission_amount: comm,
        damage_reason: it.damage_reason || null,
        complimentary_reason: it.complimentary_reason || null,
        product: issueItem.product,
      };
    });

    const newSettlement: SellerSettlementWithDetails = {
      id: newSettlementId,
      settlement_number: newSettlementNumber,
      seller_issue_id: oldSettlement.seller_issue_id,
      seller_id: oldSettlement.seller_id,
      settlement_date: settlementDate,
      status: 'approved',
      cash_received: summary.cash_received,
      upi_received: summary.upi_received,
      credit_amount: summary.credit_amount,
      gross_sales: summary.gross_sales,
      total_commission: summary.total_commission,
      expected_collection: summary.expected_collection,
      total_received: summary.total_received,
      outstanding_amount: summary.outstanding_amount,
      shortage_amount: summary.shortage_amount,
      notes: notes || null,
      submitted_by: oldSettlement.submitted_by,
      approved_by: userId,
      submitted_at: oldSettlement.submitted_at,
      approved_at: now,
      version_number: newVersion,
      is_current_version: true,
      correction_of_id: oldSettlement.id,
      superseded_by_id: null,
      correction_reason: reason,
      corrected_by: userId,
      corrected_at: now,
      created_at: oldSettlement.created_at,
      updated_at: now,
      seller: oldSettlement.seller,
      issue,
      items: newSettlementItems,
    };

    // Supersede old settlement
    oldSettlement.status = 'superseded';
    oldSettlement.is_current_version = false;
    oldSettlement.superseded_by_id = newSettlementId;
    oldSettlement.updated_at = now;

    this.state.seller_settlements.push(newSettlement);
    this.logAudit('seller_settlements', newSettlementId, 'CORRECT_RECORD', oldSettlement, newSettlement, reason, userId);
    this.saveState();
    return newSettlement;
  }

  public getSettlementRevisionHistory(settlementId: string): RevisionRecord[] {
    const allSettlements = this.state.seller_settlements;
    const target = allSettlements.find((s) => s.id === settlementId);
    if (!target) return [];

    let root = target;
    while (root.correction_of_id) {
      const parent = allSettlements.find((s) => s.id === root.correction_of_id);
      if (!parent) break;
      root = parent;
    }

    const chain: SellerSettlementWithDetails[] = [];
    let curr: SellerSettlementWithDetails | undefined = root;
    while (curr) {
      chain.push(curr);
      if (!curr.superseded_by_id) break;
      curr = allSettlements.find((s) => s.id === curr!.superseded_by_id);
    }

    const profiles = this.state.profiles;

    return chain.map((s) => {
      const user = profiles.find((p) => p.id === (s.corrected_by || s.approved_by || s.submitted_by));
      const totalSold = s.items.reduce((sum, it) => sum + it.sold_quantity, 0);

      return {
        id: s.id,
        version_number: s.version_number || 1,
        status: s.status,
        date: s.settlement_date,
        created_at: s.created_at,
        corrected_at: s.corrected_at,
        corrected_by_name: user?.full_name || 'Owner',
        correction_reason: s.correction_reason,
        is_current_version: s.is_current_version !== false,
        correction_of_id: s.correction_of_id,
        superseded_by_id: s.superseded_by_id,
        summary_text: `Version ${s.version_number || 1} (${s.status}): Gross ₹${s.gross_sales}, Received ₹${s.total_received}, Sold ${totalSold} pcs`,
        details: s,
        financial_effect: {
          gross_sales: s.gross_sales,
          total_received: s.total_received,
          shortage: s.shortage_amount,
        },
        stock_effect: {
          sold: totalSold,
          returned: s.items.reduce((sum, it) => sum + it.returned_quantity, 0),
          damaged: s.items.reduce((sum, it) => sum + it.damaged_quantity, 0),
        },
      };
    });
  }

  public deleteSellerSettlement(
    settlementId: string,
    reason: string = 'Deleted by Owner',
    userId: string = 'usr-owner-001'
  ): { success: boolean; message: string } {
    const user = this.state.profiles.find((p) => p.id === userId);
    if (user && user.role !== 'owner') {
      throw new Error('Access Denied: Only Owners are authorized to delete settlements.');
    }

    const settlement = this.state.seller_settlements.find((s) => s.id === settlementId);
    if (!settlement) throw new Error('Settlement not found');

    if (settlement.status === 'approved') {
      const closing = this.state.daily_closings.find((c) => c.business_date === settlement.settlement_date);
      if (closing && closing.status === 'closed') {
        throw new Error(`Business day (${settlement.settlement_date}) is closed. Reopen the business day before deleting this record.`);
      }

      const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer')!;
      let sellerLoc = this.state.stock_locations.find(
        (l) => l.location_type === 'seller' && l.seller_id === settlement.seller_id
      );
      if (!sellerLoc) {
        sellerLoc = {
          id: `loc-seller-${settlement.seller_id}`,
          location_type: 'seller',
          name: 'Seller Cart Stock',
          seller_id: settlement.seller_id,
          cart_id: (settlement as any).cart_id || null,
          is_active: true,
        };
        this.state.stock_locations.push(sellerLoc);
      }

      const damagedLoc = this.state.stock_locations.find((l) => l.location_type === 'damaged')!;
      const compLoc = this.state.stock_locations.find((l) => l.location_type === 'complimentary')!;
      const now = new Date().toISOString();

      for (const it of settlement.items) {
        if (it.returned_quantity > 0) {
          this.state.stock_movements.push({
            id: `mv-${generateId().slice(0, 8)}`,
            movement_date: now,
            product_id: it.product_id,
            source_location_id: freezerLoc.id,
            destination_location_id: sellerLoc.id,
            quantity: it.returned_quantity,
            movement_type: 'settlement_reversal',
            reference_table: 'seller_settlements',
            reference_id: settlement.id,
            notes: `Stock reversal for deleted settlement ${settlement.settlement_number}: returned pieces moved back to seller cart`,
            created_by: userId,
            created_at: now,
          });
        }
        if (it.damaged_quantity > 0) {
          this.state.stock_movements.push({
            id: `mv-${generateId().slice(0, 8)}`,
            movement_date: now,
            product_id: it.product_id,
            source_location_id: damagedLoc.id,
            destination_location_id: sellerLoc.id,
            quantity: it.damaged_quantity,
            movement_type: 'settlement_reversal',
            reference_table: 'seller_settlements',
            reference_id: settlement.id,
            notes: `Stock reversal for deleted settlement ${settlement.settlement_number}: damaged pieces reversed`,
            created_by: userId,
            created_at: now,
          });
        }
        if (it.complimentary_quantity > 0) {
          this.state.stock_movements.push({
            id: `mv-${generateId().slice(0, 8)}`,
            movement_date: now,
            product_id: it.product_id,
            source_location_id: compLoc.id,
            destination_location_id: sellerLoc.id,
            quantity: it.complimentary_quantity,
            movement_type: 'settlement_reversal',
            reference_table: 'seller_settlements',
            reference_id: settlement.id,
            notes: `Stock reversal for deleted settlement ${settlement.settlement_number}: complimentary pieces reversed`,
            created_by: userId,
            created_at: now,
          });
        }
      }

      // Reopen linked seller issue status back to 'issued'
      const linkedIssue = this.state.seller_issues.find((i) => i.id === settlement.seller_issue_id);
      if (linkedIssue) {
        linkedIssue.status = 'issued';
        linkedIssue.updated_at = now;
      }
    }

    const old = { ...settlement };
    this.state.seller_settlements = this.state.seller_settlements.filter((s) => s.id !== settlementId);
    this.logAudit('seller_settlements', settlementId, 'DELETE_SETTLEMENT', old, null, reason, userId);
    this.saveState();
    return { success: true, message: 'Settlement deleted successfully' };
  }

  // --- Expenses Workflow ---
  public getExpenses(): Expense[] {
    return [...this.state.expenses].sort(
      (a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime()
    );
  }

  public addExpense(
    expense: Omit<Expense, 'id' | 'status' | 'void_reason' | 'created_at' | 'updated_at' | 'created_by'> | (Omit<Expense, 'id' | 'status' | 'void_reason' | 'created_at' | 'updated_at' | 'created_by' | 'expense_head_id' | 'expense_month' | 'due_date' | 'corrected_from_expense_id' | 'is_monthly_fixed' | 'idempotency_key'> & Partial<Pick<Expense, 'expense_head_id' | 'expense_month' | 'due_date' | 'corrected_from_expense_id' | 'is_monthly_fixed' | 'idempotency_key'>>),
    userId: string
  ): Expense {
    const id = `exp-${generateId().slice(0, 8)}`;
    const now = new Date().toISOString();
    const newExpense: Expense = {
      expense_head_id: null,
      expense_month: null,
      due_date: null,
      corrected_from_expense_id: null,
      is_monthly_fixed: false,
      idempotency_key: null,
      ...expense,
      id,
      status: 'active',
      void_reason: null,
      created_by: userId,
      created_at: now,
      updated_at: now,
    };
    this.state.expenses.push(newExpense);
    this.logAudit('expenses', id, 'ADD_EXPENSE', null, newExpense, `Added expense ₹${expense.amount}`, userId);
    this.saveState();
    return newExpense;
  }

  public voidExpense(expenseId: string, voidReason: string, userId: string): Expense {
    if (!voidReason || voidReason.trim().length < 3) {
      throw new Error('A valid reason is required to void an expense');
    }
    const expense = this.state.expenses.find((e) => e.id === expenseId);
    if (!expense) throw new Error('Expense not found');
    if (expense.status === 'voided') throw new Error('Expense is already voided');

    const old = { ...expense };
    expense.status = 'voided';
    expense.void_reason = voidReason;
    expense.updated_at = new Date().toISOString();

    this.logAudit('expenses', expenseId, 'VOID_EXPENSE', old, expense, `Voided: ${voidReason}`, userId);
    this.saveState();
    return expense;
  }

  public updateExpense(
    expenseId: string,
    updates: Partial<Pick<Expense, 'expense_date' | 'category' | 'amount' | 'payment_method' | 'description' | 'vendor_name' | 'bill_image_path'>>,
    userId: string = 'usr-owner-001'
  ): Expense {
    const expense = this.state.expenses.find((e) => e.id === expenseId);
    if (!expense) throw new Error('Expense not found');
    const old = { ...expense };
    Object.assign(expense, updates, { updated_at: new Date().toISOString() });

    this.logAudit('expenses', expenseId, 'UPDATE_EXPENSE', old, expense, `Updated expense (₹${expense.amount})`, userId);
    this.saveState();
    return expense;
  }

  public deleteExpense(expenseId: string, userId: string = 'usr-owner-001'): { success: boolean; message: string } {
    const expense = this.state.expenses.find((e) => e.id === expenseId);
    if (!expense) throw new Error('Expense not found');
    const old = { ...expense };
    this.state.expenses = this.state.expenses.filter((e) => e.id !== expenseId);
    this.logAudit('expenses', expenseId, 'DELETE_EXPENSE', old, null, `Permanently deleted expense ₹${old.amount}`, userId);
    this.saveState();
    return { success: true, message: 'खर्चा सफलतापूर्वक हटा दिया गया।' };
  }

  // --- Daily Closing Workflow ---
  public getDailyClosings(): DailyClosing[] {
    return [...this.state.daily_closings].sort(
      (a, b) => new Date(b.business_date).getTime() - new Date(a.business_date).getTime()
    );
  }

  public getDailyClosingByDate(date: string): DailyClosing | undefined {
    return this.state.daily_closings.find((c) => c.business_date === date);
  }

  public closeBusinessDay(businessDate: string, notes: string, userId: string): DailyClosing {
    // 1. Validation: no open draft batches
    const openBatches = this.state.production_batches.filter(
      (b) => b.production_date === businessDate && b.status === 'draft'
    );
    if (openBatches.length > 0) {
      throw new Error(`Cannot close day. There are ${openBatches.length} draft production batches that must be completed or cancelled first.`);
    }

    // 2. Validation: no unsettled seller issues
    const unsettledIssues = this.state.seller_issues.filter(
      (i) => i.issue_date === businessDate && (i.status === 'issued' || i.status === 'partially_settled')
    );
    if (unsettledIssues.length > 0) {
      throw new Error(`Cannot close day. There are ${unsettledIssues.length} unsettled seller issues for this date.`);
    }

    // 3. Validation: no pending settlements
    const pendingSettlements = this.state.seller_settlements.filter(
      (s) => s.settlement_date === businessDate && s.status === 'pending_approval'
    );
    if (pendingSettlements.length > 0) {
      throw new Error(`Cannot close day. There are ${pendingSettlements.length} settlements awaiting owner approval.`);
    }

    // Aggregate production
    const batches = this.state.production_batches.filter(
      (b) => b.production_date === businessDate && b.status === 'completed'
    );
    const total_produced = batches.reduce(
      (sum, b) => sum + b.items.reduce((s, it) => s + it.produced_quantity, 0),
      0
    );
    const total_ingredient_cost = batches.reduce((sum, b) => sum + b.total_ingredient_cost, 0);

    // Aggregate settlements
    const settlements = this.state.seller_settlements.filter(
      (s) => s.settlement_date === businessDate && s.status === 'approved'
    );
    const total_sold = settlements.reduce(
      (sum, st) => sum + st.items.reduce((s, it) => s + it.sold_quantity, 0),
      0
    );
    const total_returned = settlements.reduce(
      (sum, st) => sum + st.items.reduce((s, it) => s + it.returned_quantity, 0),
      0
    );
    const total_damaged = settlements.reduce(
      (sum, st) => sum + st.items.reduce((s, it) => s + it.damaged_quantity, 0),
      0
    );
    const total_complimentary = settlements.reduce(
      (sum, st) => sum + st.items.reduce((s, it) => s + it.complimentary_quantity, 0),
      0
    );
    const gross_sales = settlements.reduce((sum, st) => sum + st.gross_sales, 0);
    const total_commission = settlements.reduce((sum, st) => sum + st.total_commission, 0);
    const cash_received = settlements.reduce((sum, st) => sum + st.cash_received, 0);
    const upi_received = settlements.reduce((sum, st) => sum + st.upi_received, 0);
    const credit_sales = settlements.reduce((sum, st) => sum + st.credit_amount, 0);
    const net_sales = Number((gross_sales - total_commission).toFixed(2));

    // Operating expenses
    const expenses = this.state.expenses.filter(
      (e) => e.expense_date === businessDate && e.status === 'active' && e.category !== 'seller_commission'
    );
    const total_expenses = expenses.reduce((sum, e) => sum + e.amount, 0);

    // Estimated Daily Profit
    const estimated_profit = calculateEstimatedDailyProfit(
      gross_sales,
      total_commission,
      total_ingredient_cost,
      total_expenses
    );

    // Closing freezer stock valuation
    const closing_stock_value = this.state.products.reduce((sum, p) => {
      const avail = this.getAvailableFreezerStock(p.id);
      const pr = this.getActivePrice(p.id)?.selling_price || 0;
      return sum + avail * pr;
    }, 0);

    const now = new Date().toISOString();
    let closing = this.state.daily_closings.find((c) => c.business_date === businessDate);

    if (closing) {
      if (closing.status === 'closed') throw new Error(`Business day ${businessDate} is already closed`);
      closing.status = 'closed';
      closing.total_produced = total_produced;
      closing.total_sold = total_sold;
      closing.total_returned = total_returned;
      closing.total_damaged = total_damaged;
      closing.total_complimentary = total_complimentary;
      closing.gross_sales = gross_sales;
      closing.total_commission = total_commission;
      closing.net_sales = net_sales;
      closing.cash_received = cash_received;
      closing.upi_received = upi_received;
      closing.credit_sales = credit_sales;
      closing.total_expenses = total_expenses;
      closing.estimated_profit = estimated_profit;
      closing.closing_stock_value = closing_stock_value;
      closing.notes = notes || null;
      closing.closed_by = userId;
      closing.closed_at = now;
    } else {
      closing = {
        id: `close-${generateId().slice(0, 8)}`,
        business_date: businessDate,
        status: 'closed',
        total_produced,
        total_sold,
        total_returned,
        total_damaged,
        total_complimentary,
        gross_sales,
        total_commission,
        net_sales,
        cash_received,
        upi_received,
        credit_sales,
        total_expenses,
        estimated_profit,
        closing_stock_value,
        notes: notes || null,
        closed_by: userId,
        closed_at: now,
        reopened_by: null,
        reopened_at: null,
        reopen_reason: null,
      };
      this.state.daily_closings.push(closing);
    }

    this.logAudit('daily_closings', closing.id, 'CLOSE_BUSINESS_DAY', null, closing, `Closed day ${businessDate}`, userId);
    this.saveState();
    return closing;
  }

  public reopenBusinessDay(businessDate: string, reopenReason: string, userId: string): DailyClosing {
    if (!reopenReason || reopenReason.trim().length < 5) {
      throw new Error('A mandatory explanation of at least 5 characters is required to reopen a closed day.');
    }
    const closing = this.state.daily_closings.find((c) => c.business_date === businessDate);
    if (!closing) throw new Error(`No closing record found for ${businessDate}`);
    if (closing.status === 'reopened') throw new Error(`Business day ${businessDate} is already reopened`);

    const old = { ...closing };
    closing.status = 'reopened';
    closing.reopened_by = userId;
    closing.reopened_at = new Date().toISOString();
    closing.reopen_reason = reopenReason;

    this.logAudit('daily_closings', closing.id, 'REOPEN_BUSINESS_DAY', old, closing, reopenReason, userId);
    this.saveState();
    return closing;
  }

  // --- Audit Logs ---
  public getAuditLogs(): AuditLog[] {
    return [...this.state.audit_logs].sort(
      (a, b) => new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime()
    );
  }

  public logAudit(
    tableName: string,
    recordId: string,
    action: string,
    oldData: any,
    newData: any,
    reason: string | null,
    userId: string
  ): void {
    this.state.audit_logs.push({
      id: `audit-${generateId().slice(0, 8)}`,
      table_name: tableName,
      record_id: recordId,
      action,
      old_data: oldData,
      new_data: newData,
      reason,
      performed_by: userId,
      performed_at: new Date().toISOString(),
    });
  }

  // --- Dashboard Aggregations ---
  public getDashboardSummary(dateStr = getTodayDateString()): DashboardSummary {
    const batches = this.state.production_batches.filter(
      (b) => b.production_date === dateStr && b.status === 'completed'
    );
    const total_produced = batches.reduce(
      (sum, b) => sum + b.items.reduce((s, it) => s + it.produced_quantity, 0),
      0
    );

    const issues = this.state.seller_issues.filter(
      (i) => i.issue_date === dateStr && i.status !== 'cancelled'
    );
    const total_issued = issues.reduce(
      (sum, i) => sum + i.items.reduce((s, it) => s + it.issued_quantity, 0),
      0
    );

    const settlements = this.state.seller_settlements.filter(
      (s) => s.settlement_date === dateStr && s.status === 'approved'
    );
    const total_sold = settlements.reduce(
      (sum, s) => sum + s.items.reduce((itSum, it) => itSum + it.sold_quantity, 0),
      0
    );
    const total_returned = settlements.reduce(
      (sum, s) => sum + s.items.reduce((itSum, it) => itSum + it.returned_quantity, 0),
      0
    );
    const total_damaged = settlements.reduce(
      (sum, s) => sum + s.items.reduce((itSum, it) => itSum + it.damaged_quantity, 0),
      0
    );
    const total_complimentary = settlements.reduce(
      (sum, s) => sum + s.items.reduce((itSum, it) => itSum + it.complimentary_quantity, 0),
      0
    );

    const gross_sales = settlements.reduce((sum, s) => sum + s.gross_sales, 0);
    const total_commission = settlements.reduce((sum, s) => sum + s.total_commission, 0);
    const net_sales = Number((gross_sales - total_commission).toFixed(2));
    const cash_received = settlements.reduce((sum, s) => sum + s.cash_received, 0);
    const upi_received = settlements.reduce((sum, s) => sum + s.upi_received, 0);
    const credit_sales = settlements.reduce((sum, s) => sum + s.credit_amount, 0);
    const total_received = Number((cash_received + upi_received).toFixed(2));
    const outstanding_collection = settlements.reduce((sum, s) => sum + s.outstanding_amount, 0);

    const expenses = this.state.expenses.filter(
      (e) => e.expense_date === dateStr && e.status === 'active' && e.category !== 'seller_commission'
    );
    const today_expenses = expenses.reduce((sum, e) => sum + e.amount, 0);
    const total_ingredient_cost = batches.reduce((sum, b) => sum + b.total_ingredient_cost, 0);
    const estimated_profit = calculateEstimatedDailyProfit(
      gross_sales,
      total_commission,
      total_ingredient_cost,
      today_expenses
    );

    const closing_stock_value = this.state.products.reduce((sum, p) => {
      const avail = this.getAvailableFreezerStock(p.id);
      const pr = this.getActivePrice(p.id)?.selling_price || 0;
      return sum + avail * pr;
    }, 0);

    const closing = this.state.daily_closings.find((c) => c.business_date === dateStr);
    const is_day_closed = closing?.status === 'closed';

    const unsettled_issues_count = this.state.seller_issues.filter(
      (i) => i.issue_date === dateStr && (i.status === 'issued' || i.status === 'partially_settled')
    ).length;

    const pending_approvals_count = this.state.seller_settlements.filter(
      (s) => s.settlement_date === dateStr && s.status === 'pending_approval'
    ).length;

    const products = this.getProducts();
    const low_stock_products = products.filter((p) => (p.available_quantity || 0) < 50);

    // Calculate last 7 days trend
    const seven_day_sales: { date: string; gross_sales: number; net_sales: number; pieces_sold: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().split('T')[0];
      const daySettlements = this.state.seller_settlements.filter(
        (s) => s.settlement_date === dStr && s.status === 'approved'
      );
      const gSales = daySettlements.reduce((sum, s) => sum + s.gross_sales, 0);
      const comm = daySettlements.reduce((sum, s) => sum + s.total_commission, 0);
      const sold = daySettlements.reduce(
        (sum, s) => sum + s.items.reduce((is, it) => is + it.sold_quantity, 0),
        0
      );
      seven_day_sales.push({
        date: dStr,
        gross_sales: gSales,
        net_sales: Number((gSales - comm).toFixed(2)),
        pieces_sold: sold,
      });
    }

    return {
      today_date: dateStr,
      total_produced,
      total_issued,
      total_sold,
      total_returned,
      total_damaged,
      total_complimentary,
      gross_sales,
      total_commission,
      net_sales,
      cash_received,
      upi_received,
      credit_sales,
      total_received,
      outstanding_collection,
      today_expenses,
      estimated_profit,
      closing_stock_value,
      is_day_closed,
      unsettled_issues_count,
      pending_approvals_count,
      low_stock_products,
      seven_day_sales,
    };
  }

  // --- Backup Center & Disaster Recovery ---
  public exportAllTables(): Record<string, any[]> {
    return {
      profiles: [...this.state.profiles],
      products: [...this.state.products],
      product_prices: [...this.state.product_prices],
      sellers: [...this.state.sellers],
      carts: [...this.state.carts],
      production_batches: this.state.production_batches.map(({ items, ...b }) => b),
      production_items: this.state.production_batches.flatMap((b) =>
        b.items.map(({ product, ...it }) => ({
          ...it,
          production_batch_id: b.id,
        }))
      ),
      seller_issues: this.state.seller_issues.map(({ seller, cart, items, settlements, ...i }) => i),
      seller_issue_items: this.state.seller_issues.flatMap((i) =>
        i.items.map(({ product, ...it }) => ({
          ...it,
          seller_issue_id: i.id,
        }))
      ),
      seller_settlements: this.state.seller_settlements.map(({ seller, issue, items, ...s }) => s),
      settlement_items: this.state.seller_settlements.flatMap((s) =>
        s.items.map(({ product, ...it }) => ({
          ...it,
          settlement_id: s.id,
        }))
      ),
      expenses: [...this.state.expenses],
      stock_locations: [...this.state.stock_locations],
      stock_movements: [...this.state.stock_movements],
      daily_closings: [...this.state.daily_closings],
      audit_logs: [...this.state.audit_logs],
    };
  }

  public getBackupHistory(): BackupHistory[] {
    return [...(this.state.backup_history || [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }

  public recordBackupHistory(history: Omit<BackupHistory, 'id' | 'created_at'>): BackupHistory {
    const id = `bkh-${generateId().slice(0, 8)}`;
    const now = new Date().toISOString();
    const entry: BackupHistory = {
      ...history,
      id,
      created_at: now,
    };

    if (!this.state.backup_history) {
      this.state.backup_history = [];
    }

    this.state.backup_history.push(entry);
    this.logAudit(
      'backup_history',
      id,
      'CREATE_BACKUP',
      null,
      entry,
      `Generated ${history.backup_type} backup: ${history.file_name}`,
      history.created_by
    );
    this.saveState();
    return entry;
  }

  public restoreBackupData(data: Record<string, any[]>, reason: string, userId: string): void {
    const oldSnapshot = {
      product_count: this.state.products.length,
      seller_count: this.state.sellers.length,
      batch_count: this.state.production_batches.length,
    };

    if (data.profiles) this.state.profiles = data.profiles;
    if (data.products) this.state.products = data.products;
    if (data.product_prices) this.state.product_prices = data.product_prices;
    if (data.sellers) this.state.sellers = data.sellers;
    if (data.carts) this.state.carts = data.carts;
    if (data.stock_locations) this.state.stock_locations = data.stock_locations;
    if (data.expenses) this.state.expenses = data.expenses;
    if (data.stock_movements) this.state.stock_movements = data.stock_movements;
    if (data.daily_closings) this.state.daily_closings = data.daily_closings;

    // Reconstruct nested batches
    if (data.production_batches && data.production_items) {
      const itemsMap = new Map<string, any[]>();
      for (const it of data.production_items) {
        const list = itemsMap.get(it.production_batch_id) || [];
        const prod = this.state.products.find((p) => p.id === it.product_id);
        list.push({ ...it, product: prod });
        itemsMap.set(it.production_batch_id, list);
      }

      this.state.production_batches = data.production_batches.map((b) => ({
        ...b,
        items: itemsMap.get(b.id) || [],
      }));
    }

    // Reconstruct nested seller issues
    if (data.seller_issues && data.seller_issue_items) {
      const issueItemsMap = new Map<string, any[]>();
      for (const it of data.seller_issue_items) {
        const list = issueItemsMap.get(it.seller_issue_id) || [];
        const prod = this.state.products.find((p) => p.id === it.product_id);
        list.push({ ...it, product: prod });
        issueItemsMap.set(it.seller_issue_id, list);
      }

      this.state.seller_issues = data.seller_issues.map((i) => ({
        ...i,
        seller: this.state.sellers.find((s) => s.id === i.seller_id),
        cart: this.state.carts.find((c) => c.id === i.cart_id),
        items: issueItemsMap.get(i.id) || [],
      }));
    }

    // Reconstruct nested settlements
    if (data.seller_settlements && data.settlement_items) {
      const settItemsMap = new Map<string, any[]>();
      for (const it of data.settlement_items) {
        const list = settItemsMap.get(it.settlement_id) || [];
        const prod = this.state.products.find((p) => p.id === it.product_id);
        list.push({ ...it, product: prod });
        settItemsMap.set(it.settlement_id, list);
      }

      this.state.seller_settlements = data.seller_settlements.map((s) => ({
        ...s,
        seller: this.state.sellers.find((slr) => slr.id === s.seller_id),
        issue: this.state.seller_issues.find((iss) => iss.id === s.seller_issue_id),
        items: settItemsMap.get(s.id) || [],
      }));
    }

    this.logAudit(
      'backup_history',
      `restore-${generateId().slice(0, 8)}`,
      'RESTORE_BACKUP',
      oldSnapshot,
      { restored_tables: Object.keys(data) },
      `Executed controlled restore: ${reason}`,
      userId
    );

    this.saveState();
  }

  // --- Expense Master & Monthly Expenses ---
  public getExpenseHeads(includeArchived = false): ExpenseHead[] {
    const list = this.state.expense_heads || [];
    if (includeArchived) return [...list].sort((a, b) => a.sort_order - b.sort_order);
    return list.filter((h) => !h.is_archived).sort((a, b) => a.sort_order - b.sort_order);
  }

  public getExpenseHeadById(id: string): ExpenseHead | undefined {
    return (this.state.expense_heads || []).find((h) => h.id === id);
  }

  public addExpenseHead(head: Partial<ExpenseHead>, userId: string = 'usr-owner-001'): ExpenseHead {
    if (!head.name_en || !head.name_hi || !head.code) {
      throw new Error('Name (EN), Name (HI) and Code are required');
    }
    const exists = (this.state.expense_heads || []).some((h) => h.code.toLowerCase() === head.code!.toLowerCase());
    if (exists) {
      throw new Error(`Expense head with code '${head.code}' already exists`);
    }
    const id = `head-${generateId().slice(0, 8)}`;
    const now = new Date().toISOString();
    const newHead: ExpenseHead = {
      id,
      code: head.code.toUpperCase(),
      name_en: head.name_en,
      name_hi: head.name_hi,
      expense_group: head.expense_group || 'monthly_fixed',
      calculation_mode: head.calculation_mode || 'manual',
      default_amount: Number(head.default_amount || 0),
      due_day: Number(head.due_day || 5),
      start_date: head.start_date || getTodayDateString(),
      end_date: head.end_date || null,
      notes: head.notes || null,
      is_active: head.is_active !== false,
      is_archived: false,
      sort_order: (this.state.expense_heads || []).length + 1,
      created_by: userId,
      created_at: now,
      updated_at: now,
    };
    if (!this.state.expense_heads) this.state.expense_heads = [];
    this.state.expense_heads.push(newHead);
    this.logAudit('expense_heads', id, 'CREATE_EXPENSE_HEAD', null, newHead, `Created expense head ${newHead.name_en}`, userId);
    this.saveState();
    return newHead;
  }

  public updateExpenseHead(headId: string, updates: Partial<ExpenseHead>, userId: string = 'usr-owner-001'): ExpenseHead {
    const head = (this.state.expense_heads || []).find((h) => h.id === headId);
    if (!head) throw new Error('Expense head not found');
    const old = { ...head };
    Object.assign(head, updates, { updated_at: new Date().toISOString() });
    this.logAudit('expense_heads', headId, 'UPDATE_EXPENSE_HEAD', old, head, `Updated expense head ${head.name_en}`, userId);
    this.saveState();
    return head;
  }

  public deleteOrArchiveExpenseHead(headId: string, userId: string = 'usr-owner-001'): { success: boolean; action: 'deleted' | 'archived'; message: string } {
    const head = (this.state.expense_heads || []).find((h) => h.id === headId);
    if (!head) throw new Error('Expense head not found');
    const hasExpenses = (this.state.expenses || []).some((e) => e.expense_head_id === headId);
    if (hasExpenses) {
      head.is_archived = true;
      head.is_active = false;
      head.updated_at = new Date().toISOString();
      this.logAudit('expense_heads', headId, 'ARCHIVE_EXPENSE_HEAD', null, head, 'Archived expense head with historical transactions', userId);
      this.saveState();
      return { success: true, action: 'archived', message: 'Expense head has past expenses and was archived' };
    } else {
      this.state.expense_heads = (this.state.expense_heads || []).filter((h) => h.id !== headId);
      this.logAudit('expense_heads', headId, 'DELETE_EXPENSE_HEAD', head, null, 'Permanently deleted unused expense head', userId);
      this.saveState();
      return { success: true, action: 'deleted', message: 'Expense head permanently deleted' };
    }
  }

  public restoreExpenseHead(headId: string, userId: string = 'usr-owner-001'): ExpenseHead {
    const head = (this.state.expense_heads || []).find((h) => h.id === headId);
    if (!head) throw new Error('Expense head not found');
    head.is_archived = false;
    head.is_active = true;
    head.updated_at = new Date().toISOString();
    this.logAudit('expense_heads', headId, 'RESTORE_EXPENSE_HEAD', null, head, 'Restored archived expense head', userId);
    this.saveState();
    return head;
  }

  public getMonthlyExpenses(month: string): MonthlyExpenseSummary {
    const activeHeads = (this.state.expense_heads || []).filter(
      (h) => h.expense_group === 'monthly_fixed' && h.is_active && !h.is_archived
    );

    const monthExpenses = (this.state.expenses || []).filter(
      (e) => (e.expense_month === month || e.expense_date.startsWith(month)) && e.is_monthly_fixed
    );

    const items: MonthlyExpenseItem[] = activeHeads.map((head) => {
      const dayStr = String(head.due_day).padStart(2, '0');
      const dueDate = `${month}-${dayStr}`;

      const activeExp = monthExpenses.find((e) => e.expense_head_id === head.id && e.status === 'active');
      const voidedExp = monthExpenses.find((e) => e.expense_head_id === head.id && e.status === 'voided');

      if (activeExp) {
        return {
          head,
          month,
          expected_amount: head.default_amount,
          actual_amount: activeExp.amount,
          due_date: activeExp.due_date || dueDate,
          status: 'paid',
          expense: activeExp,
          paid_date: activeExp.expense_date,
          payment_method: activeExp.payment_method,
          notes: activeExp.description,
        };
      } else if (voidedExp) {
        return {
          head,
          month,
          expected_amount: head.default_amount,
          actual_amount: 0,
          due_date: dueDate,
          status: 'voided',
          expense: voidedExp,
          notes: voidedExp.void_reason,
        };
      } else {
        return {
          head,
          month,
          expected_amount: head.default_amount,
          actual_amount: 0,
          due_date: dueDate,
          status: 'pending',
          expense: null,
        };
      }
    });

    const expected_total = items.reduce((sum, it) => sum + it.expected_amount, 0);
    const paid_total = items.filter((it) => it.status === 'paid').reduce((sum, it) => sum + it.actual_amount, 0);
    const pending_total = items.filter((it) => it.status === 'pending').reduce((sum, it) => sum + it.expected_amount, 0);

    return {
      month,
      expected_total,
      paid_total,
      pending_total,
      items,
    };
  }

  public confirmOrPayMonthlyExpense(
    data: {
      expense_head_id: string;
      month: string;
      amount: number;
      payment_method: any;
      paid_date?: string;
      description?: string;
      vendor_name?: string;
      bill_image_path?: string;
    },
    userId: string = 'usr-owner-001'
  ): Expense {
    const head = this.getExpenseHeadById(data.expense_head_id);
    const id = `exp-${generateId().slice(0, 8)}`;
    const now = new Date().toISOString();
    const paidDate = data.paid_date || getTodayDateString();
    const dueDay = head ? String(head.due_day).padStart(2, '0') : '05';

    const newExpense: Expense = {
      id,
      expense_date: paidDate,
      category: 'other',
      amount: Number(data.amount),
      payment_method: data.payment_method || 'cash',
      description: data.description || (head ? `${head.name_hi} (${data.month})` : `Monthly Expense ${data.month}`),
      vendor_name: data.vendor_name || head?.name_en || null,
      bill_image_path: data.bill_image_path || null,
      status: 'active',
      void_reason: null,
      expense_head_id: data.expense_head_id,
      expense_month: data.month,
      due_date: `${data.month}-${dueDay}`,
      corrected_from_expense_id: null,
      idempotency_key: `${data.expense_head_id}_${data.month}_${Date.now()}`,
      is_monthly_fixed: true,
      created_by: userId,
      created_at: now,
      updated_at: now,
    };

    this.state.expenses.push(newExpense);
    this.logAudit('expenses', id, 'CONFIRM_MONTHLY_EXPENSE', null, newExpense, `Confirmed monthly expense ₹${data.amount} for ${head?.name_en || data.expense_head_id}`, userId);
    this.saveState();
    return newExpense;
  }

  public correctPaidExpense(
    expenseId: string,
    updates: {
      amount: number;
      payment_method?: any;
      expense_date?: string;
      description?: string;
    },
    reason: string,
    userId: string = 'usr-owner-001'
  ): { success: boolean; old_expense_id: string; new_expense_id: string; amount: number; message: string } {
    if (!reason || reason.trim().length < 3) {
      throw new Error('A valid correction reason is required');
    }
    const oldExpense = this.state.expenses.find((e) => e.id === expenseId);
    if (!oldExpense) throw new Error('Expense not found');

    // Void old
    oldExpense.status = 'voided';
    oldExpense.void_reason = `Correction: ${reason}`;
    oldExpense.updated_at = new Date().toISOString();

    // Create new
    const newId = `exp-${generateId().slice(0, 8)}`;
    const now = new Date().toISOString();
    const newExpense: Expense = {
      ...oldExpense,
      id: newId,
      amount: Number(updates.amount),
      payment_method: updates.payment_method || oldExpense.payment_method,
      expense_date: updates.expense_date || oldExpense.expense_date,
      description: updates.description || oldExpense.description,
      status: 'active',
      void_reason: null,
      corrected_from_expense_id: expenseId,
      created_by: userId,
      created_at: now,
      updated_at: now,
    };

    this.state.expenses.push(newExpense);
    this.logAudit('expenses', newId, 'CORRECT_EXPENSE', oldExpense, newExpense, reason, userId);
    this.saveState();

    return {
      success: true,
      old_expense_id: expenseId,
      new_expense_id: newId,
      amount: Number(updates.amount),
      message: 'Expense corrected and replacement recorded',
    };
  }

  public copyPreviousMonthFixedExpenses(
    sourceMonth: string,
    targetMonth: string,
    userId: string = 'usr-owner-001'
  ): { success: boolean; copied_count: number; target_month: string } {
    const activeHeads = (this.state.expense_heads || []).filter(
      (h) => h.expense_group === 'monthly_fixed' && h.is_active && !h.is_archived
    );

    let copied_count = 0;
    for (const head of activeHeads) {
      const alreadyConfirmed = this.state.expenses.some(
        (e) => e.expense_head_id === head.id && e.expense_month === targetMonth && e.status === 'active'
      );
      if (!alreadyConfirmed) {
        const prevExp = this.state.expenses.find(
          (e) => e.expense_head_id === head.id && e.expense_month === sourceMonth && e.status === 'active'
        );
        const amount = prevExp ? prevExp.amount : head.default_amount;
        const payment_method = prevExp ? prevExp.payment_method : 'cash';

        this.confirmOrPayMonthlyExpense(
          {
            expense_head_id: head.id,
            month: targetMonth,
            amount,
            payment_method,
            paid_date: `${targetMonth}-${String(head.due_day).padStart(2, '0')}`,
            description: `${head.name_hi} (${targetMonth})`,
            vendor_name: prevExp?.vendor_name || head.name_en,
          },
          userId
        );
        copied_count++;
      }
    }

    return {
      success: true,
      copied_count,
      target_month: targetMonth,
    };
  }

  public getProfitLossReport(fromDate: string, toDate: string): ProfitLossReport {
    // 1. Sales & Revenue
    const settlements = (this.state.seller_settlements || []).filter(
      (s) => s.settlement_date >= fromDate && s.settlement_date <= toDate && s.status === 'approved'
    );
    const gross_sales = settlements.reduce((sum, s) => sum + Number(s.gross_sales || 0), 0);
    const total_commission = settlements.reduce((sum, s) => sum + Number(s.total_commission || 0), 0);
    const net_received_sales = settlements.reduce((sum, s) => sum + Number(s.total_received || 0), 0);

    // 2. Recipe Consumption Costs (Never count purchase and consumption twice)
    const movements = (this.state.raw_material_movements || []).filter((m) => {
      const mDate = m.movement_date ? m.movement_date.split('T')[0] : '';
      return (
        mDate >= fromDate &&
        mDate <= toDate &&
        (m.movement_type as string) === 'production_consumption' || (m.movement_type as string) === 'production'
      );
    });

    let production_ingredient_cost = 0;
    let packaging_cost = 0;
    for (const m of movements) {
      const ing = (this.state.ingredients || []).find((i) => i.id === m.ingredient_id);
      const val = Math.abs(Number(m.total_value_snapshot || (m.quantity * (m.unit_cost_snapshot || 0))));
      if (ing?.category === 'packaging') {
        packaging_cost += val;
      } else {
        production_ingredient_cost += val;
      }
    }

    // 3. LPG Energy Cost
    const lpgReadings = (this.state.lpg_cylinder_readings || []).filter((r) => {
      const rDate = r.reading_date ? r.reading_date.split('T')[0] : '';
      return rDate >= fromDate && rDate <= toDate;
    });
    const lpg_energy_cost = lpgReadings.reduce((sum, r) => sum + Number(r.gas_consumed_kg || 0) * 95, 0);
    const total_production_cost = Number((production_ingredient_cost + packaging_cost + lpg_energy_cost).toFixed(2));

    // 4. Confirmed Monthly Fixed Expenses (DO NOT deduct pending templates or voided records)
    const month = fromDate.slice(0, 7);
    const activeExpenses = (this.state.expenses || []).filter(
      (e) => e.expense_date >= fromDate && e.expense_date <= toDate && e.status === 'active'
    );

    const confirmed_monthly_fixed_expenses = activeExpenses
      .filter((e) => e.is_monthly_fixed || (e.expense_head_id && this.getExpenseHeadById(e.expense_head_id)?.expense_group === 'monthly_fixed'))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const other_manual_expenses = activeExpenses
      .filter((e) => !e.is_monthly_fixed && (!e.expense_head_id || this.getExpenseHeadById(e.expense_head_id)?.expense_group !== 'monthly_fixed'))
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);

    const total_operating_expenses = Number((confirmed_monthly_fixed_expenses + other_manual_expenses).toFixed(2));

    // Pending templates in that month (for information only, NOT deducted)
    const monthlySummary = this.getMonthlyExpenses(month);
    const pending_monthly_fixed_templates = monthlySummary.pending_total;

    // Days in month calculation
    const [yr, mo] = month.split('-').map(Number);
    const days_in_month = new Date(yr, mo, 0).getDate();
    const daily_allocated_fixed_cost = Number((confirmed_monthly_fixed_expenses / (days_in_month || 30)).toFixed(2));

    const gross_profit = Number((gross_sales - total_production_cost).toFixed(2));
    const net_operating_profit = Number((gross_profit - total_operating_expenses).toFixed(2));
    const profit_margin_percentage = gross_sales > 0 ? Number(((net_operating_profit / gross_sales) * 100).toFixed(2)) : 0;

    return {
      from_date: fromDate,
      to_date: toDate,
      month,
      days_in_month,
      gross_sales: Number(gross_sales.toFixed(2)),
      net_received_sales: Number(net_received_sales.toFixed(2)),
      total_commission: Number(total_commission.toFixed(2)),
      production_ingredient_cost: Number(production_ingredient_cost.toFixed(2)),
      packaging_cost: Number(packaging_cost.toFixed(2)),
      lpg_energy_cost: Number(lpg_energy_cost.toFixed(2)),
      total_production_cost,
      confirmed_monthly_fixed_expenses: Number(confirmed_monthly_fixed_expenses.toFixed(2)),
      pending_monthly_fixed_templates: Number(pending_monthly_fixed_templates.toFixed(2)),
      other_manual_expenses: Number(other_manual_expenses.toFixed(2)),
      total_operating_expenses,
      daily_allocated_fixed_cost,
      gross_profit,
      net_operating_profit,
      profit_margin_percentage,
    };
  }
}

export const mockStore = new MockStore();
