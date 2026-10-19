/**
 * Canonical ERP Currency Formatter (Indonesian Rupiah - IDR)
 * Single Source of Truth for all financial displays and PDF exports.
 */

export function formatRupiah(amount: number | string | null | undefined, includePrefix = true): string {
  const num = Number(amount);
  if (isNaN(num) || amount === null || amount === undefined) {
    return includePrefix ? 'Rp 0' : '0';
  }
  const formatted = new Intl.NumberFormat('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(num));

  return includePrefix ? `Rp ${formatted}` : formatted;
}

export function formatRupiahCompact(amount: number | null | undefined): string {
  const num = Number(amount || 0);
  if (isNaN(num)) return 'Rp 0';
  if (Math.abs(num) >= 1_000_000_000) {
    return `Rp ${(num / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  }
  if (Math.abs(num) >= 1_000_000) {
    return `Rp ${(num / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} Jt`;
  }
  return formatRupiah(num);
}

export function formatRupiahDots(val: number | string | null | undefined): string {
  if (val === null || val === undefined || val === '') return '';
  const digits = String(val).replace(/\D/g, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function stripDots(val: string): number {
  const cleaned = String(val || '').replace(/\./g, '').replace(/\D/g, '');
  return cleaned ? parseInt(cleaned, 10) : 0;
}
