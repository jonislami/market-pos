const eur = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 })

/** Formats an amount as EUR with 2 decimals, e.g. €1,248.60. */
export function formatMoney(value: number): string {
  return eur.format(value)
}

/** Rounds to cents, avoiding floating point drift (1.005 -> 1.01). */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

/** Receipt number as shown in the UI, e.g. 487 -> #00487. */
export function formatReceiptNo(n: number): string {
  return `#${String(n).padStart(5, '0')}`
}
