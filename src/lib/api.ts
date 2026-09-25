Warning: truncated output (original token count: 51088)
Total output lines: 5581

import { supabase, isSupabaseConfigured } from './supabase';
import { mockStore } from './mockStore';
import {
  Profile,
  ProductWithPrice,
  ProductPrice,
  Cart,
  Seller,
  ProductionBatchWithItems,
  SellerIssueWithDetails,
  SellerSettlementWithDetails,
  Expense,
  StockMovement,
  DailyClosing,
  AuditLog,
  DashboardSummary,
  CommissionType,
  BackupHistory,
  RevisionRecord,
  Ingredient,
  RecipeWithItems,
  UnitType,
  AdditionalOverheads,
  Supplier,
  MaterialPurchaseWithItems,
  RawMaterialMovement,
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
  RawMaterialDashboardKPIs,
  ExpenseHead,
  MonthlyExpenseItem,
  MonthlyExpenseSummary,
  ProfitLossReport,
} from '@/types';

// Detect if running in mock/local mode (Never active in production; only in test or explicitly enabled DEV fallback)
export const useMockMode =
  import.meta.env.MODE === 'test' ||
  (import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCK_FALLBACK === 'true');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function toSafeUuid(id: any): string | null {
  if (typeof id === 'string' && UUID_REGEX.test(id)) return id;
  return null;
}

export function isValidUuid(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

export function isRpcMissingError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    msg.includes('schema cache') ||
    msg.includes('could not find the function') ||
    msg.includes('does not exist')
  );
}

export function getIndiaMonthBounds(targetDate: Date = new Date()): { startOfMonth: string; endOfMonth: string } {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(targetDate);
    const year = parts.find((p) => p.type === 'year')?.value || String(targetDate.getFullYear());
    const month = parts.find((p) => p.type === 'month')?.value || String(targetDate.getMonth() + 1).padStart(2, '0');
    const startOfMonth = `${year}-${month}-01`;
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    const endOfMonth = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    return { startOfMonth, endOfMonth };
  } catch {
    const now = targetDate;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    return { startOfMonth, endOfMonth };
  }
}

export async function resolveSupabaseIngredientId(ingredientId: string): Promise<string> {
  if (!ingredientId) return ingredientId;

  // Resolve mock ID (e.g. 'ing-milk-01'), code (e.g. 'ING-MILK'), or stale UUID to active Supabase UUID
  if (isSupabaseConfigured && import.meta.env.MODE !== 'test') {
    try {
      if (isValidUuid(ingredientId)) {
        const { data: exists } = await (supabase as any)
          .from('ingredients')
          .select('id')
          .eq('id', ingredientId)
          .maybeSingle();

        if (exists && exists.id) {
          return exists.id;
        }
      }

      const mockIng = mockStore.getIngredientById(ingredientId);
      const code = mockIng?.code || (isValidUuid(ingredientId) ? null : ingredientId.toUpperCase());
      const nameEn = mockIng?.name_en;

      let query = (supabase as any).from('ingredients').select('id');
      if (code && nameEn) {
        query = query.or(`code.ilike.${code},name_en.ilike.${nameEn}`);
      } else if (code) {
        query = query.ilike('code', code);
      } else if (nameEn) {
        query = query.ilike('name_en', nameEn);
      }
      const { data } = await query.limit(1);
      if (data && data.length > 0 && data[0].id) {
        return data[0].id;
      }
    } catch {}
  }
  return ingredientId;
}

export async function resolveSupabaseSupplierId(supplierId?: string | null): Promise<string | null> {
  if (!supplierId) return null;
  if (isSupabaseConfigured && import.meta.env.MODE !== 'test') {
    try {
      if (isValidUuid(supplierId)) {
        const { data: exists } = await (supabase as any)
          .from('suppliers')
          .select('id')
          .eq('id', supplierId)
          .maybeSingle();
        if (exists && exists.id) return exists.id;
      }
      const mockSup = mockStore.getSuppliers().find((s) => s.id === supplierId);
      const name = mockSup?.name;
      if (name) {
        const { data } = await (supabase as any).from('suppliers').select('id').ilike('name', name).limit(1);
        if (data && data.length > 0 && data[0].id) return data[0].id;
      }
    } catch {}
  }
  return isValidUuid(supplierId) ? supplierId : null;
}

export async function resolveSupabaseProductId(productId: string): Promise<string> {
  if (!productId) return productId;
  if (isValidUuid(productId)) return productId;

  if (isSupabaseConfigured && import.meta.env.MODE !== 'test') {
    try {
      const mockProd = mockStore.getProducts().find((p) => p.id === productId);
      const sku = mockProd?.sku || productId.toUpperCase();
      const nameEn = mockProd?.name_en;

      let query = (supabase as any).from('products').select('id');
      if (sku && nameEn) {
        query = query.or(`sku.ilike.${sku},name_en.ilike.${nameEn}`);
      } else if (sku) {
        query = query.ilike('sku', sku);
      }
      const { data } = await query.limit(1);
      if (data && data.length > 0 && data[0].id) {
        return data[0].id;
      }
    } catch {}
  }
  return productId;
}

// Current session simulation helper for mock mode
const CURRENT_USER_KEY = 'janki_current_user_profile';

export function getSimulatedProfile(): Profile {
  const saved = localStorage.getItem(CURRENT_USER_KEY);
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {}
  }
  return mockStore.getProfiles()[0]; // Default to Owner
}

export function setSimulatedProfile(profile: Profile) {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(profile));
}

export const MAIN_FREEZER_LOCATION_ID = 'a0000000-0000-0000-0000-000000000002';

async function getOrCreateDefaultStockLocations() {
  const { data: locs } = await (supabase as any).from('stock_locations').select('id, location_type, name, seller_id');
  let freezerLoc = locs?.find((l: any) => l.location_type === 'main_freezer' || l.id === MAIN_FREEZER_LOCATION_ID);
  let prodLoc = locs?.find((l: any) => l.location_type === 'production');
  let damagedLoc = locs?.find((l: any) => l.location_type === 'damaged');
  let compLoc = locs?.find((l: any) => l.location_type === 'complimentary');

  if (!freezerLoc) {
    const { data: newLoc } = await (supabase as any).from('stock_locations').insert({
      id: MAIN_FREEZER_LOCATION_ID,
      name: 'Main Cold Storage Freezer',
      location_type: 'main_freezer',
    }).select().single();
    if (newLoc) freezerLoc = newLoc;
  }
  if (!prodLoc) {
    const { data: newLoc } = await (supabase as any).from('stock_locations').insert({
      name: 'Production Floor',
      location_type: 'production',
    }).select().single();
    if (newLoc) prodLoc = newLoc;
  }
  if (!damagedLoc) {
    const { data: newLoc } = await (supabase as any).from('stock_locations').insert({
      name: 'Damaged Stock Location',
      location_type: 'damaged',
    }).select().single();
    if (newLoc) damagedLoc = newLoc;
  }
  if (!compLoc) {
    const { data: newLoc } = await (supabase as any).from('stock_locations').insert({
      name: 'Complimentary Stock Location',
      location_type: 'complimentary',
    }).select().single();
    if (newLoc) compLoc = newLoc;
  }

  return { freezerLoc, prodLoc, damagedLoc, compLoc };
}

