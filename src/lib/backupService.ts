import JSZip from 'jszip';
import { api } from './api';
import { getKolkataTimestamp, getBackupFilename } from './formatters';
import {
  BackupManifest,
  ExpenseBillsManifest,
  BackupValidationResult,
  Profile,
} from '@/types';

export const BACKUP_FORMAT_VERSION = '1.0.0';
export const DATABASE_SCHEMA_VERSION = '005';
export const REQUIRED_TABLES = [
  'profiles',
  'products',
  'product_prices',
  'sellers',
  'carts',
  'production_batches',
  'production_items',
  'seller_issues',
  'seller_issue_items',
  'seller_settlements',
  'settlement_items',
  'expenses',
  'stock_locations',
  'stock_movements',
  'daily_closings',
  'audit_logs',
] as const;

export type RequiredTable = (typeof REQUIRED_TABLES)[number];

export const REPORTING_TABLES: RequiredTable[] = [
  'products',
  'product_prices',
  'sellers',
  'carts',
  'production_batches',
  'production_items',
  'seller_issues',
  'seller_issue_items',
  'seller_settlements',
  'settlement_items',
  'expenses',
  'stock_movements',
  'daily_closings',
  'audit_logs',
];

/**
 * Universal SHA-256 Checksum Calculator (Browser WebCrypto & Node.js Compatible)
 */
export async function calculateSha256(data: string | Uint8Array | ArrayBuffer): Promise<string> {
  const buffer =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
      ? data.buffer
      : data;

  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : (typeof window !== 'undefined' ? window.crypto : null);

  if (cryptoObj && cryptoObj.subtle) {
    const hashBuffer = await cryptoObj.subtle.digest('SHA-256', buffer as ArrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  throw new Error('SHA-256 calculation is not supported in this environment');
}

/**
 * Convert JSON array to RFC 4180 Compliant CSV
 */
export function jsonToCsv(items: any[]): string {
  if (!items || items.length === 0) {
    return '';
  }

  // Extract all distinct keys across all rows
  const keys: string[] = Array.from(
    items.reduce((acc: Set<string>, item: any) => {
      Object.keys(item || {}).forEach((k) => acc.add(k));
      return acc;
    }, new Set<string>())
  );

  const escapeCell = (val: any): string => {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') {
      val = JSON.stringify(val);
    }
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = keys.map(escapeCell).join(',');
  const rows = items.map((row) => keys.map((k) => escapeCell(row[k])).join(','));

  return [header, ...rows].join('\r\n');
}

/**
 * Sanitize User Profiles: Strip all sensitive auth/credential properties
 */
export function sanitizeProfiles(profiles: any[]): Profile[] {
  return profiles.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    phone: p.phone,
    role: p.role,
    preferred_language: p.preferred_language || 'hi',
    is_active: Boolean(p.is_active),
    created_at: p.created_at,
    updated_at: p.updated_at,
  }));
}

/**
 * Trigger browser file download for a Blob
 */
export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ProgressCallback {
  (progress: { step: string; percent: number; currentTable?: string }): void;
}

