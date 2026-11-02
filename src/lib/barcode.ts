/** EAN-13 check digit for the first 12 digits. */
export function ean13CheckDigit(first12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3)
  return (10 - (sum % 10)) % 10
}

// "20"-"29" is the EAN range reserved for in-store use, so it never clashes with supplier barcodes.
const INTERNAL_PREFIX = '20'

/** Next free in-store EAN-13 (20xxxxxxxxxxC) after the highest one already used. */
export function nextInternalBarcode(existing: Iterable<string | null>): string {
  let max = 0
  for (const code of existing) {
    if (code && code.length === 13 && code.startsWith(INTERNAL_PREFIX) && /^\d+$/.test(code)) {
      max = Math.max(max, Number(code.slice(2, 12)))
    }
  }
  const first12 = INTERNAL_PREFIX + String(max + 1).padStart(10, '0')
  return first12 + ean13CheckDigit(first12)
}