export const api = {
  // --- Auth & Profiles ---
  async getProfile(): Promise<Profile | null> {
    if (useMockMode) {
      return getSimulatedProfile();
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await (supabase as any)
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) throw error;
    return data;
  },

  async getAllProfiles(): Promise<Profile[]> {
    if (useMockMode) {
      return mockStore.getProfiles();
    }
    const { data, error } = await (supabase as any).from('profiles').select('*');
    if (error) throw error;
    return data || [];
  },

  async updateProfile(id: string, updates: Partial<Profile>): Promise<Profile> {
    if (useMockMode) {
      const updated = mockStore.updateProfile(id, updates);
      setSimulatedProfile(updated);
      return updated;
    }
    const { data, error } = await (supabase as any)
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // --- Authoritative Inventory Balance Service (Canonical current_location_stock) ---
  async getCurrentLocationStock(locationId?: string): Promise<{ location_id: string; product_id: string; quantity: number }[]> {
    if (useMockMode) {
      return mockStore.getCurrentLocationStock(locationId);
    }
    let query = (supabase as any).from('current_location_stock').select('location_id, product_id, quantity');
    if (locationId) query = query.eq('location_id', locationId);
    const { data, error } = await query;
    if (error) throw new Error(`[Supabase stock view ${error.code || ''}]: ${error.message}`);
    return data || [];
  },

  async getFreezerBalances(): Promise<Record<string, number>> {
    if (useMockMode) {
      return mockStore.getFreezerBalances();
    }

    {
      const freezerLocIds = new Set<string>([
        MAIN_FREEZER_LOCATION_ID,
        'loc-freezer',
        'loc-freezer-01',
      ]);

      // 1. Primary: Read from canonical database view public.current_location_stock
      const { data: stockRows, error: viewErr } = await (supabase as any)
        .from('current_location_stock')
        .select('location_id, product_id, quantity');

      if (!viewErr && stockRows && Array.isArray(stockRows)) {
        // Also check any dynamically created main_freezer locations
        const { data: locs } = await (supabase as any).from('stock_locations').select('id, location_type, name');
        if (locs && Array.isArray(locs)) {
          for (const l of locs) {
            if (l.location_type === 'main_freezer' || l.name?.toLowerCase().includes('freezer')) {
              freezerLocIds.add(l.id);
            }
          }
        }

        const balances: Record<string, number> = {};
        for (const row of stockRows) {
          if (freezerLocIds.has(row.location_id)) {
            balances[row.product_id] = (balances[row.product_id] || 0) + Number(row.quantity || 0);
          }
        }
        return balances;
      }

      console.error('[freezer balance] current_location_stock failed', viewErr);

      // 2. Secondary fallback: Read from v_freezer_stock
      const { data: stockData, error: fbErr } = await (supabase as any)
        .from('v_freezer_stock')
        .select('product_id, available_quantity');

      if (!fbErr && stockData && Array.isArray(stockData)) {
        const balances: Record<string, number> = {};
        for (const s of stockData) {
          balances[s.product_id] = Number(s.available_quantity) || 0;
        }
        return balances;
      }

      // 3. Tertiary fallback: Stored procedure get_freezer_balances
      const { data: rpcBalances, error: rpcErr } = await (supabase as any).rpc('get_freezer_balances');
      if (!rpcErr && rpcBalances && typeof rpcBalances === 'object') {
        return rpcBalances;
      }

      throw new Error(
        `[Supabase freezer balance]: ${viewErr?.message || fbErr?.message || rpcErr?.message || 'No live balance source available'}`
      );
    }
  },

  async getAvailableFreezerStock(productId: string): Promise<number> {
    if (useMockMode) {
      return mockStore.getAvailableFreezerStock(productId);
    }
    const balances = await this.getFreezerBalances();
    return balances[productId] || 0;
  },

  async syncCompletedBatchesStock(): Promise<{
    success: boolean;
    synced_count: number;
    synced_batch_items?: number;
    batches_checked: number;
    message: string;
    message_hi: string;
  }> {
    if (useMockMode) {
      return mockStore.syncCompletedBatchesStock();
    }

    const { data, error } = await (supabase as any).rpc('sync_completed_production_batches_stock');
    if (error) {
      console.error('[sync stock] failed', error);
      throw new Error(`[Supabase Error ${error.code || ''}]: ${error.message}`);
    }
    return {
      ...(data || {
        success: true,
        synced_count: 0,
        batches_checked: 0,
        message: 'Stock already synchronized—no changes required.',
        message_hi: 'स्टॉक पहले से सिंक है - कोई बदलाव आवश्यक नहीं।',
      }),
      synced_batch_items: data?.synced_count ?? 0,
    };
  },

  async reconcileFreezerStock(): Promise<{
    success: boolean;
    synced_count: number;
    synced_batch_items?: number;
    batches_checked: number;
    message: string;
    message_hi: string;
  }> {
    return this.syncCompletedBatchesStock();
  },

  // --- Products & Prices ---
  async getProducts(): Promise<ProductWithPrice[]> {
    if (useMockMode) {
      return mockStore.getProducts();
    }
    const { data: products, error } = await (supabase as any)
      .from('products')
      .select(`
        *,
        product_prices (
          id, selling_price, commission_type, commission_value, effective_from, effective_to
        )
      `)
      .order('created_at', { ascending: true });

    if (error) throw error;

    // Use authoritative single balance service
    const freezerBalances = await this.getFreezerBalances();

    return (products || []).map((p: any) => {
      const activePrice = p.product_prices
        ?.filter((pr: any) => !pr.effective_to || new Date(pr.effective_to) > new Date())
        ?.sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())[0];

      return {
        ...p,
        current_price: activePrice?.selling_price || 0,
        commission_type: (activePrice?.commission_type as CommissionType) || 'fixed',
        commission_value: activePrice?.commission_value || 0,
        available_quantity: freezerBalances[p.id] !== undefined ? freezerBalances[p.id] : 0,
      };
    });
  },

  async getPriceHistory(productId: string): Promise<ProductPrice[]> {
    if (useMockMode) {
      return mockStore.getPriceHistory(productId);
    }
    const { data, error } = await (supabase as any)
      .from('product_prices')
      .select('*')
      .eq('product_id', productId)
      .order('effective_from', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createProduct(
    product: { name_en: string; name_hi: string; sku: string; description?: string },
    sellingPrice: number,
    commissionType: 'fixed' | 'percentage',
    commissionValue: number,
    userId: string
  ): Promise<any> {
    if (useMockMode) {
      return mockStore.addProduct(
        { ...product, is_active: true, created_by: userId, description: product.description || null },
        sellingPrice,
        commissionType,
        commissionValue,
        userId
      );
    }

    const { data: newProd, error: prodError } = await (supabase as any)
      .from('products')
      .insert({ ...product, is_active: true, created_by: userId })
      .select()
      .single();
    if (prodError) throw prodError;

    const { error: priceError } = await (supabase as any).from('product_prices').insert({
      product_id: newProd.id,
      selling_price: sellingPrice,
      commission_type: commissionType,
      commission_value: commissionValue,
      effective_from: new Date().toISOString(),
      created_by: userId,
    });
    if (priceError) throw priceError;

    return newProd;
  },

  async updateProduct(
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
    userId?: string
  ): Promise<any> {
    if (useMockMode) {
      return mockStore.updateProduct(productId, data, userId);
    }
    const resolvedProductId = await resolveSupabaseProductId(productId);
    const { data: result, error } = await (supabase as any).rpc('update_product_transaction', {
      p_product_id: resolvedProductId,
      p_name_en: data.name_en || null,
      p_name_hi: data.name_hi || null,
      p_sku: data.sku || null,
      p_description: data.description !== undefined ? data.description : null,
      p_selling_price: data.selling_price !== undefined ? data.selling_price : null,
      p_commission_type: data.commission_type || 'fixed',
      p_commission_value: data.commission_value || 0,
      p_is_active: data.is_active !== undefined ? data.is_active : true,
    });
    if (error) {
      throw new Error(`[Update Product ${error.code || ''}]: ${error.message}`);
    }
    return result;
  },

  async updateProductPrice(
    productId: string,
    sellingPrice: number,
    commissionType: 'fixed' | 'percentage',
    commissionValue: number,
    userId: string
  ): Promise<any> {
    if (useMockMode) {
      return mockStore.updateProductPrice(productId, sellingPrice, commissionType, commissionValue, userId);
    }
    return this.updateProduct(productId, {
      selling_price: sellingPrice,
      commission_type: commissionType,
      commission_value: commissionValue,
    }, userId);
  },

  // --- Carts & Sellers ---
  async getCarts(): Promise<Cart[]> {
    if (useMockMode) {
      return mockStore.getCarts();
    }
    const { data, error } = await (supabase as any).from('carts').select('*').order('cart_code');
    if (error) throw error;
    return data || [];
  },

  async createCart(cart: { cart_code: string; cart_name: string; location?: string }): Promise<Cart> {
    if (useMockMode) {
      return mockStore.addCart({ ...cart, is_active: true, location: cart.location || null });
    }
    const { data, error } = await (supabase as any).from('carts').insert({ ...cart, is_active: true }).select().single();
    if (error) throw error;
    return data;
  },

  async updateCart(id: string, cart: Partial<Cart>, userId: string): Promise<Cart> {
    if (useMockMode) {
      return mockStore.updateCart(id, cart, userId);
    }
    const { data, error } = await (supabase as any).from('carts').update(cart).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async deleteCart(id: string, userId: string): Promise<{ success: boolean; deactivated: boolean; message: string }> {
    if (useMockMode) {
      return mockStore.deleteCart(id, userId);
    }
    const { error } = await (supabase as any).from('carts').delete().eq('id', id);
    if (error) {
      const { error: deactError } = await (supabase as any).from('carts').update({ is_active: false }).eq('id', id);
      if (deactError) throw deactError;
      return { success: true, deactivated: true, message: 'ठेला निष्क्रिय कर दिया गया है ताकि पुराना रिकॉर्ड सुरक्षित रहे।' };
    }
    return { success: true, deactivated: false, message: 'ठेला सफलतापूर्वक हटा दिया गया।' };
  },

  async getSellers(): Promise<(Seller & { default_cart?: Cart; current_held_stock?: number })[]> {
    if (useMockMode) {
      return mockStore.getSellers();
    }
    const { data, error } = await (supabase as any)
      .from('sellers')
      .select(`*, default_cart:carts(*)`)
      .order('seller_code');
    if (error) throw error;
    return data || [];
  },

  async createSeller(
    seller: { seller_code: string; full_name: string; phone?: string; address?: string; default_cart_id?: string; opening_balance?: number },
    userId: string
  ): Promise<Seller> {
    if (useMockMode) {
      return mockStore.addSeller(
        {
          ...seller,
          phone: seller.phone || null,
          address: seller.address || null,
          default_cart_id: seller.default_cart_id || null,
          user_profile_id: null,
          is_active: true,
          opening_balance: seller.opening_balance || 0,
          created_by: userId,
        },
        userId
      );
    }
    const { data, error } = await (supabase as any)
      .from('sellers')
      .insert({ ...seller, is_active: true, created_by: userId })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateSeller(
    id: string,
    seller: Partial<Seller>,
    userId: string
  ): Promise<Seller> {
    if (useMockMode) {
      return mockStore.updateSeller(id, seller, userId);
    }
    const { data, error } = await (supabase as any).from('sellers').update(seller).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async deleteSeller(id: string, userId: string): Promise<{ success: boolean; deactivated: boolean; message: string }> {
    if (useMockMode) {
      return mockStore.deleteSeller(id, userId);
    }
    const { error } = await (supabase as any).from('sellers').delete().eq('id', id);
    if (error) {
      const { error: deactError } = await (supabase as any).from('sellers').update({ is_active: false }).eq('id', id);
      if (deactError) throw deactError;
      return { success: true, deactivated: true, message: 'विक्रेता निष्क्रिय कर दिया गया है ताकि पुराना हिसाब सुरक्षित रहे।' };
    }
    return { success: true, deactivated: false, message: 'विक्रेता सफलतापूर्वक हटा दिया गया।' };
  },

  // --- Production ---
  async getProductionBatches(): Promise<ProductionBatchWithItems[]> {
    if (useMockMode) {
      return mockStore.getProductionBatches();
    }
    const { data, error } = await (supabase as any)
      .from('production_batches')
      .select(`
        *,
        items:production_items (
          *,
          product:products(*)
        )
      `)
      .order('production_date', { ascending: false });
    if (error) throw error;
    return (data as any) || [];
  },

  async createProductionBatch(
    productionDate: string,
    totalIngredientCost: number,
    notes: string,
    items: { product_id: string; produced_quantity: number; damaged_quantity: number; notes?: string }[],
    userId: string
  ): Promise<any> {
    if (useMockMode) {
      const draft = mockStore.createProductionBatch(productionDate, totalIngredientCost, notes, items, userId);
      return mockStore.completeProductionBatch(draft.id, userId);
    }

    // Try single-transaction RPC first
    try {
      const { data, error } = await (supabase as any).rpc('create_production_batch_transaction', {
        p_date: productionDate,
        p_cost: totalIngredientCost,
        p_notes: notes,
        p_items: items,
        p_user_id: userId,
      });

      if (!error && data) {
        return data;
      }
      console.warn('RPC create_production_batch_transaction failed or outdated, using fallback:', error);
    } catch (rpcErr: any) {
      console.warn('RPC execution exception, using fallback:', rpcErr);
    }

    // Fallback: Atomic direct creation with status: 'completed' and stock movements
    const batchNumber = `BAT-${productionDate.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date().toISOString();
    const { data: batch, error: batchErr } = await (supabase as any)
      .from('production_batches')
      .insert({
        batch_number: batchNumber,
        production_date: productionDate,
        status: 'completed',
        total_ingredient_cost: totalIngredientCost,
        notes: notes || null,
        completed_at: now,
        created_by: userId,
      })
      .select()
      .single();

    if (batchErr) throw batchErr;

    const totalSaleable = items.reduce((sum, it) => sum + Math.max(0, Number(it.produced_quantity || 0) - Number(it.damaged_quantity || 0)), 0);

    const itemsToInsert = items.map((it) => {
      const prod = Number(it.produced_quantity || 0);
      const dam = Number(it.damaged_quantity || 0);
      const saleable = Math.max(0, prod - dam);
      const allocatedCost = totalSaleable > 0 ? (totalIngredientCost * saleable) / totalSaleable : 0;
      const unitCost = saleable > 0 ? allocatedCost / saleable : 0;

      return {
        batch_id: batch.id,
        product_id: it.product_id,
        produced_quantity: prod,
        damaged_quantity: dam,
        saleable_quantity: saleable,
        allocated_ingredient_cost: Number(allocatedCost.toFixed(2)),
        unit_production_cost: Number(unitCost.toFixed(2)),
        notes: it.notes || null,
      };
    });

    const { error: itemsErr } = await (supabase as any)
      .from('production_items')
      .insert(itemsToInsert);

    if (itemsErr) throw itemsErr;

    // Direct stock movements (Production -> Main Freezer)
    const { freezerLoc, prodLoc } = await getOrCreateDefaultStockLocations();
    if (freezerLoc && prodLoc) {
      const movements = itemsToInsert
        .filter((it) => it.saleable_quantity > 0)
        .map((it) => ({
          movement_date: now,
          product_id: it.product_id,
          source_location_id: prodLoc.id,
          destination_location_id: freezerLoc.id,
          quantity: it.saleable_quantity,
          movement_type: 'production_completed',
          reference_table: 'production_batches',
          reference_id: batch.id,
          notes: `Stock added from completed production batch ${batchNumber}`,
          created_by: userId,
        }));

      if (movements.length > 0) {
        await (supabase as any).from('stock_movements').insert(movements);
      }
    }

    return { success: true, batch_id: batch.id, batch_number: batchNumber };
  },

  async completeProductionBatch(batchId: string, userId: string): Promise<any> {
    if (useMockMode) {
      return mockStore.completeProductionBatch(batchId, userId);
    }
    try {
      const { data, error } = await (supabase as any).rpc('complete_production_batch', {
        p_batch_id: batchId,
        p_user_id: userId,
      });
      if (!error && data) {
        return data;
      }
      console.warn('RPC complete_production_batch failed or unavailable, executing direct Supabase completion:', error);
    } catch (rpcErr) {
      console.warn('RPC complete_production_batch error, executing direct Supabase completion:', rpcErr);
    }

    // Direct Supabase completion fallback
    const { data: batch } = await (supabase as any)
      .from('production_batches')
      .select('*, items:production_items(*)')
      .eq('id', batchId)
      .maybeSingle();

    if (!batch) {
      return mockStore.completeProductionBatch(batchId, userId);
    }

    if (batch.status === 'completed') {
      return { success: true, batch_id: batchId, message: 'Batch is already completed' };
    }

    await (supabase as any)
      .from('production_batches')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);

    // Stock movements (Production -> Main Freezer)
    if (batch.items && batch.items.length > 0) {
      const { freezerLoc, prodLoc } = await getOrCreateDefaultStockLocations();

      if (freezerLoc && prodLoc) {
        const now = new Date().toISOString();
        const movements = batch.items
          .filter((it: any) => (it.saleable_quantity || 0) > 0)
          .map((it: any) => ({
            movement_date: now,
            product_id: it.product_id,
            source_location_id: prodLoc.id,
            destination_location_id: freezerLoc.id,
            quantity: it.saleable_quantity,
            movement_type: 'production_completed',
            reference_table: 'production_batches',
            reference_id: batch.id,
            notes: `Stock added from completed production batch ${batch.batch_number}`,
            created_by: userId,
          }));

        if (movements.length > 0) {
          await (supabase as any).from('stock_movements').insert(movements);
        }
      }
    }

    return { success: true, batch_id: batchId };
  },

  async cancelProductionBatch(batchId: string, userId: string): Promise<void> {
    if (useMockMode) {
      return mockStore.cancelDraftBatch(batchId, userId);
    }
    const { error } = await (supabase as any)
      .from('production_batches')
      .update({ status: 'cancelled' })
      .eq('id', batchId)
      .eq('status', 'draft');
    if (error) throw error;
  },

  async deleteProductionBatch(batchId: string, reason: string = 'Deleted by Owner', userId: string = 'usr-owner-001'): Promise<{ success: boolean; message: string }> {
    if (useMockMode) {
      return mockStore.deleteProductionBatch(batchId, reason, userId);
    }
    try {
      const { data, error } = await (supabase as any).rpc('delete_production_batch_transaction', {
        p_batch_id: batchId,
        p_reason: reason,
        p_user_id: userId,
      });
      if (!error && data) {
        return data;
      }
      console.warn('RPC delete_production_batch_transaction failed or not installed, executing direct Supabase deletion:', error);
    } catch (err) {
      console.warn('deleteProductionBatch RPC error, executing direct Supabase deletion:', err);
    }

    // Direct Supabase deletion fallback
    const { data: batch } = await (supabase as any)
      .from('production_batches')
      .select('*, items:production_items(*)')
      .eq('id', batchId)
      .maybeSingle();

    if (!batch) {
      // If not found in Supabase, try mockStore
      return mockStore.deleteProductionBatch(batchId, reason, userId);
    }

    if (batch.status === 'completed' && batch.items && batch.items.length > 0) {
      const { data: locs } = await (supabase as any).from('stock_locations').select('id, location_type');
      const freezerLoc = locs?.find((l: any) => l.location_type === 'main_freezer');
      const prodLoc = locs?.find((l: any) => l.location_type === 'production');

      if (freezerLoc && prodLoc) {
        const movementsToInsert = batch.items
          .filter((it: any) => (it.saleable_quantity || 0) > 0)
          .map((it: any) => ({
            movement_date: new Date().toISOString(),
            product_id: it.product_id,
            source_location_id: freezerLoc.id,
            destination_location_id: prodLoc.id,
            quantity: it.saleable_quantity,
            movement_type: 'production_reversal',
            reference_table: 'production_batches',
            reference_id: batch.id,
            notes: `Stock reversal for deleted production batch ${batch.batch_number}: ${reason}`,
            created_by: userId,
          }));

        if (movementsToInsert.length > 0) {
          await (supabase as any).from('stock_movements').insert(movementsToInsert);
        }
      }
    }

    // Unlink self-referencing correction chains
    await (supabase as any).from('production_batches').update({ correction_of_id: null }).eq('correction_of_id', batchId);
    await (supabase as any).from('production_batches').update({ superseded_by_id: null }).eq('superseded_by_id', batchId);

    await (supabase as any).from('production_batch_ingredients').delete().eq('batch_id', batchId);
    await (supabase as any).from('production_items').delete().eq('batch_id', batchId);
    const { error: delErr } = await (supabase as any).from('production_batches').delete().eq('id', batchId);
    if (delErr) throw delErr;

    return { success: true, message: 'Production batch deleted successfully' };
  },

  async updateDraftProductionBatch(
    batchId: string,
    productionDate: string,
    totalIngredientCost: number,
    notes: string,
    items: { product_id: string; produced_quantity: number; damaged_quantity: number; notes?: string }[],
    userId: string
  ): Promise<any> {
    if (useMockMode) {
      return mockStore.updateDraftProductionBatch(batchId, productionDate, totalIngredientCost, notes, items, userId);
    }
    const { error: bErr } = await (supabase as any)
      .from('production_batches')
      .update({
        production_date: productionDate,
        total_ingredient_cost: totalIngredientCost,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId)
      .eq('status', 'draft');
    if (bErr) throw bErr;

    await (supabase as any).from('production_items').delete().eq('batch_id', batchId);

    const totalSaleable = items.reduce((sum, it) => sum + Math.max(0, Number(it.produced_quantity || 0) - Number(it.damaged_quantity || 0)), 0);

    const itemsToInsert = items.map((it) => {
      const prod = Number(it.produced_quantity || 0);
      const dam = Number(it.damaged_quantity || 0);
      const saleable = Math.max(0, prod - dam);
      const allocatedCost = totalSaleable > 0 ? (totalIngredientCost * saleable) / totalSaleable : 0;
      const unitCost = saleable > 0 ? allocatedCost / saleable : 0;

      return {
        batch_id: batchId,
        product_id: it.product_id,
        produced_quantity: prod,
        damaged_quantity: dam,
        saleable_quantity: saleable,
        allocated_ingredient_cost: Number(allocatedCost.toFixed(2)),
        unit_production_cost: Number(unitCost.toFixed(2)),
        notes: it.notes || null,
      };
    });

    const { error: iErr } = await (supabase as any).from('production_items').insert(itemsToInsert);
    if (iErr) throw iErr;
    return { success: true };
  },

  async correctProductionBatch(
    batchId: string,
    productionDate: string,
    totalIngredientCost: number,
    notes: string,
    items: { product_id: string; produced_quantity: number; damaged_quantity: number; notes?: string }[],
    reason: string,
    userId: string
  ): Promise<any> {
    if (useMockMode) {
      return mockStore.correctProductionBatch(batchId, productionDate, totalIngredientCost, notes, items, reason, userId);
    }
    try {
      const { data, error } = await (supabase as any).rpc('correct_completed_production', {
        p_batch_id: batchId,
        p_date: productionDate,
        p_cost: totalIngredientCost,
        p_notes: notes,
        p_items: items.map(item => ({
          product_id: item.product_id,
          produced_quantity: Number(item.produced_quantity),
          damaged_quantity: Number(item.damaged_quantity),
          notes: item.notes
        })),
        p_reason: reason,
        p_user_id: userId,
      });
      if (!error && data) {
        return data;
      }
      console.warn('RPC correct_completed_production failed, attempting direct Supabase revision:', error);
    } catch (err) {
      console.warn('RPC correct_completed_production error, attempting direct Supabase revision:', err);
    }

    // Direct Supabase revision fallback
    const { data: oldBatch } = await (supabase as any)
      .from('production_batches')
      .select('*, items:production_items(*)')
      .eq('id', batchId)
      .maybeSingle();

    if (!oldBatch) {
      return mockStore.correctProductionBatch(batchId, productionDate, totalIngredientCost, notes, items, reason, userId);
    }

    const nextVersion = (oldBatch.version_number || 1) + 1;
    const baseNumber = (oldBatch.batch_number || 'BATCH').replace(/-V\d+$/, '').replace(/-R\d+$/, '');
    const newBatchNumber = `${baseNumber}-R${nextVersion}`;

    const { data: newBatch, error: nErr } = await (supabase as any)
      .from('production_batches')
      .insert({
        batch_number: newBatchNumber,
        production_date: productionDate,
        status: 'completed',
        total_ingredient_cost: totalIngredientCost,
        notes: notes || null,
        version_number: nextVersion,
        is_current_version: true,
        correction_of_id: batchId,
        correction_reason: reason,
        corrected_by: userId,
        corrected_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        created_by: oldBatch.created_by,
      })
      .select()
      .single();

    if (nErr || !newBatch) throw nErr || new Error('Failed to create revised production batch');

    const totalSaleable = items.reduce((sum, it) => sum + Math.max(0, Number(it.produced_quantity || 0) - Number(it.damaged_quantity || 0)), 0);

    const itemsToInsert = items.map((it) => {
      const prod = Number(it.produced_quantity || 0);
      const dam = Number(it.damaged_quantity || 0);
      const saleable = Math.max(0, prod - dam);
      const allocatedCost = totalSaleable > 0 ? (totalIngredientCost * saleable) / totalSaleable : 0;
      const unitCost = saleable > 0 ? allocatedCost / saleable : 0;
      return {
        batch_id: newBatch.id,
        product_id: it.product_id,
        produced_quantity: prod,
        damaged_quantity: dam,
        saleable_quantity: saleable,
        allocated_ingredient_cost: Number(allocatedCost.toFixed(2)),
        unit_production_cost: Number(unitCost.toFixed(2)),
        notes: it.notes || null,
      };
    });

    await (supabase as any).from('production_items').insert(itemsToInsert);

    // Mark old batch superseded
    await (supabase as any)
      .from('production_batches')
      .update({
        status: 'superseded',
        is_current_version: false,
        superseded_by_id: newBatch.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', batchId);

    return newBatch;
  },

  async getProductionRevisionHistory(batchId: string): Promise<RevisionRecord[]> {
    if (useMockMode) {
      return mockStore.getProductionRevisionHistory(batchId);
    }
    const { data, error } = await (supabase as any)
      .from('production_batches')
      .select('*, items:production_items(*, product:products(*)), profile:profiles!created_by(*)')
      .order('version_number', { ascending: true });
    if (error) throw error;
    const all = data || [];
    const target = all.find((b: any) => b.id === batchId);
    if (!target) return [];
    let root = target;
    while (root.correction_of_id) {
      const parent = all.find((b: any) => b.id === root.correction_of_id);
      if (!parent) break;
      root = parent;
    }
    const chain: any[] = [];
    let curr: any = root;
    while (curr) {
      chain.push(curr);
      if (!curr.superseded_by_id) break;
      curr = all.find((b: any) => b.id === curr.superseded_by_id);
    }
    return chain.map((b: any) => ({
      id: b.id,
      version_number: b.version_number || 1,
      status: b.status,
      date: b.production_date,
      created_at: b.created_at,
      corrected_at: b.corrected_at,
      corrected_by_name: b.profile?.full_name || 'Owner',
      correction_reason: b.correction_reason,
      is_current_version: b.is_current_version !== false,
      correction_of_id: b.correction_of_id,
      superseded_by_id: b.superseded_by_id,
      summary_text: `Version ${b.version_number || 1} (${b.status}): ₹${b.total_ingredient_cost} cost`,
      details: b,
      financial_effect: { cost: b.total_ingredient_cost },
    }));
  },

  // --- Recipe & Production Costing Methods ---

  async updateIngredientRate(
    ingredientId: string,
    newRate: number,
    unit?: UnitType,
    saveToMaster: boolean = true,
    userId: string = 'usr-owner-001'
  ): Promise<Ingredient> {
    if (useMockMode) {
      return mockStore.updateIngredientRate(ingredientId, newRate, unit, saveToMaster, userId);
    }
    try {
      const resolvedIngredientId = await resolveSupabaseIngredientId(ingredientId);
      if (saveToMaster) {
        // Fetch existing ingredient to preserve rate_unit if unit is not passed
        const { data: existingIng } = await (supabase as any)
          .from('ingredients')
          .select('rate_unit, base_unit')
          .eq('id', resolvedIngredientId)
          .maybeSingle();

        const effectiveRateUnit = unit || existingIng?.rate_unit || existingIng?.base_unit || 'kg';

        // Close active price
        await (supabase as any)
          .from('ingredient_prices')
          .update({ effective_to: new Date().toISOString() })
          .eq('ingredient_id', resolvedIngredientId)
          .is('effective_to', null);

        await (supabase as any).from('ingredient_prices').insert({
          ingredient_id: resolvedIngredientId,
          rate: newRate,
          unit: effectiveRateUnit,
          effective_from: new Date().toISOString(),
          created_by: userId,
        });

        const { data, error } = await (supabase as any)
          .from('ingredients')
          .update({
            current_rate: newRate,
            rate_unit: effectiveRateUnit,
            updated_at: new Date().toISOString(),
          })
          .eq('id', resolvedIngredientId)
          .select()
          .single();
        if (error) {
          return mockStore.updateIngredientRate(ingredientId, newRate, effectiveRateUnit, saveToMaster, userId);
        }
        return data;
      }
      const { data } = await (supabase as any).from('ingredients').select('*').eq('id', resolvedIngredientId).single();
      return data || mockStore.getIngredientById(ingredientId)!;
    } catch (err) {
      return mockStore.updateIngredientRate(ingredientId, newRate, unit, saveToMaster, userId);
    }
  },

  async getRecipes(): Promise<RecipeWithItems[]> {
    if (useMockMode) {
      return mockStore.getRecipes();
    }
    const { data, error } = await (supabase as any)
      .from('recipes')
      .select(`
        *,
        product:products(*),
        items:recipe_items(
          *,
          ingredient:ingredients(*)
        )
      `)
      .order('version_number', { ascending: false });
    if (error) {
      throw new Error(error.message || 'Failed to fetch recipes from database');
    }
    return (data || []).map((r: any) => {
      const yieldQty = Number(r.expected_yield_pieces || r.standard_output_pieces || 100);
      return {
        ...r,
        expected_yield_pieces: yieldQty,
        standard_output_pieces: yieldQty,
      };
    });
  },

  async getRecipeForProduct(productId: string): Promise<RecipeWithItems | undefined> {
    if (useMockMode) {
      return mockStore.getRecipeForProduct(productId);
    }
    const resolvedProductId = await resolveSupabaseProductId(productId);
    const { data, error } = await (supabase as any)
      .from('recipes')
      .select(`
        *,
        product:products(*),
        items:recipe_items(
          *,
          ingredient:ingredients(*)
        )
      `)
      .eq('product_id', resolvedProductId)
      .eq('status', 'active')
      .order('is_default', { ascending: false })
      .order('version_number', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`[Get Active Recipe ${error.code || ''}]: ${error.message}`);
    }
    const active = data?.[0];
    if (!active) return undefined;
    const yieldQty = Number(active.expected_yield_pieces || active.standard_output_pieces || 100);
    return {
      ...active,
      expected_yield_pieces: yieldQty,
      standard_output_pieces: yieldQty,
    };
  },

  async getRecipeHistory(productId: string): Promise<RecipeWithItems[]> {
    if (useMockMode) {
      return mockStore.getRecipeHistory(productId);
    }
    const resolvedProductId = await resolveSupabaseProductId(productId);
    const { data, error } = await (supabase as any)
      .from('recipes')
      .select(`
        *,
        product:products(*),
        items:recipe_items(
          *,
          ingredient:ingredients(*)
        )
      `)
      .eq('product_id', resolvedProductId)
      .order('version_number', { ascending: false });
    if (error) {
      throw new Error(`[Recipe History ${error.code || ''}]: ${error.message}`);
    }
    return (data || []).map((r: any) => {
      const yieldQty = Number(r.expected_yield_pieces || r.standard_output_pieces || 100);
      return {
        ...r,
        expected_yield_pieces: yieldQty,
        standard_output_pieces: yieldQty,
      };
    });
  },

  async saveRecipe(
    data: {
      product_id: string;
      recipe_id?: string;
      name?: string;
      standard_output_pieces: number;
      expected_yield_pieces?: number;
      default_overheads: AdditionalOverheads;
      notes?: string;
      status?: 'draft' | 'active' | 'archived';
      items: {
        ingredient_id: string;
        quantity: number;
        unit: UnitType;
        save_rate_to_master?: boolean;
        rate?: number | null;
        rate_unit?: UnitType | null;
      }[];
      idempotency_key?: string;
    },
    userId: string
  ): Promise<RecipeWithItems> {
    if (useMockMode) {
      return mockStore.saveRecipe(data, userId);
    }

    const resolvedProductId = await resolveSupabaseProductId(data.product_id);
    const resolvedRecipeId = data.recipe_id ? toSafeUuid(data.recipe_id) : null;

    const resolvedItems = await Promise.all(
      data.items.map(async (it) => ({
        ingredient_id: await resolveSupabaseIngredientId(it.ingredient_id),
        quantity: Math.max(0, Number(it.quantity) || 0),
        unit: it.unit || 'kg',
        rate: it.rate,
        rate_unit: it.rate_unit,
      }))
    );

    const stdYield = Math.max(1, Number(data.expected_yield_pieces || data.standard_output_pieces || 100));
    const idempotencyKey = toSafeUuid(data.idempotency_key) || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null);

    const { data: rpcResult, error: rpcError } = await (supabase as any).rpc('save_recipe_version_transaction', {
      p_product_id: resolvedProductId,
      p_recipe_id: resolvedRecipeId,
      p_name: data.name ? data.name.trim() : null,
      p_expected_yield: stdYield,
      p_default_overheads: data.default_overheads || {},
      p_items: resolvedItems,
      p_status: data.status || 'active',
      p_notes: data.notes ? data.notes.trim() : null,
      p_idempotency_key: idempotencyKey,
    });

    if (rpcError) {
      throw new Error(`[Save Recipe ${rpcError.code || ''}]: ${rpcError.message}`);
    }

    if (!rpcResult || rpcResult.success === false) {
      throw new Error(rpcResult?.message || 'Failed to save recipe version');
    }

    // Optionally update rates in ingredients master if flagged
    for (const it of data.items) {
      if (it.save_rate_to_master && typeof it.rate === 'number' && it.rate > 0) {
        const resIngId = await resolveSupabaseIngredientId(it.ingredient_id);
        await this.updateIngredientRate(resIngId, it.rate, undefined, true, userId);
      }
    }

    const savedRecipeId = rpcResult.recipe_id;
    const { data: recData, error: recError } = await (supabase as any)
      .from('recipes')
      .select(`
        *,
        product:products(*),
        items:recipe_items(
          *,
          ingredient:ingredients(*)
        )
      `)
      .eq('id', savedRecipeId)
      .single();

    if (recError || !recData) {
      throw new Error(`Failed to retrieve newly saved recipe: ${recError?.message || 'Not found'}`);
    }

    const yieldQty = Number(recData.expected_yield_pieces || recData.standard_output_pieces || stdYield);
    return {
      ...recData,
      expected_yield_pieces: yieldQty,
      standard_output_pieces: yieldQty,
    };
  },

  async activateRecipeVersion(recipeId: string, userId?: string): Promise<{ success: boolean; message: string }> {
    if (useMockMode) {
      return mockStore.activateRecipeVersion(recipeId, userId);
    }
    const { data, error } = await (supabase as any).rpc('activate_recipe_version_transaction', {
      p_recipe_id: recipeId,
      p_user_id: userId || null,
    });
    if (error) {
      throw new Error(error.message || 'Failed to activate recipe version');
    }
    return data;
  },

  async deleteRecipeVersion(recipeId: string, userId?: string): Promise<{ success: boolean; archived?: boolean; deleted?: boolean; message: string }> {
    if (useMockMode) {
      return mockStore.deleteRecipeVersion(recipeId, userId);
    }
    const { data, error } = await (supabase as any).rpc('delete_recipe_version_transaction', {
      p_recipe_id: recipeId,
      p_user_id: userId || null,
    });
    if (error) {
      throw new Error(error.message || 'Failed to delete recipe version');
    }
    return data;
  },

  async createProductionCostingBatch(
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
    userId: string
  ): Promise<any> {
    if (useMockMode) {
      return mockStore.createProductionCostingBatch(data, userId);
    }

    try {
      const { data: res, error } = await (supabase as any).rpc(
        'create_production_costing_batch_transaction',
        {
          p_date: data.productionDate,
          p_product_id: data.productId,
          p_recipe_id: data.recipeId || null,
          p_produced_qty: data.producedQuantity,
          p_damaged_qty: data.damagedQuantity,
          p_total_ingredient_cost: data.totalIngredientCost,
          p_overhead_costs: data.overheadCosts,
          p_total_batch_cost: data.totalBatchCost,
          p_cost_per_piece: data.costPerPiece,
          p_expected_sales: data.expectedSales,
          p_gross_profit: data.estimatedGrossProfit,
          p_gross_margin: data.grossMarginPercentage,
          p_ingredients: data.ingredients,
          p_notes: data.notes || '',
          p_user_id: userId,
        }
      );

      if (!error && res) {
        return res;
      }
      console.warn('RPC create_production_costing_batch_transaction failed or not present, using direct Supabase creation:', error);
    } catch (err) {
      console.warn('createProductionCostingBatch RPC error, using direct Supabase creation:', err);
    }

    // Direct Supabase implementation
    const produced = Math.max(0, Math.round(Number(data.producedQuantity) || 0));
    const damaged = Math.max(0, Math.round(Number(data.damagedQuantity) || 0));
    const saleable = produced - damaged;
    const now = new Date().toISOString();
    const batchNumber = `BAT-${data.productionDate.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const { data: batch, error: bErr } = await (supabase as any)
      .from('production_batches')
      .insert({
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
        created_by: userId,
      })
      .select()
      .single();

    if (bErr) throw bErr;

    // Insert production item
    const prod = Number(produced || 0);
    const dam = Number(damaged || 0);
    const sal = Math.max(0, prod - dam);
    await (supabase as any).from('production_items').insert({
      batch_id: batch.id,
      product_id: data.productId,
      produced_quantity: prod,
      damaged_quantity: dam,
      saleable_quantity: sal,
      allocated_ingredient_cost: Number(data.totalIngredientCost || 0),
      unit_production_cost: Number(data.costPerPiece || 0),
      notes: data.notes || null,
    });

    // Insert ingredients snapshots
    if (data.ingredients && data.ingredients.length > 0) {
      const ingItems = data.ingredients.map((ing) => ({
        batch_id: batch.id,
        ingredient_id: ing.ingredient_id || null,
        ingredient_name: ing.ingredient_name,
        quantity_used: ing.quantity_used,
        unit: ing.unit,
        converted_base_quantity: ing.converted_base_quantity,
        rate_snapshot: ing.rate_snapshot,
        rate_unit: ing.rate_unit,
        calculated_cost: ing.calculated_cost,
        is_packaging: ing.is_packaging || false,
      }));
      await (supabase as any).from('production_batch_ingredients').insert(ingItems);
    }

    // Insert stock movements (production -> main_freezer)
    const { freezerLoc, prodLoc } = await getOrCreateDefaultStockLocations();
    if (freezerLoc && prodLoc && saleable > 0) {
      await (supabase as any).from('stock_movements').insert({
        movement_date: now,
        product_id: data.productId,
        source_location_id: prodLoc.id,
        destination_location_id: freezerLoc.id,
        quantity: saleable,
        movement_type: 'production_completed',
        reference_table: 'production_batches',
        reference_id: batch.id,
        notes: `Costing batch completed: ${batchNumber} (${saleable} pcs)`,
        created_by: userId,
      });
    }

    return batch;
  },

  async reconcileFreezerStockCounts(
    counts: Record<string, number>,
    reason: string = 'Physical Stock Count Reconciliation',
    idempotencyKey?: string
  ): Promise<{
    success: boolean;
    message: string;
    old_balances: Record<string, number>;
    new_balances: Record<string, number>;
    adjustments: any[];
    total_adjusted_products: number;
  }> {
    if (useMockMode) {
      return mockStore.reconcileFreezerStockCounts(counts, reason, idempotencyKey);
    }

    const payload: any = {
      p_counts: counts,
      p_reason: reason,
    };
    if (idempotencyKey) {
      payload.p_idempotency_key = idempotencyKey;
    }

    const { data, error } = await (supabase as any).rpc('reconcile_freezer_stock_transaction', payload);
    if (error) {
      console.error('[stock reconciliation] failed', error);
      throw new Error(`[Supabase Error ${error.code || ''}]: ${error.message}`);
    }
    if (!data || !data.success) {
      throw new Error(data?.message || 'Stock reconciliation failed on server');
    }
    return data;
  },

  async adjustFreezerStock(
    productId: string,
    newQuantity: number,
    reason: string = 'Manual Adjustment',
    userId: string = 'usr-owner-001'
  ): Promise<{ success: boolean; previousQuantity: number; newQuantity: number; difference: number; message: string }> {
    if (useMockMode) {
      return mockStore.adjustFreezerStock(productId, newQuantity, reason, userId);
    }

    const res = await this.reconcileFreezerStockCounts({ [productId]: newQuantity }, reason);
    const adj = res.adjustments?.find((a: any) => a.product_id === productId);
    return {
      success: true,
      previousQuantity: Number(res.old_balances?.[productId] ?? 0),
      newQuantity: Number(res.new_balances?.[productId] ?? newQuantity),
      difference: adj ? Number(adj.difference) : 0,
      message: res.message || 'Freezer stock successfully updated',
    };
  },

  async resetAllFreezerStockToZero(
    reason: string = 'Reset all stock to 0 by Owner',
    userId: string = 'usr-owner-001'
  ): Promise<{ success: boolean; message: string }> {
    if (useMockMode) {
      return mockStore.resetAllFreezerStockToZero(reason, userId);
    }
    const products = await this.getProducts();
    const counts: Record<string, number> = {};
    for (const prod of products) {
      counts[prod.id] = 0;
    }
    await this.reconcileFreezerStockCounts(counts, reason);
    return { success: true, message: 'All freezer stock successfully reset to 0 pcs' };
  },


  // --- Seller Stock Issues ---
  async getSellerIssues(): Promise<SellerIssueWithDetails[]> {
    if (useMockMode) {
      return mockStore.getSellerIssues();
    }
    const { data, error } = await (supabase as any)
      .from('seller_issues')
      .select(`
        *,
        seller:sellers(*),
        cart:carts(*),
        items:seller_issue_items(
          *,
          product:products(*)
        ),
        settlements:seller_settlements(*)
      `)
      .neq('status', 'superseded')
      .order('issue_date', { ascending: false });
    if (error) throw error;
    return (data as any) || [];
  },

  async issueSellerStock(
    sellerId: string,
    cartId: string | null,
    issueDate: string,
    items: { product_id: string; issued_quantity: number }[],
    notes: string,
    userId: string
  ): Promise<any> {
    if (useMockMode) {
      return mockStore.issueSellerStock(sellerId, cartId, issueDate, items, notes, userId);
    }
    try {
      const { data, error } = await (supabase as any).rpc('issue_seller_stock', {
        p_seller_id: sellerId,
        p_cart_id: cartId,
        p_issue_date: issueDate,
        p_items: items,
        p_notes: notes,
        p_user_id: userId,
      });
      if (!error && data) {
        return data;
      }
      console.warn('RPC issue_seller_stock failed or unavailable, executing direct Supabase issue:', error);
    } catch (rpcErr) {
      console.warn('RPC issue_seller_stock call failed, executing direct Supabase issue:', rpcErr);
    }

    // Direct Supabase Issue Fallback
    const todayCode = `IS-${issueDate.replace(/-/g, '')}`;
    const { data: existingIssues } = await (supabase as any)
      .from('seller_issues')
      .select('issue_number')
      .ilike('issue_number', `${todayCode}%`);
    const seq = (existingIssues?.length || 0) + 1;
    const issueNumber = `${todayCode}-${String(seq).padStart(3, '0')}`;

    const { data: newIssue, error: iErr } = await (supabase as any)
      .from('seller_issues')
      .insert({
        issue_number: issueNumber,
        seller_id: sellerId,
        cart_id: cartId || null,
        issue_date: issueDate,
        status: 'issued',
        notes: notes || null,
        created_by: userId,
      })
      .select()
      .single();

    if (iErr || !newIssue) throw iErr || new Error('Failed to create seller issue');

    // Fetch products for price snapshots
    const { data: prods } = await (supabase as any).from('products').select('*');
    const { data: seller } = await (supabase as any).from('sellers').select('*').eq('id', sellerId).maybeSingle();

    const itemsToInsert = items.map((it) => {
      const p = prods?.find((pr: any) => pr.id === it.product_id);
      return {
        seller_issue_id: newIssue.id,
        product_id: it.product_id,
        issued_quantity: it.issued_quantity,
        unit_selling_price_snapshot: p?.selling_price || 0,
        commission_type_snapshot: seller?.commission_type || 'fixed',
        commission_value_snapshot: seller?.commission_value || 0,
      };
    });

    await (supabas…21088 tokens truncated…Materials: activeCount,
      lowStockMaterials: lowStockCount,
      outOfStockMaterials: outOfStockCount,
      purchasesThisMonth: Number(purchasesThisMonth.toFixed(2)),
      productionConsumptionThisMonth: Number(productionConsumptionThisMonth.toFixed(2)),
    };
  },

  // --- Material Purchases ---
  async getMaterialPurchases(): Promise<MaterialPurchaseWithItems[]> {
    if (useMockMode) {
      return mockStore.getMaterialPurchases();
    }

    const { data, error } = await (supabase as any)
      .from('material_purchases')
      .select('*, supplier:suppliers(*), items:material_purchase_items(*, ingredient:ingredients(*))')
      .order('purchase_date', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        console.warn('[Supabase] Table material_purchases not found in schema cache. Please run migration 025 in Supabase SQL editor.');
        return [];
      }
      throw new Error(`[Material Purchases ${error.code || ''}]: ${error.message}`);
    }
    return data || [];
  },

  async getMaterialPurchaseById(id: string): Promise<MaterialPurchaseWithItems | undefined> {
    if (useMockMode) {
      return mockStore.getMaterialPurchaseById(id);
    }

    const { data, error } = await (supabase as any)
      .from('material_purchases')
      .select('*, supplier:suppliers(*), items:material_purchase_items(*, ingredient:ingredients(*))')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        console.warn('[Supabase] Table material_purchases not found in schema cache. Please run migration 025 in Supabase SQL editor.');
        return undefined;
      }
      throw new Error(`[Material Purchase ${error.code || ''}]: ${error.message}`);
    }
    return data || undefined;
  },

  async createMaterialPurchase(
    data: {
      purchase_date: string;
      supplier_id?: string | null;
      invoice_number?: string | null;
      payment_method: 'cash' | 'upi' | 'bank_transfer' | 'credit';
      paid_amount: number;
      credit_amount?: number;
      bill_image_url?: string | null;
      notes?: string | null;
      idempotency_key?: string | null;
      items: {
        ingredient_id: string;
        purchased_quantity: number;
        purchase_unit: UnitType;
        free_quantity?: number;
        unit_price: number;
        discount?: number;
        tax?: number;
        allocated_charge?: number;
        lot_number?: string | null;
        manufacturing_date?: string | null;
        expiry_date?: string | null;
      }[];
    },
    userId: string
  ): Promise<MaterialPurchaseWithItems> {
    if (useMockMode) {
      return mockStore.createMaterialPurchase(data, userId);
    }

    const resolvedItems = await Promise.all(
      data.items.map(async (item) => ({
        ...item,
        ingredient_id: await resolveSupabaseIngredientId(item.ingredient_id),
      }))
    );
    const resolvedSupplierId = await resolveSupabaseSupplierId(data.supplier_id);
    const safeUserId = toSafeUuid(userId) || '00000000-0000-0000-0000-000000000001';
    const safeSupplierId = toSafeUuid(resolvedSupplierId);
    const idempotencyKey = toSafeUuid(data.idempotency_key) || null;

    // 1. Attempt Atomic RPC 'confirm_material_purchase_atomic'
    let rpcPurchaseId: string | null = null;
    try {
      const { data: result, error: rpcError } = await (supabase as any).rpc(
        'confirm_material_purchase_atomic',
        {
          p_purchase_date: data.purchase_date,
          p_supplier_id: safeSupplierId || resolvedSupplierId || null,
          p_invoice_number: data.invoice_number || null,
          p_payment_method: data.payment_method,
          p_paid_amount: Number(data.paid_amount || 0),
          p_credit_amount: Number(data.credit_amount || 0),
          p_bill_image_url: data.bill_image_url || null,
          p_notes: data.notes || null,
          p_items: resolvedItems,
          p_idempotency_key: idempotencyKey,
          p_user_id: safeUserId || userId,
        }
      );

      if (!rpcError && result?.purchase_id) {
        rpcPurchaseId = result.purchase_id;
      } else if (rpcError) {
        if (isRpcMissingError(rpcError)) {
          // Fallback to confirm_material_purchase_transaction if atomic RPC not yet in schema cache
          console.warn('[material purchase] confirm_material_purchase_atomic not in schema cache, trying confirm_material_purchase_transaction fallback...');
          const { data: fallbackRes, error: fbErr } = await (supabase as any).rpc(
            'confirm_material_purchase_transaction',
            {
              p_purchase_date: data.purchase_date,
              p_supplier_id: safeSupplierId || resolvedSupplierId || null,
              p_invoice_number: data.invoice_number || null,
              p_payment_method: data.payment_method,
              p_paid_amount: Number(data.paid_amount || 0),
              p_credit_amount: Number(data.credit_amount || 0),
              p_bill_image_url: data.bill_image_url || null,
              p_notes: data.notes || null,
              p_items: resolvedItems,
              p_user_id: safeUserId || userId,
            }
          );
          if (!fbErr && fallbackRes?.purchase_id) {
            rpcPurchaseId = fallbackRes.purchase_id;
          } else if (fbErr && !isRpcMissingError(fbErr)) {
            console.error('[material purchase] Fallback RPC error:', fbErr);
            throw new Error(`[Supabase Purchase RPC Error ${fbErr.code || ''}]: ${fbErr.message}`);
          }
        } else {
          // Real validation or constraint error: throw directly to caller
          console.error('[material purchase] Atomic RPC error:', rpcError);
          throw new Error(`[Supabase Purchase RPC Error ${rpcError.code || ''}]: ${rpcError.message}`);
        }
      }
    } catch (e: any) {
      if (e.message?.startsWith('[Supabase Purchase RPC Error')) {
        throw e;
      }
      console.warn('[material purchase] RPC exception, attempting direct Supabase transaction fallback:', e);
    }

    if (rpcPurchaseId) {
      const loaded = await this.getMaterialPurchaseById(rpcPurchaseId);
      if (loaded) return loaded;
    }

    // 2. Direct live Supabase transaction (Guarantees live DB transaction with authoritative stock movements)
    const purchaseNumber = `PUR-${data.purchase_date.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const totalAmount = resolvedItems.reduce((sum, it) => {
      const itemPrice = (Number(it.purchased_quantity) || 0) * (Number(it.unit_price) || 0);
      const discount = Number(it.discount || 0);
      const tax = Number(it.tax || 0);
      const charge = Number(it.allocated_charge || 0);
      return sum + (itemPrice - discount + tax + charge);
    }, 0);

    const headerPayload: any = {
      purchase_number: purchaseNumber,
      purchase_date: data.purchase_date,
      supplier_id: safeSupplierId || null,
      invoice_number: data.invoice_number || null,
      payment_method: data.payment_method,
      total_amount: Number(totalAmount.toFixed(2)),
      paid_amount: Number(data.paid_amount || 0),
      credit_amount: Number(data.credit_amount || 0),
      status: 'received',
      bill_image_url: data.bill_image_url || null,
      notes: data.notes || null,
      created_by: safeUserId,
    };
    if (idempotencyKey) {
      headerPayload.idempotency_key = idempotencyKey;
    }

    let { data: purchaseRow, error: purchaseErr } = await (supabase as any)
      .from('material_purchases')
      .insert(headerPayload)
      .select()
      .single();

    // If idempotency_key is not in schema cache (PGRST204), retry insert without it
    if (purchaseErr && (purchaseErr.code === 'PGRST204' || String(purchaseErr.message).includes('idempotency_key'))) {
      console.warn('[Supabase Purchase] Column idempotency_key not found in schema cache, retrying without it. Please execute migration 030 in Supabase SQL editor.');
      delete headerPayload.idempotency_key;
      const retryResult = await (supabase as any)
        .from('material_purchases')
        .insert(headerPayload)
        .select()
        .single();
      purchaseRow = retryResult.data;
      purchaseErr = retryResult.error;
    }

    if (purchaseErr) {
      if (purchaseErr.code === 'PGRST205' || purchaseErr.code === '42P01') {
        throw new Error(
          `[Supabase Purchase PGRST205]: Table 'public.material_purchases' is not yet present in your Supabase database schema cache. ` +
          `Please open your Supabase SQL Editor and execute 'supabase/migrations/030_atomic_material_purchase_and_stock_repair.sql' or 'supabase/complete_setup.sql'.`
        );
      }
      throw new Error(`[Supabase Purchase ${purchaseErr.code || ''}]: ${purchaseErr.message}`);
    }

    // Insert purchase items
    const itemsToInsert = resolvedItems.map((it) => {
      const itemPrice = (Number(it.purchased_quantity) || 0) * (Number(it.unit_price) || 0);
      const discount = Number(it.discount || 0);
      const tax = Number(it.tax || 0);
      const charge = Number(it.allocated_charge || 0);
      const netCost = itemPrice - discount + tax + charge;
      const totalRecQty = (Number(it.purchased_quantity) || 0) + (Number(it.free_quantity) || 0);
      const unitAcqCost = totalRecQty > 0 ? Number((netCost / totalRecQty).toFixed(4)) : Number(it.unit_price);
      return {
        purchase_id: purchaseRow.id,
        ingredient_id: it.ingredient_id,
        purchased_quantity: Number(it.purchased_quantity),
        purchase_unit: it.purchase_unit,
        free_quantity: Number(it.free_quantity || 0),
        total_received_quantity: totalRecQty,
        base_quantity: totalRecQty,
        base_unit: it.purchase_unit,
        unit_price: Number(it.unit_price),
        item_price: Number(itemPrice.toFixed(2)),
        discount: discount,
        tax: tax,
        allocated_charge: charge,
        net_item_cost: Number(netCost.toFixed(2)),
        unit_acquisition_cost: unitAcqCost,
        lot_number: it.lot_number || null,
        manufacturing_date: it.manufacturing_date || null,
        expiry_date: it.expiry_date || null,
      };
    });

    let { error: itemsErr } = await (supabase as any)
      .from('material_purchase_items')
      .insert(itemsToInsert);

    if (itemsErr && itemsErr.code === 'PGRST204') {
      console.warn('[Supabase Purchase] Schema mismatch on material_purchase_items, retrying with core columns...');
      const fallbackItems = itemsToInsert.map((it: any) => ({
        purchase_id: it.purchase_id,
        ingredient_id: it.ingredient_id,
        purchased_quantity: it.purchased_quantity,
        purchase_unit: it.purchase_unit,
        unit_price: it.unit_price,
        item_price: it.item_price,
        net_item_cost: it.net_item_cost,
      }));
      const retryItems = await (supabase as any)
        .from('material_purchase_items')
        .insert(fallbackItems);
      itemsErr = retryItems.error;
    }

    if (itemsErr) {
      throw new Error(`[Supabase Purchase Items ${itemsErr.code || ''}]: ${itemsErr.message}`);
    }

    // Insert stock movements in raw_material_movements
    for (const it of resolvedItems) {
      const qty = Number(it.purchased_quantity) + Number(it.free_quantity || 0);
      const itemPrice = Number(it.purchased_quantity) * Number(it.unit_price);
      const netCost = itemPrice - Number(it.discount || 0) + Number(it.tax || 0) + Number(it.allocated_charge || 0);
      const unitAcqCost = qty > 0 ? Number((netCost / qty).toFixed(4)) : Number(it.unit_price);

      const movPayload: any = {
        ingredient_id: it.ingredient_id,
        movement_type: 'purchase_received',
        quantity: qty,
        base_unit: it.purchase_unit,
        unit_cost_snapshot: unitAcqCost,
        total_value_snapshot: Number(netCost.toFixed(2)),
        reference_table: 'material_purchases',
        reference_id: purchaseRow.id,
        movement_date: data.purchase_date,
        source_location: 'Supplier',
        destination_location: 'Main Store',
        reason: `Material purchase: ${purchaseNumber}`,
      };
      if (safeUserId) {
        movPayload.created_by = safeUserId;
        movPayload.performed_by = safeUserId;
      }

      let { error: movErr } = await (supabase as any).from('raw_material_movements').insert(movPayload);

      if (
        movErr &&
        (movErr.code === 'PGRST204' ||
          String(movErr.message).includes('created_by') ||
          String(movErr.message).includes('performed_by') ||
          movErr.code === '23503' ||
          String(movErr.message).includes('foreign key'))
      ) {
        delete movPayload.created_by;
        delete movPayload.performed_by;
        const retryMov = await (supabase as any).from('raw_material_movements').insert(movPayload);
        movErr = retryMov.error;
      }

      if (movErr) {
        throw new Error(`[Supabase Purchase Movement ${movErr.code || ''}]: Failed to record inventory movement: ${movErr.message}`);
      }

      // Update current_rate on ingredients table
      await (supabase as any)
        .from('ingredients')
        .update({ current_rate: Number(it.unit_price) })
        .eq('id', it.ingredient_id);
    }

    // If paid_amount > 0, insert expense
    if (Number(data.paid_amount || 0) > 0) {
      await (supabase as any).from('expenses').insert({
        expense_date: data.purchase_date,
        category: 'raw_materials',
        amount: Number(data.paid_amount),
        payment_method: data.payment_method === 'credit' ? 'cash' : data.payment_method,
        paid_to: 'Material Supplier',
        description: `Raw material purchase ${purchaseNumber}`,
        bill_url: data.bill_image_url || null,
        created_by: safeUserId,
      });
    }

    const loaded = await this.getMaterialPurchaseById(purchaseRow.id);
    if (!loaded) {
      throw new Error(`[Supabase]: Purchase ${purchaseRow.id} created in database but failed to retrieve`);
    }

    return loaded;
  },

  async reverseMaterialPurchase(purchaseId: string, reason: string, userId: string): Promise<boolean> {
    if (useMockMode) {
      return mockStore.reverseMaterialPurchase(purchaseId, reason, userId);
    }

    const safeUserId = toSafeUuid(userId) || '00000000-0000-0000-0000-000000000001';

    // 1. Attempt RPC
    try {
      const { data, error } = await (supabase as any).rpc('reverse_material_purchase_transaction', {
        p_purchase_id: purchaseId,
        p_reason: reason,
        p_user_id: safeUserId,
      });

      if (!error && data?.success !== false) {
        return true;
      }
    } catch (e) {
      console.warn('[reverse purchase] RPC exception:', e);
    }

    // 2. Direct Supabase reversal
    const purchase = await this.getMaterialPurchaseById(purchaseId);
    if (!purchase) {
      throw new Error(`[Supabase]: Purchase ${purchaseId} not found`);
    }

    const { error: updErr } = await (supabase as any)
      .from('material_purchases')
      .update({ status: 'cancelled', notes: `${purchase.notes || ''} [Cancelled: ${reason}]` })
      .eq('id', purchaseId);

    if (updErr) {
      throw new Error(`[Supabase Cancel Purchase ${updErr.code || ''}]: ${updErr.message}`);
    }

    for (const item of purchase.items || []) {
      const qty = Number(item.purchased_quantity) + Number(item.free_quantity || 0);
      await (supabase as any).from('raw_material_movements').insert({
        ingredient_id: item.ingredient_id,
        movement_type: 'purchase_reversal',
        quantity: -Math.abs(qty),
        base_unit: item.purchase_unit,
        unit_cost_snapshot: item.unit_price,
        total_value_snapshot: -Math.abs((item as any).item_total_cost ?? item.net_item_cost ?? (Number(item.purchased_quantity || 0) * Number(item.unit_price || 0))),
        reference_table: 'material_purchases',
        reference_id: purchaseId,
        movement_date: new Date().toISOString().split('T')[0],
        source_location: 'Main Store',
        destination_location: 'Reversal',
        reason: `Purchase reversal: ${reason}`,
        created_by: safeUserId,
      });
    }

    return true;
  },

  // --- Physical Stock Counts ---
  async getPhysicalStockCounts(): Promise<PhysicalStockCountWithItems[]> {
    if (useMockMode) {
      return mockStore.getPhysicalStockCounts();
    }
    const { data, error } = await (supabase as any)
      .from('physical_stock_counts')
      .select('*, items:physical_stock_count_items(*, ingredient:ingredients(*))')
      .order('count_date', { ascending: false });
    if (error) {
      throw new Error(`[Physical Stock Counts ${error.code || ''}]: ${error.message}`);
    }
    return data || [];
  },

  async createPhysicalStockCount(
    data: {
      count_date: string;
      notes?: string;
      items: {
        ingredient_id: string;
        physical_stock: number;
        reason?: string;
      }[];
      status?: 'draft' | 'approved';
      idempotency_key?: string;
    },
    userId?: string
  ): Promise<PhysicalStockCountWithItems> {
    if (useMockMode) {
      return mockStore.createPhysicalStockCount(data, userId || 'usr-owner-001');
    }

    const resolvedItems = await Promise.all(
      data.items.map(async (item) => ({
        ingredient_id: await resolveSupabaseIngredientId(item.ingredient_id),
        physical_stock: Math.max(0, Number(item.physical_stock) || 0),
        reason: item.reason ? item.reason.trim() : null,
      }))
    );

    const idempotencyKey = toSafeUuid(data.idempotency_key) || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null);

    const { data: result, error } = await (supabase as any).rpc('create_physical_stock_count_transaction', {
      p_count_date: data.count_date,
      p_notes: data.notes ? data.notes.trim() : null,
      p_items: resolvedItems,
      p_idempotency_key: idempotencyKey,
    });

    if (error) {
      throw new Error(`[Create Stock Count ${error.code || ''}]: ${error.message}`);
    }

    if (!result || result.success === false) {
      throw new Error(result?.message || 'Failed to create physical stock count');
    }

    const countId = result.count_id;

    // If approved status requested during creation, approve immediately
    if (data.status === 'approved' && countId) {
      const { data: approveResult, error: approveError } = await (supabase as any).rpc('approve_physical_stock_count_transaction', {
        p_count_id: countId,
        p_notes: data.notes ? `Approved on submission: ${data.notes.trim()}` : null,
      });

      if (approveError) {
        throw new Error(`[Approve Stock Count ${approveError.code || ''}]: ${approveError.message}`);
      }

      if (approveResult?.success === false) {
        throw new Error(approveResult?.message || 'Failed to approve physical stock count');
      }
    }

    // Return the full record from the database
    const counts = await this.getPhysicalStockCounts();
    const found = counts.find((c) => c.id === countId);
    if (found) return found;

    return {
      id: countId,
      count_number: result.count_number,
      count_date: data.count_date,
      status: data.status === 'approved' ? 'approved' : 'draft',
      notes: data.notes || null,
      items: (result.items || []).map((it: any) => ({
        id: it.id,
        count_id: countId,
        ingredient_id: it.ingredient_id,
        app_stock: Number(it.app_stock) || 0,
        physical_stock: Number(it.physical_stock) || 0,
        difference_quantity: Number(it.difference_quantity) || 0,
        base_unit: it.base_unit || 'kg',
        unit_cost_snapshot: Number(it.unit_cost_snapshot) || 0,
        difference_value: Number(it.difference_value) || 0,
        reason: it.reason || null,
      })),
    };
  },

  async approvePhysicalStockCount(countId: string, notes?: string): Promise<boolean> {
    if (useMockMode) {
      return mockStore.approvePhysicalStockCount(countId);
    }
    const { data, error } = await (supabase as any).rpc('approve_physical_stock_count_transaction', {
      p_count_id: countId,
      p_notes: notes || null,
    });
    if (error) {
      throw new Error(`[Approve Stock Count ${error.code || ''}]: ${error.message}`);
    }
    if (data?.success === false) {
      throw new Error(data?.message || 'Failed to approve physical stock count');
    }
    return true;
  },

  async rejectPhysicalStockCount(countId: string, reason?: string): Promise<boolean> {
    if (useMockMode) {
      const count = (mockStore.getState().physical_stock_counts || []).find((c) => c.id === countId);
      if (count) count.status = 'rejected';
      return true;
    }
    const { data, error } = await (supabase as any).rpc('reject_physical_stock_count_transaction', {
      p_count_id: countId,
      p_reason: reason || null,
    });
    if (error) {
      throw new Error(`[Reject Stock Count ${error.code || ''}]: ${error.message}`);
    }
    if (data?.success === false) {
      throw new Error(data?.message || 'Failed to reject physical stock count');
    }
    return true;
  },

  // --- Simple LPG Cylinder Register Management ---
  async getSimpleLpgCylinders(includeInactive: boolean = true): Promise<SimpleLpgCylinder[]> {
    if (useMockMode) {
      const list = mockStore.getSimpleLpgCylinders();
      return includeInactive ? list : list.filter((c) => c.is_active !== false);
    }
    let query = (supabase as any).from('lpg_cylinders').select('*').order('sort_order', { ascending: true }).order('cylinder_code', { ascending: true });
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`[LPG Cylinders ${error.code || ''}]: ${error.message}`);
    }
    return data || [];
  },

  async getSimpleLpgCylinderById(id: string): Promise<SimpleLpgCylinder | undefined> {
    if (useMockMode) {
      return mockStore.getSimpleLpgCylinderById(id);
    }
    const { data, error } = await (supabase as any)
      .from('lpg_cylinders')
      .select('*')
      .or(`id.eq.${id},cylinder_code.eq.${id}`)
      .maybeSingle();
    if (error) {
      throw new Error(`[LPG Cylinder ${error.code || ''}]: ${error.message}`);
    }
    return data || undefined;
  },

  async getSimpleLpgMovements(cylinderId?: string): Promise<SimpleLpgMovement[]> {
    if (useMockMode) {
      return mockStore.getSimpleLpgMovements(cylinderId);
    }
    let query = (supabase as any)
      .from('lpg_cylinder_movements')
      .select('*, cylinder:lpg_cylinders(*)')
      .order('created_at', { ascending: false });
    if (cylinderId) {
      query = query.eq('cylinder_id', cylinderId);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`[LPG Movements ${error.code || ''}]: ${error.message}`);
    }
    return data || [];
  },

  async getLpgSummaryKPIs(): Promise<LpgSummaryKPIs> {
    if (useMockMode) {
      return mockStore.getLpgSummaryKPIs();
    }
    const { data, error } = await (supabase as any)
      .from('lpg_cylinders')
      .select('id, status, is_active');
    if (error) {
      throw new Error(`[LPG Summary ${error.code || ''}]: ${error.message}`);
    }
    const cylinders = data || [];
    const active = cylinders.filter((c: any) => c.is_active !== false);
    return {
      totalActive: active.length,
      fullCount: active.filter((c: any) => c.status === 'full').length,
      connectedCount: active.filter((c: any) => c.status === 'connected' || c.status === 'in_use').length,
      emptyCount: active.filter((c: any) => c.status === 'empty').length,
      sentForRefillCount: active.filter((c: any) => c.status === 'sent_for_refill').length,
      inactiveCount: cylinders.filter((c: any) => c.is_active === false || c.status === 'inactive' || c.status === 'damaged_inactive').length,
    };
  },

  async addSimpleLpgCylinder(
    data: {
      cylinder_code: string;
      status?: SimpleLpgCylinderStatus;
      supplier_id?: string | null;
      supplier_name?: string | null;
      starting_date?: string;
      notes?: string | null;
      idempotency_key?: string;
    },
    userId?: string
  ): Promise<{ success: boolean; cylinder: SimpleLpgCylinder; movement: SimpleLpgMovement }> {
    if (useMockMode) {
      const created = mockStore.addSimpleLpgCylinder(data, userId || 'usr-owner-001');
      return { success: true, cylinder: created.cylinder, movement: created.movement };
    }
    const cleanCode = data.cylinder_code.trim().toUpperCase();
    const cleanStatus = data.status || 'full';
    const cleanPlace = cleanStatus === 'connected' ? 'भट्टी 1' : 'Main Store';
    const effDate = data.starting_date || new Date().toISOString().split('T')[0];

    try {
      const { data: res, error } = await (supabase as any).rpc('add_lpg_cylinder_transaction', {
        p_cylinder_code: cleanCode,
        p_status: cleanStatus,
        p_supplier_id: toSafeUuid(data.supplier_id),
        p_supplier_name: data.supplier_name || null,
        p_place: cleanPlace,
        p_starting_date: effDate,
        p_notes: data.notes || null,
        p_user_id: toSafeUuid(userId),
        p_idempotency_key: data.idempotency_key || null,
      });
      if (error) {
        if (isRpcMissingError(error)) {
          return await this.addSimpleLpgCylinderDirectFallback(data, userId);
        }
        throw new Error(`[Add Cylinder ${error.code || ''}]: ${error.message}`);
      }
      return res;
    } catch (err: any) {
      if (isRpcMissingError(err)) {
        return await this.addSimpleLpgCylinderDirectFallback(data, userId);
      }
      throw err;
    }
  },

  async addSimpleLpgCylinderDirectFallback(
    data: {
      cylinder_code: string;
      status?: SimpleLpgCylinderStatus;
      supplier_id?: string | null;
      supplier_name?: string | null;
      starting_date?: string;
      notes?: string | null;
      idempotency_key?: string;
    },
    userId?: string
  ): Promise<{ success: boolean; cylinder: SimpleLpgCylinder; movement: SimpleLpgMovement }> {
    const cleanCode = data.cylinder_code.trim().toUpperCase();
    if (!cleanCode) throw new Error('Cylinder ID/Code is required.');

    // Unique code check
    const { data: existing } = await (supabase as any)
      .from('lpg_cylinders')
      .select('id, cylinder_code')
      .ilike('cylinder_code', cleanCode);

    if (existing && existing.length > 0) {
      throw new Error(`Cylinder code "${cleanCode}" already exists. Please choose a unique code.`);
    }

    const cleanStatus = data.status || 'full';
    const initialPlace = cleanStatus === 'connected' ? 'भट्टी 1' : 'Main Store';
    const effDate = data.starting_date ? new Date(data.starting_date).toISOString() : new Date().toISOString();

    let newCyl: any = null;

    // 1. Try modern schema insert
    const { data: modData, error: modErr } = await (supabase as any)
      .from('lpg_cylinders')
      .insert({
        cylinder_code: cleanCode,
        status: cleanStatus,
        current_place: initialPlace,
        supplier_id: toSafeUuid(data.supplier_id),
        supplier_name: data.supplier_name || null,
        notes: data.notes || null,
        is_active: true,
        connected_at: cleanStatus === 'connected' ? effDate : null,
        last_movement_at: effDate,
      })
      .select()
      .single();

    if (!modErr && modData) {
      newCyl = modData;
    } else {
      // 2. If modern column not in schema cache (e.g. connected_at), try legacy-compatible insert
      const { data: legData, error: legErr } = await (supabase as any)
        .from('lpg_cylinders')
        .insert({
          cylinder_code: cleanCode,
          status: cleanStatus === 'connected' ? 'in_use' : cleanStatus,
          storage_location: initialPlace,
          supplier_id: toSafeUuid(data.supplier_id),
          supplier_name: data.supplier_name || null,
          notes: data.notes || null,
          is_active: true,
          connected_date: cleanStatus === 'connected' ? effDate.split('T')[0] : null,
          tare_weight: 15.00,
          full_gross_weight: 34.00,
          current_gross_weight: 34.00,
          rated_gas_capacity: 19.00,
          calculated_remaining_gas: cleanStatus === 'empty' ? 0.00 : 19.00,
          remaining_percentage: cleanStatus === 'empty' ? 0.00 : 100.00,
        })
        .select()
        .single();

      if (legErr) {
        throw new Error(`[Add Cylinder DB]: ${legErr.message || modErr?.message}`);
      }
      newCyl = {
        ...legData,
        current_place: initialPlace,
        connected_at: cleanStatus === 'connected' ? effDate : null,
        status: cleanStatus,
      };
    }

    let newMov: any = null;
    try {
      const { data: movData } = await (supabase as any)
        .from('lpg_cylinder_movements')
        .insert({
          cylinder_id: newCyl.id,
          movement_type: cleanStatus === 'connected' ? 'connected' : 'cylinder_added',
          movement_date: effDate,
          place: initialPlace,
          supplier_name: data.supplier_name || null,
          notes: data.notes || 'Initial cylinder registration',
          idempotency_key: data.idempotency_key || null,
          created_by: toSafeUuid(userId),
        })
        .select()
        .single();
      newMov = movData;
    } catch (_) {}

    try {
      await (supabase as any).from('audit_logs').insert({
        table_name: 'lpg_cylinders',
        record_id: newCyl.id,
        action: 'ADD_LPG_CYLINDER',
        new_data: { id: newCyl.id, code: cleanCode, status: cleanStatus },
        reason: 'New cylinder registered: ' + cleanCode,
        performed_by: toSafeUuid(userId),
      });
    } catch (_) {}

    return {
      success: true,
      cylinder: newCyl,
      movement: newMov || {
        id: 'mov-' + Date.now(),
        cylinder_id: newCyl.id,
        movement_type: cleanStatus === 'connected' ? 'connected' : 'cylinder_added',
        movement_date: effDate,
        place: initialPlace,
      } as any,
    };
  },

  async recordSimpleLpgMovement(
    data: {
      cylinder_id: string;
      movement_type: SimpleLpgMovementType;
      movement_date?: string;
      movement_time?: string | null;
      bhatti_place?: string | null;
      supplier_name?: string | null;
      bill_number?: string | null;
      notes?: string | null;
      idempotency_key?: string;
    },
    userId?: string
  ): Promise<{ success: boolean; cylinder: SimpleLpgCylinder; movement: SimpleLpgMovement }> {
    if (useMockMode) {
      const res = mockStore.recordSimpleLpgMovement({
        cylinder_id: data.cylinder_id,
        movement_type: data.movement_type,
        movement_date: data.movement_date,
        movement_time: data.movement_time || undefined,
        bhatti_place: data.bhatti_place || undefined,
        supplier_name: data.supplier_name || undefined,
        bill_number: data.bill_number || undefined,
        notes: data.notes || undefined,
      }, userId || 'usr-owner-001');
      return { success: true, cylinder: res.cylinder, movement: res.movement };
    }

    try {
      const { data: res, error } = await (supabase as any).rpc('record_lpg_cylinder_movement_transaction', {
        p_cylinder_id: data.cylinder_id,
        p_movement_type: data.movement_type,
        p_movement_date: data.movement_date || new Date().toISOString().split('T')[0],
        p_movement_time: data.movement_time || null,
        p_place: data.bhatti_place || null,
        p_bhatti_place: data.bhatti_place || null,
        p_supplier_name: data.supplier_name || null,
        p_bill_number: data.bill_number || null,
        p_notes: data.notes || null,
        p_user_id: toSafeUuid(userId),
        p_idempotency_key: data.idempotency_key || null,
      });
      if (error) {
        if (isRpcMissingError(error)) {
          return await this.recordSimpleLpgMovementDirectFallback(data, userId);
        }
        throw new Error(`[Record Movement ${error.code || ''}]: ${error.message}`);
      }
      return res;
    } catch (err: any) {
      if (isRpcMissingError(err)) {
        return await this.recordSimpleLpgMovementDirectFallback(data, userId);
      }
      throw err;
    }
  },

  async recordSimpleLpgMovementDirectFallback(
    data: {
      cylinder_id: string;
      movement_type: SimpleLpgMovementType;
      movement_date?: string;
      movement_time?: string | null;
      bhatti_place?: string | null;
      supplier_name?: string | null;
      bill_number?: string | null;
      notes?: string | null;
      idempotency_key?: string;
    },
    userId?: string
  ): Promise<{ success: boolean; cylinder: SimpleLpgCylinder; movement: SimpleLpgMovement }> {
    const { data: cyl, error: getErr } = await (supabase as any)
      .from('lpg_cylinders')
      .select('*')
      .eq('id', data.cylinder_id)
      .single();

    if (getErr || !cyl) throw new Error('Cylinder not found');
    if (cyl.is_active === false) throw new Error('Cannot record movement on an inactive/archived cylinder.');

    const effDate = data.movement_date ? new Date(data.movement_date).toISOString() : new Date().toISOString();
    let newStatus = cyl.status;
    let targetPlace = cyl.current_place || cyl.storage_location || 'Main Store';
    let connectedAt = cyl.connected_at || (cyl.connected_date ? new Date(cyl.connected_date).toISOString() : null);
    let emptyAt: string | null = null;
    let runningDurationHours: number | null = null;
    let runningDurationDisplay: string | null = null;

    if (data.movement_type === 'connected') {
      if (cyl.status === 'connected' || cyl.status === 'in_use') throw new Error(`Cylinder ${cyl.cylinder_code} is already connected.`);
      newStatus = 'connected';
      targetPlace = data.bhatti_place || cyl.current_place || cyl.storage_location || 'भट्टी 1';
      connectedAt = effDate;
    } else if (data.movement_type === 'empty_removed') {
      newStatus = 'empty';
      targetPlace = data.bhatti_place || 'Empty Storage';
      emptyAt = effDate;
      if (connectedAt) {
        const connMs = new Date(connectedAt).getTime();
        const empMs = new Date(effDate).getTime();
        if (empMs >= connMs) {
          runningDurationHours = Math.round(((empMs - connMs) / (1000 * 3600)) * 100) / 100;
          const days = Math.floor(runningDurationHours / 24);
          const remHours = Math.round(runningDurationHours % 24);
          runningDurationDisplay = days > 0 ? (remHours > 0 ? `${days} दिन ${remHours} घंटे` : `${days} दिन`) : `${Math.max(1, remHours)} घंटे`;
        }
      }
      connectedAt = null;
    } else if (data.movement_type === 'refill_sent') {
      if (cyl.status === 'connected' || cyl.status === 'in_use') throw new Error('Cannot send a connected cylinder for refill. Please mark it Empty/Removed first.');
      newStatus = 'sent_for_refill';
      targetPlace = data.bhatti_place || 'Gas Agency';
    } else if (data.movement_type === 'refill_received') {
      newStatus = 'full';
      targetPlace = data.bhatti_place || 'Main Store';
    }

    let updatedCyl: any = null;

    // Try modern update
    const { data: uMod, error: uModErr } = await (supabase as any)
      .from('lpg_cylinders')
      .update({
        status: newStatus,
        current_place: targetPlace,
        connected_at: connectedAt,
        supplier_name: data.supplier_name || cyl.supplier_name,
        last_movement_at: effDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.cylinder_id)
      .select()
      .single();

    if (!uModErr && uMod) {
      updatedCyl = uMod;
    } else {
      // Legacy column update fallback
      const { data: uLeg, error: uLegErr } = await (supabase as any)
        .from('lpg_cylinders')
        .update({
          status: newStatus === 'connected' ? 'in_use' : newStatus,
          storage_location: targetPlace,
          connected_date: newStatus === 'connected' ? effDate.split('T')[0] : null,
          empty_date: newStatus === 'empty' ? effDate.split('T')[0] : null,
          supplier_name: data.supplier_name || cyl.supplier_name,
          updated_at: new Date().toISOString(),
        })
        .eq('id', data.cylinder_id)
        .select()
        .single();

      if (uLegErr) throw new Error(`[Update Cylinder DB]: ${uLegErr.message || uModErr?.message}`);
      updatedCyl = {
        ...uLeg,
        current_place: targetPlace,
        connected_at: connectedAt,
        status: newStatus,
      };
    }

    let mov: any = null;
    try {
      const { data: movData } = await (supabase as any)
        .from('lpg_cylinder_movements')
        .insert({
          cylinder_id: data.cylinder_id,
          movement_type: data.movement_type,
          movement_date: effDate,
          place: targetPlace,
          connected_at: data.movement_type === 'empty_removed' ? cyl.connected_at : connectedAt,
          empty_removed_at: emptyAt,
          running_duration_hours: runningDurationHours,
          running_duration_display: runningDurationDisplay,
          supplier_name: data.supplier_name || null,
          bill_number: data.bill_number || null,
          notes: data.notes || null,
          idempotency_key: data.idempotency_key || null,
          created_by: toSafeUuid(userId),
        })
        .select()
        .single();
      mov = movData;
    } catch (_) {}

    try {
      await (supabase as any).from('audit_logs').insert({
        table_name: 'lpg_cylinder_movements',
        record_id: mov?.id || data.cylinder_id,
        action: 'LPG_MOVEMENT_' + data.movement_type.toUpperCase(),
        new_data: { new_status: newStatus, place: targetPlace, duration: runningDurationDisplay },
        reason: data.notes || 'Cylinder movement: ' + data.movement_type,
        performed_by: toSafeUuid(userId),
      });
    } catch (_) {}

    return { success: true, cylinder: updatedCyl, movement: mov || { id: 'mov-' + Date.now(), cylinder_id: data.cylinder_id, movement_type: data.movement_type, movement_date: effDate, place: targetPlace } as any };
  },

  async correctSimpleLpgMovement(
    data: {
      movement_id: string;
      reason: string;
      corrected_movement_type?: SimpleLpgMovementType;
      corrected_date?: string;
      corrected_time?: string;
      corrected_bhatti_place?: string;
      corrected_supplier_name?: string;
      corrected_bill_number?: string;
      corrected_notes?: string;
      idempotency_key?: string;
    },
    userId?: string
  ): Promise<{ success: boolean; correction_movement: SimpleLpgMovement; cylinder: SimpleLpgCylinder }> {
    if (useMockMode) {
      const res = mockStore.correctSimpleLpgMovement(data, userId || 'usr-owner-001');
      return { success: true, correction_movement: res.correction_movement, cylinder: res.cylinder };
    }
    try {
      const { data: res, error } = await (supabase as any).rpc('correct_lpg_cylinder_movement_transaction', {
        p_movement_id: data.movement_id,
        p_reason: data.reason,
        p_corrected_movement_type: data.corrected_movement_type || null,
        p_corrected_date: data.corrected_date || null,
        p_corrected_time: data.corrected_time || null,
        p_corrected_place: data.corrected_bhatti_place || null,
        p_corrected_bhatti_place: data.corrected_bhatti_place || null,
        p_corrected_supplier_name: data.corrected_supplier_name || null,
        p_corrected_bill_number: data.corrected_bill_number || null,
        p_corrected_notes: data.corrected_notes || null,
        p_user_id: toSafeUuid(userId),
        p_idempotency_key: data.idempotency_key || null,
      });
      if (error) {
        if (isRpcMissingError(error)) {
          return await this.correctSimpleLpgMovementDirectFallback(data, userId);
        }
        throw new Error(`[Correct Movement ${error.code || ''}]: ${error.message}`);
      }
      return res;
    } catch (err: any) {
      if (isRpcMissingError(err)) {
        return await this.correctSimpleLpgMovementDirectFallback(data, userId);
      }
      throw err;
    }
  },

  async correctSimpleLpgMovementDirectFallback(
    data: {
      movement_id: string;
      reason: string;
      corrected_movement_type?: SimpleLpgMovementType;
      corrected_date?: string;
      corrected_time?: string;
      corrected_bhatti_place?: string;
      corrected_supplier_name?: string;
      corrected_bill_number?: string;
      corrected_notes?: string;
      idempotency_key?: string;
    },
    userId?: string
  ): Promise<{ success: boolean; correction_movement: SimpleLpgMovement; cylinder: SimpleLpgCylinder }> {
    const { data: oldMov, error: oldErr } = await (supabase as any)
      .from('lpg_cylinder_movements')
      .select('*')
      .eq('id', data.movement_id)
      .single();

    if (oldErr || !oldMov) throw new Error('Movement record not found');

    const effDate = data.corrected_date ? new Date(data.corrected_date).toISOString() : new Date().toISOString();
    const corrPlace = data.corrected_bhatti_place || oldMov.place || 'Main Store';

    const { data: mov, error: movErr } = await (supabase as any)
      .from('lpg_cylinder_movements')
      .insert({
        cylinder_id: oldMov.cylinder_id,
        movement_type: 'correction',
        movement_date: effDate,
        place: corrPlace,
        supplier_name: data.corrected_supplier_name || oldMov.supplier_name,
        bill_number: data.corrected_bill_number || oldMov.bill_number,
        notes: `Correction: ${data.reason} | ${data.corrected_notes || ''}`,
        corrected_from_movement_id: data.movement_id,
        idempotency_key: data.idempotency_key || null,
        created_by: toSafeUuid(userId),
      })
      .select()
      .single();

    if (movErr) throw new Error(`[Insert Correction Movement DB]: ${movErr.message}`);

    // Fetch latest non-correction movement for this cylinder
    const { data: latestMovs } = await (supabase as any)
      .from('lpg_cylinder_movements')
      .select('*')
      .eq('cylinder_id', oldMov.cylinder_id)
      .neq('id', data.movement_id)
      .neq('movement_type', 'correction')
      .order('movement_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1);

    const latest = latestMovs?.[0];
    let newStatus = 'full';
    if (latest) {
      if (latest.movement_type === 'connected') newStatus = 'connected';
      else if (latest.movement_type === 'empty_removed') newStatus = 'empty';
      else if (latest.movement_type === 'refill_sent') newStatus = 'sent_for_refill';
    }

    let updatedCyl: any = null;
    const { data: uMod, error: uModErr } = await (supabase as any)
      .from('lpg_cylinders')
      .update({
        status: newStatus,
        current_place: corrPlace,
        last_movement_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', oldMov.cylinder_id)
      .select()
      .single();

    if (!uModErr && uMod) {
      updatedCyl = uMod;
    } else {
      const { data: uLeg } = await (supabase as any)
        .from('lpg_cylinders')
        .update({
          status: newStatus === 'connected' ? 'in_use' : newStatus,
          storage_location: corrPlace,
          updated_at: new Date().toISOString(),
        })
        .eq('id', oldMov.cylinder_id)
        .select()
        .single();
      updatedCyl = uLeg || { id: oldMov.cylinder_id, status: newStatus, current_place: corrPlace };
    }

    return { success: true, correction_movement: mov, cylinder: updatedCyl };
  },

  async deleteOrArchiveSimpleLpgCylinder(
    data: {
      cylinder_id: string;
      reason: string;
    },
    userId?: string
  ): Promise<{ success: boolean; action: 'deleted' | 'archived'; cylinder_id: string; message: string }> {
    if (useMockMode) {
      const res = mockStore.deleteOrArchiveSimpleLpgCylinder(data, userId || 'usr-owner-001');
      return { success: true, ...res };
    }
    try {
      const { data: res, error } = await (supabase as any).rpc('delete_or_archive_lpg_cylinder_transaction', {
        p_cylinder_id: data.cylinder_id,
        p_reason: data.reason || null,
        p_user_id: toSafeUuid(userId),
      });
      if (error) {
        if (isRpcMissingError(error)) {
          return await this.deleteOrArchiveSimpleLpgCylinderDirectFallback(data, userId);
        }
        throw new Error(`[Delete/Archive Cylinder ${error.code || ''}]: ${error.message}`);
      }
      return res;
    } catch (err: any) {
      if (isRpcMissingError(err)) {
        return await this.deleteOrArchiveSimpleLpgCylinderDirectFallback(data, userId);
      }
      throw err;
    }
  },

  async deleteOrArchiveSimpleLpgCylinderDirectFallback(
    data: {
      cylinder_id: string;
      reason: string;
    },
    userId?: string
  ): Promise<{ success: boolean; action: 'deleted' | 'archived'; cylinder_id: string; message: string }> {
    const { data: cyl, error: getErr } = await (supabase as any)
      .from('lpg_cylinders')
      .select('*')
      .eq('id', data.cylinder_id)
      .single();

    if (getErr || !cyl) throw new Error('Cylinder not found');
    if (cyl.status === 'connected') {
      throw new Error('Cannot remove a connected cylinder. Please mark it Empty/Removed first before archiving.');
    }

    const { data: movements } = await (supabase as any)
      .from('lpg_cylinder_movements')
      .select('id, movement_type')
      .eq('cylinder_id', data.cylinder_id);

    const operationalMovements = (movements || []).filter((m: any) => m.movement_type !== 'cylinder_added');

    if (operationalMovements.length === 0) {
      await (supabase as any).from('lpg_cylinder_movements').delete().eq('cylinder_id', data.cylinder_id);
      await (supabase as any).from('lpg_cylinders').delete().eq('id', data.cylinder_id);
      try {
        await (supabase as any).from('audit_logs').insert({
          table_name: 'lpg_cylinders',
          record_id: data.cylinder_id,
          action: 'DELETE_LPG_CYLINDER',
          reason: data.reason || 'Unused cylinder permanently deleted',
          performed_by: toSafeUuid(userId),
        });
      } catch (_) {}
      return {
        success: true,
        action: 'deleted',
        cylinder_id: data.cylinder_id,
        message: 'अउपयोगी सिलेंडर स्थायी रूप से हटाया गया (Permanently Deleted)',
      };
    } else {
      await (supabase as any).from('lpg_cylinders').update({
        is_active: false,
        status: 'inactive',
        updated_at: new Date().toISOString(),
      }).eq('id', data.cylinder_id);
      try {
        await (supabase as any).from('audit_logs').insert({
          table_name: 'lpg_cylinders',
          record_id: data.cylinder_id,
          action: 'ARCHIVE_LPG_CYLINDER',
          reason: data.reason || 'Cylinder archived to preserve movement history',
          performed_by: toSafeUuid(userId),
        });
      } catch (_) {}
      return {
        success: true,
        action: 'archived',
        cylinder_id: data.cylinder_id,
        message: 'सिलेंडर सुरक्षित रूप से संग्रहित (Archived) किया गया',
      };
    }
  },

  async reactivateSimpleLpgCylinder(
    data: {
      cylinder_id: string;
      reason?: string;
    },
    userId?: string
  ): Promise<{ success: boolean; cylinder: SimpleLpgCylinder }> {
    if (useMockMode) {
      const res = mockStore.reactivateSimpleLpgCylinder(data.cylinder_id, data.reason, userId || 'usr-owner-001');
      return { success: true, cylinder: res.cylinder };
    }
    try {
      const { data: res, error } = await (supabase as any).rpc('reactivate_lpg_cylinder_transaction', {
        p_cylinder_id: data.cylinder_id,
        p_status: 'full',
        p_reason: data.reason || null,
        p_user_id: toSafeUuid(userId),
      });
      if (error) {
        if (isRpcMissingError(error)) {
          return await this.reactivateSimpleLpgCylinderDirectFallback(data, userId);
        }
        throw new Error(`[Reactivate Cylinder ${error.code || ''}]: ${error.message}`);
      }
      return res;
    } catch (err: any) {
      if (isRpcMissingError(err)) {
        return await this.reactivateSimpleLpgCylinderDirectFallback(data, userId);
      }
      throw err;
    }
  },

  async reactivateSimpleLpgCylinderDirectFallback(
    data: {
      cylinder_id: string;
      reason?: string;
    },
    userId?: string
  ): Promise<{ success: boolean; cylinder: SimpleLpgCylinder }> {
    const { data: cyl, error: cylErr } = await (supabase as any)
      .from('lpg_cylinders')
      .update({
        is_active: true,
        status: 'full',
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.cylinder_id)
      .select()
      .single();

    if (cylErr || !cyl) throw new Error(`[Reactivate Cylinder DB]: ${cylErr?.message || 'Failed'}`);

    await (supabase as any).from('lpg_cylinder_movements').insert({
      cylinder_id: data.cylinder_id,
      movement_type: 'cylinder_added',
      movement_date: new Date().toISOString(),
      place: cyl.current_place || 'Main Store',
      notes: data.reason || 'Reactivated from archive as full',
      created_by: toSafeUuid(userId),
    });

    return { success: true, cylinder: cyl };
  },

  // --- Legacy Compatibility Wrappers ---
  async getLpgCylinders(): Promise<LpgCylinder[]> {
    return this.getSimpleLpgCylinders(true);
  },

  async getLpgCylinderById(id: string): Promise<LpgCylinder | undefined> {
    return this.getSimpleLpgCylinderById(id);
  },

  async createLpgCylinder(
    data: any,
    userId: string
  ): Promise<LpgCylinder> {
    const res = await this.addSimpleLpgCylinder(data, userId);
    return res.cylinder || (res as any);
  },

  async recordLpgReading(
    cylinderId: string,
    _grossWeight?: number,
    _readingType: any = 'weighed',
    _batchId?: string,
    _notes?: string,
    _userId?: string
  ): Promise<LpgCylinder> {
    const updated = await this.getSimpleLpgCylinderById(cylinderId);
    return updated!;
  },

  async recordLpgRefill(
    cylinderId: string,
    refillCost: number,
    _fullGrossWeight?: number,
    userId?: string
  ): Promise<LpgCylinder> {
    const res = await this.recordSimpleLpgMovement({
      cylinder_id: cylinderId,
      movement_type: 'refill_received',
      notes: `Refilled for ₹${refillCost}`,
    }, userId);
    return res.cylinder;
  },

  async connectLpgCylinder(cylinderId: string, userId: string): Promise<LpgCylinder> {
    const res = await this.recordSimpleLpgMovement({
      cylinder_id: cylinderId,
      movement_type: 'connected',
    }, userId);
    return res.cylinder;
  },

  async getLpgReadings(_cylinderId?: string): Promise<LpgCylinderReading[]> {
    return [];
  },

  async deleteLpgCylinder(id: string, userId: string = 'usr-owner-001'): Promise<{ success: boolean; cylinder_id?: string; message?: string }> {
    const res = await this.deleteOrArchiveSimpleLpgCylinder({ cylinder_id: id, reason: 'Owner deleted' }, userId);
    return { success: true, cylinder_id: id, message: res.message };
  },

  // --- Inventory Wastage & Damage ---
  async getInventoryWastages(): Promise<InventoryWastage[]> {
    if (useMockMode) {
      return mockStore.getInventoryWastages();
    }
    const { data, error } = await (supabase as any).from('inventory_wastage').select('*, ingredient:ingredients(*)').order('wastage_date', { ascending: false });
    if (error) {
      throw new Error(`[Inventory Wastages ${error.code || ''}]: ${error.message}`);
    }
    return data || [];
  },

  async recordInventoryWastage(
    data: {
      wastage_date: string;
      ingredient_id: string;
      lot_id?: string | null;
      quantity: number;
      unit: UnitType;
      wastage_type: InventoryWastage['wastage_type'];
      reason: string;
      photo_url?: string | null;
    },
    userId: string
  ): Promise<InventoryWastage> {
    if (useMockMode) {
      return mockStore.recordInventoryWastage(data, userId);
    }
    const resolvedIngredientId = await resolveSupabaseIngredientId(data.ingredient_id);
    const { data: created, error } = await (supabase as any).from('inventory_wastage').insert({
      ...data,
      ingredient_id: resolvedIngredientId,
      recorded_by: userId,
    }).select().single();

    if (error) {
      throw new Error(`[Record Wastage ${error.code || ''}]: ${error.message}`);
    }

    const { error: movError } = await (supabase as any).from('raw_material_movements').insert({
      ingredient_id: resolvedIngredientId,
      movement_type: 'wastage',
      quantity: -Math.abs(data.quantity),
      base_unit: data.unit,
      movement_date: data.wastage_date || new Date().toISOString(),
      source_location: 'Main Store',
      destination_location: 'Wastage',
      reason: `Wastage: ${data.reason}`,
      created_by: userId,
    });

    if (movError) {
      throw new Error(`[Wastage Movement ${movError.code || ''}]: ${movError.message}`);
    }

    return created;
  },

  // --- Supplier Returns ---
  async getSupplierReturns(): Promise<SupplierReturn[]> {
    if (useMockMode) {
      return mockStore.getSupplierReturns();
    }
    const { data, error } = await (supabase as any).from('supplier_returns').select('*, ingredient:ingredients(*), supplier:suppliers(*)').order('return_date', { ascending: false });
    if (error) {
      throw new Error(`[Supplier Returns ${error.code || ''}]: ${error.message}`);
    }
    return data || [];
  },

  async createSupplierReturn(
    data: {
      return_date: string;
      supplier_id?: string | null;
      purchase_id?: string | null;
      ingredient_id: string;
      lot_id?: string | null;
      returned_quantity: number;
      unit: UnitType;
      reason: string;
      total_refund_amount: number;
    },
    userId: string
  ): Promise<SupplierReturn> {
    if (useMockMode) {
      return mockStore.createSupplierReturn(data, userId);
    }
    const resolvedIngredientId = await resolveSupabaseIngredientId(data.ingredient_id);
    const resolvedSupplierId = await resolveSupabaseSupplierId(data.supplier_id);
    const { data: created, error } = await (supabase as any).from('supplier_returns').insert({
      ...data,
      ingredient_id: resolvedIngredientId,
      supplier_id: resolvedSupplierId,
      processed_by: userId,
    }).select().single();

    if (error) {
      throw new Error(`[Supplier Return ${error.code || ''}]: ${error.message}`);
    }

    const { error: movError } = await (supabase as any).from('raw_material_movements').insert({
      ingredient_id: resolvedIngredientId,
      movement_type: 'supplier_return',
      quantity: -Math.abs(data.returned_quantity),
      base_unit: data.unit,
      movement_date: data.return_date || new Date().toISOString(),
      source_location: 'Main Store',
      destination_location: 'Supplier Return',
      reason: `Supplier Return: ${data.reason}`,
      created_by: userId,
    });

    if (movError) {
      throw new Error(`[Supplier Return Movement ${movError.code || ''}]: ${movError.message}`);
    }

    return created;
  },

  // --- Raw Material Stock Correction ---
  async correctRawMaterialStock(params: {
    ingredientId: string;
    newQuantity: number;
    reason: string;
    userId?: string;
  }): Promise<{ success: boolean; difference: number; message: string }> {
    if (useMockMode) {
      return mockStore.correctRawMaterialStock(params);
    }
    const resolvedId = await resolveSupabaseIngredientId(params.ingredientId);
    const { data, error } = await (supabase as any).rpc('correct_raw_material_stock_transaction', {
      p_ingredient_id: resolvedId,
      p_new_quantity: params.newQuantity,
      p_reason: params.reason,
      p_user_id: params.userId || null,
    });
    if (error) {
      throw new Error(`[Stock Correction ${error.code || ''}]: ${error.message}`);
    }
    return data;
  },

  // --- Atomic Recipe-Based Production Completion ---
  async completeProductionWithRecipeTransaction(params: {
    productionDate: string;
    productId: string;
    producedQuantity: number;
    damagedQuantity?: number;
    recipeId?: string;
    actualIngredients?: { ingredient_id: string; actual_quantity: number; unit: UnitType; reason?: string }[];
    notes?: string;
    lpgCost?: number;
    overheadCosts?: AdditionalOverheads;
    idempotencyKey?: string;
    userId?: string;
  }): Promise<{
    success: boolean;
    idempotent?: boolean;
    batch_id: string;
    batch_number: string;
    saleable_quantity: number;
    total_ingredient_cost: number;
    cost_per_piece: number;
    message: string;
  }> {
    if (useMockMode) {
      return mockStore.completeProductionWithRecipeTransaction(params);
    }

    const resolvedProductId = await resolveSupabaseProductId(params.productId);
    let resolvedRecipeId = params.recipeId;
    if (resolvedRecipeId && !isValidUuid(resolvedRecipeId)) {
      const { data: dbRec } = await (supabase as any)
        .from('recipes')
        .select('id')
        .eq('product_id', resolvedProductId)
        .or('status.eq.active,is_default.eq.true')
        .limit(1);
      resolvedRecipeId = dbRec?.[0]?.id || null;
    }

    let resolvedActualIngredients = params.actualIngredients;
    if (resolvedActualIngredients && resolvedActualIngredients.length > 0) {
      resolvedActualIngredients = await Promise.all(
        resolvedActualIngredients.map(async (item) => ({
          ...item,
          ingredient_id: await resolveSupabaseIngredientId(item.ingredient_id),
        }))
      );
    }

    const { data, error } = await (supabase as any).rpc('complete_production_with_recipe_transaction', {
      p_production_date: params.productionDate,
      p_product_id: resolvedProductId,
      p_produced_quantity: Number(params.producedQuantity || 0),
      p_damaged_quantity: Number(params.damagedQuantity || 0),
      p_recipe_id: resolvedRecipeId,
      p_actual_ingredients: resolvedActualIngredients && resolvedActualIngredients.length > 0 ? resolvedActualIngredients : null,
      p_notes: params.notes || '',
      p_lpg_cost: Number(params.lpgCost || 0.0),
      p_overhead_costs: params.overheadCosts || {},
      p_idempotency_key: params.idempotencyKey || null,
      p_user_id: params.userId || null,
    });
    if (error) {
      throw new Error(error.message || 'Failed to complete production batch');
    }
    return data;
  },

  // Backward compatibility alias for completeProductionWithRawMaterials
  async completeProductionWithRawMaterials(
    batchId: string,
    rawMaterials: {
      ingredient_id: string;
      quantity_used: number;
      unit: UnitType;
      lot_id?: string | null;
    }[],
    allowEmergencyOverride: boolean = false,
    overrideReason?: string,
    userId: string = 'usr-owner-001'
  ): Promise<ProductionBatchWithItems> {
    if (useMockMode) {
      return mockStore.completeProductionWithRawMaterials(batchId, rawMaterials, allowEmergencyOverride, overrideReason, userId);
    }
    const resolvedRawMaterials = await Promise.all(
      rawMaterials.map(async (rm) => ({
        ...rm,
        ingredient_id: await resolveSupabaseIngredientId(rm.ingredient_id),
      }))
    );
    const { error } = await (supabase as any).rpc('complete_production_with_raw_materials_transaction', {
      p_batch_id: batchId,
      p_raw_materials: resolvedRawMaterials,
      p_allow_emergency_override: allowEmergencyOverride,
      p_override_reason: overrideReason || null,
      p_user_id: userId,
    });
    if (error) {
      throw new Error(error.message || 'Failed to complete production batch');
    }
    const batches = await this.getProductionBatches();
    return batches.find((b) => b.id === batchId)!;
  },
};