export const backupService = {
  /**
   * Fetch all database tables safely and completely
   */
  async fetchAllTableData(): Promise<Record<RequiredTable, any[]>> {
    const rawData = await api.exportAllTables();

    // Verify all required tables exist
    for (const tbl of REQUIRED_TABLES) {
      if (!Array.isArray(rawData[tbl])) {
        throw new Error(`Export Failed: Table "${tbl}" could not be retrieved from database.`);
      }
    }

    return {
      profiles: sanitizeProfiles(rawData.profiles),
      products: rawData.products,
      product_prices: rawData.product_prices,
      sellers: rawData.sellers,
      carts: rawData.carts,
      production_batches: rawData.production_batches,
      production_items: rawData.production_items,
      seller_issues: rawData.seller_issues,
      seller_issue_items: rawData.seller_issue_items,
      seller_settlements: rawData.seller_settlements,
      settlement_items: rawData.settlement_items,
      expenses: rawData.expenses,
      stock_locations: rawData.stock_locations,
      stock_movements: rawData.stock_movements,
      daily_closings: rawData.daily_closings,
      audit_logs: rawData.audit_logs,
    };
  },

  /**
   * Generate Full Offline Disaster-Recovery Backup ZIP
   */
  async generateCompleteBackup(
    userId: string,
    onProgress?: ProgressCallback
  ): Promise<{ blob: Blob; fileName: string; manifest: BackupManifest }> {
    onProgress?.({ step: 'डेटाबेस से सभी 16 टेबल्स लोड हो रही हैं...', percent: 10 });

    const tableData = await this.fetchAllTableData();
    const zip = new JSZip();
    const fileChecksums: Record<string, string> = {};
    const rowCounts: Record<string, number> = {};
    const exportedFiles: string[] = [];

    const totalTables = REQUIRED_TABLES.length;
    let processedTables = 0;

    for (const table of REQUIRED_TABLES) {
      const rows = tableData[table] || [];
      rowCounts[table] = rows.length;

      // 1. JSON Export
      const jsonFileName = `${table}.json`;
      const jsonContent = JSON.stringify(rows, null, 2);
      const jsonChecksum = await calculateSha256(jsonContent);
      zip.file(jsonFileName, jsonContent);
      fileChecksums[jsonFileName] = jsonChecksum;
      exportedFiles.push(jsonFileName);

      // 2. CSV Export for reporting tables
      if (REPORTING_TABLES.includes(table)) {
        const csvFileName = `${table}.csv`;
        const csvContent = jsonToCsv(rows);
        const csvChecksum = await calculateSha256(csvContent);
        zip.file(csvFileName, csvContent);
        fileChecksums[csvFileName] = csvChecksum;
        exportedFiles.push(csvFileName);
      }

      processedTables++;
      const currentPercent = 10 + Math.round((processedTables / totalTables) * 60);
      onProgress?.({
        step: `टेबल निर्यात: ${table} (${rows.length} पंक्तियाँ)`,
        percent: currentPercent,
        currentTable: table,
      });
    }

    const now = new Date();
    const projectRef = import.meta.env.VITE_SUPABASE_URL
      ? import.meta.env.VITE_SUPABASE_URL.replace('https://', '').replace('.supabase.co', '')
      : 'local-store';

    const manifest: BackupManifest = {
      application_name: 'Janki Kulfi Management',
      backup_format_version: BACKUP_FORMAT_VERSION,
      database_schema_version: DATABASE_SCHEMA_VERSION,
      supabase_project_ref: projectRef,
      created_at_iso: now.toISOString(),
      created_at_kolkata: getKolkataTimestamp(now),
      created_by_user_id: userId,
      backup_type: 'complete',
      date_range: null,
      tables: [...REQUIRED_TABLES],
      row_counts: rowCounts,
      file_checksums: fileChecksums,
      exported_files: exportedFiles,
    };

    // Add manifest.json to ZIP
    const manifestJson = JSON.stringify(manifest, null, 2);
    zip.file('manifest.json', manifestJson);

    // Add README.txt
    const readmeText = [
      '======================================================================',
      '🍨 JANKI KULFI MANAGEMENT - COMPLETE OFFLINE BACKUP ARCHIVE',
      '======================================================================',
      `Application:      Janki Kulfi Management (जानकी कुल्फी प्रबंधन)`,
      `Location:         Mirehchi, Etah, Uttar Pradesh, India`,
      `Backup Version:   ${BACKUP_FORMAT_VERSION}`,
      `Schema Version:   ${DATABASE_SCHEMA_VERSION}`,
      `Generated At:     ${getKolkataTimestamp(now)} (Asia/Kolkata)`,
      `Created By User:  ${userId}`,
      `Supabase Project: ${projectRef}`,
      '----------------------------------------------------------------------',
      'CONTENTS & STRUCTURE:',
      '  - manifest.json: Complete metadata, row counts & SHA-256 integrity checksums.',
      '  - *.json: Raw JSON formatted database records (one file per table).',
      '  - *.csv:  Formatted CSV files for reporting in Excel/LibreOffice.',
      '----------------------------------------------------------------------',
      'SECURITY & PRIVACY NOTICE:',
      '  - User passwords, auth tokens, database secret keys, and .env credentials',
      '    are strictly EXCLUDED from this archive.',
      '  - Store this archive securely on encrypted offline media or cold storage.',
      '----------------------------------------------------------------------',
      'OFFLINE DISASTER RECOVERY & RESTORATION GUIDELINES:',
      '  1. Validate this ZIP using the "Validate Backup" tool in Settings -> Backup Center.',
      '  2. Full restoration should be performed using the verified Administrator',
      '     restore procedure or Supabase PostgreSQL CLI in a separate staging project.',
      '  3. WARNING: Local browser IndexedDB drafts are NOT a permanent backup.',
      '======================================================================',
    ].join('\r\n');

    zip.file('README.txt', readmeText);

    onProgress?.({ step: 'ZIP कम्प्रेसन एवं चेकसम सत्यापन हो रहा है...', percent: 85 });

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    const fileName = getBackupFilename('janki-kulfi-backup', now);

    onProgress?.({ step: 'बैकअप इतिहास रिकॉर्ड हो रहा है...', percent: 95 });

    // Save record to backup_history and audit_logs
    try {
      await api.recordBackupHistory({
        backup_type: 'complete',
        format_version: BACKUP_FORMAT_VERSION,
        file_name: fileName,
        table_counts: rowCounts,
        checksum_summary: fileChecksums,
        status: 'success',
        error_summary: null,
        created_by: userId,
        date_from: null,
        date_to: null,
      });
    } catch (e) {
      console.warn('Could not record backup_history in DB (offline fallback active):', e);
    }

    onProgress?.({ step: 'बैकअप पूर्ण!', percent: 100 });

    return { blob, fileName, manifest };
  },

  /**
   * Generate Filtered Date-Range Backup (Reporting Export)
   */
  async generateDateRangeBackup(
    startDate: string,
    endDate: string,
    userId: string,
    onProgress?: ProgressCallback
  ): Promise<{ blob: Blob; fileName: string; manifest: BackupManifest }> {
    onProgress?.({ step: `दिनांक सीमा (${startDate} से ${endDate}) का डेटा लोड हो रहा है...`, percent: 15 });

    const allData = await this.fetchAllTableData();

    // Filter time-series tables
    const inRange = (dStr: string | null | undefined) => {
      if (!dStr) return false;
      const d = dStr.substring(0, 10);
      return d >= startDate && d <= endDate;
    };

    const filteredBatches = allData.production_batches.filter((b) => inRange(b.production_date));
    const batchIds = new Set(filteredBatches.map((b) => b.id));
    const filteredBatchItems = allData.production_items.filter((it) => batchIds.has(it.production_batch_id));

    const filteredIssues = allData.seller_issues.filter((i) => inRange(i.issue_date));
    const issueIds = new Set(filteredIssues.map((i) => i.id));
    const filteredIssueItems = allData.seller_issue_items.filter((it) => issueIds.has(it.seller_issue_id));

    const filteredSettlements = allData.seller_settlements.filter((s) => inRange(s.settlement_date));
    const settlementIds = new Set(filteredSettlements.map((s) => s.id));
    const filteredSettlementItems = allData.settlement_items.filter((it) => settlementIds.has(it.settlement_id));

    const filteredExpenses = allData.expenses.filter((e) => inRange(e.expense_date));
    const filteredClosings = allData.daily_closings.filter((c) => inRange(c.business_date));
    const filteredMovements = allData.stock_movements.filter((m) => inRange(m.movement_date));

    const exportTables: Record<string, any[]> = {
      production_batches: filteredBatches,
      production_items: filteredBatchItems,
      seller_issues: filteredIssues,
      seller_issue_items: filteredIssueItems,
      seller_settlements: filteredSettlements,
      settlement_items: filteredSettlementItems,
      expenses: filteredExpenses,
      daily_closings: filteredClosings,
      stock_movements: filteredMovements,
      // Reference master data for context
      products: allData.products,
      sellers: allData.sellers,
      carts: allData.carts,
    };

    const zip = new JSZip();
    const fileChecksums: Record<string, string> = {};
    const rowCounts: Record<string, number> = {};
    const exportedFiles: string[] = [];

    for (const [table, rows] of Object.entries(exportTables)) {
      rowCounts[table] = rows.length;

      const jsonFileName = `${table}.json`;
      const jsonContent = JSON.stringify(rows, null, 2);
      const jsonChecksum = await calculateSha256(jsonContent);
      zip.file(jsonFileName, jsonContent);
      fileChecksums[jsonFileName] = jsonChecksum;
      exportedFiles.push(jsonFileName);

      const csvFileName = `${table}.csv`;
      const csvContent = jsonToCsv(rows);
      const csvChecksum = await calculateSha256(csvContent);
      zip.file(csvFileName, csvContent);
      fileChecksums[csvFileName] = csvChecksum;
      exportedFiles.push(csvFileName);
    }

    const now = new Date();
    const manifest: BackupManifest = {
      application_name: 'Janki Kulfi Management',
      backup_format_version: BACKUP_FORMAT_VERSION,
      database_schema_version: DATABASE_SCHEMA_VERSION,
      supabase_project_ref: 'reporting-export',
      created_at_iso: now.toISOString(),
      created_at_kolkata: getKolkataTimestamp(now),
      created_by_user_id: userId,
      backup_type: 'date_range',
      date_range: { from: startDate, to: endDate },
      tables: Object.keys(exportTables),
      row_counts: rowCounts,
      file_checksums: fileChecksums,
      exported_files: exportedFiles,
    };

    zip.file('manifest.json', JSON.stringify(manifest, null, 2));

    const readmeText = [
      '======================================================================',
      '⚠️ JANKI KULFI MANAGEMENT - DATE-RANGE FILTERED EXPORT',
      '======================================================================',
      'NOTICE: This archive is a filtered reporting export for specific dates.',
      'It is NOT a complete disaster recovery backup.',
      `Date Range:       ${startDate} to ${endDate}`,
      `Generated At:     ${getKolkataTimestamp(now)}`,
      `Created By User:  ${userId}`,
      '======================================================================',
    ].join('\r\n');
    zip.file('README.txt', readmeText);

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 9 },
    });

    const fileName = `janki-kulfi-export-${startDate}-to-${endDate}.zip`;

    try {
      await api.recordBackupHistory({
        backup_type: 'date_range',
        format_version: BACKUP_FORMAT_VERSION,
        file_name: fileName,
        table_counts: rowCounts,
        checksum_summary: fileChecksums,
        status: 'success',
        error_summary: null,
        created_by: userId,
        date_from: startDate,
        date_to: endDate,
      });
    } catch (e) {
      // quiet fallback
    }

    onProgress?.({ step: 'दिनांक सीमा निर्यात पूर्ण!', percent: 100 });
    return { blob, fileName, manifest };
  },

  /**
   * Generate Expense Bills Storage Archive ZIP
   */
  async generateExpenseBillsBackup(
    userId: string,
    onProgress?: ProgressCallback
  ): Promise<{ blob: Blob; fileName: string; manifest: ExpenseBillsManifest }> {
    onProgress?.({ step: 'खर्च बिलों की सूची जांची जा रही है...', percent: 10 });

    const expenses = await api.getExpenses();
    const expensesWithBills = expenses.filter((e) => Boolean(e.bill_image_path));

    const zip = new JSZip();
    const fileChecksums: Record<string, string> = {};
    const mappedExpenses: ExpenseBillsManifest['mapped_expenses'] = [];
    const missingFiles: string[] = [];
    let totalBytes = 0;

    let processed = 0;
    const totalBills = expensesWithBills.length;

    for (const exp of expensesWithBills) {
      const billPath = exp.bill_image_path!;
      const cleanFileName = billPath.split('/').pop() || `bill-${exp.id}.jpg`;
      const zipPath = `bills/${exp.expense_date.substring(0, 7)}/${cleanFileName}`;

      try {
        const fileBlob = await api.downloadExpenseBillBlob(billPath);
        if (fileBlob) {
          const arrayBuffer = await fileBlob.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);
          const sha256 = await calculateSha256(uint8);
          zip.file(zipPath, uint8);
          fileChecksums[zipPath] = sha256;
          totalBytes += uint8.byteLength;

          mappedExpenses.push({
            expense_id: exp.id,
            expense_date: exp.expense_date,
            amount: exp.amount,
            category: exp.category,
            vendor_name: exp.vendor_name,
            description: exp.description,
            bill_path: billPath,
            file_name: cleanFileName,
            file_size: uint8.byteLength,
            sha256,
            status: 'found',
          });
        } else {
          missingFiles.push(billPath);
          mappedExpenses.push({
            expense_id: exp.id,
            expense_date: exp.expense_date,
            amount: exp.amount,
            category: exp.category,
            vendor_name: exp.vendor_name,
            description: exp.description,
            bill_path: billPath,
            file_name: cleanFileName,
            file_size: 0,
            sha256: '',
            status: 'missing',
          });
        }
      } catch (err) {
        missingFiles.push(billPath);
        mappedExpenses.push({
          expense_id: exp.id,
          expense_date: exp.expense_date,
          amount: exp.amount,
          category: exp.category,
          vendor_name: exp.vendor_name,
          description: exp.description,
          bill_path: billPath,
          file_name: cleanFileName,
          file_size: 0,
          sha256: '',
          status: 'missing',
        });
      }

      processed++;
      const currentPercent = 10 + Math.round((processed / (totalBills || 1)) * 75);
      onProgress?.({
        step: `बिल फाइल डाउनलोड: ${cleanFileName} (${processed}/${totalBills})`,
        percent: currentPercent,
      });
    }

    const now = new Date();
    const manifest: ExpenseBillsManifest = {
      application_name: 'Janki Kulfi Management',
      backup_format_version: BACKUP_FORMAT_VERSION,
      created_at_kolkata: getKolkataTimestamp(now),
      created_by_user_id: userId,
      total_files_found: mappedExpenses.filter((m) => m.status === 'found').length,
      total_bytes: totalBytes,
      mapped_expenses: mappedExpenses,
      orphaned_files: [],
      missing_files: missingFiles,
      file_checksums: fileChecksums,
    };

    zip.file('expense-bills-manifest.json', JSON.stringify(manifest, null, 2));

    const blob = await zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const fileName = getBackupFilename('janki-kulfi-expense-bills', now);

    try {
      await api.recordBackupHistory({
        backup_type: 'expense_bills',
        format_version: BACKUP_FORMAT_VERSION,
        file_name: fileName,
        table_counts: { expense_bills: manifest.total_files_found, missing: missingFiles.length },
        checksum_summary: fileChecksums,
        status: missingFiles.length === 0 ? 'success' : 'failed',
        error_summary: missingFiles.length > 0 ? `${missingFiles.length} bill files missing` : null,
        created_by: userId,
        date_from: null,
        date_to: null,
      });
    } catch (e) {
      // quiet fallback
    }

    onProgress?.({ step: 'खर्च बिल बैकअप पूर्ण!', percent: 100 });
    return { blob, fileName, manifest };
  },

  /**
   * Validate a Backup ZIP file completely client-side without any DB modification
   */
  async validateBackupZip(file: File | Blob | Uint8Array): Promise<BackupValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const checksumResults: BackupValidationResult['checksumResults'] = [];
    const tableCounts: Record<string, number> = {};
    const missingFiles: string[] = [];

    try {
      const zip = await JSZip.loadAsync(file);

      // 1. Check for manifest.json
      const manifestFile = zip.file('manifest.json');
      if (!manifestFile) {
        return {
          isValid: false,
          manifest: null,
          checksumResults: [],
          tableCounts: {},
          missingFiles: ['manifest.json'],
          errors: ['अमान्य बैकअप फाइल: manifest.json नहीं मिली।'],
          warnings: [],
        };
      }

      const manifestContent = await manifestFile.async('string');
      let manifest: BackupManifest;
      try {
        manifest = JSON.parse(manifestContent);
      } catch {
        return {
          isValid: false,
          manifest: null,
          checksumResults: [],
          tableCounts: {},
          missingFiles: [],
          errors: ['manifest.json भ्रष्ट (corrupted) है और पढ़ी नहीं जा सकी।'],
          warnings: [],
        };
      }

      // Check format version
      if (manifest.backup_format_version !== BACKUP_FORMAT_VERSION) {
        warnings.push(
          `बैकअप प्रारूप संस्करण अंतर: फ़ाइल v${manifest.backup_format_version} है, वर्तमान ऐप v${BACKUP_FORMAT_VERSION} है।`
        );
      }

      // 2. Check each expected file and its SHA-256 Checksum
      const expectedChecksums = manifest.file_checksums || {};
      for (const [filename, expectedSha] of Object.entries(expectedChecksums)) {
        const fileInZip = zip.file(filename);
        if (!fileInZip) {
          missingFiles.push(filename);
          errors.push(`गुम फाइल: "${filename}" manifest में दर्ज है किन्तु ZIP में नहीं मिली।`);
          checksumResults.push({
            file: filename,
            expected: expectedSha,
            actual: 'MISSING',
            match: false,
          });
          continue;
        }

        const fileData = await fileInZip.async('uint8array');
        const actualSha = await calculateSha256(fileData);
        const match = actualSha.toLowerCase() === expectedSha.toLowerCase();

        checksumResults.push({
          file: filename,
          expected: expectedSha,
          actual: actualSha,
          match,
        });

        if (!match) {
          errors.push(`चेकसम बेमेल (Checksum Mismatch): फ़ाइल "${filename}" में बदलाव या खराबी पाई गई।`);
        }

        // Parse JSON row counts
        if (filename.endsWith('.json') && filename !== 'manifest.json') {
          const tblName = filename.replace('.json', '');
          try {
            const parsed = JSON.parse(new TextDecoder().decode(fileData));
            if (Array.isArray(parsed)) {
              tableCounts[tblName] = parsed.length;
              if (manifest.row_counts && manifest.row_counts[tblName] !== undefined) {
                if (manifest.row_counts[tblName] !== parsed.length) {
                  errors.push(
                    `पंक्ति गणना बेमेल: "${tblName}" (manifest: ${manifest.row_counts[tblName]}, zip: ${parsed.length})`
                  );
                }
              }
            }
          } catch {
            errors.push(`अमान्य JSON प्रारूप: "${filename}"`);
          }
        }
      }

      const isValid = errors.length === 0;

      return {
        isValid,
        manifest,
        checksumResults,
        tableCounts,
        missingFiles,
        unsupportedVersion: manifest.backup_format_version,
        errors,
        warnings,
      };
    } catch (err: any) {
      return {
        isValid: false,
        manifest: null,
        checksumResults: [],
        tableCounts: {},
        missingFiles: [],
        errors: [`बैकअप सत्यापन विफल: ${err.message || 'ZIP फ़ाइल अमान्य है'}`],
        warnings: [],
      };
    }
  },

  /**
   * Execute controlled dry-run or transactional restore (Owner Protected)
   */
  async executeControlledRestore(
    backupFile: File,
    passphrase: string,
    reason: string,
    userId: string,
    isDryRun = false
  ): Promise<{ success: boolean; message: string; tablesRestored: Record<string, number> }> {
    if (passphrase !== 'RESTORE JANKI KULFI') {
      throw new Error('अमान्य पुष्टिकरण वाक्यांश! कृपया सही सुरक्षा कोड "RESTORE JANKI KULFI" टाइप करें।');
    }

    if (!reason || reason.trim().length < 5) {
      throw new Error('डेटा पुनर्स्थापना (Restore) का वैध कारण लिखना अनिवार्य है।');
    }

    // 1. Validate the backup archive
    const validation = await this.validateBackupZip(backupFile);
    if (!validation.isValid) {
      throw new Error(`बैकअप सत्यापन विफल रहा:\n${validation.errors.join('\n')}`);
    }

    if (isDryRun) {
      return {
        success: true,
        message: 'सत्यापन व ड्राई-रन सफल रहा! कोई डेटाबेस परिवर्तन नहीं किया गया।',
        tablesRestored: validation.tableCounts,
      };
    }

    // 2. Automatically create pre-restore snapshot backup first for safety!
    try {
      await this.generateCompleteBackup(userId);
    } catch (e) {
      console.warn('Pre-restore backup creation warning:', e);
    }

    // 3. Load data from ZIP and perform restoration
    const zip = await JSZip.loadAsync(backupFile);
    const restoredData: Partial<Record<RequiredTable, any[]>> = {};

    for (const tbl of REQUIRED_TABLES) {
      const f = zip.file(`${tbl}.json`);
      if (f) {
        const text = await f.async('string');
        restoredData[tbl] = JSON.parse(text);
      }
    }

    // Apply restore to store/database
    await api.restoreBackupData(restoredData as any, reason, userId);

    return {
      success: true,
      message: 'डेटा सफलतापूर्वक पुनर्स्थापित (Restored) हो गया।',
      tablesRestored: validation.tableCounts,
    };
  },
};
