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
} from '@/types';
import {
  calculateSaleableProduction,
  calculateSettlementSummary,
  calculateEstimatedDailyProfit,
} from './calculations';
import { generateId } from './utils';
import { getTodayDateString } from './formatters';

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
  backup_history?: BackupHistory[];
  ingredients?: Ingredient[];
  ingredient_prices?: IngredientPrice[];
  recipes?: Recipe[];
  recipe_items?: RecipeItem[];
  production_batch_ingredients?: ProductionBatchIngredient[];
}

const DEFAULT_STATE: LocalStoreState = {
  backup_history: [],
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
  ingredients: [
    { id: 'ing-milk-01', code: 'ING-MILK', name_en: 'Milk', name_hi: 'दूध', category: 'dairy', base_unit: 'litre', current_rate: 60.0, rate_unit: 'litre', is_active: true },
    { id: 'ing-sug-02', code: 'ING-SUGAR', name_en: 'Sugar', name_hi: 'चीनी', category: 'sweetener', base_unit: 'kg', current_rate: 48.0, rate_unit: 'kg', is_active: true },
    { id: 'ing-khoy-03', code: 'ING-KHOYA', name_en: 'Khoya', name_hi: 'खोया / मावा', category: 'dairy', base_unit: 'kg', current_rate: 320.0, rate_unit: 'kg', is_active: true },
    { id: 'ing-cash-04', code: 'ING-CASHEW', name_en: 'Cashew', name_hi: 'काजू', category: 'dry_fruit', base_unit: 'kg', current_rate: 800.0, rate_unit: 'kg', is_active: true },
    { id: 'ing-pist-05', code: 'ING-PISTA', name_en: 'Pistachio', name_hi: 'पिस्ता', category: 'dry_fruit', base_unit: 'kg', current_rate: 1200.0, rate_unit: 'kg', is_active: true },
    { id: 'ing-almd-06', code: 'ING-ALMOND', name_en: 'Almond', name_hi: 'बादाम', category: 'dry_fruit', base_unit: 'kg', current_rate: 750.0, rate_unit: 'kg', is_active: true },
    { id: 'ing-cust-07', code: 'ING-CUSTARD', name_en: 'Custard powder', name_hi: 'कस्टर्ड पाउडर', category: 'flavoring', base_unit: 'kg', current_rate: 160.0, rate_unit: 'kg', is_active: true },
    { id: 'ing-card-08', code: 'ING-CARDAMOM', name_en: 'Cardamom', name_hi: 'इलायची', category: 'spice', base_unit: 'kg', current_rate: 2400.0, rate_unit: 'kg', is_active: true },
    { id: 'ing-saff-09', code: 'ING-SAFFRON', name_en: 'Saffron', name_hi: 'केसर', category: 'spice', base_unit: 'g', current_rate: 250.0, rate_unit: 'g', is_active: true },
    { id: 'ing-flav-10', code: 'ING-FLAVOUR', name_en: 'Flavour', name_hi: 'फ्लेवर', category: 'flavoring', base_unit: 'ml', current_rate: 1.5, rate_unit: 'ml', is_active: true },
    { id: 'ing-stk-11', code: 'ING-STICK', name_en: 'Kulfi stick', name_hi: 'कुल्फी स्टिक', category: 'packaging', base_unit: 'piece', current_rate: 0.3, rate_unit: 'piece', is_active: true },
    { id: 'ing-wrp-12', code: 'ING-WRAPPER', name_en: 'Wrapper', name_hi: 'रैपर', category: 'packaging', base_unit: 'piece', current_rate: 0.4, rate_unit: 'piece', is_active: true },
    { id: 'ing-pck-13', code: 'ING-POUCH', name_en: 'Pouch/packing', name_hi: 'पैकिंग', category: 'packaging', base_unit: 'piece', current_rate: 0.5, rate_unit: 'piece', is_active: true },
    { id: 'ing-oth-14', code: 'ING-OTHER', name_en: 'Other ingredient', name_hi: 'अन्य सामग्री', category: 'other', base_unit: 'kg', current_rate: 100.0, rate_unit: 'kg', is_active: true },
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

  // --- Stock Ledger Balances ---
  public getAvailableFreezerStock(productId: string): number {
    const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer');
    if (!freezerLoc) return 0;

    let incoming = 0;
    let outgoing = 0;

    for (const m of this.state.stock_movements) {
      if (m.product_id === productId) {
        if (m.destination_location_id === freezerLoc.id) incoming += m.quantity;
        if (m.source_location_id === freezerLoc.id) outgoing += m.quantity;
      }
    }
    return Math.max(0, incoming - outgoing);
  }

  public getSellerHeldStock(sellerId: string, productId?: string): number {
    const sellerLoc = this.state.stock_locations.find(
      (l) => l.location_type === 'seller' && l.seller_id === sellerId
    );
    if (!sellerLoc) return 0;

    let incoming = 0;
    let outgoing = 0;

    for (const m of this.state.stock_movements) {
      if (!productId || m.product_id === productId) {
        if (m.destination_location_id === sellerLoc.id) incoming += m.quantity;
        if (m.source_location_id === sellerLoc.id) outgoing += m.quantity;
      }
    }
    return Math.max(0, incoming - outgoing);
  }

  public getStockMovements(): StockMovement[] {
    return [...this.state.stock_movements].sort(
      (a, b) => new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime()
    );
  }

  // --- Production Workflow ---
  public getProductionBatches(): ProductionBatchWithItems[] {
    return [...this.state.production_batches]
      .filter((b) => b.is_current_version !== false)
      .sort(
        (a, b) => new Date(b.production_date).getTime() - new Date(a.production_date).getTime()
      );
  }

  public createProductionBatch(
    productionDate: string,
    totalIngredientCost: number,
    notes: string,
    items: { product_id: string; produced_quantity: number; damaged_quantity: number; notes?: string }[],
    userId: string
  ): ProductionBatchWithItems {
    const batchId = `batch-${generateId().slice(0, 8)}`;
    const dateStr = productionDate.replace(/-/g, '');
    const seq = String(this.state.production_batches.filter((b) => b.production_date === productionDate).length + 1).padStart(3, '0');
    const batchNumber = `JK-${dateStr}-${seq}`;
    const now = new Date().toISOString();

    const totalSaleable = items.reduce((sum, it) => sum + calculateSaleableProduction(it.produced_quantity, it.damaged_quantity), 0);

    const batchItems = items.map((it) => {
      const saleable = calculateSaleableProduction(it.produced_quantity, it.damaged_quantity);
      const allocatedCost = totalSaleable > 0 ? Number(((saleable / totalSaleable) * totalIngredientCost).toFixed(2)) : 0;
      const unitCost = saleable > 0 ? Number((allocatedCost / saleable).toFixed(2)) : 0;
      const product = this.state.products.find((p) => p.id === it.product_id);

      return {
        id: `pitem-${generateId().slice(0, 8)}`,
        batch_id: batchId,
        product_id: it.product_id,
        produced_quantity: it.produced_quantity,
        damaged_quantity: it.damaged_quantity,
        saleable_quantity: saleable,
        allocated_ingredient_cost: allocatedCost,
        unit_production_cost: unitCost,
        notes: it.notes || null,
        product,
      };
    });

    const batch: ProductionBatchWithItems = {
      id: batchId,
      batch_number: batchNumber,
      production_date: productionDate,
      status: 'draft',
      total_ingredient_cost: totalIngredientCost,
      notes: notes || null,
      completed_at: null,
      version_number: 1,
      is_current_version: true,
      correction_of_id: null,
      superseded_by_id: null,
      correction_reason: null,
      corrected_by: null,
      corrected_at: null,
      created_by: userId,
      created_at: now,
      updated_at: now,
      items: batchItems,
    };

    this.state.production_batches.push(batch);
    this.logAudit('production_batches', batchId, 'CREATE_BATCH', null, batch, 'Created draft production batch', userId);
    this.saveState();
    return batch;
  }

  public completeProductionBatch(batchId: string, userId: string): ProductionBatchWithItems {
    const batch = this.state.production_batches.find((b) => b.id === batchId);
    if (!batch) throw new Error('Production batch not found');
    if (batch.status === 'completed') return batch;
    if (batch.status === 'cancelled') throw new Error('Cannot complete a cancelled batch');

    const now = new Date().toISOString();
    const prodLoc = this.state.stock_locations.find((l) => l.location_type === 'production') || {
      id: 'loc-prod-01',
      name: 'Production Floor',
      location_type: 'production' as const,
      seller_id: null,
      cart_id: null,
      is_active: true,
    };
    const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer') || {
      id: 'loc-freezer-01',
      name: 'Main Cold Storage Freezer',
      location_type: 'main_freezer' as const,
      seller_id: null,
      cart_id: null,
      is_active: true,
    };
    const damagedLoc = this.state.stock_locations.find((l) => l.location_type === 'damaged') || {
      id: 'loc-damaged-01',
      name: 'Damaged / Wastage',
      location_type: 'damaged' as const,
      seller_id: null,
      cart_id: null,
      is_active: true,
    };

    // Create stock movements for each item
    for (const it of batch.items) {
      if (it.saleable_quantity > 0) {
        this.state.stock_movements.push({
          id: `mv-${generateId().slice(0, 8)}`,
          movement_date: now,
          product_id: it.product_id,
          source_location_id: prodLoc.id,
          destination_location_id: freezerLoc.id,
          quantity: it.saleable_quantity,
          movement_type: 'production_completed',
          reference_table: 'production_batches',
          reference_id: batchId,
          notes: `Batch completed: ${batch.batch_number}`,
          created_by: userId,
          created_at: now,
        });
      }

      if (it.damaged_quantity > 0) {
        this.state.stock_movements.push({
          id: `mv-${generateId().slice(0, 8)}`,
          movement_date: now,
          product_id: it.product_id,
          source_location_id: prodLoc.id,
          destination_location_id: damagedLoc.id,
          quantity: it.damaged_quantity,
          movement_type: 'damaged',
          reference_table: 'production_batches',
          reference_id: batchId,
          notes: `Production wastage: ${batch.batch_number}`,
          created_by: userId,
          created_at: now,
        });
      }
    }

    batch.status = 'completed';
    batch.completed_at = now;
    batch.updated_at = now;

    this.logAudit('production_batches', batchId, 'COMPLETE_PRODUCTION', null, batch, 'Completed batch and moved to freezer', userId);
    this.saveState();
    return batch;
  }

  public cancelDraftBatch(batchId: string, userId: string): void {
    const batch = this.state.production_batches.find((b) => b.id === batchId);
    if (!batch) throw new Error('Batch not found');
    if (batch.status !== 'draft') throw new Error('Only draft batches can be cancelled');

    batch.status = 'cancelled';
    batch.updated_at = new Date().toISOString();
    this.logAudit('production_batches', batchId, 'CANCEL_BATCH', null, batch, 'Draft batch cancelled', userId);
    this.saveState();
  }

  public updateDraftProductionBatch(
    batchId: string,
    productionDate: string,
    totalIngredientCost: number,
    notes: string,
    items: { product_id: string; produced_quantity: number; damaged_quantity: number; notes?: string }[],
    userId: string
  ): ProductionBatchWithItems {
    const batch = this.state.production_batches.find((b) => b.id === batchId);
    if (!batch) throw new Error('Production batch not found');
    if (batch.status !== 'draft') throw new Error('Only draft batches can be edited directly');

    const user = this.state.profiles.find((p) => p.id === userId);
    if (user && user.role === 'production_worker' && batch.created_by && batch.created_by !== userId) {
      throw new Error('Workers can edit only their own drafts.');
    }

    const totalSaleable = items.reduce((sum, it) => sum + calculateSaleableProduction(it.produced_quantity, it.damaged_quantity), 0);

    const batchItems = items.map((it) => {
      const saleable = calculateSaleableProduction(it.produced_quantity, it.damaged_quantity);
      const allocatedCost = totalSaleable > 0 ? Number(((saleable / totalSaleable) * totalIngredientCost).toFixed(2)) : 0;
      const unitCost = saleable > 0 ? Number((allocatedCost / saleable).toFixed(2)) : 0;
      const product = this.state.products.find((p) => p.id === it.product_id);

      return {
        id: `pitem-${generateId().slice(0, 8)}`,
        batch_id: batchId,
        product_id: it.product_id,
        produced_quantity: it.produced_quantity,
        damaged_quantity: it.damaged_quantity,
        saleable_quantity: saleable,
        allocated_ingredient_cost: allocatedCost,
        unit_production_cost: unitCost,
        notes: it.notes || null,
        product,
      };
    });

    const oldBatch = { ...batch };
    batch.production_date = productionDate;
    batch.total_ingredient_cost = totalIngredientCost;
    batch.notes = notes || null;
    batch.items = batchItems;
    batch.updated_at = new Date().toISOString();

    this.logAudit('production_batches', batchId, 'EDIT_DRAFT', oldBatch, batch, 'Draft production batch updated', userId);
    this.saveState();
    return batch;
  }

  public correctProductionBatch(
    batchId: string,
    productionDate: string,
    totalIngredientCost: number,
    notes: string,
    items: { product_id: string; produced_quantity: number; damaged_quantity: number; notes?: string }[],
    reason: string,
    userId: string
  ): ProductionBatchWithItems {
    const user = this.state.profiles.find((p) => p.id === userId);
    if (user && user.role !== 'owner') {
      throw new Error('Access Denied: Only Owners are authorized to correct completed production batches.');
    }

    if (!reason || reason.trim().length < 5) {
      throw new Error('A valid explanation of at least 5 characters is required for correcting a completed batch.');
    }

    const oldBatch = this.state.production_batches.find((b) => b.id === batchId);
    if (!oldBatch) throw new Error('Production batch not found');
    if (oldBatch.status !== 'completed' || oldBatch.is_current_version === false) {
      throw new Error('Only active, completed production batches can be corrected.');
    }

    // Check closed business day
    const closing = this.state.daily_closings.find((c) => c.business_date === oldBatch.production_date);
    if (closing && closing.status === 'closed') {
      throw new Error(`Business day (${oldBatch.production_date}) is closed. You must reopen the business day first before correcting this record.`);
    }

    // Stock Safety check: check each product difference
    const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer')!;
    const prodLoc = this.state.stock_locations.find((l) => l.location_type === 'production')!;

    for (const it of items) {
      const oldItem = oldBatch.items.find((i) => i.product_id === it.product_id);
      const oldSaleable = oldItem ? oldItem.saleable_quantity : 0;
      const newSaleable = it.produced_quantity - (it.damaged_quantity || 0);
      const netDiff = newSaleable - oldSaleable;

      if (netDiff < 0) {
        const currentFreezerStock = this.getAvailableFreezerStock(it.product_id);
        if (currentFreezerStock + netDiff < 0) {
          throw new Error(`Correction cannot reduce production below stock already issued or consumed. Current freezer stock is ${currentFreezerStock}, proposed reduction is ${Math.abs(netDiff)}.`);
        }
      }
    }

    const now = new Date().toISOString();

    // Reverse old stock movements
    const oldMovements = this.state.stock_movements.filter(
      (m) => m.reference_table === 'production_batches' && m.reference_id === batchId && (m.movement_type === 'production_completed' || (m.movement_type as any) === 'production_in')
    );

    for (const om of oldMovements) {
      this.state.stock_movements.push({
        id: `mv-${generateId().slice(0, 8)}`,
        movement_date: now,
        product_id: om.product_id,
        source_location_id: om.destination_location_id,
        destination_location_id: om.source_location_id,
        quantity: om.quantity,
        movement_type: 'production_reversal',
        reference_table: 'production_batches',
        reference_id: batchId,
        reversal_of_movement_id: om.id,
        notes: `Reversal for correction: ${reason}`,
        created_by: userId,
        created_at: now,
      });
    }

    // Create new batch (Version N+1)
    const newVersion = (oldBatch.version_number || 1) + 1;
    const newBatchId = `batch-${generateId().slice(0, 8)}`;
    const baseBatchNumber = oldBatch.batch_number.replace(/-V\d+$/, '');
    const newBatchNumber = `${baseBatchNumber}-V${newVersion}`;

    const totalSaleable = items.reduce((sum, it) => sum + calculateSaleableProduction(it.produced_quantity, it.damaged_quantity), 0);

    const newItems = items.map((it) => {
      const saleable = calculateSaleableProduction(it.produced_quantity, it.damaged_quantity);
      const allocatedCost = totalSaleable > 0 ? Number(((saleable / totalSaleable) * totalIngredientCost).toFixed(2)) : 0;
      const unitCost = saleable > 0 ? Number((allocatedCost / saleable).toFixed(2)) : 0;
      const product = this.state.products.find((p) => p.id === it.product_id);

      if (saleable > 0) {
        this.state.stock_movements.push({
          id: `mv-${generateId().slice(0, 8)}`,
          movement_date: now,
          product_id: it.product_id,
          source_location_id: prodLoc.id,
          destination_location_id: freezerLoc.id,
          quantity: saleable,
          movement_type: 'production_completed',
          reference_table: 'production_batches',
          reference_id: newBatchId,
          notes: `Replacement stock for correction V${newVersion}`,
          created_by: userId,
          created_at: now,
        });
      }

      return {
        id: `pitem-${generateId().slice(0, 8)}`,
        batch_id: newBatchId,
        product_id: it.product_id,
        produced_quantity: it.produced_quantity,
        damaged_quantity: it.damaged_quantity,
        saleable_quantity: saleable,
        allocated_ingredient_cost: allocatedCost,
        unit_production_cost: unitCost,
        notes: it.notes || null,
        product,
      };
    });

    const newBatch: ProductionBatchWithItems = {
      id: newBatchId,
      batch_number: newBatchNumber,
      production_date: productionDate,
      status: 'completed',
      total_ingredient_cost: totalIngredientCost,
      notes: notes || null,
      completed_at: now,
      version_number: newVersion,
      is_current_version: true,
      correction_of_id: oldBatch.id,
      superseded_by_id: null,
      correction_reason: reason,
      corrected_by: userId,
      corrected_at: now,
      created_by: oldBatch.created_by,
      created_at: oldBatch.created_at,
      updated_at: now,
      items: newItems,
    };

    // Supersede old batch
    oldBatch.status = 'superseded';
    oldBatch.is_current_version = false;
    oldBatch.superseded_by_id = newBatchId;
    oldBatch.updated_at = now;

    this.state.production_batches.push(newBatch);
    this.logAudit('production_batches', newBatchId, 'CORRECT_RECORD', oldBatch, newBatch, reason, userId);
    this.saveState();
    return newBatch;
  }

  public getProductionRevisionHistory(batchId: string): RevisionRecord[] {
    const allBatches = this.state.production_batches;
    const target = allBatches.find((b) => b.id === batchId);
    if (!target) return [];

    let root = target;
    while (root.correction_of_id) {
      const parent = allBatches.find((b) => b.id === root.correction_of_id);
      if (!parent) break;
      root = parent;
    }

    const chain: ProductionBatchWithItems[] = [];
    let curr: ProductionBatchWithItems | undefined = root;
    while (curr) {
      chain.push(curr);
      if (!curr.superseded_by_id) break;
      curr = allBatches.find((b) => b.id === curr!.superseded_by_id);
    }

    const profiles = this.state.profiles;

    return chain.map((b) => {
      const user = profiles.find((p) => p.id === (b.corrected_by || b.created_by));
      const totalProduced = b.items.reduce((s, it) => s + it.produced_quantity, 0);
      const totalSaleable = b.items.reduce((s, it) => s + it.saleable_quantity, 0);

      return {
        id: b.id,
        version_number: b.version_number || 1,
        status: b.status,
        date: b.production_date,
        created_at: b.created_at,
        corrected_at: b.corrected_at,
        corrected_by_name: user?.full_name || 'Owner',
        correction_reason: b.correction_reason,
        is_current_version: b.is_current_version !== false,
        correction_of_id: b.correction_of_id,
        superseded_by_id: b.superseded_by_id,
        summary_text: `Version ${b.version_number || 1} (${b.status}): ${totalProduced} pcs produced (${totalSaleable} saleable), Cost: ₹${b.total_ingredient_cost}`,
        details: b,
        financial_effect: {
          cost: b.total_ingredient_cost,
        },
        stock_effect: {
          produced: totalProduced,
          damaged: totalProduced - totalSaleable,
        },
      };
    });
  }

  public deleteProductionBatch(
    batchId: string,
    reason: string = 'Deleted by Owner',
    userId: string = 'usr-owner-001'
  ): { success: boolean; message: string } {
    const user = this.state.profiles.find((p) => p.id === userId);
    if (user && user.role !== 'owner') {
      throw new Error('Access Denied: Only Owners are authorized to delete production batches.');
    }

    const batch = this.state.production_batches.find((b) => b.id === batchId);
    if (!batch) throw new Error('Production batch not found');

    if (batch.status === 'completed') {
      const closing = this.state.daily_closings.find((c) => c.business_date === batch.production_date);
      if (closing && closing.status === 'closed') {
        throw new Error(`Business day (${batch.production_date}) is closed. Reopen the business day before deleting this record.`);
      }

      const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer')!;
      const prodLoc = this.state.stock_locations.find((l) => l.location_type === 'production')!;
      const now = new Date().toISOString();

      for (const it of batch.items) {
        const saleable = it.saleable_quantity;
        if (saleable > 0) {
          const availableStock = this.getAvailableFreezerStock(it.product_id);
          if (availableStock < saleable) {
            throw new Error(`Cannot delete batch because ${saleable} pcs of ${it.product?.name_hi || it.product?.name_en || 'product'} were produced, but only ${availableStock} pcs remain in the main freezer (stock has already been issued or sold).`);
          }

          this.state.stock_movements.push({
            id: `mv-${generateId().slice(0, 8)}`,
            movement_date: now,
            product_id: it.product_id,
            source_location_id: freezerLoc.id,
            destination_location_id: prodLoc.id,
            quantity: saleable,
            movement_type: 'production_reversal',
            reference_table: 'production_batches',
            reference_id: batch.id,
            notes: `Stock reversal for deleted production batch ${batch.batch_number}: ${reason}`,
            created_by: userId,
            created_at: now,
          });
        }
      }
    }

    const old = { ...batch };
    this.state.production_batches = this.state.production_batches.filter((b) => b.id !== batchId);
    if (this.state.production_batch_ingredients) {
      this.state.production_batch_ingredients = this.state.production_batch_ingredients.filter((pbi) => pbi.batch_id !== batchId);
    }

    this.logAudit('production_batches', batchId, 'DELETE_BATCH', old, null, reason, userId);
    this.saveState();
    return { success: true, message: 'Production batch deleted successfully' };
  }

  public adjustFreezerStock(
    productId: string,
    newQuantity: number,
    reason: string = 'Manual Adjustment',
    userId: string = 'usr-owner-001'
  ): { success: boolean; previousQuantity: number; newQuantity: number; difference: number; message: string } {
    const product = this.state.products.find((p) => p.id === productId);
    if (!product) throw new Error('Product not found');

    const targetQty = Math.max(0, Math.round(Number(newQuantity) || 0));
    const currentQty = this.getAvailableFreezerStock(productId);
    const difference = targetQty - currentQty;

    if (difference === 0) {
      return {
        success: true,
        previousQuantity: currentQty,
        newQuantity: targetQty,
        difference: 0,
        message: 'No change in freezer stock quantity',
      };
    }

    const now = new Date().toISOString();
    let freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer');
    if (!freezerLoc) {
      freezerLoc = {
        id: 'loc-freezer-01',
        name: 'Main Cold Storage Freezer',
        location_type: 'main_freezer',
        seller_id: null,
        cart_id: null,
        is_active: true,
      };
      this.state.stock_locations.push(freezerLoc);
    }

    let adjLoc = this.state.stock_locations.find((l) => l.location_type === 'damaged' || l.location_type === 'production');
    if (!adjLoc) {
      adjLoc = {
        id: 'loc-adj-01',
        name: 'Inventory Adjustment Floor',
        location_type: 'production',
        seller_id: null,
        cart_id: null,
        is_active: true,
      };
      this.state.stock_locations.push(adjLoc);
    }

    const safeFreezerLoc = freezerLoc;
    const safeAdjLoc = adjLoc;

    if (difference > 0) {
      // Stock increase: source = adjLoc, destination = freezerLoc
      this.state.stock_movements.push({
        id: `mv-${generateId().slice(0, 8)}`,
        movement_date: now,
        product_id: productId,
        source_location_id: safeAdjLoc.id,
        destination_location_id: safeFreezerLoc.id,
        quantity: difference,
        movement_type: 'manual_adjustment' as any,
        reference_table: 'stock_locations',
        reference_id: safeFreezerLoc.id,
        notes: `Freezer stock adjusted (+${difference} pcs): ${currentQty} -> ${targetQty}. Reason: ${reason}`,
        created_by: userId,
        created_at: now,
      });
    } else {
      // Stock decrease: source = freezerLoc, destination = adjLoc
      const reduceQty = Math.abs(difference);
      this.state.stock_movements.push({
        id: `mv-${generateId().slice(0, 8)}`,
        movement_date: now,
        product_id: productId,
        source_location_id: safeFreezerLoc.id,
        destination_location_id: safeAdjLoc.id,
        quantity: reduceQty,
        movement_type: 'manual_adjustment' as any,
        reference_table: 'stock_locations',
        reference_id: safeFreezerLoc.id,
        notes: `Freezer stock adjusted (-${reduceQty} pcs): ${currentQty} -> ${targetQty}. Reason: ${reason}`,
        created_by: userId,
        created_at: now,
      });
    }

    this.logAudit(
      'stock_locations',
      safeFreezerLoc.id,
      'FREEZER_STOCK_ADJUSTMENT',
      { product_id: productId, product_name: product.name_en, previous_quantity: currentQty },
      { product_id: productId, product_name: product.name_en, new_quantity: targetQty, difference },
      reason,
      userId
    );
    this.saveState();

    return {
      success: true,
      previousQuantity: currentQty,
      newQuantity: targetQty,
      difference,
      message: `Freezer stock successfully updated from ${currentQty} to ${targetQty} pcs`,
    };
  }

  // --- Recipe & Ingredient Master Workflow ---
  public getIngredients(): Ingredient[] {
    return (this.state.ingredients || []).filter((i) => i.is_active !== false);
  }

  public getIngredientById(id: string): Ingredient | undefined {
    return (this.state.ingredients || []).find((i) => i.id === id);
  }

  public addIngredient(
    ingredient: Omit<Ingredient, 'id' | 'created_at' | 'updated_at'>,
    userId: string = 'usr-owner-001'
  ): Ingredient {
    const id = `ing-${generateId().slice(0, 8)}`;
    const now = new Date().toISOString();

    const newIng: Ingredient = {
      id,
      ...ingredient,
      created_at: now,
      updated_at: now,
    };

    if (!this.state.ingredients) this.state.ingredients = [];
    this.state.ingredients.push(newIng);

    if (!this.state.ingredient_prices) this.state.ingredient_prices = [];
    this.state.ingredient_prices.push({
      id: `ip-${generateId().slice(0, 8)}`,
      ingredient_id: id,
      rate: ingredient.current_rate,
      unit: ingredient.rate_unit,
      effective_from: now,
      effective_to: null,
      created_by: userId,
      created_at: now,
    });

    this.logAudit('ingredients', id, 'CREATE_INGREDIENT', null, newIng, `Added ingredient ${newIng.name_en}`, userId);
    this.saveState();
    return newIng;
  }

  public updateIngredientRate(
    ingredientId: string,
    newRate: number,
    unit?: UnitType,
    saveToMaster: boolean = true,
    userId: string = 'usr-owner-001'
  ): Ingredient {
    const ing = (this.state.ingredients || []).find((i) => i.id === ingredientId);
    if (!ing) throw new Error('Ingredient not found');

    if (saveToMaster) {
      const now = new Date().toISOString();
      const old = { ...ing };
      const effectiveRateUnit = unit || ing.rate_unit || ing.base_unit;
      ing.current_rate = newRate;
      ing.rate_unit = effectiveRateUnit;
      ing.updated_at = now;

      // Close previous price record
      if (!this.state.ingredient_prices) this.state.ingredient_prices = [];
      const activePrice = this.state.ingredient_prices.find(
        (p) => p.ingredient_id === ingredientId && !p.effective_to
      );
      if (activePrice) {
        activePrice.effective_to = now;
      }

      this.state.ingredient_prices.push({
        id: `ip-${generateId().slice(0, 8)}`,
        ingredient_id: ingredientId,
        rate: newRate,
        unit: effectiveRateUnit,
        effective_from: now,
        effective_to: null,
        created_by: userId,
        created_at: now,
      });

      this.logAudit('ingredients', ingredientId, 'UPDATE_RATE', old, ing, `Updated rate for ${ing.name_en} to ₹${newRate}/${effectiveRateUnit}`, userId);
      this.saveState();
    }
    return ing;
  }

  public getIngredientPriceHistory(ingredientId: string): IngredientPrice[] {
    return (this.state.ingredient_prices || [])
      .filter((p) => p.ingredient_id === ingredientId)
      .sort((a, b) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime());
  }

  public getRecipes(): RecipeWithItems[] {
    const recipes = this.state.recipes || [];
    return recipes.map((r) => {
      const items = (this.state.recipe_items || [])
        .filter((it) => it.recipe_id === r.id)
        .map((it) => ({
          ...it,
          ingredient: this.getIngredientById(it.ingredient_id),
        }));
      const product = this.state.products.find((p) => p.id === r.product_id);
      return {
        ...r,
        items,
        product,
      };
    });
  }

  public getRecipeByProductId(productId: string): RecipeWithItems | undefined {
    const recipes = this.getRecipes();
    return (
      recipes.find((r) => r.product_id === productId && r.is_default) ||
      recipes.filter((r) => r.product_id === productId).sort((a, b) => b.version_number - a.version_number)[0]
    );
  }

  public getRecipeForProduct(productId: string): RecipeWithItems | undefined {
    return this.getRecipeByProductId(productId);
  }

  public getRecipeHistory(productId: string): RecipeWithItems[] {
    const all = this.getRecipes();
    return all
      .filter((r) => r.product_id === productId)
      .sort((a, b) => b.version_number - a.version_number);
  }

  public saveRecipe(
    data: {
      product_id: string;
      name?: string;
      standard_output_pieces: number;
      default_overheads: AdditionalOverheads;
      notes?: string;
      items: {
        ingredient_id: string;
        quantity: number;
        unit: UnitType;
        save_rate_to_master?: boolean;
        rate?: number;
      }[];
    },
    userId: string = 'usr-owner-001'
  ): RecipeWithItems {
    if (!this.state.recipes) this.state.recipes = [];
    if (!this.state.recipe_items) this.state.recipe_items = [];

    const existingRecipes = this.state.recipes.filter((r) => r.product_id === data.product_id);
    const latestVersion = existingRecipes.sort((a, b) => b.version_number - a.version_number)[0];
    const newVersion = (latestVersion?.version_number || 0) + 1;

    // Mark previous defaults as false
    for (const r of existingRecipes) {
      r.is_default = false;
    }

    const now = new Date().toISOString();
    const recipeId = `rec-${generateId().slice(0, 8)}`;
    const product = this.state.products.find((p) => p.id === data.product_id);

    const newRecipe: Recipe = {
      id: recipeId,
      product_id: data.product_id,
      version_number: newVersion,
      name: data.name || `${product?.name_hi || product?.name_en || 'कुल्फी'} Standard Recipe v${newVersion}`,
      standard_output_pieces: Math.max(1, data.standard_output_pieces || 100),
      default_overheads: data.default_overheads || {
        electricity: 0,
        generator_fuel: 0,
        gas: 0,
        direct_labour: 0,
        water: 0,
        packaging_extra: 0,
        transport: 0,
        other: 0,
      },
      notes: data.notes || null,
      is_default: true,
      effective_from: now,
      created_by: userId,
      created_at: now,
      updated_at: now,
    };

    this.state.recipes.push(newRecipe);

    // Save recipe items
    const insertedItems: RecipeItem[] = [];
    data.items.forEach((it, idx) => {
      const itemId = `rit-${generateId().slice(0, 8)}`;
      const rItem: RecipeItem = {
        id: itemId,
        recipe_id: recipeId,
        ingredient_id: it.ingredient_id,
        quantity: Number(it.quantity) || 0,
        unit: it.unit,
        sort_order: idx + 1,
      };
      this.state.recipe_items!.push(rItem);
      insertedItems.push(rItem);

      // Optionally update ingredient rate in master if requested, WITHOUT mutating rate_unit
      if (it.save_rate_to_master && typeof it.rate === 'number' && it.rate > 0) {
        const ing = this.getIngredientById(it.ingredient_id);
        const persistentRateUnit = ing?.rate_unit || ing?.base_unit || 'kg';
        this.updateIngredientRate(it.ingredient_id, it.rate, persistentRateUnit, true, userId);
      }
    });

    this.logAudit(
      'recipes',
      recipeId,
      'SAVE_RECIPE',
      null,
      newRecipe,
      `Saved recipe version ${newVersion} for product ${product?.name_en}`,
      userId
    );
    this.saveState();

    return {
      ...newRecipe,
      items: insertedItems.map((it) => ({
        ...it,
        ingredient: this.getIngredientById(it.ingredient_id),
      })),
      product,
    };
  }

  public createProductionCostingBatch(
    data: {
      productionDate: string;
      productId: string;
      recipeId?: string;
      producedQuantity: number;
      damagedQuantity: number;
      totalIngredientCost: number;
      overheadCosts: AdditionalOverheads;
      totalBatchCost: number;
      costPerPiece: number;
      expectedSales: number;
      estimatedGrossProfit: number;
      grossMarginPercentage: number;
      ingredients: {
        ingredient_id?: string;
        ingredient_name: string;
        quantity_used: number;
        unit: UnitType;
        converted_base_quantity: number;
        rate_snapshot: number;
        rate_unit: UnitType;
        calculated_cost: number;
        is_packaging: boolean;
      }[];
      notes?: string;
    },
    userId: string = 'usr-owner-001'
  ): ProductionBatchWithItems {
    const produced = Math.max(0, Math.round(Number(data.producedQuantity) || 0));
    const damaged = Math.max(0, Math.round(Number(data.damagedQuantity) || 0));
    if (damaged > produced) {
      throw new Error('खराब मात्रा उत्पादित मात्रा से अधिक नहीं हो सकती');
    }
    const saleable = produced - damaged;
    if (saleable <= 0) {
      throw new Error('बिक्री योग्य मात्रा (Saleable quantity) 0 से अधिक होनी चाहिए');
    }

    const batchId = `batch-${generateId().slice(0, 8)}`;
    const dateStr = data.productionDate.replace(/-/g, '');
    const seq = String(
      this.state.production_batches.filter((b) => b.production_date === data.productionDate).length + 1
    ).padStart(3, '0');
    const batchNumber = `BAT-${dateStr}-${seq}`;
    const now = new Date().toISOString();

    const product = this.state.products.find((p) => p.id === data.productId);
    const prodItemId = `pitem-${generateId().slice(0, 8)}`;

    const batchItem = {
      id: prodItemId,
      batch_id: batchId,
      product_id: data.productId,
      produced_quantity: produced,
      damaged_quantity: damaged,
      saleable_quantity: saleable,
      allocated_ingredient_cost: data.totalIngredientCost,
      unit_production_cost: data.costPerPiece,
      notes: data.notes || null,
      product,
    };

    const newBatch: ProductionBatchWithItems = {
      id: batchId,
      batch_number: batchNumber,
      production_date: data.productionDate,
      status: 'completed',
      total_ingredient_cost: data.totalIngredientCost,
      recipe_id: data.recipeId || null,
      overhead_costs: data.overheadCosts,
      total_batch_cost: data.totalBatchCost,
      cost_per_saleable_piece: data.costPerPiece,
      expected_sales: data.expectedSales,
      estimated_gross_profit: data.estimatedGrossProfit,
      gross_margin_percentage: data.grossMarginPercentage,
      notes: data.notes || null,
      completed_at: now,
      version_number: 1,
      is_current_version: true,
      correction_of_id: null,
      superseded_by_id: null,
      correction_reason: null,
      corrected_by: null,
      corrected_at: null,
      created_by: userId,
      created_at: now,
      updated_at: now,
      items: [batchItem],
    } as any;

    this.state.production_batches.push(newBatch);

    // Store ingredient snapshots
    if (!this.state.production_batch_ingredients) {
      this.state.production_batch_ingredients = [];
    }

    for (const ing of data.ingredients || []) {
      this.state.production_batch_ingredients.push({
        id: `pbi-${generateId().slice(0, 8)}`,
        batch_id: batchId,
        ingredient_id: ing.ingredient_id || null,
        ingredient_name: ing.ingredient_name,
        quantity_used: ing.quantity_used,
        unit: ing.unit,
        converted_base_quantity: ing.converted_base_quantity,
        rate_snapshot: ing.rate_snapshot,
        rate_unit: ing.rate_unit,
        calculated_cost: ing.calculated_cost,
        is_packaging: ing.is_packaging || false,
        created_at: now,
      });
    }

    // Stock Movement: Move saleable pieces to Main Freezer
    const prodLoc = this.state.stock_locations.find((l) => l.location_type === 'production')!;
    const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer')!;

    this.state.stock_movements.push({
      id: `mv-${generateId().slice(0, 8)}`,
      movement_date: now,
      product_id: data.productId,
      source_location_id: prodLoc.id,
      destination_location_id: freezerLoc.id,
      quantity: saleable,
      movement_type: 'production_completed',
      reference_table: 'production_batches',
      reference_id: batchId,
      notes: `Costing batch completed: ${batchNumber} (${saleable} pcs of ${product?.name_en || 'Kulfi'})`,
      created_by: userId,
      created_at: now,
    });

    this.logAudit(
      'production_batches',
      batchId,
      'CREATE_COSTING_BATCH',
      null,
      newBatch,
      `Completed production batch with recipe costing for ${product?.name_en} (${saleable} pcs, Cost: ₹${data.costPerPiece}/pc)`,
      userId
    );

    this.saveState();
    return newBatch;
  }


  // --- Seller Stock Issue Workflow ---
  public getSellerIssues(): SellerIssueWithDetails[] {
    return [...this.state.seller_issues]
      .filter((i) => i.is_current_version !== false)
      .sort(
        (a, b) => new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime()
      );
  }

  public issueSellerStock(
    sellerId: string,
    cartId: string | null,
    issueDate: string,
    items: { product_id: string; issued_quantity: number }[],
    notes: string,
    userId: string
  ): SellerIssueWithDetails {
    if (!items || items.length === 0) {
      throw new Error('Cannot issue empty stock. At least one product is required.');
    }

    const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer')!;
    let sellerLoc = this.state.stock_locations.find(
      (l) => l.location_type === 'seller' && l.seller_id === sellerId
    );

    if (!sellerLoc) {
      sellerLoc = {
        id: `loc-seller-${sellerId}`,
        location_type: 'seller',
        name: 'Seller Cart Stock',
        seller_id: sellerId,
        cart_id: cartId,
        is_active: true,
      };
      this.state.stock_locations.push(sellerLoc);
    }

    // Validate available freezer stock first!
    for (const it of items) {
      const available = this.getAvailableFreezerStock(it.product_id);
      if (available < it.issued_quantity) {
        const prod = this.state.products.find((p) => p.id === it.product_id);
        throw new Error(
          `Insufficient freezer stock for ${prod?.name_en || 'Product'} (Available: ${available}, Requested: ${it.issued_quantity})`
        );
      }
    }

    const issueId = `issue-${generateId().slice(0, 8)}`;
    const dateCode = issueDate.replace(/-/g, '');
    const seq = String(this.state.seller_issues.filter((i) => i.issue_date === issueDate).length + 1).padStart(3, '0');
    const issueNumber = `IS-${dateCode}-${seq}`;
    const now = new Date().toISOString();

    const seller = this.state.sellers.find((s) => s.id === sellerId);
    const cart = this.state.carts.find((c) => c.id === (cartId || seller?.default_cart_id));

    const issueItems = items.map((it) => {
      const price = this.getActivePrice(it.product_id);
      if (!price) throw new Error(`No active price configured for product ${it.product_id}`);
      const product = this.state.products.find((p) => p.id === it.product_id);

      // Create stock movement from freezer to seller
      this.state.stock_movements.push({
        id: `mv-${generateId().slice(0, 8)}`,
        movement_date: now,
        product_id: it.product_id,
        source_location_id: freezerLoc.id,
        destination_location_id: sellerLoc!.id,
        quantity: it.issued_quantity,
        movement_type: 'seller_issued',
        reference_table: 'seller_issues',
        reference_id: issueId,
        notes: `Issued to ${seller?.full_name}: ${issueNumber}`,
        created_by: userId,
        created_at: now,
      });

      return {
        id: `iitem-${generateId().slice(0, 8)}`,
        seller_issue_id: issueId,
        product_id: it.product_id,
        issued_quantity: it.issued_quantity,
        unit_selling_price_snapshot: price.selling_price,
        commission_type_snapshot: price.commission_type,
        commission_value_snapshot: price.commission_value,
        product,
      };
    });

    const newIssue: SellerIssueWithDetails = {
      id: issueId,
      issue_number: issueNumber,
      seller_id: sellerId,
      cart_id: cart?.id || null,
      issue_date: issueDate,
      status: 'issued',
      issued_at: now,
      notes: notes || null,
      version_number: 1,
      is_current_version: true,
      correction_of_id: null,
      superseded_by_id: null,
      correction_reason: null,
      corrected_by: null,
      corrected_at: null,
      created_by: userId,
      created_at: now,
      updated_at: now,
      seller,
      cart,
      items: issueItems,
      settlements: [],
    };

    this.state.seller_issues.push(newIssue);
    this.logAudit('seller_issues', issueId, 'ISSUE_STOCK', null, newIssue, `Issued stock ${issueNumber}`, userId);
    this.saveState();
    return newIssue;
  }

  public updateDraftSellerIssue(
    issueId: string,
    issueDate: string,
    sellerId: string,
    cartId: string | null,
    items: { product_id: string; issued_quantity: number }[],
    notes: string,
    userId: string
  ): SellerIssueWithDetails {
    const issue = this.state.seller_issues.find((i) => i.id === issueId);
    if (!issue) throw new Error('Stock issue not found');
    if (issue.status !== 'draft') throw new Error('Only draft stock issues can be directly edited');

    const seller = this.state.sellers.find((s) => s.id === sellerId);
    const cart = this.state.carts.find((c) => c.id === (cartId || seller?.default_cart_id));

    // Validate available freezer stock
    for (const it of items) {
      const available = this.getAvailableFreezerStock(it.product_id);
      if (available < it.issued_quantity) {
        const prod = this.state.products.find((p) => p.id === it.product_id);
        throw new Error(
          `Insufficient freezer stock for ${prod?.name_en || 'Product'} (Available: ${available}, Requested: ${it.issued_quantity})`
        );
      }
    }

    const issueItems = items.map((it) => {
      const price = this.getActivePrice(it.product_id);
      if (!price) throw new Error(`No active price configured for product ${it.product_id}`);
      const product = this.state.products.find((p) => p.id === it.product_id);

      return {
        id: `iitem-${generateId().slice(0, 8)}`,
        seller_issue_id: issueId,
        product_id: it.product_id,
        issued_quantity: it.issued_quantity,
        unit_selling_price_snapshot: price.selling_price,
        commission_type_snapshot: price.commission_type,
        commission_value_snapshot: price.commission_value,
        product,
      };
    });

    const oldIssue = { ...issue };
    issue.issue_date = issueDate;
    issue.seller_id = sellerId;
    issue.cart_id = cart?.id || null;
    issue.seller = seller;
    issue.cart = cart;
    issue.items = issueItems;
    issue.notes = notes || null;
    issue.updated_at = new Date().toISOString();

    this.logAudit('seller_issues', issueId, 'EDIT_DRAFT', oldIssue, issue, 'Draft stock issue updated', userId);
    this.saveState();
    return issue;
  }

  public cancelDraftSellerIssue(issueId: string, userId: string): void {
    const issue = this.state.seller_issues.find((i) => i.id === issueId);
    if (!issue) throw new Error('Stock issue not found');
    if (issue.status !== 'draft') throw new Error('Only draft stock issues can be cancelled');

    issue.status = 'cancelled';
    issue.updated_at = new Date().toISOString();
    this.logAudit('seller_issues', issueId, 'CANCEL_DRAFT', null, issue, 'Draft stock issue cancelled', userId);
    this.saveState();
  }

  public correctSellerIssue(
    issueId: string,
    issueDate: string,
    sellerId: string,
    cartId: string | null,
    items: { product_id: string; issued_quantity: number }[],
    notes: string,
    reason: string,
    userId: string
  ): SellerIssueWithDetails {
    const user = this.state.profiles.find((p) => p.id === userId);
    if (user && user.role !== 'owner') {
      throw new Error('Access Denied: Only Owners can correct stock issues.');
    }

    if (!reason || reason.trim().length < 5) {
      throw new Error('A valid correction reason of at least 5 characters is required.');
    }

    const oldIssue = this.state.seller_issues.find((i) => i.id === issueId);
    if (!oldIssue) throw new Error('Stock issue not found');
    if (oldIssue.is_current_version === false) {
      throw new Error('Only active, current version of stock issue can be corrected.');
    }

    // Check if issue has settlements
    const settlements = this.state.seller_settlements.filter(
      (s) => s.seller_issue_id === issueId && s.status !== 'rejected' && s.status !== 'superseded'
    );
    if (settlements.length > 0 || oldIssue.status === 'settled' || oldIssue.status === 'partially_settled') {
      throw new Error('This stock issue has a settlement. Correct or reverse the related settlement before changing this issue.');
    }

    if (oldIssue.status !== 'issued' && oldIssue.status !== 'draft') {
      throw new Error('Only active issued or draft records can be corrected.');
    }

    // Check closed business day
    const closing = this.state.daily_closings.find((c) => c.business_date === oldIssue.issue_date);
    if (closing && closing.status === 'closed') {
      throw new Error(`Business day (${oldIssue.issue_date}) is closed. Please reopen the business day first.`);
    }

    const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer')!;
    let sellerLoc = this.state.stock_locations.find(
      (l) => l.location_type === 'seller' && l.seller_id === sellerId
    );
    if (!sellerLoc) {
      sellerLoc = {
        id: `loc-seller-${sellerId}`,
        location_type: 'seller',
        name: 'Seller Cart Stock',
        seller_id: sellerId,
        cart_id: cartId,
        is_active: true,
      };
      this.state.stock_locations.push(sellerLoc);
    }

    // Validate available freezer stock for additional quantity
    for (const it of items) {
      const oldItem = oldIssue.items.find((i) => i.product_id === it.product_id);
      const oldIssued = oldItem ? oldItem.issued_quantity : 0;
      const netDiff = it.issued_quantity - oldIssued;

      if (netDiff > 0) {
        const available = this.getAvailableFreezerStock(it.product_id);
        if (available < netDiff) {
          const prod = this.state.products.find((p) => p.id === it.product_id);
          throw new Error(`Insufficient freezer stock for ${prod?.name_en || 'Product'} (Available: ${available}, Required: ${netDiff})`);
        }
      }
    }

    const now = new Date().toISOString();

    // Reverse old stock movements
    const oldMovements = this.state.stock_movements.filter(
      (m) => m.reference_table === 'seller_issues' && m.reference_id === issueId && m.movement_type === 'seller_issued'
    );

    for (const om of oldMovements) {
      this.state.stock_movements.push({
        id: `mv-${generateId().slice(0, 8)}`,
        movement_date: now,
        product_id: om.product_id,
        source_location_id: om.destination_location_id,
        destination_location_id: om.source_location_id,
        quantity: om.quantity,
        movement_type: 'issue_reversal',
        reference_table: 'seller_issues',
        reference_id: issueId,
        reversal_of_movement_id: om.id,
        notes: `Reversal for issue correction: ${reason}`,
        created_by: userId,
        created_at: now,
      });
    }

    // Create new issue (Version N+1)
    const newVersion = (oldIssue.version_number || 1) + 1;
    const newIssueId = `issue-${generateId().slice(0, 8)}`;
    const baseIssueNumber = oldIssue.issue_number.replace(/-V\d+$/, '');
    const newIssueNumber = `${baseIssueNumber}-V${newVersion}`;

    const seller = this.state.sellers.find((s) => s.id === sellerId);
    const cart = this.state.carts.find((c) => c.id === (cartId || seller?.default_cart_id));

    const newIssueItems = items.map((it) => {
      const price = this.getActivePrice(it.product_id);
      if (!price) throw new Error(`No active price configured for product ${it.product_id}`);
      const product = this.state.products.find((p) => p.id === it.product_id);

      if (it.issued_quantity > 0) {
        this.state.stock_movements.push({
          id: `mv-${generateId().slice(0, 8)}`,
          movement_date: now,
          product_id: it.product_id,
          source_location_id: freezerLoc.id,
          destination_location_id: sellerLoc!.id,
          quantity: it.issued_quantity,
          movement_type: 'seller_issued',
          reference_table: 'seller_issues',
          reference_id: newIssueId,
          notes: `Corrected stock issue: ${newIssueNumber}`,
          created_by: userId,
          created_at: now,
        });
      }

      return {
        id: `iitem-${generateId().slice(0, 8)}`,
        seller_issue_id: newIssueId,
        product_id: it.product_id,
        issued_quantity: it.issued_quantity,
        unit_selling_price_snapshot: price.selling_price,
        commission_type_snapshot: price.commission_type,
        commission_value_snapshot: price.commission_value,
        product,
      };
    });

    const newIssue: SellerIssueWithDetails = {
      id: newIssueId,
      issue_number: newIssueNumber,
      seller_id: sellerId,
      cart_id: cart?.id || null,
      issue_date: issueDate,
      status: 'issued',
      issued_at: now,
      notes: notes || null,
      version_number: newVersion,
      is_current_version: true,
      correction_of_id: oldIssue.id,
      superseded_by_id: null,
      correction_reason: reason,
      corrected_by: userId,
      corrected_at: now,
      created_by: oldIssue.created_by,
      created_at: oldIssue.created_at,
      updated_at: now,
      seller,
      cart,
      items: newIssueItems,
      settlements: [],
    };

    // Supersede old issue
    oldIssue.status = 'superseded';
    oldIssue.is_current_version = false;
    oldIssue.superseded_by_id = newIssueId;
    oldIssue.updated_at = now;

    this.state.seller_issues.push(newIssue);
    this.logAudit('seller_issues', newIssueId, 'CORRECT_RECORD', oldIssue, newIssue, reason, userId);
    this.saveState();
    return newIssue;
  }

  public getIssueRevisionHistory(issueId: string): RevisionRecord[] {
    const allIssues = this.state.seller_issues;
    const target = allIssues.find((i) => i.id === issueId);
    if (!target) return [];

    let root = target;
    while (root.correction_of_id) {
      const parent = allIssues.find((i) => i.id === root.correction_of_id);
      if (!parent) break;
      root = parent;
    }

    const chain: SellerIssueWithDetails[] = [];
    let curr: SellerIssueWithDetails | undefined = root;
    while (curr) {
      chain.push(curr);
      if (!curr.superseded_by_id) break;
      curr = allIssues.find((i) => i.id === curr!.superseded_by_id);
    }

    const profiles = this.state.profiles;

    return chain.map((i) => {
      const user = profiles.find((p) => p.id === (i.corrected_by || i.created_by));
      const totalIssued = i.items.reduce((s, it) => s + it.issued_quantity, 0);

      return {
        id: i.id,
        version_number: i.version_number || 1,
        status: i.status,
        date: i.issue_date,
        created_at: i.created_at,
        corrected_at: i.corrected_at,
        corrected_by_name: user?.full_name || 'Owner',
        correction_reason: i.correction_reason,
        is_current_version: i.is_current_version !== false,
        correction_of_id: i.correction_of_id,
        superseded_by_id: i.superseded_by_id,
        summary_text: `Version ${i.version_number || 1} (${i.status}): ${totalIssued} pcs issued to ${i.seller?.full_name || 'Seller'}`,
        details: i,
        stock_effect: {
          issued: totalIssued,
        },
      };
    });
  }

  public deleteSellerIssue(
    issueId: string,
    reason: string = 'Deleted by Owner',
    userId: string = 'usr-owner-001'
  ): { success: boolean; message: string } {
    const user = this.state.profiles.find((p) => p.id === userId);
    if (user && user.role !== 'owner') {
      throw new Error('Access Denied: Only Owners are authorized to delete stock issues.');
    }

    const issue = this.state.seller_issues.find((i) => i.id === issueId);
    if (!issue) throw new Error('Stock issue not found');

    // Resolve the active issue in the correction chain if this is superseded or has corrections
    let activeIssue = issue;
    while (activeIssue.superseded_by_id) {
      const next = this.state.seller_issues.find((i) => i.id === activeIssue.superseded_by_id);
      if (!next) break;
      activeIssue = next;
    }

    // Collect all issue IDs in this version chain
    const chainIds = new Set<string>([issue.id, activeIssue.id]);
    this.state.seller_issues.forEach((si) => {
      if (
        si.correction_of_id === issue.id ||
        si.correction_of_id === activeIssue.id ||
        si.superseded_by_id === issue.id ||
        si.superseded_by_id === activeIssue.id
      ) {
        chainIds.add(si.id);
      }
    });

    // Check if settlement exists for any issue in chain
    const linkedSettlement = this.state.seller_settlements.find(
      (s) => chainIds.has(s.seller_issue_id) && s.status !== 'superseded' && (s.status as any) !== 'rejected' && (s.status as any) !== 'cancelled'
    );
    if (linkedSettlement) {
      throw new Error('इस स्टॉक निकासी को नहीं हटाया जा सकता क्योंकि इसके विरुद्ध हिसाब (Settlement) दर्ज है। पहले संबंधित हिसाब को हटाएं।');
    }

    if (activeIssue.status === 'issued') {
      const closing = this.state.daily_closings.find((c) => c.business_date === activeIssue.issue_date);
      if (closing && closing.status === 'closed') {
        throw new Error(`Business day (${activeIssue.issue_date}) is closed. Reopen the business day before deleting this record.`);
      }

      const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer')!;
      let sellerLoc = this.state.stock_locations.find(
        (l) => l.location_type === 'seller' && l.seller_id === activeIssue.seller_id
      );
      if (!sellerLoc) {
        sellerLoc = {
          id: `loc-seller-${activeIssue.seller_id}`,
          location_type: 'seller',
          name: 'Seller Cart Stock',
          seller_id: activeIssue.seller_id,
          cart_id: activeIssue.cart_id || null,
          is_active: true,
        };
        this.state.stock_locations.push(sellerLoc);
      }

      const now = new Date().toISOString();

      for (const it of activeIssue.items) {
        if (it.issued_quantity > 0) {
          this.state.stock_movements.push({
            id: `mv-${generateId().slice(0, 8)}`,
            movement_date: now,
            product_id: it.product_id,
            source_location_id: sellerLoc.id,
            destination_location_id: freezerLoc.id,
            quantity: it.issued_quantity,
            movement_type: 'issue_reversal',
            reference_table: 'seller_issues',
            reference_id: activeIssue.id,
            notes: `Stock reversal for deleted issue ${activeIssue.issue_number}: ${reason}`,
            created_by: userId,
            created_at: now,
          });
        }
      }
    }

    // Clean up all superseded settlements linked to this chain
    this.state.seller_settlements = this.state.seller_settlements.filter((s) => !chainIds.has(s.seller_issue_id));

    // Remove all versions in the chain
    this.state.seller_issues = this.state.seller_issues.filter((i) => !chainIds.has(i.id));
    this.logAudit('seller_issues', activeIssue.id, 'DELETE_ISSUE', activeIssue, null, reason, userId);
    this.saveState();
    return { success: true, message: 'Stock issue deleted successfully' };
  }

  // --- Seller Settlement Workflow ---
  public getSettlements(): SellerSettlementWithDetails[] {
    return [...this.state.seller_settlements]
      .filter((s) => s.is_current_version !== false)
      .sort(
        (a, b) => new Date(b.settlement_date).getTime() - new Date(a.settlement_date).getTime()
      );
  }

  public processSellerSettlement(
    issueId: string,
    settlementDate: string,
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
    isApprovedByOwner: boolean,
    userId: string
  ): SellerSettlementWithDetails {
    const issue = this.state.seller_issues.find((i) => i.id === issueId);
    if (!issue) throw new Error('Stock issue not found');
    if (issue.status === 'settled') throw new Error('This stock issue is already fully settled');

    const calculationItems = items.map((it) => {
      const issueItem = issue.items.find((ii) => ii.id === it.issue_item_id);
      if (!issueItem) throw new Error(`Issue item ${it.issue_item_id} not found`);

      if (it.damaged_quantity > 0 && (!it.damage_reason || it.damage_reason.trim() === '')) {
        throw new Error('Damage reason is required when damaged quantity is greater than 0');
      }
      if (it.complimentary_quantity > 0 && (!it.complimentary_reason || it.complimentary_reason.trim() === '')) {
        throw new Error('Complimentary reason is required when complimentary quantity is greater than 0');
      }

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

    const settlementId = `st-${generateId().slice(0, 8)}`;
    const dateCode = settlementDate.replace(/-/g, '');
    const seq = String(this.state.seller_settlements.filter((s) => s.settlement_date === settlementDate).length + 1).padStart(3, '0');
    const settlementNumber = `ST-${dateCode}-${seq}`;
    const now = new Date().toISOString();

    const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer')!;
    const sellerLoc = this.state.stock_locations.find(
      (l) => l.location_type === 'seller' && l.seller_id === issue.seller_id
    )!;
    const damagedLoc = this.state.stock_locations.find((l) => l.location_type === 'damaged')!;
    const compLoc = this.state.stock_locations.find((l) => l.location_type === 'complimentary')!;

    const settlementItems = items.map((it, idx) => {
      const issueItem = issue.items.find((ii) => ii.id === it.issue_item_id)!;
      const cItem = calculationItems[idx];
      const sold = cItem.issued_quantity - (cItem.returned_quantity + cItem.damaged_quantity + cItem.complimentary_quantity);
      const gross = sold * issueItem.unit_selling_price_snapshot;
      const comm =
        issueItem.commission_type_snapshot === 'percentage'
          ? Number(((gross * issueItem.commission_value_snapshot) / 100).toFixed(2))
          : sold * issueItem.commission_value_snapshot;

      if (isApprovedByOwner) {
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
            reference_id: settlementId,
            notes: `Returned to freezer: ${settlementNumber}`,
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
            reference_id: settlementId,
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
            reference_id: settlementId,
            notes: `Complimentary: ${it.complimentary_reason || ''}`,
            created_by: userId,
            created_at: now,
          });
        }
      }

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

    const status = isApprovedByOwner ? 'approved' : 'pending_approval';

    const settlement: SellerSettlementWithDetails = {
      id: settlementId,
      settlement_number: settlementNumber,
      seller_issue_id: issueId,
      seller_id: issue.seller_id,
      settlement_date: settlementDate,
      status,
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
      submitted_by: userId,
      approved_by: isApprovedByOwner ? userId : null,
      submitted_at: now,
      approved_at: isApprovedByOwner ? now : null,
      version_number: 1,
      is_current_version: true,
      correction_of_id: null,
      superseded_by_id: null,
      correction_reason: null,
      corrected_by: null,
      corrected_at: null,
      created_at: now,
      updated_at: now,
      seller: issue.seller,
      issue,
      items: settlementItems,
    };

    this.state.seller_settlements.push(settlement);
    issue.status = isApprovedByOwner ? 'settled' : 'partially_settled';
    issue.settlements = issue.settlements || [];
    issue.settlements.push(settlement);

    this.logAudit(
      'seller_settlements',
      settlementId,
      isApprovedByOwner ? 'APPROVE_SETTLEMENT' : 'SUBMIT_SETTLEMENT',
      null,
      settlement,
      `Settlement ${settlementNumber} (${status})`,
      userId
    );
    this.saveState();
    return settlement;
  }

  public approvePendingSettlement(settlementId: string, userId: string): SellerSettlementWithDetails {
    const settlement = this.state.seller_settlements.find((s) => s.id === settlementId);
    if (!settlement) throw new Error('Settlement not found');
    if (settlement.status === 'approved') throw new Error('Settlement is already approved');

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
    expense: Omit<Expense, 'id' | 'status' | 'void_reason' | 'created_at' | 'updated_at' | 'created_by'>,
    userId: string
  ): Expense {
    const id = `exp-${generateId().slice(0, 8)}`;
    const now = new Date().toISOString();
    const newExpense: Expense = {
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
}

export const mockStore = new MockStore();
