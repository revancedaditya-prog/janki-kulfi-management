/**
 * Format currency into Indian Rupee format (e.g., ₹1,25,000.00 or ₹450)
 */
export function formatCurrency(amount: number | string | null | undefined, includeDecimals = true): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : Number(amount || 0);
  if (isNaN(num)) return '₹0';

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: includeDecimals ? 2 : 0,
    maximumFractionDigits: includeDecimals ? 2 : 0,
  }).format(num);
}

/**
 * Format date into DD/MM/YYYY in Asia/Kolkata
 */
export function formatDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return '-';
  try {
    const d = typeof dateString === 'string' ? new Date(dateString) : dateString;
    if (isNaN(d.getTime())) return '-';
    
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Asia/Kolkata',
    }).format(d);
  } catch {
    return '-';
  }
}

/**
 * Format datetime into DD/MM/YYYY hh:mm a in Asia/Kolkata
 */
export function formatDateTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return '-';
  try {
    const d = typeof dateString === 'string' ? new Date(dateString) : dateString;
    if (isNaN(d.getTime())) return '-';

    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Kolkata',
    }).format(d);
  } catch {
    return '-';
  }
}

/**
 * Format whole number quantity of kulfi pieces
 */
export function formatQuantity(qty: number | string | null | undefined): string {
  const num = typeof qty === 'string' ? parseInt(qty, 10) : Math.round(Number(qty || 0));
  if (isNaN(num)) return '0';
  return new Intl.NumberFormat('en-IN').format(num);
}

/**
 * Get current date string in YYYY-MM-DD for date inputs
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get full formatted timestamp in Asia/Kolkata (e.g. 2026-09-01T23:15:00+05:30)
 */
export function getKolkataTimestamp(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date).replace(', ', 'T') + '+05:30';
}

/**
 * Generate standard backup file name: janki-kulfi-backup-YYYY-MM-DD-HHmm.zip
 */
export function getBackupFilename(prefix = 'janki-kulfi-backup', date: Date = new Date()): string {
  // Format parts according to Asia/Kolkata
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const partMap: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') {
      partMap[p.type] = p.value;
    }
  }

  const y = partMap.year || String(date.getFullYear());
  const m = partMap.month || String(date.getMonth() + 1).padStart(2, '0');
  const d = partMap.day || String(date.getDate()).padStart(2, '0');
  const hr = partMap.hour || String(date.getHours()).padStart(2, '0');
  const min = partMap.minute || String(date.getMinutes()).padStart(2, '0');

  return `${prefix}-${y}-${m}-${d}-${hr}${min}.zip`;
}

/**
 * Format LPG cylinder running duration from connected timestamp to end/now, or from minutes
 */
export function formatLpgDuration(
  input?: string | number | null,
  endedAt?: string | null
): any {
  if (input === null || input === undefined) return null;

  let diffMinutes = 0;
  if (typeof input === 'number') {
    diffMinutes = Math.max(0, Math.floor(input));
    const days = Math.floor(diffMinutes / (60 * 24));
    const hours = Math.floor((diffMinutes % (60 * 24)) / 60);
    const mins = diffMinutes % 60;

    const parts: string[] = [];
    if (days > 0) parts.push(`${days} दिन`);
    if (hours > 0) parts.push(`${hours} घंटे`);
    if (mins > 0 || parts.length === 0) parts.push(`${mins} मिनट`);
    return parts.join(' ');
  }

  const start = new Date(input).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  if (isNaN(start) || isNaN(end) || end <= start) {
    return { text: '0 मिनट', minutes: 0 };
  }
  diffMinutes = Math.floor((end - start) / (1000 * 60));
  const days = Math.floor(diffMinutes / (60 * 24));
  const hours = Math.floor((diffMinutes % (60 * 24)) / 60);
  const mins = diffMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} दिन`);
  if (hours > 0) parts.push(`${hours} घंटे`);
  if (mins > 0 || parts.length === 0) parts.push(`${mins} मिनट`);

  return {
    text: parts.join(' '),
    minutes: diffMinutes,
  };
}
