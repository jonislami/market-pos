import type { Unit } from '@/types/database'

export const UNITS: Unit[] = ['cope', 'kg', 'pako', 'liter']

export const UNIT_LABELS: Record<Unit, string> = {
  cope: 'copë',
  kg: 'kg',
  pako: 'pako',
  liter: 'litër',
}

/** Only kg allows fractional quantities. */
export function allowsDecimals(unit: Unit): boolean {
  return unit === 'kg'
}

/** Quantity without trailing zeros: 18.500 -> "18.5", 64 -> "64". */
export function formatQty(value: number): string {
  return String(Math.round(value * 1000) / 1000)
}
