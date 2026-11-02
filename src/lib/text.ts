/** Lowercase without diacritics, so "qumesht" matches "Qumësht". */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * Parses a user-typed decimal: accepts "1,20", "€1.20", " 3 ". Returns null when empty or invalid.
 */
export function parseDecimal(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = value.replace(/[€\s]/g, '').replace(',', '.')
  if (cleaned === '') return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** "24.2%" from a 0.242 fraction. */
export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}
