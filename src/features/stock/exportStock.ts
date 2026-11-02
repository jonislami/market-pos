import { roundMoney } from '@/lib/money'
import { stockStatus } from '@/lib/stock'
import { UNIT_LABELS } from '@/lib/units'
import { todayISO } from '@/lib/date'
import type { Category, Product } from '@/types/database'

const STATUS_TEXT = { critical: 'Kritik', low: 'I ulët', ok: '' }

/** Downloads the current stock as an Excel file. */
export async function exportStockReport(products: Product[], categories: Category[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const names = new Map(categories.map((c) => [c.id, c.name]))
  const header = ['Barkodi', 'Produkti', 'Kategoria', 'Njësia', 'Stoku', 'Stoku minimal', 'Statusi', 'Ç. blerjes', 'Ç. shitjes', 'Vlera (blerje)'].map(
    (value) => ({ value, fontWeight: 'bold' as const }),
  )
  const active = products.filter((p) => p.active)
  const rows = active.map((p) => [
    { value: p.barcode ?? '' },
    { value: p.name },
    { value: p.category_id ? (names.get(p.category_id) ?? '') : '' },
    { value: UNIT_LABELS[p.unit] },
    { value: p.stock, type: Number },
    { value: p.min_stock, type: Number },
    { value: STATUS_TEXT[stockStatus(p.stock, p.min_stock)] },
    { value: p.cost_price, type: Number, format: '0.00' },
    { value: p.sale_price, type: Number, format: '0.00' },
    { value: roundMoney(Math.max(p.stock, 0) * p.cost_price), type: Number, format: '0.00' },
  ])
  const total = roundMoney(active.reduce((s, p) => s + Math.max(p.stock, 0) * p.cost_price, 0))
  const footer = [
    { value: 'Totali', fontWeight: 'bold' as const },
    ...Array.from({ length: 8 }, () => ({ value: '' })),
    { value: total, type: Number, format: '0.00', fontWeight: 'bold' as const },
  ]
  await writeXlsxFile([header, ...rows, footer] as never, {
    columns: [16, 32, 18, 8, 10, 12, 10, 12, 12, 14].map((width) => ({ width })),
  }).toFile(`stoku-${todayISO()}.xlsx`)
}

/** Stock value at purchase price; negative stock does not reduce it. */
export function stockValue(products: Product[]): number {
  return roundMoney(products.filter((p) => p.active).reduce((s, p) => s + Math.max(p.stock, 0) * p.cost_price, 0))
}
