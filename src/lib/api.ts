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
  ): Promise<ProductionBatchWithItems> {
    if (useMockMode) {
      return mockStore.createProductionBatch(productionDate, totalIngredientCost, notes, items, userId);
    }

    const { data, error } = await (supabase as any).rpc('create_production_batch_transaction', {
      p_date: productionDate,
      p_cost: totalIngredientCost,
      p_notes: notes,
      p_items: items,
      p_user_id: userId,
    });
    if (error) throw error;
    return data;
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
};
