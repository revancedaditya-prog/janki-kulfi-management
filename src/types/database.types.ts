export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'owner' | 'production_worker' | 'seller';
export type CommissionType = 'fixed' | 'percentage';
export type BatchStatus = 'draft' | 'completed' | 'cancelled' | 'corrected' | 'superseded';
export type IssueStatus = 'draft' | 'issued' | 'partially_settled' | 'settled' | 'cancelled' | 'corrected' | 'superseded';
export type SettlementStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'corrected' | 'superseded';
export type ExpenseCategory =
  | 'ingredients'
  | 'electricity'
  | 'generator_fuel'
  | 'wages'
  | 'seller_commission'
  | 'packaging'
  | 'transport'
  | 'repairs'
  | 'rent'
  | 'marketing'
  | 'other';
export type PaymentMethod = 'cash' | 'upi' | 'bank_transfer' | 'credit';
export type ExpenseStatus = 'active' | 'voided';
export type StockLocationType = 'production' | 'main_freezer' | 'seller' | 'returned' | 'damaged' | 'complimentary';
export type StockMovementType =
  | 'production_completed'
  | 'seller_issued'
  | 'seller_returned'
  | 'damaged'
  | 'complimentary'
  | 'stock_correction'
  | 'cancellation_reversal'
  | 'production_reversal'
  | 'issue_reversal'
  | 'settlement_reversal'
  | 'correction_replacement';
