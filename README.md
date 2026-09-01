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

---

## 🛡️ Backup Center & Disaster Recovery Guide

The application includes an **Owner-Only Backup Center** (`Settings → Backup Center` or `/settings/backup`) for disaster recovery, auditing, and offline compliance.

### 1. How Owner Backup Works
- **Complete Offline Backup ("Download Complete Backup")**:
  - Exports all 16 database tables (`profiles`, `products`, `product_prices`, `sellers`, `carts`, `production_batches`, `production_items`, `seller_issues`, `seller_issue_items`, `seller_settlements`, `settlement_items`, `expenses`, `stock_locations`, `stock_movements`, `daily_closings`, `audit_logs`).
  - Automatically sanitizes user profiles: Strips passwords, auth hashes, JWT access tokens, and environment secrets.
  - Outputs `janki-kulfi-backup-YYYY-MM-DD-HHmm.zip` containing:
    - `manifest.json`: Application metadata, schema version, Asia/Kolkata creation timestamp, table names, row counts, and SHA-256 checksums for every file.
    - `*.json`: Full raw JSON records per table.
    - `*.csv`: Formatted CSV sheets for reporting (Excel/LibreOffice).
    - `README.txt`: Disaster recovery notes and verification guidelines.
  - Logs operation in `backup_history` and `audit_logs`.
- **Date-Range Reporting Export ("Download Date-Range Backup")**:
  - Filtered export of production batches, stock issues, seller settlements, expenses, day closings, and inventory movements between selected start and end dates.
  - Clearly labeled as a filtered reporting archive (not a complete disaster recovery backup).
- **Expense Bills Storage Backup ("Download Expense Bills")**:
  - Downloads physical receipt photos from the private `expense-bills` Supabase Storage bucket.
  - Generates `expense-bills-manifest.json` mapping each receipt file to its respective expense ID, date, amount, category, and vendor, while reporting any missing or orphaned files.

---

### 2. Where to Store Backups
- Store regular backups on an **encrypted external USB drive** or **dedicated offline hard drive** kept in a safe physical location.
- Optionally upload to a secure, password-protected cold cloud storage folder (e.g. Google Drive with 2FA or encrypted AWS S3 bucket).
- **NEVER** commit backup ZIP files to public git repositories or share unencrypted archives over insecure messaging apps.

---

### 3. How to Validate a Backup
1. Go to **Settings → Backup Center**.
2. Under **"बैकअप सत्यापन (Validate Backup ZIP)"**, select or drop any backup `.zip` file.
3. The tool executes **100% client-side**:
   - Reads `manifest.json` without modifying your database or uploading data.
   - Calculates real-time SHA-256 hashes for every file in the archive and matches them against `manifest.file_checksums`.
   - Compares internal JSON row counts with manifest declarations.
   - Flags missing files, format version discrepancies, or tampering immediately.

---

### 4. Why IndexedDB is NOT a Backup
- **IndexedDB is temporary offline working cache**:
  - It holds unsynced draft batches, stock issues, and settlements created while field workers or carts are without internet.
  - **Browser cache clearing, device resets, browser storage eviction, or private/incognito browsing will wipe IndexedDB data.**
  - Offline drafts are not considered authoritative business records until synced with Supabase.
  - Use the **"Export Drafts (JSON)"** button in Backup Center if you need an emergency local dump of unsynced offline drafts.

---

### 5. Full PostgreSQL Backup with Supabase CLI (Server-Level Disaster Recovery)
To perform a complete raw SQL database dump using Supabase CLI:

```bash
# 1. Login to Supabase CLI
npx supabase login

# 2. Link your local directory to your remote project
npx supabase link --project-ref viodkbdrjhdutbzrgyeo

# 3. Dump database schema and data into SQL file
npx supabase db dump --data-only -f janki_kulfi_data_$(date +%Y%m%d).sql
npx supabase db dump --schema-only -f janki_kulfi_schema_$(date +%Y%m%d).sql

# Or dump the full database with PostgreSQL pg_dump:
pg_dump "postgresql://postgres:[YOUR-PASSWORD]@db.viodkbdrjhdutbzrgyeo.supabase.co:5432/postgres" \
  --clean --if-exists --quote-all-identifiers \
  -f janki_kulfi_full_backup_$(date +%Y%m%d).sql
```

---

### 6. How to Restore into a Separate Supabase Project
Always restore backups into a **separate staging/test project first** before touching production:

```bash
# 1. Link to your staging Supabase project
npx supabase link --project-ref YOUR_STAGING_PROJECT_REF

# 2. Apply migrations in order
npx supabase db push

# 3. Restore data from dump file
psql "postgresql://postgres:[STAGING-PASSWORD]@db.YOUR_STAGING_PROJECT_REF.supabase.co:5432/postgres" \
  -f janki_kulfi_data_20260901.sql
```

---

### 7. How to Back Up Supabase Storage Files
To mirror and back up all bill receipts from the private `expense-bills` storage bucket:

```bash
# Using AWS S3 CLI with Supabase S3 Compatibility endpoint:
aws s3 sync s3://expense-bills ./backup_expense_bills/ \
  --endpoint-url https://viodkbdrjhdutbzrgyeo.supabase.co/storage/v1/s3 \
  --profile supabase_owner
```
Or simply use the built-in **"Download Expense Bills"** button in **Settings → Backup Center**, which packages all bucket files into a structured ZIP archive.

---

## 👥 Demo Profiles & Quick Role Switcher

For pairing and testing different user experiences, select any simulated profile from the top-right header or login screen:

| Role | Name | Phone / Login | Permissions |
| :--- | :--- | :--- | :--- |
| **Owner** | Aditya Kumar | `7906564964` | Full administrative access, pricing, settlement approvals, expenses, daily closing & reopening, audit logs, backup center & disaster recovery |
| **Production Worker** | Ram Niwas | `9876500002` | Production batch entry & completion, stock issue to carts, freezer stock view |
| **Seller** | Ramesh Kumar | `9876500003` | View assigned stock, submit evening returns and collections for approval |

---

## 📄 License & Attribution
Developed with ❤️ for **Janki Kulfi, Mirehchi, Etah, Uttar Pradesh, India**.

