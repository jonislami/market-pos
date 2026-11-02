import type { VatRate } from '@/types/database'
import { roundMoney } from './money'

export type { VatRate }

export const VAT_RATES: VatRate[] = [8, 18, 0]

/** Receipt letter for each VAT rate. */
export const VAT_CODES: Record<VatRate, string> = { 18: 'A', 8: 'B', 0: 'C' }

/** Net base of a VAT-inclusive gross amount: gross / (1 + rate). */
export function vatBase(gross: number, rate: VatRate): number {
  return roundMoney(gross / (1 + rate / 100))
}

/** VAT portion of a VAT-inclusive gross amount. */
export function vatAmount(gross: number, rate: VatRate): number {
  return roundMoney(gross - vatBase(gross, rate))
}

/** Margin = (sale - cost) / sale, as a fraction (0.25 = 25%). */
export function margin(salePrice: number, costPrice: number): number | null {
  if (salePrice <= 0) return null
  return (salePrice - costPrice) / salePrice
}