export type ClosingStatus = 'open' | 'closed' | 'reopened';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string;
          phone: string | null;
          role: UserRole;
          preferred_language: 'en' | 'hi';
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name: string;
          phone?: string | null;
          role?: UserRole;
          preferred_language?: 'en' | 'hi';
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone?: string | null;
          role?: UserRole;
          preferred_language?: 'en' | 'hi';
          is_active?: boolean;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name_en: string;
          name_hi: string;
          sku: string;
          description: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name_en: string;
          name_hi: string;
          sku: string;
          description?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name_en?: string;
          name_hi?: string;
          sku?: string;
          description?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      product_prices: {
        Row: {
          id: string;
          product_id: string;
          selling_price: number;
          commission_type: CommissionType;
          commission_value: number;
          effective_from: string;
          effective_to: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          selling_price: number;
          commission_type?: CommissionType;
          commission_value: number;
          effective_from?: string;
          effective_to?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          selling_price?: number;
          commission_type?: CommissionType;
          commission_value?: number;
          effective_from?: string;
          effective_to?: string | null;
        };
      };
      carts: {
        Row: {
          id: string;
          cart_code: string;
          cart_name: string;
          location: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          cart_code: string;
          cart_name: string;
          location?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cart_code?: string;
          cart_name?: string;
          location?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
      };
      sellers: {
        Row: {
          id: string;
          seller_code: string;
          full_name: string;
          phone: string | null;
          address: string | null;
          user_profile_id: string | null;
          default_cart_id: string | null;
          is_active: boolean;
          opening_balance: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          seller_code: string;
          full_name: string;
          phone?: string | null;
          address?: string | null;
          user_profile_id?: string | null;
          default_cart_id?: string | null;
          is_active?: boolean;
          opening_balance?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          seller_code?: string;
          full_name?: string;
          phone?: string | null;
          address?: string | null;
          user_profile_id?: string | null;
          default_cart_id?: string | null;
          is_active?: boolean;
          opening_balance?: number;
          updated_at?: string;
        };
      };
      stock_locations: {
        Row: {
          id: string;
          location_type: StockLocationType;
          name: string;
          seller_id: string | null;
          cart_id: string | null;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          location_type: StockLocationType;
          name: string;
          seller_id?: string | null;
          cart_id?: string | null;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          location_type?: StockLocationType;
          name?: string;
          seller_id?: string | null;
          cart_id?: string | null;
          is_active?: boolean;
        };
      };
      production_batches: {
        Row: {
          id: string;
          batch_number: string;
          production_date: string;
          status: BatchStatus;
          total_ingredient_cost: number;
          notes: string | null;
          completed_at: string | null;
          version_number: number;
          is_current_version: boolean;
          correction_of_id: string | null;
          superseded_by_id: string | null;
          correction_reason: string | null;
          corrected_by: string | null;
          corrected_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          batch_number: string;
          production_date?: string;
          status?: BatchStatus;
          total_ingredient_cost?: number;
          notes?: string | null;
          completed_at?: string | null;
          version_number?: number;
          is_current_version?: boolean;
          correction_of_id?: string | null;
          superseded_by_id?: string | null;
          correction_reason?: string | null;
          corrected_by?: string | null;
          corrected_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          batch_number?: string;
          production_date?: string;
          status?: BatchStatus;
          total_ingredient_cost?: number;
          notes?: string | null;
          completed_at?: string | null;
          version_number?: number;
          is_current_version?: boolean;
          correction_of_id?: string | null;
          superseded_by_id?: string | null;
          correction_reason?: string | null;
          corrected_by?: string | null;
          corrected_at?: string | null;
          updated_at?: string;
        };
      };
      production_items: {
        Row: {
          id: string;
          batch_id: string;
          product_id: string;
          produced_quantity: number;
          damaged_quantity: number;
          saleable_quantity: number;
          allocated_ingredient_cost: number;
          unit_production_cost: number;
          notes: string | null;
        };
        Insert: {
          id?: string;
          batch_id: string;
          product_id: string;
          produced_quantity: number;
          damaged_quantity?: number;
          saleable_quantity: number;
          allocated_ingredient_cost?: number;
          unit_production_cost?: number;
          notes?: string | null;
        };
        Update: {
          id?: string;
          batch_id?: string;
          product_id?: string;
          produced_quantity?: number;
          damaged_quantity?: number;
          saleable_quantity?: number;
          allocated_ingredient_cost?: number;
          unit_production_cost?: number;
          notes?: string | null;
        };
      };
      seller_issues: {
        Row: {
          id: string;
          issue_number: string;
          seller_id: string;
          cart_id: string | null;
          issue_date: string;
          status: IssueStatus;
          issued_at: string | null;
          notes: string | null;
          version_number: number;
          is_current_version: boolean;
          correction_of_id: string | null;
          superseded_by_id: string | null;
          correction_reason: string | null;
          corrected_by: string | null;
          corrected_at: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          issue_number: string;
          seller_id: string;
          cart_id?: string | null;
          issue_date?: string;
          status?: IssueStatus;
          issued_at?: string | null;
          notes?: string | null;
          version_number?: number;
          is_current_version?: boolean;
          correction_of_id?: string | null;
          superseded_by_id?: string | null;
          correction_reason?: string | null;
          corrected_by?: string | null;
          corrected_at?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          issue_number?: string;
          seller_id?: string;
          cart_id?: string | null;
          issue_date?: string;
          status?: IssueStatus;
          issued_at?: string | null;
          notes?: string | null;
          version_number?: number;
          is_current_version?: boolean;
          correction_of_id?: string | null;
          superseded_by_id?: string | null;
          correction_reason?: string | null;
          corrected_by?: string | null;
          corrected_at?: string | null;
          updated_at?: string;
        };
      };
      seller_issue_items: {
        Row: {
          id: string;
          seller_issue_id: string;
          product_id: string;
          issued_quantity: number;
          unit_selling_price_snapshot: number;
          commission_type_snapshot: string;
          commission_value_snapshot: number;
        };
        Insert: {
          id?: string;
          seller_issue_id: string;
          product_id: string;
          issued_quantity: number;
          unit_selling_price_snapshot: number;
          commission_type_snapshot?: string;
          commission_value_snapshot: number;
        };
        Update: {
          id?: string;
          seller_issue_id?: string;
          product_id?: string;
          issued_quantity?: number;
          unit_selling_price_snapshot?: number;
          commission_type_snapshot?: string;
          commission_value_snapshot?: number;
        };
      };
      seller_settlements: {
        Row: {
          id: string;
          settlement_number: string;
          seller_issue_id: string;
          seller_id: string;
          settlement_date: string;
          status: SettlementStatus;
          cash_received: number;
          upi_received: number;
          credit_amount: number;
          gross_sales: number;
          total_commission: number;
          expected_collection: number;
          total_received: number;
          outstanding_amount: number;
          shortage_amount: number;
          notes: string | null;
          submitted_by: string | null;
          approved_by: string | null;
          submitted_at: string | null;
          approved_at: string | null;
          version_number: number;
          is_current_version: boolean;
          correction_of_id: string | null;
          superseded_by_id: string | null;
          correction_reason: string | null;
          corrected_by: string | null;
          corrected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          settlement_number: string;
          seller_issue_id: string;
          seller_id: string;
          settlement_date?: string;
          status?: SettlementStatus;
          cash_received?: number;
          upi_received?: number;
          credit_amount?: number;
          gross_sales?: number;
          total_commission?: number;
          expected_collection?: number;
          total_received?: number;
          outstanding_amount?: number;
          shortage_amount?: number;
          notes?: string | null;
          submitted_by?: string | null;
          approved_by?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          version_number?: number;
          is_current_version?: boolean;
          correction_of_id?: string | null;
          superseded_by_id?: string | null;
          correction_reason?: string | null;
          corrected_by?: string | null;
          corrected_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          settlement_number?: string;
          seller_issue_id?: string;
          seller_id?: string;
          settlement_date?: string;
          status?: SettlementStatus;
          cash_received?: number;
          upi_received?: number;
          credit_amount?: number;
          gross_sales?: number;
          total_commission?: number;
          expected_collection?: number;
          total_received?: number;
          outstanding_amount?: number;
          shortage_amount?: number;
          notes?: string | null;
          submitted_by?: string | null;
          approved_by?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          version_number?: number;
          is_current_version?: boolean;
          correction_of_id?: string | null;
          superseded_by_id?: string | null;
          correction_reason?: string | null;
          corrected_by?: string | null;
          corrected_at?: string | null;
          updated_at?: string;
        };
      };
      settlement_items: {
        Row: {
          id: string;
          settlement_id: string;
          seller_issue_item_id: string;
          product_id: string;
          issued_quantity_snapshot: number;
          returned_quantity: number;
          damaged_quantity: number;
          complimentary_quantity: number;
          sold_quantity: number;
          selling_price_snapshot: number;
          gross_sales: number;
          commission_amount: number;
          damage_reason: string | null;
          complimentary_reason: string | null;
        };
        Insert: {
          id?: string;
          settlement_id: string;
          seller_issue_item_id: string;
          product_id: string;
          issued_quantity_snapshot: number;
          returned_quantity?: number;
          damaged_quantity?: number;
          complimentary_quantity?: number;
          sold_quantity: number;
          selling_price_snapshot: number;
          gross_sales: number;
          commission_amount?: number;
          damage_reason?: string | null;
          complimentary_reason?: string | null;
        };
        Update: {
          id?: string;
          settlement_id?: string;
          seller_issue_item_id?: string;
          product_id?: string;
          issued_quantity_snapshot?: number;
          returned_quantity?: number;
          damaged_quantity?: number;
          complimentary_quantity?: number;
          sold_quantity?: number;
          selling_price_snapshot?: number;
          gross_sales?: number;
          commission_amount?: number;
          damage_reason?: string | null;
          complimentary_reason?: string | null;
        };
      };
      expenses: {
        Row: {
          id: string;
          expense_date: string;
          category: ExpenseCategory;
          amount: number;
          payment_method: PaymentMethod;
          description: string;
          vendor_name: string | null;
          bill_image_path: string | null;
          status: ExpenseStatus;
          void_reason: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          expense_date?: string;
          category: ExpenseCategory;
          amount: number;
          payment_method?: PaymentMethod;
          description: string;
          vendor_name?: string | null;
          bill_image_path?: string | null;
          status?: ExpenseStatus;
          void_reason?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          expense_date?: string;
          category?: ExpenseCategory;
          amount?: number;
          payment_method?: PaymentMethod;
          description?: string;
          vendor_name?: string | null;
          bill_image_path?: string | null;
          status?: ExpenseStatus;
          void_reason?: string | null;
          updated_at?: string;
        };
      };
      stock_movements: {
        Row: {
          id: string;
          movement_date: string;
          product_id: string;
          source_location_id: string | null;
          destination_location_id: string | null;
          quantity: number;
          movement_type: StockMovementType;
          reference_table: string | null;
          reference_id: string | null;
          reversal_of_movement_id?: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          movement_date?: string;
          product_id: string;
          source_location_id?: string | null;
          destination_location_id?: string | null;
          quantity: number;
          movement_type: StockMovementType;
          reference_table?: string | null;
          reference_id?: string | null;
          reversal_of_movement_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          movement_date?: string;
          product_id?: string;
          source_location_id?: string | null;
          destination_location_id?: string | null;
          quantity?: number;
          movement_type?: StockMovementType;
          reference_table?: string | null;
          reference_id?: string | null;
          reversal_of_movement_id?: string | null;
          notes?: string | null;
          created_by?: string | null;
        };
      };
      daily_closings: {
        Row: {
          id: string;
          business_date: string;
          status: ClosingStatus;
          total_produced: number;
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
          total_expenses: number;
          estimated_profit: number;
          closing_stock_value: number;
          notes: string | null;
          closed_by: string | null;
          closed_at: string;
          reopened_by: string | null;
          reopened_at: string | null;
          reopen_reason: string | null;
        };
        Insert: {
          id?: string;
          business_date: string;
          status?: ClosingStatus;
          total_produced?: number;
          total_sold?: number;
          total_returned?: number;
          total_damaged?: number;
          total_complimentary?: number;
          gross_sales?: number;
          total_commission?: number;
          net_sales?: number;
          cash_received?: number;
          upi_received?: number;
          credit_sales?: number;
          total_expenses?: number;
          estimated_profit?: number;
          closing_stock_value?: number;
          notes?: string | null;
          closed_by?: string | null;
          closed_at?: string;
          reopened_by?: string | null;
          reopened_at?: string | null;
          reopen_reason?: string | null;
        };
        Update: {
          id?: string;
          business_date?: string;
          status?: ClosingStatus;
          total_produced?: number;
          total_sold?: number;
          total_returned?: number;
          total_damaged?: number;
          total_complimentary?: number;
          gross_sales?: number;
          total_commission?: number;
          net_sales?: number;
          cash_received?: number;
          upi_received?: number;
          credit_sales?: number;
          total_expenses?: number;
          estimated_profit?: number;
          closing_stock_value?: number;
          notes?: string | null;
          closed_by?: string | null;
          closed_at?: string;
          reopened_by?: string | null;
          reopened_at?: string | null;
          reopen_reason?: string | null;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          table_name: string;
          record_id: string;
          action: string;
          old_data: Json | null;
          new_data: Json | null;
          reason: string | null;
          performed_by: string | null;
          performed_at: string;
        };
        Insert: {
          id?: string;
          table_name: string;
          record_id: string;
          action: string;
          old_data?: Json | null;
          new_data?: Json | null;
          reason?: string | null;
          performed_by?: string | null;
          performed_at?: string;
        };
        Update: {
          id?: string;
          table_name?: string;
          record_id?: string;
          action?: string;
          old_data?: Json | null;
          new_data?: Json | null;
          reason?: string | null;
        };
      };
    };
    Views: {
      v_freezer_stock: {
        Row: {
          product_id: string;
          name_en: string;
          name_hi: string;
          sku: string;
          is_active: boolean;
          available_quantity: number;
        };
      };
      v_seller_stock: {
        Row: {
          seller_id: string;
          seller_name: string;
          seller_code: string;
          product_id: string;
          name_en: string;
          name_hi: string;
          current_held_quantity: number;
        };
      };
    };
    Functions: {
      complete_production_batch: {
        Args: {
          p_batch_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      issue_seller_stock: {
        Args: {
          p_seller_id: string;
          p_cart_id: string | null;
          p_issue_date: string;
          p_items: Json;
          p_notes: string | null;
          p_user_id: string;
        };
        Returns: Json;
      };
      process_seller_settlement: {
        Args: {
          p_seller_issue_id: string;
          p_settlement_date: string;
          p_items: Json;
          p_cash: number;
          p_upi: number;
          p_credit: number;
          p_notes: string | null;
          p_is_approved_by_owner: boolean;
          p_user_id: string;
        };
        Returns: Json;
      };
      approve_pending_settlement: {
        Args: {
          p_settlement_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      close_business_day: {
        Args: {
          p_business_date: string;
          p_notes: string | null;
          p_user_id: string;
        };
        Returns: Json;
      };
      reopen_business_day: {
        Args: {
          p_business_date: string;
          p_reason: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      void_expense: {
        Args: {
          p_expense_id: string;
          p_reason: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      adjust_stock: {
        Args: {
          p_product_id: string;
          p_location_id: string;
          p_quantity: number;
          p_movement_type: StockMovementType;
          p_reason: string;
          p_user_id: string;
        };
        Returns: Json;
      };
    };
  };
}
