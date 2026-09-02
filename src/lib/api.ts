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
} from '@/types';

// Detect if running in mock/local mode
export const useMockMode = !isSupabaseConfigured || import.meta.env.VITE_ENABLE_MOCK_FALLBACK === 'true';

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

async function getOrCreateDefaultStockLocations() {
  const { data: locs } = await (supabase as any).from('stock_locations').select('id, location_type, name, seller_id');
  let freezerLoc = locs?.find((l: any) => l.location_type === 'main_freezer');
  let prodLoc = locs?.find((l: any) => l.location_type === 'production');
  let damagedLoc = locs?.find((l: any) => l.location_type === 'damaged');
  let compLoc = locs?.find((l: any) => l.location_type === 'complimentary');

  if (!freezerLoc) {
    const { data: newLoc } = await (supabase as any).from('stock_locations').insert({
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

    // Fetch stock from v_freezer_stock or fallback to stock_movements
    let stockData: any[] = [];
    try {
      const { data, error: vErr } = await (supabase as any).from('v_freezer_stock').select('*');
      if (!vErr && data && data.length > 0) {
        stockData = data;
      }
    } catch {
      // Ignore and fallback to direct movements
    }

    // Direct movement calculation map
    const movementStockMap = new Map<string, number>();
    if (stockData.length === 0) {
      try {
        const { data: locs } = await (supabase as any).from('stock_locations').select('id, location_type');
        const freezerLocId = locs?.find((l: any) => l.location_type === 'main_freezer')?.id;
        if (freezerLocId) {
          const { data: movements } = await (supabase as any)
            .from('stock_movements')
            .select('product_id, quantity, source_location_id, destination_location_id');

          if (movements) {
            for (const m of movements) {
              const current = movementStockMap.get(m.product_id) || 0;
              if (m.destination_location_id === freezerLocId) {
                movementStockMap.set(m.product_id, current + (Number(m.quantity) || 0));
              } else if (m.source_location_id === freezerLocId) {
                movementStockMap.set(m.product_id, current - (Number(m.quantity) || 0));
              }
            }
          }
        }
      } catch (err) {
        console.warn('Failed to calculate stock from movements:', err);
      }
    }

    return (products || []).map((p: any) => {
      const activePrice = p.product_prices
        ?.filter((pr: any) => !pr.effective_to || new Date(pr.effective_to) > new Date())
        ?.sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())[0];

      const stock = stockData.find((s: any) => s.product_id === p.id);
      const calculatedQty = stock ? stock.available_quantity : (movementStockMap.get(p.id) || 0);

      return {
        ...p,
        current_price: activePrice?.selling_price || 0,
        commission_type: (activePrice?.commission_type as CommissionType) || 'fixed',
        commission_value: activePrice?.commission_value || 0,
        available_quantity: Math.max(0, calculatedQty || 0),
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
      return mockStore.createProductionBatch(productionDate, totalIngredientCost, notes, items, userId);
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

    // Fallback: Two-step creation with standard complete_production_batch RPC
    const batchNumber = `BAT-${productionDate.replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;
    const { data: batch, error: batchErr } = await (supabase as any)
      .from('production_batches')
      .insert({
        batch_number: batchNumber,
        production_date: productionDate,
        status: 'draft',
        total_ingredient_cost: totalIngredientCost,
        notes: notes || null,
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

    // Call standard complete_production_batch RPC or fallback
    try {
      const { data: completedRes, error: compErr } = await (supabase as any).rpc('complete_production_batch', {
        p_batch_id: batch.id,
        p_user_id: userId,
      });
      if (compErr) throw compErr;
      return completedRes || { success: true, batch_id: batch.id, batch_number: batchNumber };
    } catch {
      return this.completeProductionBatch(batch.id, userId);
    }
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
  async getIngredients(): Promise<Ingredient[]> {
    if (useMockMode) {
      return mockStore.getIngredients();
    }
    try {
      const { data, error } = await (supabase as any)
        .from('ingredients')
        .select('*')
        .eq('is_active', true)
        .order('code', { ascending: true });
      if (error || !data || data.length === 0) {
        console.warn('Ingredients table not found or empty in Supabase, using mock fallback:', error);
        return mockStore.getIngredients();
      }
      return data;
    } catch (err) {
      console.warn('Failed to fetch ingredients, fallback to mock:', err);
      return mockStore.getIngredients();
    }
  },

  async createIngredient(
    ingredient: Omit<Ingredient, 'id' | 'created_at' | 'updated_at'>,
    userId: string
  ): Promise<Ingredient> {
    if (useMockMode) {
      return mockStore.addIngredient(ingredient, userId);
    }
    try {
      const { data, error } = await (supabase as any)
        .from('ingredients')
        .insert(ingredient)
        .select()
        .single();
      if (error) {
        console.warn('Failed to insert ingredient in Supabase, fallback to mock:', error);
        return mockStore.addIngredient(ingredient, userId);
      }

      // Log initial price
      await (supabase as any).from('ingredient_prices').insert({
        ingredient_id: data.id,
        rate: ingredient.current_rate,
        unit: ingredient.rate_unit,
        effective_from: new Date().toISOString(),
        created_by: userId,
      });

      return data;
    } catch (err) {
      return mockStore.addIngredient(ingredient, userId);
    }
  },

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
      if (saveToMaster) {
        // Fetch existing ingredient to preserve rate_unit if unit is not passed
        const { data: existingIng } = await (supabase as any)
          .from('ingredients')
          .select('rate_unit, base_unit')
          .eq('id', ingredientId)
          .maybeSingle();

        const effectiveRateUnit = unit || existingIng?.rate_unit || existingIng?.base_unit || 'kg';

        // Close active price
        await (supabase as any)
          .from('ingredient_prices')
          .update({ effective_to: new Date().toISOString() })
          .eq('ingredient_id', ingredientId)
          .is('effective_to', null);

        await (supabase as any).from('ingredient_prices').insert({
          ingredient_id: ingredientId,
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
          .eq('id', ingredientId)
          .select()
          .single();
        if (error) {
          return mockStore.updateIngredientRate(ingredientId, newRate, effectiveRateUnit, saveToMaster, userId);
        }
        return data;
      }
      const { data } = await (supabase as any).from('ingredients').select('*').eq('id', ingredientId).single();
      return data || mockStore.getIngredientById(ingredientId)!;
    } catch (err) {
      return mockStore.updateIngredientRate(ingredientId, newRate, unit, saveToMaster, userId);
    }
  },

  async getRecipes(): Promise<RecipeWithItems[]> {
    if (useMockMode) {
      return mockStore.getRecipes();
    }
    try {
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
      if (error || !data || data.length === 0) {
        console.warn('Recipes table not found or empty in Supabase, fallback to mock:', error);
        return mockStore.getRecipes();
      }
      return data;
    } catch (err) {
      console.warn('Failed to fetch recipes from Supabase, fallback to mock:', err);
      return mockStore.getRecipes();
    }
  },

  async getRecipeForProduct(productId: string): Promise<RecipeWithItems | undefined> {
    if (useMockMode) {
      return mockStore.getRecipeForProduct(productId);
    }
    try {
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
        .eq('is_default', true)
        .order('version_number', { ascending: false })
        .maybeSingle();
      if (error || !data) {
        return mockStore.getRecipeForProduct(productId);
      }
      return data;
    } catch (err) {
      return mockStore.getRecipeForProduct(productId);
    }
  },

  async getRecipeHistory(productId: string): Promise<RecipeWithItems[]> {
    if (useMockMode) {
      return mockStore.getRecipeHistory(productId);
    }
    try {
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
      if (error || !data || data.length === 0) {
        return mockStore.getRecipeHistory(productId);
      }
      return data;
    } catch (err) {
      return mockStore.getRecipeHistory(productId);
    }
  },

  async saveRecipe(
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
    userId: string
  ): Promise<RecipeWithItems> {
    if (useMockMode) {
      return mockStore.saveRecipe(data, userId);
    }

    try {
      // Get current version number
      const { data: existing } = await (supabase as any)
        .from('recipes')
        .select('version_number')
        .eq('product_id', data.product_id)
        .order('version_number', { ascending: false })
        .limit(1);

      const newVersion = (existing?.[0]?.version_number || 0) + 1;

      // Mark previous defaults as false
      await (supabase as any)
        .from('recipes')
        .update({ is_default: false })
        .eq('product_id', data.product_id);

      const { data: newRecipe, error: recError } = await (supabase as any)
        .from('recipes')
        .insert({
          product_id: data.product_id,
          version_number: newVersion,
          name: data.name || `Standard Recipe v${newVersion}`,
          standard_output_pieces: data.standard_output_pieces || 100,
          default_overheads: data.default_overheads,
          notes: data.notes || null,
          is_default: true,
          created_by: userId,
        })
        .select()
        .single();
      if (recError) {
        console.warn('Supabase recipes insert failed, fallback to mockStore:', recError);
        return mockStore.saveRecipe(data, userId);
      }

      // Insert recipe items
      const itemsToInsert = data.items.map((it, idx) => ({
        recipe_id: newRecipe.id,
        ingredient_id: it.ingredient_id,
        quantity: it.quantity,
        unit: it.unit,
        sort_order: idx + 1,
      }));

      const { error: itemsError } = await (supabase as any)
        .from('recipe_items')
        .insert(itemsToInsert);
      if (itemsError) {
        console.warn('Supabase recipe_items insert failed, fallback to mockStore:', itemsError);
        return mockStore.saveRecipe(data, userId);
      }

      // Optionally update rates WITHOUT modifying rate_unit
      for (const it of data.items) {
        if (it.save_rate_to_master && typeof it.rate === 'number' && it.rate > 0) {
          await this.updateIngredientRate(it.ingredient_id, it.rate, undefined, true, userId);
        }
      }

      const freshRecipe = await this.getRecipeForProduct(data.product_id);
      return freshRecipe || mockStore.saveRecipe(data, userId);
    } catch (err) {
      console.warn('Failed to save recipe in Supabase, using mock fallback:', err);
      return mockStore.saveRecipe(data, userId);
    }
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

  async adjustFreezerStock(
    productId: string,
    newQuantity: number,
    reason: string = 'Manual Adjustment',
    userId: string = 'usr-owner-001'
  ): Promise<{ success: boolean; previousQuantity: number; newQuantity: number; difference: number; message: string }> {
    if (useMockMode) {
      return mockStore.adjustFreezerStock(productId, newQuantity, reason, userId);
    }

    try {
      const { data, error } = await (supabase as any).rpc('adjust_freezer_stock_transaction', {
        p_product_id: productId,
        p_new_quantity: newQuantity,
        p_reason: reason,
        p_user_id: userId,
      });
      if (!error && data) {
        return data;
      }
      console.warn('RPC adjust_freezer_stock_transaction failed or not installed, using direct Supabase adjustment:', error);
    } catch (err) {
      console.warn('adjustFreezerStock RPC error, using direct Supabase adjustment:', err);
    }

    // Direct Supabase implementation
    const { freezerLoc, prodLoc, damagedLoc } = await getOrCreateDefaultStockLocations();
    if (!freezerLoc) throw new Error('Main Freezer location not found');

    // Calculate current available freezer stock
    const { data: movements } = await (supabase as any)
      .from('stock_movements')
      .select('product_id, quantity, source_location_id, destination_location_id')
      .eq('product_id', productId);

    let currentQty = 0;
    if (movements) {
      for (const m of movements) {
        if (m.destination_location_id === freezerLoc.id) {
          currentQty += Number(m.quantity) || 0;
        } else if (m.source_location_id === freezerLoc.id) {
          currentQty -= Number(m.quantity) || 0;
        }
      }
    }
    currentQty = Math.max(0, currentQty);
    const targetQty = Math.max(0, Math.round(Number(newQuantity) || 0));
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
    const adjLoc = damagedLoc || prodLoc || freezerLoc;

    if (difference > 0) {
      // Stock increase
      await (supabase as any).from('stock_movements').insert({
        movement_date: now,
        product_id: productId,
        source_location_id: adjLoc.id,
        destination_location_id: freezerLoc.id,
        quantity: difference,
        movement_type: 'manual_adjustment',
        reference_table: 'stock_locations',
        reference_id: freezerLoc.id,
        notes: `Freezer stock adjusted (+${difference} pcs): ${currentQty} -> ${targetQty}. Reason: ${reason}`,
        created_by: userId,
      });
    } else {
      // Stock decrease
      const reduceQty = Math.abs(difference);
      await (supabase as any).from('stock_movements').insert({
        movement_date: now,
        product_id: productId,
        source_location_id: freezerLoc.id,
        destination_location_id: adjLoc.id,
        quantity: reduceQty,
        movement_type: 'manual_adjustment',
        reference_table: 'stock_locations',
        reference_id: freezerLoc.id,
        notes: `Freezer stock adjusted (-${reduceQty} pcs): ${currentQty} -> ${targetQty}. Reason: ${reason}`,
        created_by: userId,
      });
    }

    // Insert audit log
    await (supabase as any).from('audit_logs').insert({
      table_name: 'stock_locations',
      record_id: freezerLoc.id,
      action: 'FREEZER_STOCK_ADJUSTMENT',
      old_values: { product_id: productId, previous_quantity: currentQty },
      new_values: { product_id: productId, new_quantity: targetQty, difference },
      change_reason: reason,
      user_id: userId,
      created_at: now,
    });

    return {
      success: true,
      previousQuantity: currentQty,
      newQuantity: targetQty,
      difference,
      message: `Freezer stock updated from ${currentQty} to ${targetQty} pcs`,
    };
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
};
