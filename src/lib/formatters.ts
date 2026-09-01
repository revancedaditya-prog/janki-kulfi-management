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
