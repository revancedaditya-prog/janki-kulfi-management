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

    const { data: stockData } = await (supabase as any).from('v_freezer_stock').select('*');

    return (products || []).map((p: any) => {
      const activePrice = p.product_prices
        ?.filter((pr: any) => !pr.effective_to || new Date(pr.effective_to) > new Date())
        ?.sort((a: any, b: any) => new Date(b.effective_from).getTime() - new Date(a.effective_from).getTime())[0];
      const stock = stockData?.find((s: any) => s.product_id === p.id);

      return {
        ...p,
        current_price: activePrice?.selling_price || 0,
        commission_type: (activePrice?.commission_type as CommissionType) || 'fixed',
        commission_value: activePrice?.commission_value || 0,
        available_quantity: stock?.available_quantity || 0,
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

    // Call standard complete_production_batch RPC
    try {
      const { data: completedRes, error: compErr } = await (supabase as any).rpc('complete_production_batch', {
        p_batch_id: batch.id,
        p_user_id: userId,
      });
      if (compErr) throw compErr;
      return completedRes || { success: true, batch_id: batch.id, batch_number: batchNumber };
    } catch {
      return { success: true, batch_id: batch.id, batch_number: batchNumber };
    }
  },

  async completeProductionBatch(batchId: string, userId: string): Promise<any> {
    if (useMockMode) {
      return mockStore.completeProductionBatch(batchId, userId);
    }
    const { data, error } = await (supabase as any).rpc('complete_production_batch', {
      p_batch_id: batchId,
      p_user_id: userId,
    });
    if (error) throw error;
    return data;
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
    const { data, error } = await (supabase as any).rpc('correct_completed_production', {
      p_batch_id: batchId,
      p_date: productionDate,
      p_cost: totalIngredientCost,
      p_notes: notes,
      p_items: items,
      p_reason: reason,
      p_user_id: userId,
    });
    if (error) throw error;
    return data;
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
    const { data, error } = await (supabase as any)
      .from('ingredients')
      .select('*')
      .eq('is_active', true)
      .order('code', { ascending: true });
    if (error) {
      console.warn('Failed to fetch ingredients from Supabase, falling back to mock:', error);
      return mockStore.getIngredients();
    }
    return data || [];
  },

  async createIngredient(
    ingredient: Omit<Ingredient, 'id' | 'created_at' | 'updated_at'>,
    userId: string
  ): Promise<Ingredient> {
    if (useMockMode) {
      return mockStore.addIngredient(ingredient, userId);
    }
    const { data, error } = await (supabase as any)
      .from('ingredients')
      .insert(ingredient)
      .select()
      .single();
    if (error) throw error;

    // Log initial price
    await (supabase as any).from('ingredient_prices').insert({
      ingredient_id: data.id,
      rate: ingredient.current_rate,
      unit: ingredient.rate_unit,
      effective_from: new Date().toISOString(),
      created_by: userId,
    });

    return data;
  },

  async updateIngredientRate(
    ingredientId: string,
    newRate: number,
    unit: UnitType,
    saveToMaster: boolean = true,
    userId: string = 'usr-owner-001'
  ): Promise<Ingredient> {
    if (useMockMode) {
      return mockStore.updateIngredientRate(ingredientId, newRate, unit, saveToMaster, userId);
    }
    if (saveToMaster) {
      // Close active price
      await (supabase as any)
        .from('ingredient_prices')
        .update({ effective_to: new Date().toISOString() })
        .eq('ingredient_id', ingredientId)
        .is('effective_to', null);

      await (supabase as any).from('ingredient_prices').insert({
        ingredient_id: ingredientId,
        rate: newRate,
        unit,
        effective_from: new Date().toISOString(),
        created_by: userId,
      });

      const { data, error } = await (supabase as any)
        .from('ingredients')
        .update({
          current_rate: newRate,
          rate_unit: unit,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ingredientId)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const { data } = await (supabase as any).from('ingredients').select('*').eq('id', ingredientId).single();
    return data;
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
      console.warn('Failed to fetch recipes from Supabase, fallback to mock:', error);
      return mockStore.getRecipes();
    }
    return data || [];
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
      .eq('is_default', true)
      .order('version_number', { ascending: false })
      .maybeSingle();
    if (error) {
      console.warn('Failed to fetch recipe for product from Supabase, fallback to mock:', error);
      return mockStore.getRecipeForProduct(productId);
    }
    return data || mockStore.getRecipeForProduct(productId);
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
      console.warn('Failed to fetch recipe history, fallback to mock:', error);
      return mockStore.getRecipeHistory(productId);
    }
    return data || [];
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
    if (recError) throw recError;

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
    if (itemsError) throw itemsError;

    // Optionally update rates
    for (const it of data.items) {
      if (it.save_rate_to_master && typeof it.rate === 'number' && it.rate > 0) {
        await this.updateIngredientRate(it.ingredient_id, it.rate, it.unit, true, userId);
      }
    }

    return this.getRecipeForProduct(data.product_id) as any;
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

    if (error) {
      console.warn('RPC create_production_costing_batch_transaction failed, using fallback:', error);
      return mockStore.createProductionCostingBatch(data, userId);
    }

    return res;
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
    const { data, error } = await (supabase as any).rpc('issue_seller_stock', {
      p_seller_id: sellerId,
      p_cart_id: cartId,
      p_issue_date: issueDate,
      p_items: items,
      p_notes: notes,
      p_user_id: userId,
    });
    if (error) throw error;
    return data;
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
    if (error) throw error;
    return data;
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
    if (error) throw error;
    return data;
  },

  async approvePendingSettlement(settlementId: string, userId: string): Promise<any> {
    if (useMockMode) {
      return mockStore.approvePendingSettlement(settlementId, userId);
    }
    const { data, error } = await (supabase as any).rpc('approve_pending_settlement', {
      p_settlement_id: settlementId,
      p_user_id: userId,
    });
    if (error) throw error;
    return data;
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
    if (error) throw error;
    return data;
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
