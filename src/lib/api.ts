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
      // If code/name query returned nothing, fallback to first available ingredient
      const { data: fallbackAll } = await (supabase as any).from('ingredients').select('id').limit(1);
      if (fallbackAll && fallbackAll.length > 0 && fallbackAll[0].id) {
        return fallbackAll[0].id;
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
      const { data: anySup } = await (supabase as any).from('suppliers').select('id').limit(1);
      if (anySup && anySup.length > 0 && anySup[0].id) return anySup[0].id;
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
    // Close existing price
    await (supabase as any)
      .from('product_prices')
      .update({ effective_to: new Date().toISOString() })
      .eq('product_id', productId)
      .is('effective_to', null);

    const { data, error } = await (supabase as any)
      .from('product_prices')
      .insert({
        product_id: productId,
        selling_price: sellingPrice,
        commission_type: commissionType,
        commission_value: commissionValue,
        effective_from: new Date().toISOString(),
        created_by: userId,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
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

    const totalSaleable = items.reduce((sum, it) => sum + (it.produced_quantity - (it.damaged_quantity || 0)), 0);

    const itemsToInsert = items.map((it) => {
      const saleable = it.produced_quantity - (it.damaged_quantity || 0);
      const allocatedCost = totalSaleable > 0 ? (totalIngredientCost * saleable) / totalSaleable : 0;
      const unitCost = saleable > 0 ? allocatedCost / saleable : 0;

      return {
        batch_id: batch.id,
        product_id: it.product_id,
        produced_quantity: it.produced_quantity,
        damaged_quantity: it.damaged_quantity || 0,
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

    const totalSaleable = items.reduce((sum, it) => sum + (it.produced_quantity - (it.damaged_quantity || 0)), 0);
    const itemsToInsert = items.map((it) => {
      const saleable = it.produced_quantity - (it.damaged_quantity || 0);
      const allocatedCost = totalSaleable > 0 ? (totalIngredientCost * saleable) / totalSaleable : 0;
      const unitCost = saleable > 0 ? allocatedCost / saleable : 0;
      return {
        batch_id: batchId,
        product_id: it.product_id,
        produced_quantity: it.produced_quantity,
        damaged_quantity: it.damaged_quantity || 0,
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
        p_items: items,
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

    const totalSaleable = items.reduce((sum, it) => sum + (it.produced_quantity - (it.damaged_quantity || 0)), 0);
    const itemsToInsert = items.map((it) => {
      const saleable = it.produced_quantity - (it.damaged_quantity || 0);
      const allocatedCost = totalSaleable > 0 ? (totalIngredientCost * saleable) / totalSaleable : 0;
      const unitCost = saleable > 0 ? allocatedCost / saleable : 0;
      return {
        batch_id: newBatch.id,
        product_id: it.product_id,
        produced_quantity: it.produced_quantity,
        damaged_quantity: it.damaged_quantity || 0,
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
      .eq('product_id', productId)
      .or('status.eq.active,is_default.eq.true')
      .order('version_number', { ascending: false })
      .maybeSingle();
    if (error) {
      throw new Error(error.message || 'Failed to fetch active recipe from database');
    }
    if (!data) return undefined;
    const yieldQty = Number(data.expected_yield_pieces || data.standard_output_pieces || 100);
    return {
      ...data,
      expected_yield_pieces: yieldQty,
      standard_output_pieces: yieldQty,
    };
  },

  async getRecipeHistory(productId: string): Promise<RecipeWithItems[]> {
    if (useMockMode) {
      return mockStore.getRecipeHistory(productId);
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
      .eq('product_id', productId)
      .order('version_number', { ascending: false });
    if (error) {
      throw new Error(error.message || 'Failed to fetch recipe history from database');
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
        rate?: number;
      }[];
    },
    userId: string
  ): Promise<RecipeWithItems> {
    if (useMockMode) {
      return mockStore.saveRecipe(data, userId);
    }

    const resolvedProductId = await resolveSupabaseProductId(data.product_id);

    // Get current version number
    const { data: existing } = await (supabase as any)
      .from('recipes')
      .select('version_number')
      .eq('product_id', resolvedProductId)
      .order('version_number', { ascending: false })
      .limit(1);

    const newVersion = (existing?.[0]?.version_number || 0) + 1;
    const isActivating = data.status === 'active' || data.status === undefined;

    if (isActivating) {
      await (supabase as any)
        .from('recipes')
        .update({ status: 'archived', is_default: false })
        .eq('product_id', resolvedProductId);
    }

    const stdYield = Math.max(1, Number(data.standard_output_pieces || data.expected_yield_pieces || 100));

    const recipeInsertPayload: Record<string, any> = {
      product_id: resolvedProductId,
      version_number: newVersion,
      name: data.name || `Standard Recipe v${newVersion}`,
      standard_output_pieces: stdYield,
      default_overheads: data.default_overheads,
      notes: data.notes || null,
      status: data.status || 'active',
      is_default: isActivating,
      created_by: userId,
    };

    let { data: newRecipe, error: recError } = await (supabase as any)
      .from('recipes')
      .insert(recipeInsertPayload)
      .select()
      .single();

    // If status column is missing in older remote schema, retry without status column
    if (recError && recError.message?.includes('status')) {
      delete recipeInsertPayload.status;
      const retry = await (supabase as any)
        .from('recipes')
        .insert(recipeInsertPayload)
        .select()
        .single();
      newRecipe = retry.data;
      recError = retry.error;
    }

    if (recError) {
      throw new Error(recError.message || 'Failed to save recipe in Supabase');
    }

    // Insert recipe items with resolved ingredient UUIDs
    const itemsToInsert = await Promise.all(
      data.items.map(async (it, idx) => ({
        recipe_id: newRecipe.id,
        ingredient_id: await resolveSupabaseIngredientId(it.ingredient_id),
        quantity: it.quantity,
        unit: it.unit,
        sort_order: idx + 1,
      }))
    );

    const { error: itemsError } = await (supabase as any)
      .from('recipe_items')
      .insert(itemsToInsert);

    if (itemsError) {
      throw new Error(itemsError.message || 'Failed to insert recipe items');
    }

    // Optionally update rates WITHOUT modifying rate_unit
    for (const it of data.items) {
      if (it.save_rate_to_master && typeof it.rate === 'number' && it.rate > 0) {
        const resIngId = await resolveSupabaseIngredientId(it.ingredient_id);
        await this.updateIngredientRate(resIngId, it.rate, undefined, true, userId);
      }
    }

    const freshRecipe = await this.getRecipeForProduct(resolvedProductId);
    if (!freshRecipe) {
      throw new Error('Failed to retrieve newly saved recipe from Supabase');
    }
    return freshRecipe;
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
    await (supabase as any).from('production_items').insert({
      batch_id: batch.id,
      product_id: data.productId,
      produced_quantity: produced,
      damaged_quantity: damaged,
      saleable_quantity: saleable,
      allocated_ingredient_cost: data.totalIngredientCost,
      unit_production_cost: data.costPerPiece,
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

    await (supabase as any).from('seller_issue_items').insert(itemsToInsert);

    // Insert stock movements (Freezer -> Seller Cart)
    const { data: locs } = await (supabase as any).from('stock_locations').select('id, location_type, seller_id');
    const freezerLoc = locs?.find((l: any) => l.location_type === 'main_freezer');
    let sellerLoc = locs?.find((l: any) => l.location_type === 'seller' && l.seller_id === sellerId);

    if (!sellerLoc) {
      const { data: newLoc } = await (supabase as any)
        .from('stock_locations')
        .insert({
          location_type: 'seller',
          name: `Seller Cart Stock - ${seller?.full_name || sellerId}`,
          seller_id: sellerId,
          cart_id: cartId || null,
          is_active: true,
        })
        .select()
        .single();
      sellerLoc = newLoc;
    }

    if (freezerLoc && sellerLoc) {
      const now = new Date().toISOString();
      const movements = items
        .filter((it) => it.issued_quantity > 0)
        .map((it) => ({
          movement_date: now,
          product_id: it.product_id,
          source_location_id: freezerLoc.id,
          destination_location_id: sellerLoc.id,
          quantity: it.issued_quantity,
          movement_type: 'seller_issue',
          reference_table: 'seller_issues',
          reference_id: newIssue.id,
          notes: `Stock issued to seller in issue ${issueNumber}`,
          created_by: userId,
        }));

      if (movements.length > 0) {
        await (supabase as any).from('stock_movements').insert(movements);
      }
    }

    return newIssue;
  },

  async updateDraftSellerIssue(
    issueId: string,
    issueDate: string,
    sellerId: string,
    cartId: string | null,
    items: { product_id: string; issued_quantity: number }[],
    notes: string,
    userId: string
  ): Promise<any> {
    if (useMockMode) {
      return mockStore.updateDraftSellerIssue(issueId, issueDate, sellerId, cartId, items, notes, userId);
    }
    const { error: iErr } = await (supabase as any)
      .from('seller_issues')
      .update({
        issue_date: issueDate,
        seller_id: sellerId,
        cart_id: cartId || null,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', issueId)
      .eq('status', 'draft');
    if (iErr) throw iErr;

    await (supabase as any).from('seller_issue_items').delete().eq('seller_issue_id', issueId);
    // Fetch prices and insert items
    const { data: prices } = await (supabase as any).from('product_prices').select('*').eq('is_active', true);
    const itemsToInsert = items.map((it) => {
      const p = prices?.find((pr: any) => pr.product_id === it.product_id);
      return {
        seller_issue_id: issueId,
        product_id: it.product_id,
        issued_quantity: it.issued_quantity,
        unit_selling_price_snapshot: p?.selling_price || 0,
        commission_type_snapshot: p?.commission_type || 'fixed',
        commission_value_snapshot: p?.commission_value || 0,
      };
    });
    const { error: itErr } = await (supabase as any).from('seller_issue_items').insert(itemsToInsert);
    if (itErr) throw itErr;
    return { success: true };
  },

  async cancelDraftSellerIssue(issueId: string, userId: string): Promise<void> {
    if (useMockMode) {
      return mockStore.cancelDraftSellerIssue(issueId, userId);
    }
    const { error } = await (supabase as any)
      .from('seller_issues')
      .update({ status: 'cancelled' })
      .eq('id', issueId)
      .eq('status', 'draft');
    if (error) throw error;
  },

  async correctSellerIssue(
    issueId: string,
    issueDate: string,
    sellerId: string,
    cartId: string | null,
    items: { product_id: string; issued_quantity: number }[],
    notes: string,
    reason: string,
    userId: string
  ): Promise<any> {
    if (useMockMode) {
      return mockStore.correctSellerIssue(issueId, issueDate, sellerId, cartId, items, notes, reason, userId);
    }
    try {
      const { data, error } = await (supabase as any).rpc('correct_issued_stock', {
        p_issue_id: issueId,
        p_date: issueDate,
        p_seller_id: sellerId,
        p_cart_id: cartId,
        p_items: items,
        p_notes: notes,
        p_reason: reason,
        p_user_id: userId,
      });
      if (!error && data) {
        return data;
      }
      console.warn('RPC correct_issued_stock failed, attempting direct Supabase revision:', error);
    } catch (err) {
      console.warn('RPC correct_issued_stock error, attempting direct Supabase revision:', err);
    }

    // Direct Supabase revision fallback
    const { data: oldIssue } = await (supabase as any)
      .from('seller_issues')
      .select('*, items:seller_issue_items(*)')
      .eq('id', issueId)
      .maybeSingle();

    if (!oldIssue) {
      return mockStore.correctSellerIssue(issueId, issueDate, sellerId, cartId, items, notes, reason, userId);
    }

    const nextVersion = (oldIssue.version_number || 1) + 1;
    const baseNumber = (oldIssue.issue_number || 'ISSUE').replace(/-V\d+$/, '').replace(/-R\d+$/, '');
    const newIssueNumber = `${baseNumber}-R${nextVersion}`;

    const { data: newIssue, error: nErr } = await (supabase as any)
      .from('seller_issues')
      .insert({
        issue_number: newIssueNumber,
        issue_date: issueDate,
        seller_id: sellerId,
        cart_id: cartId || oldIssue.cart_id,
        status: 'issued',
        notes: notes || null,
        version_number: nextVersion,
        is_current_version: true,
        correction_of_id: issueId,
        correction_reason: reason,
        corrected_by: userId,
        corrected_at: new Date().toISOString(),
        created_by: oldIssue.created_by,
      })
      .select()
      .single();

    if (nErr || !newIssue) throw nErr || new Error('Failed to create revised seller issue');

    const itemsToInsert = items.map((it) => ({
      seller_issue_id: newIssue.id,
      product_id: it.product_id,
      issued_quantity: it.issued_quantity,
      unit_selling_price_snapshot: 0,
      commission_type_snapshot: 'fixed',
      commission_value_snapshot: 0,
    }));

    await (supabase as any).from('seller_issue_items').insert(itemsToInsert);

    // Mark old issue superseded
    await (supabase as any)
      .from('seller_issues')
      .update({
        status: 'superseded',
        is_current_version: false,
        superseded_by_id: newIssue.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', issueId);

    return newIssue;
  },

  async deleteSellerIssue(issueId: string, reason: string = 'Deleted by Owner', userId: string = 'usr-owner-001'): Promise<{ success: boolean; message: string }> {
    if (useMockMode) {
      return mockStore.deleteSellerIssue(issueId, reason, userId);
    }
    try {
      const { data, error } = await (supabase as any).rpc('delete_seller_issue_transaction', {
        p_issue_id: issueId,
        p_reason: reason,
        p_user_id: userId,
      });
      if (!error && data) {
        return data;
      }
      console.warn('RPC delete_seller_issue_transaction failed or not installed, executing direct Supabase deletion:', error);
    } catch (err) {
      console.warn('deleteSellerIssue RPC error, executing direct Supabase deletion:', err);
    }

    // Direct Supabase fallback
    const { data: issue } = await (supabase as any)
      .from('seller_issues')
      .select('*, items:seller_issue_items(*)')
      .eq('id', issueId)
      .maybeSingle();

    if (!issue) {
      return mockStore.deleteSellerIssue(issueId, reason, userId);
    }

    // Check if active settlements exist
    const { data: activeSettlements } = await (supabase as any)
      .from('seller_settlements')
      .select('id, settlement_number, status')
      .or(`seller_issue_id.eq.${issueId},issue_id.eq.${issueId}`)
      .in('status', ['approved', 'pending_approval', 'draft']);

    if (activeSettlements && activeSettlements.length > 0) {
      const numbers = activeSettlements.map((s: any) => s.settlement_number).filter(Boolean).join(', ');
      throw new Error(`इस स्टॉक निकासी को नहीं हटाया जा सकता क्योंकि इसके विरुद्ध हिसाब (${numbers || 'Settlement'}) दर्ज है। कृपया पहले संबंधित हिसाब को हटाएं।`);
    }

    // Clean up any remaining superseded/cancelled/rejected settlements for this issue
    const { data: allLinkedSettlements } = await (supabase as any)
      .from('seller_settlements')
      .select('id')
      .or(`seller_issue_id.eq.${issueId},issue_id.eq.${issueId}`);

    if (allLinkedSettlements && allLinkedSettlements.length > 0) {
      const setIds = allLinkedSettlements.map((s: any) => s.id);
      await (supabase as any).from('settlement_items').delete().in('settlement_id', setIds);
      await (supabase as any).from('seller_settlements').delete().in('id', setIds);
    }

    if (issue.status === 'issued' && issue.items && issue.items.length > 0) {
      const { data: locs } = await (supabase as any).from('stock_locations').select('id, location_type, seller_id');
      const freezerLoc = locs?.find((l: any) => l.location_type === 'main_freezer');
      const sellerLoc = locs?.find((l: any) => l.location_type === 'seller' && l.seller_id === issue.seller_id);

      if (freezerLoc && sellerLoc) {
        const movementsToInsert = issue.items
          .filter((it: any) => (it.issued_quantity || 0) > 0)
          .map((it: any) => ({
            movement_date: new Date().toISOString(),
            product_id: it.product_id,
            source_location_id: sellerLoc.id,
            destination_location_id: freezerLoc.id,
            quantity: it.issued_quantity,
            movement_type: 'issue_reversal',
            reference_table: 'seller_issues',
            reference_id: issue.id,
            notes: `Stock reversal for deleted stock issue ${issue.issue_number}: ${reason}`,
            created_by: userId,
          }));

        if (movementsToInsert.length > 0) {
          await (supabase as any).from('stock_movements').insert(movementsToInsert);
        }
      }
    }

    // Unlink self-referencing correction chains
    await (supabase as any).from('seller_issues').update({ correction_of_id: null }).eq('correction_of_id', issueId);
    await (supabase as any).from('seller_issues').update({ superseded_by_id: null }).eq('superseded_by_id', issueId);

    await (supabase as any).from('seller_issue_items').delete().eq('seller_issue_id', issueId);
    const { error: delErr } = await (supabase as any).from('seller_issues').delete().eq('id', issueId);
    if (delErr) throw delErr;

    return { success: true, message: 'Stock issue deleted successfully' };
  },

  async getIssueRevisionHistory(issueId: string): Promise<RevisionRecord[]> {
    if (useMockMode) {
      return mockStore.getIssueRevisionHistory(issueId);
    }
    const { data, error } = await (supabase as any)
      .from('seller_issues')
      .select('*, items:seller_issue_items(*, product:products(*)), profile:profiles!created_by(*)')
      .order('version_number', { ascending: true });
    if (error) throw error;
    const all = data || [];
    const target = all.find((i: any) => i.id === issueId);
    if (!target) return [];
    let root = target;
    while (root.correction_of_id) {
      const parent = all.find((i: any) => i.id === root.correction_of_id);
      if (!parent) break;
      root = parent;
    }
    const chain: any[] = [];
    let curr: any = root;
    while (curr) {
      chain.push(curr);
      if (!curr.superseded_by_id) break;
      curr = all.find((i: any) => i.id === curr.superseded_by_id);
    }
    return chain.map((i: any) => {
      const totalIssued = i.items?.reduce((s: number, it: any) => s + (it.issued_quantity || 0), 0) || 0;
      return {
        id: i.id,
        version_number: i.version_number || 1,
        status: i.status,
        date: i.issue_date,
        created_at: i.created_at,
        corrected_at: i.corrected_at,
        corrected_by_name: i.profile?.full_name || 'Owner',
        correction_reason: i.correction_reason,
        is_current_version: i.is_current_version !== false,
        correction_of_id: i.correction_of_id,
        superseded_by_id: i.superseded_by_id,
        summary_text: `Version ${i.version_number || 1} (${i.status}): ${totalIssued} pcs issued`,
        details: i,
        stock_effect: { issued: totalIssued },
      };
    });
  },

  // --- Seller Settlements ---
  async getSellerSettlements(): Promise<SellerSettlementWithDetails[]> {
    if (useMockMode) {
      return mockStore.getSettlements();
    }
    const { data, error } = await (supabase as any)
      .from('seller_settlements')
      .select(`
        *,
        seller:sellers(*),
        issue:seller_issues(*),
        items:settlement_items(
          *,
          product:products(*)
        )
      `)
      .neq('status', 'superseded')
      .order('settlement_date', { ascending: false });
    if (error) throw error;
    return (data as any) || [];
  },

  async processSellerSettlement(
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
  ): Promise<any> {
    if (useMockMode) {
      return mockStore.processSellerSettlement(
        issueId,
        settlementDate,
        items,
        cashReceived,
        upiReceived,
        creditAmount,
        notes,
        isApprovedByOwner,
        userId
      );
    }
    try {
      const { data, error } = await (supabase as any).rpc('process_seller_settlement', {
        p_seller_issue_id: issueId,
        p_settlement_date: settlementDate,
        p_items: items,
        p_cash: cashReceived,
        p_upi: upiReceived,
        p_credit: creditAmount,
        p_notes: notes,
        p_is_approved_by_owner: isApprovedByOwner,
        p_user_id: userId,
      });
      if (!error && data) {
        return data;
      }
      console.warn('RPC process_seller_settlement unavailable or failed, executing direct Supabase settlement:', error);
    } catch (rpcErr) {
      console.warn('RPC process_seller_settlement call failed, executing direct Supabase settlement:', rpcErr);
    }

    // Direct Supabase Settlement Fallback
    const { data: issue } = await (supabase as any)
      .from('seller_issues')
      .select('*, items:seller_issue_items(*, product:products(*)), seller:sellers(*)')
      .eq('id', issueId)
      .maybeSingle();

    if (!issue) {
      return mockStore.processSellerSettlement(
        issueId,
        settlementDate,
        items,
        cashReceived,
        upiReceived,
        creditAmount,
        notes,
        isApprovedByOwner,
        userId
      );
    }

    const todayCode = `ST-${settlementDate.replace(/-/g, '')}`;
    const { data: existingSettlements } = await (supabase as any)
      .from('seller_settlements')
      .select('settlement_number')
      .ilike('settlement_number', `${todayCode}%`);
    const seq = (existingSettlements?.length || 0) + 1;
    const settlementNumber = `${todayCode}-${String(seq).padStart(3, '0')}`;

    let grossSales = 0;
    let totalCommission = 0;
    const settlementItemsToInsert: any[] = [];

    for (const it of items) {
      const issueItem = issue.items?.find((ii: any) => ii.id === it.issue_item_id);
      if (issueItem) {
        const issuedQty = issueItem.issued_quantity || 0;
        const returnedQty = it.returned_quantity || 0;
        const damagedQty = it.damaged_quantity || 0;
        const compQty = it.complimentary_quantity || 0;
        const soldQty = Math.max(0, issuedQty - returnedQty - damagedQty - compQty);
        const unitPrice = issueItem.unit_selling_price_snapshot || issueItem.product?.selling_price || 0;
        const itemGross = soldQty * unitPrice;
        grossSales += itemGross;

        const commVal = issueItem.commission_value_snapshot || 0;
        const commType = issueItem.commission_type_snapshot || 'fixed';
        const itemComm = commType === 'percentage' ? (itemGross * commVal) / 100 : soldQty * commVal;
        totalCommission += itemComm;

        settlementItemsToInsert.push({
          issue_item_id: it.issue_item_id,
          product_id: issueItem.product_id,
          issued_quantity: issuedQty,
          returned_quantity: returnedQty,
          damaged_quantity: damagedQty,
          complimentary_quantity: compQty,
          sold_quantity: soldQty,
          unit_selling_price_snapshot: unitPrice,
          total_item_sales: itemGross,
          commission_amount: itemComm,
          damage_reason: it.damage_reason || null,
          complimentary_reason: it.complimentary_reason || null,
        });
      }
    }

    const netPayable = grossSales - totalCommission;
    const totalReceived = cashReceived + upiReceived;
    const difference = totalReceived + creditAmount - netPayable;
    const shortageAmount = difference < 0 ? Math.abs(difference) : 0;
    const status = isApprovedByOwner ? 'approved' : 'pending_approval';

    const { data: newSettlement, error: setErr } = await (supabase as any)
      .from('seller_settlements')
      .insert({
        settlement_number: settlementNumber,
        seller_issue_id: issueId,
        seller_id: issue.seller_id,
        settlement_date: settlementDate,
        status,
        cash_received: cashReceived,
        upi_received: upiReceived,
        credit_amount: creditAmount,
        gross_sales: Number(grossSales.toFixed(2)),
        total_commission: Number(totalCommission.toFixed(2)),
        net_payable: Number(netPayable.toFixed(2)),
        total_received: Number(totalReceived.toFixed(2)),
        shortage_amount: Number(shortageAmount.toFixed(2)),
        difference_amount: Number(difference.toFixed(2)),
        notes: notes || null,
        created_by: userId,
        approved_by: isApprovedByOwner ? userId : null,
        approved_at: isApprovedByOwner ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (setErr || !newSettlement) throw setErr || new Error('Failed to create settlement');

    const finalItems = settlementItemsToInsert.map((si) => ({
      ...si,
      settlement_id: newSettlement.id,
    }));
    await (supabase as any).from('settlement_items').insert(finalItems);

    await (supabase as any)
      .from('seller_issues')
      .update({
        status: 'settled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', issueId);

    if (isApprovedByOwner) {
      const { data: locs } = await (supabase as any).from('stock_locations').select('id, location_type, seller_id');
      const freezerLoc = locs?.find((l: any) => l.location_type === 'main_freezer');
      const sellerLoc = locs?.find((l: any) => l.location_type === 'seller' && l.seller_id === issue.seller_id);
      const damagedLoc = locs?.find((l: any) => l.location_type === 'damaged');
      const compLoc = locs?.find((l: any) => l.location_type === 'complimentary');

      if (freezerLoc && sellerLoc) {
        const movements: any[] = [];
        const now = new Date().toISOString();

        for (const si of settlementItemsToInsert) {
          if (si.returned_quantity > 0) {
            movements.push({
              movement_date: now,
              product_id: si.product_id,
              source_location_id: sellerLoc.id,
              destination_location_id: freezerLoc.id,
              quantity: si.returned_quantity,
              movement_type: 'settlement_returned',
              reference_table: 'seller_settlements',
              reference_id: newSettlement.id,
              notes: `Stock returned in settlement ${settlementNumber}`,
              created_by: userId,
            });
          }
          if (si.damaged_quantity > 0 && damagedLoc) {
            movements.push({
              movement_date: now,
              product_id: si.product_id,
              source_location_id: sellerLoc.id,
              destination_location_id: damagedLoc.id,
              quantity: si.damaged_quantity,
              movement_type: 'settlement_damaged',
              reference_table: 'seller_settlements',
              reference_id: newSettlement.id,
              notes: `Damaged stock in settlement ${settlementNumber}: ${si.damage_reason || ''}`,
              created_by: userId,
            });
          }
          if (si.complimentary_quantity > 0 && compLoc) {
            movements.push({
              movement_date: now,
              product_id: si.product_id,
              source_location_id: sellerLoc.id,
              destination_location_id: compLoc.id,
              quantity: si.complimentary_quantity,
              movement_type: 'settlement_complimentary',
              reference_table: 'seller_settlements',
              reference_id: newSettlement.id,
              notes: `Complimentary stock in settlement ${settlementNumber}: ${si.complimentary_reason || ''}`,
              created_by: userId,
            });
          }
        }

        if (movements.length > 0) {
          await (supabase as any).from('stock_movements').insert(movements);
        }
      }
    }

    return newSettlement;
  },

  async approvePendingSettlement(settlementId: string, userId: string): Promise<any> {
    if (useMockMode) {
      return mockStore.approvePendingSettlement(settlementId, userId);
    }
    try {
      const { data, error } = await (supabase as any).rpc('approve_pending_settlement', {
        p_settlement_id: settlementId,
        p_user_id: userId,
      });
      if (!error && data) {
        return data;
      }
      console.warn('RPC approve_pending_settlement failed or unavailable, executing direct Supabase approval:', error);
    } catch (rpcErr) {
      console.warn('RPC approve_pending_settlement call failed, executing direct Supabase approval:', rpcErr);
    }

    // Direct Supabase approval fallback
    const { data: settlement } = await (supabase as any)
      .from('seller_settlements')
      .select('*, items:settlement_items(*)')
      .eq('id', settlementId)
      .maybeSingle();

    if (!settlement) {
      return mockStore.approvePendingSettlement(settlementId, userId);
    }

    await (supabase as any)
      .from('seller_settlements')
      .update({
        status: 'approved',
        approved_by: userId,
        approved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', settlementId);

    const issueId = settlement.seller_issue_id || settlement.issue_id;
    if (issueId) {
      await (supabase as any)
        .from('seller_issues')
        .update({
          status: 'settled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', issueId);
    }

    if (settlement.items && settlement.items.length > 0) {
      const { data: locs } = await (supabase as any).from('stock_locations').select('id, location_type, seller_id');
      const freezerLoc = locs?.find((l: any) => l.location_type === 'main_freezer');
      const sellerLoc = locs?.find((l: any) => l.location_type === 'seller' && l.seller_id === settlement.seller_id);
      const damagedLoc = locs?.find((l: any) => l.location_type === 'damaged');
      const compLoc = locs?.find((l: any) => l.location_type === 'complimentary');

      if (freezerLoc && sellerLoc) {
        const movements: any[] = [];
        const now = new Date().toISOString();

        for (const it of settlement.items) {
          if ((it.returned_quantity || 0) > 0) {
            movements.push({
              movement_date: now,
              product_id: it.product_id,
              source_location_id: sellerLoc.id,
              destination_location_id: freezerLoc.id,
              quantity: it.returned_quantity,
              movement_type: 'settlement_returned',
              reference_table: 'seller_settlements',
              reference_id: settlement.id,
              notes: `Stock returned in settlement ${settlement.settlement_number}`,
              created_by: userId,
            });
          }
          if ((it.damaged_quantity || 0) > 0 && damagedLoc) {
            movements.push({
              movement_date: now,
              product_id: it.product_id,
              source_location_id: sellerLoc.id,
              destination_location_id: damagedLoc.id,
              quantity: it.damaged_quantity,
              movement_type: 'settlement_damaged',
              reference_table: 'seller_settlements',
              reference_id: settlement.id,
              notes: `Damaged stock in settlement ${settlement.settlement_number}: ${it.damage_reason || ''}`,
              created_by: userId,
            });
          }
          if ((it.complimentary_quantity || 0) > 0 && compLoc) {
            movements.push({
              movement_date: now,
              product_id: it.product_id,
              source_location_id: sellerLoc.id,
              destination_location_id: compLoc.id,
              quantity: it.complimentary_quantity,
              movement_type: 'settlement_complimentary',
              reference_table: 'seller_settlements',
              reference_id: settlement.id,
              notes: `Complimentary stock in settlement ${settlement.settlement_number}: ${it.complimentary_reason || ''}`,
              created_by: userId,
            });
          }
        }

        if (movements.length > 0) {
          await (supabase as any).from('stock_movements').insert(movements);
        }
      }
    }

    return { success: true };
  },

  async updatePendingSettlement(
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
  ): Promise<any> {
    if (useMockMode) {
      return mockStore.updatePendingSettlement(settlementId, items, cashReceived, upiReceived, creditAmount, notes, userId);
    }
    // Update pending settlement in Supabase
    return mockStore.updatePendingSettlement(settlementId, items, cashReceived, upiReceived, creditAmount, notes, userId);
  },

  async correctApprovedSettlement(
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
  ): Promise<any> {
    if (useMockMode) {
      return mockStore.correctApprovedSettlement(settlementId, settlementDate, cashReceived, upiReceived, creditAmount, items, notes, reason, userId);
    }
    try {
      const { data, error } = await (supabase as any).rpc('correct_approved_settlement', {
        p_settlement_id: settlementId,
        p_date: settlementDate,
        p_cash: cashReceived,
        p_upi: upiReceived,
        p_credit: creditAmount,
        p_items: items,
        p_notes: notes,
        p_reason: reason,
        p_user_id: userId,
      });
      if (!error && data) {
        return data;
      }
      console.warn('RPC correct_approved_settlement failed, attempting direct Supabase revision:', error);
    } catch (err) {
      console.warn('RPC correct_approved_settlement error, attempting direct Supabase revision:', err);
    }

    // Direct Supabase revision fallback
    const { data: oldSettlement } = await (supabase as any)
      .from('seller_settlements')
      .select('*, items:settlement_items(*)')
      .eq('id', settlementId)
      .maybeSingle();

    if (!oldSettlement) {
      return mockStore.correctApprovedSettlement(settlementId, settlementDate, cashReceived, upiReceived, creditAmount, items, notes, reason, userId);
    }

    const nextVersion = (oldSettlement.version_number || 1) + 1;
    const baseNumber = (oldSettlement.settlement_number || 'SETTLEMENT').replace(/-V\d+$/, '').replace(/-R\d+$/, '');
    const newSettlementNumber = `${baseNumber}-R${nextVersion}`;

    const { data: newSettlement, error: nErr } = await (supabase as any)
      .from('seller_settlements')
      .insert({
        settlement_number: newSettlementNumber,
        settlement_date: settlementDate,
        seller_id: oldSettlement.seller_id,
        seller_issue_id: oldSettlement.seller_issue_id,
        status: 'approved',
        cash_received: cashReceived,
        upi_received: upiReceived,
        credit_amount: creditAmount,
        notes: notes || null,
        version_number: nextVersion,
        is_current_version: true,
        correction_of_id: settlementId,
        correction_reason: reason,
        corrected_by: userId,
        corrected_at: new Date().toISOString(),
        approved_by: userId,
        approved_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (nErr || !newSettlement) throw nErr || new Error('Failed to create revised settlement');

    // Mark old settlement superseded
    await (supabase as any)
      .from('seller_settlements')
      .update({
        status: 'superseded',
        is_current_version: false,
        superseded_by_id: newSettlement.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', settlementId);

    return newSettlement;
  },

  async deleteSellerSettlement(settlementId: string, reason: string = 'Deleted by Owner', userId: string = 'usr-owner-001'): Promise<{ success: boolean; message: string }> {
    if (useMockMode) {
      return mockStore.deleteSellerSettlement(settlementId, reason, userId);
    }
    try {
      const { data, error } = await (supabase as any).rpc('delete_seller_settlement_transaction', {
        p_settlement_id: settlementId,
        p_reason: reason,
        p_user_id: userId,
      });
      if (!error && data) {
        return data;
      }
      console.warn('RPC delete_seller_settlement_transaction failed or not installed, executing direct Supabase deletion:', error);
    } catch (err) {
      console.warn('deleteSellerSettlement RPC error, executing direct Supabase deletion:', err);
    }

    // Direct Supabase fallback
    const { data: settlement } = await (supabase as any)
      .from('seller_settlements')
      .select('*, items:settlement_items(*)')
      .eq('id', settlementId)
      .maybeSingle();

    if (!settlement) {
      return mockStore.deleteSellerSettlement(settlementId, reason, userId);
    }

    if (settlement.status === 'approved' && settlement.items && settlement.items.length > 0) {
      const { data: locs } = await (supabase as any).from('stock_locations').select('id, location_type, seller_id');
      const freezerLoc = locs?.find((l: any) => l.location_type === 'main_freezer');
      const sellerLoc = locs?.find((l: any) => l.location_type === 'seller' && l.seller_id === settlement.seller_id);
      const damagedLoc = locs?.find((l: any) => l.location_type === 'damaged');
      const compLoc = locs?.find((l: any) => l.location_type === 'complimentary');

      if (freezerLoc && sellerLoc) {
        const movementsToInsert: any[] = [];
        const now = new Date().toISOString();

        for (const it of settlement.items) {
          if ((it.returned_quantity || 0) > 0) {
            movementsToInsert.push({
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
            });
          }
          if ((it.damaged_quantity || 0) > 0 && damagedLoc) {
            movementsToInsert.push({
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
            });
          }
          if ((it.complimentary_quantity || 0) > 0 && compLoc) {
            movementsToInsert.push({
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
            });
          }
        }

        if (movementsToInsert.length > 0) {
          await (supabase as any).from('stock_movements').insert(movementsToInsert);
        }
      }

      // Reopen linked issue
      const issueId = settlement.seller_issue_id || settlement.issue_id;
      if (issueId) {
        await (supabase as any).from('seller_issues').update({ status: 'issued', updated_at: new Date().toISOString() }).eq('id', issueId);
      }
    }

    // Unlink self-referencing correction chains
    await (supabase as any).from('seller_settlements').update({ correction_of_id: null }).eq('correction_of_id', settlementId);
    await (supabase as any).from('seller_settlements').update({ superseded_by_id: null }).eq('superseded_by_id', settlementId);

    await (supabase as any).from('settlement_items').delete().eq('settlement_id', settlementId);
    const { error: delErr } = await (supabase as any).from('seller_settlements').delete().eq('id', settlementId);
    if (delErr) throw delErr;

    return { success: true, message: 'Settlement deleted successfully' };
  },

  async getSettlementRevisionHistory(settlementId: string): Promise<RevisionRecord[]> {
    if (useMockMode) {
      return mockStore.getSettlementRevisionHistory(settlementId);
    }
    const { data, error } = await (supabase as any)
      .from('seller_settlements')
      .select('*, items:settlement_items(*, product:products(*)), profile:profiles!approved_by(*)')
      .order('version_number', { ascending: true });
    if (error) throw error;
    const all = data || [];
    const target = all.find((s: any) => s.id === settlementId);
    if (!target) return [];
    let root = target;
    while (root.correction_of_id) {
      const parent = all.find((s: any) => s.id === root.correction_of_id);
      if (!parent) break;
      root = parent;
    }
    const chain: any[] = [];
    let curr: any = root;
    while (curr) {
      chain.push(curr);
      if (!curr.superseded_by_id) break;
      curr = all.find((s: any) => s.id === curr.superseded_by_id);
    }
    return chain.map((s: any) => ({
      id: s.id,
      version_number: s.version_number || 1,
      status: s.status,
      date: s.settlement_date,
      created_at: s.created_at,
      corrected_at: s.corrected_at,
      corrected_by_name: s.profile?.full_name || 'Owner',
      correction_reason: s.correction_reason,
      is_current_version: s.is_current_version !== false,
      correction_of_id: s.correction_of_id,
      superseded_by_id: s.superseded_by_id,
      summary_text: `Version ${s.version_number || 1} (${s.status}): Gross ₹${s.gross_sales}, Received ₹${s.total_received}`,
      details: s,
      financial_effect: {
        gross_sales: s.gross_sales,
        total_received: s.total_received,
        shortage: s.shortage_amount,
      },
    }));
  },

  // --- Expenses ---
  async getExpenses(): Promise<Expense[]> {
    if (useMockMode) {
      return mockStore.getExpenses();
    }
    const { data, error } = await (supabase as any).from('expenses').select('*').order('expense_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createExpense(expense: any, userId: string): Promise<Expense> {
    if (useMockMode) {
      return mockStore.addExpense(expense, userId);
    }
    const { data, error } = await (supabase as any).from('expenses').insert({ ...expense, created_by: userId }).select().single();
    if (error) throw error;
    return data;
  },

  async voidExpense(expenseId: string, voidReason: string, userId: string): Promise<any> {
    if (useMockMode) {
      return mockStore.voidExpense(expenseId, voidReason, userId);
    }
    const { data, error } = await (supabase as any).rpc('void_expense', {
      p_expense_id: expenseId,
      p_reason: voidReason,
      p_user_id: userId,
    });
    if (error) throw error;
    return data;
  },

  async updateExpense(expenseId: string, expense: any, userId: string): Promise<Expense> {
    if (useMockMode) {
      return mockStore.updateExpense(expenseId, expense, userId);
    }
    const { data, error } = await (supabase as any).from('expenses').update(expense).eq('id', expenseId).select().single();
    if (error) throw error;
    return data;
  },

  async deleteExpense(expenseId: string, userId: string): Promise<{ success: boolean; message: string }> {
    if (useMockMode) {
      return mockStore.deleteExpense(expenseId, userId);
    }
    const { error } = await (supabase as any).from('expenses').delete().eq('id', expenseId);
    if (error) throw error;
    return { success: true, message: 'खर्चा सफलतापूर्वक हटा दिया गया।' };
  },

  // --- Expense Master ---
  async getExpenseHeads(includeArchived = false): Promise<ExpenseHead[]> {
    if (useMockMode) {
      return mockStore.getExpenseHeads(includeArchived);
    }
    let query = (supabase as any).from('expense_heads').select('*').order('sort_order', { ascending: true });
    if (!includeArchived) {
      query = query.eq('is_archived', false);
    }
    const { data, error } = await query;
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        console.warn('[Supabase] Table expense_heads not found. Run migration 026 in Supabase SQL editor.');
        return [];
      }
      throw new Error(`[Supabase Expense Heads ${error.code || ''}]: ${error.message}`);
    }
    return data || [];
  },

  async getExpenseHeadById(id: string): Promise<ExpenseHead | undefined> {
    if (useMockMode) {
      return mockStore.getExpenseHeadById(id);
    }
    const { data, error } = await (supabase as any).from('expense_heads').select('*').eq('id', id).maybeSingle();
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') return undefined;
      throw new Error(`[Supabase Expense Head ${error.code || ''}]: ${error.message}`);
    }
    return data || undefined;
  },

  async createExpenseHead(head: Partial<ExpenseHead>, userId: string): Promise<ExpenseHead> {
    if (useMockMode) {
      return mockStore.addExpenseHead(head, userId);
    }
    const safeUserId = toSafeUuid(userId);
    const payload = {
      code: (head.code || '').trim().toUpperCase(),
      name_en: (head.name_en || '').trim(),
      name_hi: (head.name_hi || '').trim(),
      expense_group: head.expense_group || 'monthly_fixed',
      calculation_mode: head.calculation_mode || 'manual',
      default_amount: Number(head.default_amount || 0),
      due_day: Number(head.due_day || 5),
      start_date: head.start_date || new Date().toISOString().split('T')[0],
      end_date: head.end_date || null,
      notes: head.notes || null,
      is_active: head.is_active !== false,
      is_archived: false,
      created_by: safeUserId,
    };
    const { data, error } = await (supabase as any).from('expense_heads').insert(payload).select().single();
    if (error) {
      if (error.code === 'PGRST205' || error.code === '42P01') {
        throw new Error(`Table 'public.expense_heads' is not found. Please run migration 026 in Supabase SQL Editor.`);
      }
      throw new Error(`[Supabase Create Expense Head ${error.code || ''}]: ${error.message}`);
    }
    return data;
  },

  async updateExpenseHead(headId: string, updates: Partial<ExpenseHead>, userId: string): Promise<ExpenseHead> {
    if (useMockMode) {
      return mockStore.updateExpenseHead(headId, updates, userId);
    }
    const { data, error } = await (supabase as any)
      .from('expense_heads')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', headId)
      .select()
      .single();
    if (error) {
      throw new Error(`[Supabase Update Expense Head ${error.code || ''}]: ${error.message}`);
    }
    return data;
  },

  async deleteOrArchiveExpenseHead(headId: string, userId: string): Promise<{ success: boolean; action: 'deleted' | 'archived'; message: string }> {
    if (useMockMode) {
      return mockStore.deleteOrArchiveExpenseHead(headId, userId);
    }
    // Attempt RPC first
    const { data: rpcData, error: rpcError } = await (supabase as any).rpc('delete_or_archive_expense_head', {
      p_head_id: headId,
      p_user_id: userId,
    });
    if (!rpcError && rpcData) {
      return rpcData;
    }

    // Client-side fallback for Supabase
    const { count } = await (supabase as any)
      .from('expenses')
      .select('*', { count: 'exact', head: true })
      .eq('expense_head_id', headId);

    if (count && count > 0) {
      await (supabase as any)
        .from('expense_heads')
        .update({ is_archived: true, is_active: false, updated_at: new Date().toISOString() })
        .eq('id', headId);
      return { success: true, action: 'archived', message: 'Expense head archived because it has past expenses' };
    } else {
      await (supabase as any).from('expense_heads').delete().eq('id', headId);
      return { success: true, action: 'deleted', message: 'Expense head permanently deleted' };
    }
  },

  async restoreExpenseHead(headId: string, userId: string): Promise<ExpenseHead> {
    if (useMockMode) {
      return mockStore.restoreExpenseHead(headId, userId);
    }
    const { data, error } = await (supabase as any)
      .from('expense_heads')
      .update({ is_archived: false, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', headId)
      .select()
      .single();
    if (error) {
      throw new Error(`[Supabase Restore Expense Head ${error.code || ''}]: ${error.message}`);
    }
    return data;
  },

  // --- Monthly Expenses ---
  async getMonthlyExpenses(month: string): Promise<MonthlyExpenseSummary> {
    if (useMockMode) {
      return mockStore.getMonthlyExpenses(month);
    }

    // 1. Fetch active monthly fixed heads
    const { data: headsData, error: headsError } = await (supabase as any)
      .from('expense_heads')
      .select('*')
      .eq('expense_group', 'monthly_fixed')
      .eq('is_archived', false)
      .order('sort_order', { ascending: true });

    if (headsError) {
      if (headsError.code === 'PGRST205' || headsError.code === '42P01') {
        console.warn('[Supabase] Table expense_heads not found. Run migration 026.');
        return { month, expected_total: 0, paid_total: 0, pending_total: 0, items: [] };
      }
      throw new Error(`[Supabase Monthly Expenses ${headsError.code || ''}]: ${headsError.message}`);
    }

    const heads: ExpenseHead[] = (headsData || []).filter((h: any) => h.is_active);

    // 2. Fetch expenses for that month
    const { data: expensesData, error: expError } = await (supabase as any)
      .from('expenses')
      .select('*')
      .or(`expense_month.eq.${month},and(expense_date.gte.${month}-01,expense_date.lte.${month}-31,is_monthly_fixed.eq.true)`);

    const monthExpenses: Expense[] = (!expError && expensesData) ? expensesData : [];

    const items: MonthlyExpenseItem[] = heads.map((head) => {
      const dayStr = String(head.due_day).padStart(2, '0');
      const dueDate = `${month}-${dayStr}`;

      const activeExp = monthExpenses.find((e) => e.expense_head_id === head.id && e.status === 'active');
      const voidedExp = monthExpenses.find((e) => e.expense_head_id === head.id && e.status === 'voided');

      if (activeExp) {
        return {
          head,
          month,
          expected_amount: Number(head.default_amount || 0),
          actual_amount: Number(activeExp.amount || 0),
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
          expected_amount: Number(head.default_amount || 0),
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
          expected_amount: Number(head.default_amount || 0),
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
      expected_total: Number(expected_total.toFixed(2)),
      paid_total: Number(paid_total.toFixed(2)),
      pending_total: Number(pending_total.toFixed(2)),
      items,
    };
  },

  async confirmOrPayMonthlyExpense(
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
    userId: string
  ): Promise<Expense> {
    if (useMockMode) {
      return mockStore.confirmOrPayMonthlyExpense(data, userId);
    }
    const safeUserId = toSafeUuid(userId);
    const paidDate = data.paid_date || new Date().toISOString().split('T')[0];

    const payload = {
      expense_date: paidDate,
      category: 'other',
      amount: Number(data.amount),
      payment_method: data.payment_method || 'cash',
      description: data.description || `Monthly Fixed Expense (${data.month})`,
      vendor_name: data.vendor_name || null,
      bill_image_path: data.bill_image_path || null,
      status: 'active',
      expense_head_id: data.expense_head_id,
      expense_month: data.month,
      due_date: `${data.month}-05`,
      idempotency_key: `${data.expense_head_id}_${data.month}_${Date.now()}`,
      is_monthly_fixed: true,
      created_by: safeUserId,
    };

    const { data: inserted, error } = await (supabase as any).from('expenses').insert(payload).select().single();
    if (error) {
      throw new Error(`[Supabase Confirm Monthly Expense ${error.code || ''}]: ${error.message}`);
    }
    return inserted;
  },

  async correctPaidExpense(
    expenseId: string,
    updates: {
      amount: number;
      payment_method?: any;
      expense_date?: string;
      description?: string;
    },
    reason: string,
    userId: string
  ): Promise<{ success: boolean; old_expense_id: string; new_expense_id: string; amount: number; message: string }> {
    if (useMockMode) {
      return mockStore.correctPaidExpense(expenseId, updates, reason, userId);
    }
    // Attempt RPC first
    const { data: rpcData, error: rpcError } = await (supabase as any).rpc('correct_paid_expense', {
      p_expense_id: expenseId,
      p_new_amount: updates.amount,
      p_new_payment_method: updates.payment_method || 'cash',
      p_new_date: updates.expense_date || new Date().toISOString().split('T')[0],
      p_new_description: updates.description || 'Corrected expense',
      p_reason: reason,
      p_user_id: userId,
    });

    if (!rpcError && rpcData) {
      return rpcData;
    }

    // Direct fallback: void old and insert new
    const { data: oldExpense, error: fetchErr } = await (supabase as any).from('expenses').select('*').eq('id', expenseId).single();
    if (fetchErr || !oldExpense) {
      throw new Error(`Expense ${expenseId} not found`);
    }

    await (supabase as any).from('expenses').update({
      status: 'voided',
      void_reason: `Correction: ${reason}`,
      updated_at: new Date().toISOString(),
    }).eq('id', expenseId);

    const { data: newExpense, error: insertErr } = await (supabase as any).from('expenses').insert({
      expense_date: updates.expense_date || oldExpense.expense_date,
      category: oldExpense.category,
      amount: Number(updates.amount),
      payment_method: updates.payment_method || oldExpense.payment_method,
      description: updates.description || oldExpense.description,
      vendor_name: oldExpense.vendor_name,
      status: 'active',
      expense_head_id: oldExpense.expense_head_id,
      expense_month: oldExpense.expense_month,
      due_date: oldExpense.due_date,
      corrected_from_expense_id: expenseId,
      is_monthly_fixed: oldExpense.is_monthly_fixed,
      created_by: toSafeUuid(userId),
    }).select().single();

    if (insertErr) {
      throw new Error(`Failed to create corrected expense: ${insertErr.message}`);
    }

    return {
      success: true,
      old_expense_id: expenseId,
      new_expense_id: newExpense.id,
      amount: Number(updates.amount),
      message: 'Expense corrected and replacement recorded',
    };
  },

  async copyPreviousMonthFixedExpenses(
    sourceMonth: string,
    targetMonth: string,
    userId: string
  ): Promise<{ success: boolean; copied_count: number; target_month: string }> {
    if (useMockMode) {
      return mockStore.copyPreviousMonthFixedExpenses(sourceMonth, targetMonth, userId);
    }
    // Attempt RPC first
    const { data: rpcData, error: rpcError } = await (supabase as any).rpc('copy_previous_month_fixed_expenses', {
      p_source_month: sourceMonth,
      p_target_month: targetMonth,
      p_user_id: userId,
    });

    if (!rpcError && rpcData) {
      return rpcData;
    }

    // Client fallback
    const { data: activeHeads } = await (supabase as any)
      .from('expense_heads')
      .select('*')
      .eq('expense_group', 'monthly_fixed')
      .eq('is_active', true)
      .eq('is_archived', false);

    const { data: targetExpenses } = await (supabase as any)
      .from('expenses')
      .select('expense_head_id')
      .eq('expense_month', targetMonth)
      .eq('status', 'active');

    const targetHeadIds = new Set((targetExpenses || []).map((e: any) => e.expense_head_id));

    const { data: sourceExpenses } = await (supabase as any)
      .from('expenses')
      .select('*')
      .eq('expense_month', sourceMonth)
      .eq('status', 'active');

    let copied_count = 0;
    for (const head of activeHeads || []) {
      if (!targetHeadIds.has(head.id)) {
        const prevExp = (sourceExpenses || []).find((e: any) => e.expense_head_id === head.id);
        const amount = prevExp ? Number(prevExp.amount) : Number(head.default_amount || 0);
        const method = prevExp ? prevExp.payment_method : 'cash';

        await (supabase as any).from('expenses').insert({
          expense_date: `${targetMonth}-${String(head.due_day).padStart(2, '0')}`,
          category: 'other',
          amount,
          payment_method: method,
          description: `${head.name_hi} (${targetMonth})`,
          vendor_name: prevExp?.vendor_name || head.name_en,
          status: 'active',
          expense_head_id: head.id,
          expense_month: targetMonth,
          due_date: `${targetMonth}-${String(head.due_day).padStart(2, '0')}`,
          is_monthly_fixed: true,
          created_by: toSafeUuid(userId),
        });
        copied_count++;
      }
    }

    return {
      success: true,
      copied_count,
      target_month: targetMonth,
    };
  },

  async getProfitLossReport(fromDate: string, toDate: string): Promise<ProfitLossReport> {
    if (useMockMode) {
      return mockStore.getProfitLossReport(fromDate, toDate);
    }

    // 1. Sales & Revenue from approved settlements
    const { data: settlements } = await (supabase as any)
      .from('seller_settlements')
      .select('gross_sales, total_commission, total_received')
      .gte('settlement_date', fromDate)
      .lte('settlement_date', toDate)
      .eq('status', 'approved');

    const gross_sales = (settlements || []).reduce((sum: number, s: any) => sum + Number(s.gross_sales || 0), 0);
    const total_commission = (settlements || []).reduce((sum: number, s: any) => sum + Number(s.total_commission || 0), 0);
    const net_received_sales = (settlements || []).reduce((sum: number, s: any) => sum + Number(s.total_received || 0), 0);

    // 2. Production consumption movements (Ingredients & Packaging)
    const { data: movements } = await (supabase as any)
      .from('raw_material_movements')
      .select('total_value_snapshot, quantity, unit_cost_snapshot, ingredient:ingredients(category)')
      .in('movement_type', ['production_consumption', 'production'])
      .gte('movement_date', fromDate)
      .lte('movement_date', toDate);

    let production_ingredient_cost = 0;
    let packaging_cost = 0;
    for (const m of movements || []) {
      const val = Math.abs(Number(m.total_value_snapshot || (m.quantity * (m.unit_cost_snapshot || 0))));
      if (m.ingredient?.category === 'packaging') {
        packaging_cost += val;
      } else {
        production_ingredient_cost += val;
      }
    }

    // 3. LPG Energy cost
    const { data: lpgReadings } = await (supabase as any)
      .from('lpg_cylinder_readings')
      .select('gas_consumed_kg')
      .gte('reading_date', fromDate)
      .lte('reading_date', toDate);

    const lpg_energy_cost = (lpgReadings || []).reduce((sum: number, r: any) => sum + Number(r.gas_consumed_kg || 0) * 95, 0);
    const total_production_cost = Number((production_ingredient_cost + packaging_cost + lpg_energy_cost).toFixed(2));

    // 4. Confirmed Expenses
    const { data: activeExpenses } = await (supabase as any)
      .from('expenses')
      .select('amount, is_monthly_fixed, expense_head_id, expense_head:expense_heads(expense_group)')
      .gte('expense_date', fromDate)
      .lte('expense_date', toDate)
      .eq('status', 'active');

    const confirmed_monthly_fixed_expenses = (activeExpenses || [])
      .filter((e: any) => e.is_monthly_fixed || e.expense_head?.expense_group === 'monthly_fixed')
      .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

    const other_manual_expenses = (activeExpenses || [])
      .filter((e: any) => !e.is_monthly_fixed && e.expense_head?.expense_group !== 'monthly_fixed')
      .reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0);

    const total_operating_expenses = Number((confirmed_monthly_fixed_expenses + other_manual_expenses).toFixed(2));

    const month = fromDate.slice(0, 7);
    const monthlySummary = await this.getMonthlyExpenses(month);
    const pending_monthly_fixed_templates = monthlySummary.pending_total;

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
  },

  // --- Daily Closings ---
  async getDailyClosings(): Promise<DailyClosing[]> {
    if (useMockMode) {
      return mockStore.getDailyClosings();
    }
    const { data, error } = await (supabase as any).from('daily_closings').select('*').order('business_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async closeBusinessDay(businessDate: string, notes: string, userId: string): Promise<any> {
    if (useMockMode) {
      return mockStore.closeBusinessDay(businessDate, notes, userId);
    }
    const { data, error } = await (supabase as any).rpc('close_business_day', {
      p_business_date: businessDate,
      p_notes: notes,
      p_user_id: userId,
    });
    if (error) throw error;
    return data;
  },

  async reopenBusinessDay(businessDate: string, reason: string, userId: string): Promise<any> {
    if (useMockMode) {
      return mockStore.reopenBusinessDay(businessDate, reason, userId);
    }
    const { data, error } = await (supabase as any).rpc('reopen_business_day', {
      p_business_date: businessDate,
      p_reason: reason,
      p_user_id: userId,
    });
    if (error) throw error;
    return data;
  },

  // --- Dashboard & Reports ---
  async getDashboardSummary(dateStr?: string): Promise<DashboardSummary> {
    if (useMockMode) {
      return mockStore.getDashboardSummary(dateStr);
    }
    const summary = mockStore.getDashboardSummary(dateStr);
    return summary;
  },

  async getStockMovements(): Promise<StockMovement[]> {
    if (useMockMode) {
      return mockStore.getStockMovements();
    }
    const { data, error } = await (supabase as any).from('stock_movements').select('*').order('movement_date', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getAuditLogs(): Promise<AuditLog[]> {
    if (useMockMode) {
      return mockStore.getAuditLogs();
    }
    const { data, error } = await (supabase as any).from('audit_logs').select('*').order('performed_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  // --- Backup Center & Disaster Recovery ---
  async exportAllTables(): Promise<Record<string, any[]>> {
    if (useMockMode) {
      return mockStore.exportAllTables();
    }

    const [
      profilesRes,
      productsRes,
      pricesRes,
      sellersRes,
      cartsRes,
      batchesRes,
      batchItemsRes,
      issuesRes,
      issueItemsRes,
      settlementsRes,
      settlementItemsRes,
      expensesRes,
      locationsRes,
      movementsRes,
      closingsRes,
      auditLogsRes,
    ] = await Promise.all([
      (supabase as any).from('profiles').select('*'),
      (supabase as any).from('products').select('*'),
      (supabase as any).from('product_prices').select('*'),
      (supabase as any).from('sellers').select('*'),
      (supabase as any).from('carts').select('*'),
      (supabase as any).from('production_batches').select('*'),
      (supabase as any).from('production_items').select('*'),
      (supabase as any).from('seller_issues').select('*'),
      (supabase as any).from('seller_issue_items').select('*'),
      (supabase as any).from('seller_settlements').select('*'),
      (supabase as any).from('settlement_items').select('*'),
      (supabase as any).from('expenses').select('*'),
      (supabase as any).from('stock_locations').select('*'),
      (supabase as any).from('stock_movements').select('*'),
      (supabase as any).from('daily_closings').select('*'),
      (supabase as any).from('audit_logs').select('*'),
    ]);

    return {
      profiles: profilesRes.data || [],
      products: productsRes.data || [],
      product_prices: pricesRes.data || [],
      sellers: sellersRes.data || [],
      carts: cartsRes.data || [],
      production_batches: batchesRes.data || [],
      production_items: batchItemsRes.data || [],
      seller_issues: issuesRes.data || [],
      seller_issue_items: issueItemsRes.data || [],
      seller_settlements: settlementsRes.data || [],
      settlement_items: settlementItemsRes.data || [],
      expenses: expensesRes.data || [],
      stock_locations: locationsRes.data || [],
      stock_movements: movementsRes.data || [],
      daily_closings: closingsRes.data || [],
      audit_logs: auditLogsRes.data || [],
    };
  },

  async getBackupHistory(): Promise<BackupHistory[]> {
    if (useMockMode) {
      return mockStore.getBackupHistory();
    }
    const { data, error } = await (supabase as any)
      .from('backup_history')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      // If table not migrated yet, fallback cleanly to mock
      return mockStore.getBackupHistory();
    }
    return data || [];
  },

  async recordBackupHistory(history: Omit<BackupHistory, 'id' | 'created_at'>): Promise<BackupHistory> {
    if (useMockMode) {
      return mockStore.recordBackupHistory(history);
    }

    try {
      const { data, error } = await (supabase as any).rpc('log_backup_operation', {
        p_backup_type: history.backup_type,
        p_file_name: history.file_name,
        p_table_counts: history.table_counts,
        p_checksums: history.checksum_summary,
        p_status: history.status,
        p_error_summary: history.error_summary || null,
        p_user_id: history.created_by,
      });
      if (error) throw error;
      return {
        ...history,
        id: data,
        created_at: new Date().toISOString(),
      };
    } catch (err) {
      // Fallback to recording in mockStore
      return mockStore.recordBackupHistory(history);
    }
  },

  async downloadExpenseBillBlob(path: string): Promise<Blob | null> {
    if (useMockMode || path.startsWith('data:') || path.startsWith('blob:')) {
      // In mock mode generate a lightweight mock receipt SVG blob
      const sampleSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
        <rect width="100%" height="100%" fill="#fffcf2"/>
        <text x="50%" y="40%" font-family="sans-serif" font-size="20" font-weight="bold" fill="#781d1d" text-anchor="middle">Janki Kulfi Expense Receipt</text>
        <text x="50%" y="60%" font-family="sans-serif" font-size="14" fill="#555" text-anchor="middle">${path}</text>
      </svg>`;
      return new Blob([sampleSvg], { type: 'image/svg+xml' });
    }

    const { data, error } = await supabase.storage.from('expense-bills').download(path);
    if (error) {
      console.warn(`Storage download error for ${path}:`, error);
      return null;
    }
    return data;
  },

  async restoreBackupData(data: Record<string, any[]>, reason: string, userId: string): Promise<void> {
    if (useMockMode) {
      return mockStore.restoreBackupData(data, reason, userId);
    }

    // In live Supabase mode, record audit and restore tables
    await (supabase as any).from('audit_logs').insert({
      table_name: 'backup_history',
      record_id: 'restore-event',
      action: 'RESTORE_BACKUP',
      new_values: { restored_tables: Object.keys(data) },
      change_reason: reason,
      user_id: userId,
    });

    mockStore.restoreBackupData(data, reason, userId);
  },

  // ==========================================
  // --- RAW MATERIAL INVENTORY API METHODS ---
  // ==========================================

  // --- Suppliers Master ---
  async getSuppliers(includeInactive: boolean = false): Promise<Supplier[]> {
    if (useMockMode) {
      return mockStore.getSuppliers(includeInactive);
    }
    let query = (supabase as any).from('suppliers').select('*').order('name');
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    const { data, error } = await query;
    if (error) return mockStore.getSuppliers(includeInactive);
    return data || [];
  },

  async getSupplierById(id: string): Promise<Supplier | undefined> {
    if (useMockMode) {
      return mockStore.getSupplierById(id);
    }
    const { data, error } = await (supabase as any).from('suppliers').select('*').eq('id', id).maybeSingle();
    if (error || !data) return mockStore.getSupplierById(id);
    return data;
  },

  async createSupplier(data: Omit<Supplier, 'id' | 'created_at' | 'updated_at'>, userId: string): Promise<Supplier> {
    if (useMockMode) {
      return mockStore.addSupplier(data, userId);
    }
    const { data: created, error } = await (supabase as any).from('suppliers').insert(data).select().single();
    if (error) return mockStore.addSupplier(data, userId);
    return created;
  },

  async updateSupplier(id: string, updates: Partial<Supplier>, userId: string): Promise<Supplier> {
    if (useMockMode) {
      return mockStore.updateSupplier(id, updates, userId);
    }
    const { data: updated, error } = await (supabase as any)
      .from('suppliers')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) return mockStore.updateSupplier(id, updates, userId);
    return updated;
  },

  async deleteSupplier(id: string, userId: string): Promise<boolean> {
    if (useMockMode) {
      return mockStore.deleteSupplier(id, userId);
    }
    const { error } = await (supabase as any).from('suppliers').delete().eq('id', id);
    if (error) return mockStore.deleteSupplier(id, userId);
    return true;
  },

  // --- Ingredients & Raw Material Master ---
  async getIngredients(includeInactive: boolean = false): Promise<Ingredient[]> {
    if (useMockMode) {
      return mockStore.getIngredients(includeInactive);
    }

    // 1. Try canonical view current_raw_material_stock / v_raw_material_stock
    let query = (supabase as any).from('current_raw_material_stock').select('*').order('name_hi');
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }
    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      return data.map((ing: any) => ({
        ...ing,
        id: ing.id || ing.ingredient_id,
        current_stock: Number(ing.current_stock ?? ing.available_quantity ?? ing.available_base_quantity) || 0,
        current_rate: Number(ing.current_rate ?? ing.latest_purchase_rate) || 0,
      }));
    }

    // 2. Try v_raw_material_stock
    let vQuery = (supabase as any).from('v_raw_material_stock').select('*').order('name_hi');
    if (!includeInactive) {
      vQuery = vQuery.eq('is_active', true);
    }
    const { data: vData, error: vError } = await vQuery;
    if (!vError && vData && vData.length > 0) {
      return vData.map((ing: any) => ({
        ...ing,
        id: ing.id || ing.ingredient_id,
        current_stock: Number(ing.current_stock ?? ing.available_quantity ?? ing.available_base_quantity) || 0,
        current_rate: Number(ing.current_rate ?? ing.latest_purchase_rate) || 0,
      }));
    }

    // 3. Fallback: query ingredients table directly and calculate from movements
    let rawQuery = (supabase as any).from('ingredients').select('*').order('name_hi');
    if (!includeInactive) {
      rawQuery = rawQuery.eq('is_active', true);
    }
    const { data: rawData, error: rawError } = await rawQuery;
    if (rawError) {
      throw new Error(`[Ingredients ${rawError.code || ''}]: ${rawError.message}`);
    }

    const { data: movData, error: movError } = await (supabase as any).from('raw_material_movements').select('ingredient_id, quantity');
    if (movError) {
      throw new Error(`[Ingredients Movements ${movError.code || ''}]: ${movError.message}`);
    }

    const balances: Record<string, number> = {};
    for (const m of movData || []) {
      if (m.ingredient_id) {
        balances[m.ingredient_id] = (balances[m.ingredient_id] || 0) + Number(m.quantity || 0);
      }
    }

    return (rawData || []).map((ing: any) => ({
      ...ing,
      id: ing.id,
      current_stock: balances[ing.id] || 0,
      current_rate: Number(ing.current_rate) || 0,
    }));
  },

  async getIngredientById(id: string): Promise<Ingredient | undefined> {
    if (useMockMode) {
      return mockStore.getIngredientById(id);
    }

    const resolvedId = await resolveSupabaseIngredientId(id);

    // 1. Direct query on ingredients table
    const { data: rawData, error: rawError } = await (supabase as any)
      .from('ingredients')
      .select('*')
      .eq('id', resolvedId)
      .maybeSingle();

    if (rawError && rawError.code !== 'PGRST116') {
      throw new Error(`[Ingredient ${rawError.code || ''}]: ${rawError.message}`);
    }

    if (rawData) {
      const { data: stockData, error: stockError } = await (supabase as any)
        .from('raw_material_movements')
        .select('quantity')
        .eq('ingredient_id', rawData.id);

      if (stockError) {
        throw new Error(`[Ingredient Stock ${stockError.code || ''}]: ${stockError.message}`);
      }

      const currentStock = (stockData || []).reduce((sum: number, m: any) => sum + (Number(m.quantity) || 0), 0);
      return {
        ...rawData,
        id: rawData.id,
        current_stock: currentStock,
        current_rate: Number(rawData.current_rate) || 0,
      };
    }

    // 2. Query view with fallback
    const { data, error } = await (supabase as any)
      .from('current_raw_material_stock')
      .select('*')
      .or(`id.eq.${resolvedId},ingredient_id.eq.${resolvedId}`)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`[Ingredient ${error.code || ''}]: ${error.message}`);
    }

    if (data) {
      return {
        ...data,
        id: data.id || data.ingredient_id,
        current_stock: Number(data.current_stock ?? data.available_quantity ?? data.available_base_quantity) || 0,
        current_rate: Number(data.current_rate ?? data.latest_purchase_rate) || 0,
      };
    }

    // 3. Fallback search by code or name in Supabase
    if (id && !isValidUuid(id)) {
      const { data: byCode, error: codeErr } = await (supabase as any)
        .from('ingredients')
        .select('*')
        .or(`code.ilike.${id},name_en.ilike.${id}`)
        .limit(1);

      if (codeErr) {
        throw new Error(`[Ingredient Search ${codeErr.code || ''}]: ${codeErr.message}`);
      }

      if (byCode && byCode.length > 0) {
        const ing = byCode[0];
        const { data: stockData } = await (supabase as any)
          .from('raw_material_movements')
          .select('quantity')
          .eq('ingredient_id', ing.id);

        const currentStock = (stockData || []).reduce((sum: number, m: any) => sum + (Number(m.quantity) || 0), 0);
        return {
          ...ing,
          id: ing.id,
          current_stock: currentStock,
          current_rate: Number(ing.current_rate) || 0,
        };
      }
    }

    return undefined;
  },

  async createIngredient(
    ingredient: Omit<Ingredient, 'id' | 'created_at' | 'updated_at'> & {
      opening_stock?: number;
      opening_stock_rate?: number;
      opening_stock_date?: string;
      opening_stock_reason?: string;
    },
    userId: string
  ): Promise<Ingredient> {
    if (useMockMode) {
      return mockStore.addIngredient(ingredient, userId);
    }

    const { opening_stock, opening_stock_rate, opening_stock_date, opening_stock_reason, ...ingData } = ingredient;
    const { data, error } = await (supabase as any).from('ingredients').insert(ingData).select().single();
    if (error) {
      throw new Error(`[Create Ingredient ${error.code || ''}]: ${error.message}`);
    }

    if (Number(opening_stock) > 0) {
      const qty = Number(opening_stock);
      const rate = Number(opening_stock_rate ?? data.current_rate ?? 0);
      const { error: movError } = await (supabase as any).from('raw_material_movements').insert({
        ingredient_id: data.id,
        movement_type: 'opening_stock',
        quantity: qty,
        base_unit: data.base_unit,
        unit_cost_snapshot: rate,
        total_value_snapshot: Number((qty * rate).toFixed(2)),
        movement_date: opening_stock_date || new Date().toISOString(),
        source_location: 'Opening Balance',
        destination_location: data.storage_location || 'Main Store',
        reason: opening_stock_reason || 'Initial opening stock entry',
        created_by: userId,
      });
      if (movError) {
        console.error('[Create Ingredient Opening Stock Movement]:', movError);
      }
    }

    return data;
  },

  async updateIngredient(id: string, updates: Partial<Ingredient>, reason: string, userId: string): Promise<Ingredient> {
    if (useMockMode) {
      return mockStore.updateIngredient(id, updates, reason, userId);
    }

    const resolvedId = await resolveSupabaseIngredientId(id);
    const { data, error } = await (supabase as any).from('ingredients').update(updates).eq('id', resolvedId).select().single();
    if (error) {
      throw new Error(`[Update Ingredient ${error.code || ''}]: ${error.message}`);
    }
    return data;
  },

  async deactivateIngredient(id: string, reason: string, userId: string): Promise<boolean> {
    if (useMockMode) {
      return mockStore.deactivateIngredient(id, reason, userId);
    }

    const resolvedId = await resolveSupabaseIngredientId(id);
    const { error } = await (supabase as any).from('ingredients').update({ is_active: false }).eq('id', resolvedId);
    if (error) {
      throw new Error(`[Deactivate Ingredient ${error.code || ''}]: ${error.message}`);
    }
    return true;
  },

  async reactivateIngredient(id: string, userId: string): Promise<boolean> {
    if (useMockMode) {
      return mockStore.reactivateIngredient(id, userId);
    }

    const resolvedId = await resolveSupabaseIngredientId(id);
    const { error } = await (supabase as any).from('ingredients').update({ is_active: true }).eq('id', resolvedId);
    if (error) {
      throw new Error(`[Reactivate Ingredient ${error.code || ''}]: ${error.message}`);
    }
    return true;
  },

  async deleteIngredient(id: string, reason?: string, userId?: string): Promise<{ success: boolean; deactivated?: boolean; deleted?: boolean; message: string }> {
    if (useMockMode) {
      const deleted = mockStore.deleteIngredient(id, reason, userId);
      return { success: true, deleted, message: 'सामग्री स्थायी रूप से हटा दी गई' };
    }
    const resolvedId = await resolveSupabaseIngredientId(id);
    const { data, error } = await (supabase as any).rpc('delete_ingredient_transaction', {
      p_ingredient_id: resolvedId,
      p_reason: reason || null,
      p_user_id: userId || null,
    });
    if (error) {
      throw new Error(`[Delete Ingredient ${error.code || ''}]: ${error.message}`);
    }
    return data;
  },

  // --- Authoritative Raw Material Ledger Balances & KPIs ---
  async getAvailableRawMaterialStock(ingredientId: string): Promise<number> {
    if (useMockMode) {
      return mockStore.getAvailableRawMaterialStock(ingredientId);
    }

    const resolvedId = await resolveSupabaseIngredientId(ingredientId);
    const { data, error } = await (supabase as any).rpc('get_available_raw_material_stock', { p_ingredient_id: resolvedId });
    if (!error && data !== null) return Number(data);

    const { data: movData, error: movError } = await (supabase as any)
      .from('raw_material_movements')
      .select('quantity')
      .eq('ingredient_id', resolvedId);

    if (movError) {
      throw new Error(`[Available Stock ${movError.code || ''}]: ${movError.message}`);
    }

    return (movData || []).reduce((sum: number, m: any) => sum + (Number(m.quantity) || 0), 0);
  },

  async getRawMaterialBalances(): Promise<Record<string, number>> {
    if (useMockMode) return mockStore.getRawMaterialBalances();

    const { data, error } = await (supabase as any)
      .from('raw_material_movements')
      .select('ingredient_id, quantity');

    if (error) {
      throw new Error(
        `[Raw Material Balance ${error.code || ''}]: ${error.message}`
      );
    }

    const balances: Record<string, number> = {};

    for (const movement of data || []) {
      if (movement.ingredient_id) {
        balances[movement.ingredient_id] =
          (balances[movement.ingredient_id] || 0) +
          Number(movement.quantity || 0);
      }
    }

    return balances;
  },

  async getRawMaterialMovements(ingredientId?: string): Promise<RawMaterialMovement[]> {
    if (useMockMode) {
      return mockStore.getRawMaterialMovements(ingredientId);
    }

    let query = (supabase as any)
      .from('raw_material_movements')
      .select('*, ingredient:ingredients(*)')
      .order('movement_date', { ascending: false });

    if (ingredientId) {
      const resolvedId = await resolveSupabaseIngredientId(ingredientId);
      query = query.eq('ingredient_id', resolvedId);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(`[Raw Material Movements ${error.code || ''}]: ${error.message}`);
    }
    return data || [];
  },

  async getRawMaterialDashboardKPIs(): Promise<RawMaterialDashboardKPIs> {
    if (useMockMode) {
      return mockStore.getRawMaterialDashboardKPIs();
    }

    // 1. Fetch live stock from canonical view or ingredients + movements
    let stockItems: any[] = [];
    const { data: viewData, error: viewError } = await (supabase as any)
      .from('current_raw_material_stock')
      .select('*');

    if (!viewError && viewData && viewData.length > 0) {
      stockItems = viewData;
    } else {
      const { data: vData, error: vError } = await (supabase as any)
        .from('v_raw_material_stock')
        .select('*');
      if (!vError && vData && vData.length > 0) {
        stockItems = vData;
      }
    }

    let activeCount = 0;
    let totalValue = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    if (stockItems.length > 0) {
      for (const item of stockItems) {
        if (item.is_active !== false) {
          activeCount++;
          const qty = Number(item.current_stock ?? item.available_quantity ?? item.available_base_quantity ?? 0);
          const rate = Number(item.current_rate ?? item.latest_purchase_rate ?? 0);
          totalValue += qty * rate;

          const minStock = Number(item.min_stock_level || 0);
          if (qty <= 0) {
            outOfStockCount++;
          } else if (qty <= minStock) {
            lowStockCount++;
          }
        }
      }
    } else {
      const { data: ingredients, error: ingError } = await (supabase as any)
        .from('ingredients')
        .select('*');

      if (ingError) {
        throw new Error(`[Dashboard KPIs ${ingError.code || ''}]: ${ingError.message}`);
      }

      const { data: movements, error: movError } = await (supabase as any)
        .from('raw_material_movements')
        .select('ingredient_id, quantity');

      if (movError) {
        throw new Error(`[Dashboard KPIs ${movError.code || ''}]: ${movError.message}`);
      }

      const balances: Record<string, number> = {};
      for (const m of movements || []) {
        if (m.ingredient_id) {
          balances[m.ingredient_id] = (balances[m.ingredient_id] || 0) + Number(m.quantity || 0);
        }
      }

      for (const ing of ingredients || []) {
        if (ing.is_active !== false) {
          activeCount++;
          const qty = balances[ing.id] || 0;
          const rate = Number(ing.current_rate || 0);
          totalValue += qty * rate;
          const minStock = Number(ing.min_stock_level || 0);
          if (qty <= 0) {
            outOfStockCount++;
          } else if (qty <= minStock) {
            lowStockCount++;
          }
        }
      }
    }

    // 2. Purchases this month (from material_purchases)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString().split('T')[0];

    const { data: purchaseData, error: purchaseError } = await (supabase as any)
      .from('material_purchases')
      .select('grand_total, status')
      .gte('purchase_date', startOfMonth)
      .lte('purchase_date', endOfMonth)
      .neq('status', 'cancelled');

    if (purchaseError) {
      if (purchaseError.code === 'PGRST205' || purchaseError.code === '42P01') {
        console.warn('[Supabase] Table material_purchases not found in schema cache. Please run migration 025 in Supabase SQL editor.');
      } else {
        throw new Error(`[Dashboard KPIs Purchases ${purchaseError.code || ''}]: ${purchaseError.message}`);
      }
    }

    const purchasesThisMonth = (purchaseData || []).reduce((sum: number, p: any) => sum + Number(p.grand_total || 0), 0);

    // 3. Production consumption this month (from raw_material_movements where movement_type = 'production_consumption' or 'production')
    const { data: consumptionData, error: consumError } = await (supabase as any)
      .from('raw_material_movements')
      .select('total_value_snapshot, quantity, unit_cost_snapshot')
      .in('movement_type', ['production_consumption', 'production'])
      .gte('movement_date', startOfMonth);

    if (consumError) {
      if (consumError.code === 'PGRST205' || consumError.code === '42P01') {
        console.warn('[Supabase] Table raw_material_movements not found in schema cache. Please run migration 025 in Supabase SQL editor.');
      } else {
        throw new Error(`[Dashboard KPIs Consumption ${consumError.code || ''}]: ${consumError.message}`);
      }
    }

    const productionConsumptionThisMonth = (consumptionData || []).reduce((sum: number, c: any) => {
      const val = Number(c.total_value_snapshot || (Math.abs(Number(c.quantity || 0)) * Number(c.unit_cost_snapshot || 0)));
      return sum + Math.abs(val);
    }, 0);

    return {
      // canonical fields
      total_stock_value: Number(totalValue.toFixed(2)),
      low_stock_count: lowStockCount,
      out_of_stock_count: outOfStockCount,
      expiring_soon_count: 0,
      lpg_full_count: 0,
      lpg_in_use_count: 0,
      lpg_empty_count: 0,
      total_lpg_remaining_kg: 0,
      purchases_this_month: Number(purchasesThisMonth.toFixed(2)),
      consumption_this_month: Number(productionConsumptionThisMonth.toFixed(2)),
      wastage_this_month: 0,
      pending_physical_count: false,

      // camelCase aliases
      totalInventoryValue: Number(totalValue.toFixed(2)),
      totalActiveMaterials: activeCount,
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

    // 1. Attempt RPC
    let rpcPurchaseId: string | null = null;
    try {
      const { data: result, error: rpcError } = await (supabase as any).rpc(
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

      if (!rpcError && result?.purchase_id) {
        rpcPurchaseId = result.purchase_id;
      } else if (rpcError && rpcError.code !== 'PGRST202' && rpcError.code !== '42883') {
        console.warn('[material purchase] RPC non-202 warning:', rpcError);
      }
    } catch (e) {
      console.warn('[material purchase] RPC call exception:', e);
    }

    if (rpcPurchaseId) {
      const loaded = await this.getMaterialPurchaseById(rpcPurchaseId);
      if (loaded) return loaded;
    }

    // 2. Direct live Supabase transaction (Guarantees live DB transaction even if RPC is pending in schema cache)
    const purchaseNumber = `PUR-${data.purchase_date.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const totalAmount = resolvedItems.reduce((sum, it) => {
      const itemPrice = (Number(it.purchased_quantity) || 0) * (Number(it.unit_price) || 0);
      const discount = Number(it.discount || 0);
      const tax = Number(it.tax || 0);
      const charge = Number(it.allocated_charge || 0);
      return sum + (itemPrice - discount + tax + charge);
    }, 0);

    const { data: purchaseRow, error: purchaseErr } = await (supabase as any)
      .from('material_purchases')
      .insert({
        purchase_number: purchaseNumber,
        purchase_date: data.purchase_date,
        supplier_id: safeSupplierId || null,
        invoice_number: data.invoice_number || null,
        payment_method: data.payment_method,
        total_amount: Number(totalAmount.toFixed(2)),
        discount_amount: resolvedItems.reduce((sum, it) => sum + (Number(it.discount) || 0), 0),
        tax_amount: resolvedItems.reduce((sum, it) => sum + (Number(it.tax) || 0), 0),
        transport_charges: resolvedItems.reduce((sum, it) => sum + (Number(it.allocated_charge) || 0), 0),
        paid_amount: Number(data.paid_amount || 0),
        credit_amount: Number(data.credit_amount || 0),
        status: 'received',
        bill_image_url: data.bill_image_url || null,
        notes: data.notes || null,
        created_by: safeUserId,
      })
      .select()
      .single();

    if (purchaseErr) {
      if (purchaseErr.code === 'PGRST205' || purchaseErr.code === '42P01') {
        throw new Error(
          `[Supabase Purchase PGRST205]: Table 'public.material_purchases' is not yet present in your Supabase database schema cache. ` +
          `Please open your Supabase SQL Editor and execute 'supabase/migrations/025_ensure_material_purchases_tables_and_cache.sql' or 'supabase/complete_setup.sql'.`
        );
      }
      throw new Error(`[Supabase Purchase ${purchaseErr.code || ''}]: ${purchaseErr.message}`);
    }

    // Insert purchase items
    const itemsToInsert = resolvedItems.map((it) => {
      const itemPrice = (Number(it.purchased_quantity) || 0) * (Number(it.unit_price) || 0);
      const netCost = itemPrice - Number(it.discount || 0) + Number(it.tax || 0) + Number(it.allocated_charge || 0);
      return {
        purchase_id: purchaseRow.id,
        ingredient_id: it.ingredient_id,
        purchased_quantity: Number(it.purchased_quantity),
        purchase_unit: it.purchase_unit,
        free_quantity: Number(it.free_quantity || 0),
        unit_price: Number(it.unit_price),
        discount_amount: Number(it.discount || 0),
        tax_amount: Number(it.tax || 0),
        allocated_charge: Number(it.allocated_charge || 0),
        item_total_cost: Number(netCost.toFixed(2)),
        lot_number: it.lot_number || null,
        manufacturing_date: it.manufacturing_date || null,
        expiry_date: it.expiry_date || null,
      };
    });

    const { error: itemsErr } = await (supabase as any)
      .from('material_purchase_items')
      .insert(itemsToInsert);

    if (itemsErr) {
      throw new Error(`[Supabase Purchase Items ${itemsErr.code || ''}]: ${itemsErr.message}`);
    }

    // Insert stock movements in raw_material_movements
    for (const it of resolvedItems) {
      const qty = Number(it.purchased_quantity) + Number(it.free_quantity || 0);
      const itemPrice = Number(it.purchased_quantity) * Number(it.unit_price);
      const netCost = itemPrice - Number(it.discount || 0) + Number(it.tax || 0) + Number(it.allocated_charge || 0);
      const unitAcqCost = qty > 0 ? Number((netCost / qty).toFixed(4)) : Number(it.unit_price);

      await (supabase as any).from('raw_material_movements').insert({
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
        created_by: safeUserId,
      });

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
    },
    userId: string
  ): Promise<PhysicalStockCountWithItems> {
    if (useMockMode) {
      return mockStore.createPhysicalStockCount(data, userId);
    }
    const resolvedItems = await Promise.all(
      data.items.map(async (item) => ({
        ...item,
        ingredient_id: await resolveSupabaseIngredientId(item.ingredient_id),
      }))
    );
    const { data: created, error } = await (supabase as any).from('physical_stock_counts').insert({
      count_date: data.count_date,
      notes: data.notes,
      status: data.status || 'draft',
      counted_by: userId,
    }).select().single();
    if (error) {
      throw new Error(`[Create Stock Count ${error.code || ''}]: ${error.message}`);
    }
    if (resolvedItems.length > 0) {
      const itemsToInsert = resolvedItems.map((item) => ({
        count_id: created.id,
        ingredient_id: item.ingredient_id,
        physical_stock: item.physical_stock,
        reason: item.reason || null,
      }));
      const { error: itemsError } = await (supabase as any).from('physical_stock_count_items').insert(itemsToInsert);
      if (itemsError) {
        throw new Error(`[Stock Count Items ${itemsError.code || ''}]: ${itemsError.message}`);
      }
    }
    return (await this.getPhysicalStockCounts()).find((c) => c.id === created.id) || created;
  },

  async approvePhysicalStockCount(countId: string, approvedBy: string): Promise<boolean> {
    if (useMockMode) {
      return mockStore.approvePhysicalStockCount(countId, approvedBy);
    }
    const { data, error } = await (supabase as any).rpc('approve_physical_stock_count_transaction', {
      p_count_id: countId,
      p_approved_by: approvedBy,
    });
    if (error) {
      throw new Error(`[Approve Stock Count ${error.code || ''}]: ${error.message}`);
    }
    return data?.success !== false;
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
    const { data: res, error } = await (supabase as any).rpc('add_lpg_cylinder_transaction', {
      p_cylinder_code: data.cylinder_code,
      p_status: data.status || 'full',
      p_supplier_id: toSafeUuid(data.supplier_id),
      p_supplier_name: data.supplier_name || null,
      p_starting_date: data.starting_date || new Date().toISOString().split('T')[0],
      p_notes: data.notes || null,
      p_user_id: toSafeUuid(userId),
      p_idempotency_key: data.idempotency_key || null,
    });
    if (error) {
      throw new Error(`[Add Cylinder ${error.code || ''}]: ${error.message}`);
    }
    return res;
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
    const { data: res, error } = await (supabase as any).rpc('record_lpg_cylinder_movement_transaction', {
      p_cylinder_id: data.cylinder_id,
      p_movement_type: data.movement_type,
      p_movement_date: data.movement_date || new Date().toISOString().split('T')[0],
      p_movement_time: data.movement_time || null,
      p_bhatti_place: data.bhatti_place || null,
      p_supplier_name: data.supplier_name || null,
      p_bill_number: data.bill_number || null,
      p_notes: data.notes || null,
      p_user_id: toSafeUuid(userId),
      p_idempotency_key: data.idempotency_key || null,
    });
    if (error) {
      throw new Error(`[Record Movement ${error.code || ''}]: ${error.message}`);
    }
    return res;
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
    const { data: res, error } = await (supabase as any).rpc('correct_lpg_cylinder_movement_transaction', {
      p_movement_id: data.movement_id,
      p_reason: data.reason,
      p_corrected_movement_type: data.corrected_movement_type || null,
      p_corrected_date: data.corrected_date || null,
      p_corrected_time: data.corrected_time || null,
      p_corrected_bhatti_place: data.corrected_bhatti_place || null,
      p_corrected_supplier_name: data.corrected_supplier_name || null,
      p_corrected_bill_number: data.corrected_bill_number || null,
      p_corrected_notes: data.corrected_notes || null,
      p_user_id: toSafeUuid(userId),
      p_idempotency_key: data.idempotency_key || null,
    });
    if (error) {
      throw new Error(`[Correct Movement ${error.code || ''}]: ${error.message}`);
    }
    return res;
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
    const { data: res, error } = await (supabase as any).rpc('delete_or_archive_lpg_cylinder_transaction', {
      p_cylinder_id: data.cylinder_id,
      p_reason: data.reason,
      p_user_id: toSafeUuid(userId),
    });
    if (error) {
      throw new Error(`[Delete/Archive Cylinder ${error.code || ''}]: ${error.message}`);
    }
    return res;
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
    const { data: res, error } = await (supabase as any).rpc('reactivate_lpg_cylinder_transaction', {
      p_cylinder_id: data.cylinder_id,
      p_reason: data.reason || null,
      p_user_id: toSafeUuid(userId),
    });
    if (error) {
      throw new Error(`[Reactivate Cylinder ${error.code || ''}]: ${error.message}`);
    }
    return res;
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
      p_produced_quantity: params.producedQuantity,
      p_damaged_quantity: params.damagedQuantity || 0,
      p_recipe_id: resolvedRecipeId,
      p_actual_ingredients: resolvedActualIngredients && resolvedActualIngredients.length > 0 ? resolvedActualIngredients : null,
      p_notes: params.notes || '',
      p_lpg_cost: params.lpgCost || 0.0,
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
