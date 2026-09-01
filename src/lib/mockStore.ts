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
}

const DEFAULT_STATE: LocalStoreState = {
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
    return [...this.state.production_batches].sort(
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
    if (batch.status === 'completed') throw new Error('Batch is already completed');
    if (batch.status === 'cancelled') throw new Error('Cannot complete a cancelled batch');

    const now = new Date().toISOString();
    const prodLoc = this.state.stock_locations.find((l) => l.location_type === 'production')!;
    const freezerLoc = this.state.stock_locations.find((l) => l.location_type === 'main_freezer')!;
    const damagedLoc = this.state.stock_locations.find((l) => l.location_type === 'damaged')!;

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

  // --- Seller Stock Issue Workflow ---
  public getSellerIssues(): SellerIssueWithDetails[] {
    return [...this.state.seller_issues].sort(
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

  // --- Seller Settlement Workflow ---
  public getSettlements(): SellerSettlementWithDetails[] {
    return [...this.state.seller_settlements].sort(
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
}

export const mockStore = new MockStore();
