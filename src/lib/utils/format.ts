/**
 * Formats an amount as a localised currency string, e.g. formatMoney(1234.5, 'DKK') -> "1.234,50 kr."
 */
export function formatMoney(amount: number, currency: string, locale = 'da-DK'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}
