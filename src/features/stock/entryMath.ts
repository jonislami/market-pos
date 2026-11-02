import { roundMoney } from '@/lib/money'
import type { VatRate } from '@/types/database'

export interface EntryLineValue {
  quantity: number
  /** Net unit cost (without VAT). */
  unitCost: number
  vatRate: VatRate
}

export interface EntryTotals {
  net: number
  vat: number
  total: number
  vatGroups: { rate: VatRate; net: number; vat: number }[]
}

/** Line value without VAT, as stored by confirm_stock_entry. */
export function lineNet(l: EntryLineValue): number {
  return roundMoney(l.quantity * l.unitCost)
}

/** Mirrors confirm_stock_entry: VAT once per rate on the summed net value. */
export function entryTotals(lines: EntryLineValue[]): EntryTotals {
  const byRate = new Map<VatRate, number>()
  for (const l of lines) byRate.set(l.vatRate, (byRate.get(l.vatRate) ?? 0) + lineNet(l))
  const vatGroups = [...byRate.entries()]
    .map(([rate, n]) => {
      const net = roundMoney(n)
      return { rate, net, vat: roundMoney((net * rate) / 100) }
    })
    .sort((a, b) => a.rate - b.rate)
  const net = roundMoney(vatGroups.reduce((s, g) => s + g.net, 0))
  const vat = roundMoney(vatGroups.reduce((s, g) => s + g.vat, 0))
  return { net, vat, total: roundMoney(net + vat), vatGroups }
}

/** Net cost from a VAT-inclusive purchase price (products.cost_price is stored with VAT). */
export function netCost(costWithVat: number, rate: VatRate): number {
  return roundMoney(costWithVat / (1 + rate / 100))
}
