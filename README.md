# 🍨 Janki Kulfi Management (जानकी कुल्फी प्रबंधन)

> **Production-ready, mobile-first business management system designed specifically for the daily operations, production batches, cart stock issuance, seller returns & settlements, commission accounting, and daily profit estimation of Janki Kulfi in Mirehchi, Etah, Uttar Pradesh, India.**

---

## 🌟 Key Highlights

- **🇮🇳 Tailored for Indian Field Operations**: Fully localized bilingual interface (**हिन्दी / English**), Indian Rupee formatting (`₹`), `Asia/Kolkata` timestamps, whole piece counters with integer steppers (`+`/`-`), and minimum 44px touch targets for mobile usability in the sun.
- **⚡ Authoritative Inventory Ledger**: Strict double-entry inventory tracking in `stock_movements`. Available freezer stock is computed authoritative balance (`incoming - outgoing`), preventing inventory drift.
- **🛡️ Immutable Price & Commission Snapshotting**: Unit selling prices and seller commission rates are snapshotted onto issue items and settlement receipts at transaction time, preserving historical financial integrity even after price updates.
- **🔒 Multi-Role Security & Row Level Security (RLS)**: PostgreSQL Row Level Security policies enforcing permissions for `owner`, `production_worker`, and `seller`. Sensitive actions (price edits, settlement approvals, expense voiding, day closing & reopening) require owner authorization and mandatory audit logging.
- **📶 Offline-First Draft Mode**: Field workers can record batches, issues, settlements, and expenses without an internet connection. Drafts are safely persisted in client-side **IndexedDB** and synced via idempotent transactions upon network reconnect.
- **🧪 100% Comprehensive Automated Test Suite**: 15 Vitest tests covering core arithmetic formulas, stock ledger movements, insufficient stock rejections, and a complete multi-step daily business simulation.

---

## 🏗️ Architecture & Database Design

The PostgreSQL database schema is structured into 16 normalized tables and transactional RPC functions:

```
├── 001_initial_schema.sql       # DDL: Locations, Products, Prices, Carts, Sellers,
│                                # Production, Issues, Settlements, Expenses,
│                                # Closings, Audit Logs & Views
├── 002_functions_and_rpc.sql    # Atomic Stored Procedures with explicit row locks:
│                                # - complete_production_batch()
│                                # - issue_seller_stock()
│                                # - process_seller_settlement()
│                                # - approve_pending_settlement()
│                                # - close_business_day()
│                                # - reopen_business_day()
│                                # - void_expense()
├── 003_rls_policies.sql         # Row Level Security policies for 3 user roles
├── 004_storage_setup.sql        # Supabase Storage bucket 'expense-bills'
└── seed.sql                     # Seed locations, seed products, active prices, carts
```

### Core Business Formulas Implemented:
1. **Saleable Production** = $\text{Produced} - \text{Production Damage}$
2. **Unit Production Cost** = $\frac{\text{Total Ingredient Cost}}{\text{Saleable Production}}$
3. **Sold Quantity** = $\text{Issued} - \text{Returned} - \text{Damaged} - \text{Complimentary}$
4. **Gross Sales** = $\sum(\text{Sold Quantity} \times \text{Selling Price Snapshot})$
5. **Seller Commission** = $\sum(\text{Sold Quantity} \times \text{Commission Value Snapshot})$ (or $\%$ of gross sales)
6. **Expected Collection** = $\text{Gross Sales} - \text{Seller Commission}$
7. **Total Received** = $\text{Cash} + \text{UPI}$
8. **Accounted Amount** = $\text{Cash} + \text{UPI} + \text{Approved Credit}$
9. **Shortage / Surplus** = $\text{Accounted Amount} - \text{Expected Collection}$
10. **Estimated Daily Profit** = $\text{Gross Sales} - \text{Seller Commissions} - \text{Ingredient Costs} - \text{Operating Expenses}$

---

## 🚀 Quick Start (Local Development)

### 1. Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **yarn**

### 2. Installation
```bash
# Navigate to the project directory
cd /Users/adityakumar/.gemini/antigravity-ide/scratch/janki-kulfi-management

# Install dependencies
npm install
```

### 3. Environment Setup
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Configure your Supabase credentials:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_ENABLE_MOCK_FALLBACK=true
```

> **Note**: When `VITE_ENABLE_MOCK_FALLBACK=true` or when Supabase keys are left default, the app automatically runs in **high-fidelity local mock mode** with in-memory persistence and full RPC simulation, allowing complete offline testing without an active Supabase server!

### 4. Running the Application
```bash
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## 🗄️ Supabase Migration Setup (For Production Deployment)

To connect this application to a real Supabase project:

1. Create a project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** in the Supabase Dashboard.
3. Run the migration scripts in the exact order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_functions_and_rpc.sql`
   - `supabase/migrations/003_rls_policies.sql`
   - `supabase/migrations/004_storage_setup.sql`
   - `supabase/seed.sql`
4. Set the `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in your `.env` file.
5. Set `VITE_ENABLE_MOCK_FALLBACK=false`.

---

## 🧪 Testing & Verification

Run the comprehensive test suite and type check:

```bash
# Run all unit and integration tests (Vitest)
npm run test

# Run TypeScript type checking
npm run type-check

# Build optimized production bundle
npm run build
```

---

## 👥 Demo Profiles & Quick Role Switcher

For pairing and testing different user experiences, select any simulated profile from the top-right header or login screen:

| Role | Name | Phone / Login | Permissions |
| :--- | :--- | :--- | :--- |
| **Owner** | Aditya Kumar | `7906564964` | Full administrative access, pricing, settlement approvals, expenses, daily closing & reopening, audit logs |
| **Production Worker** | Ram Niwas | `9876500002` | Production batch entry & completion, stock issue to carts, freezer stock view |
| **Seller** | Ramesh Kumar | `9876500003` | View assigned stock, submit evening returns and collections for approval |

---

## 📄 License & Attribution
Developed with ❤️ for **Janki Kulfi, Mirehchi, Etah, Uttar Pradesh, India**.
