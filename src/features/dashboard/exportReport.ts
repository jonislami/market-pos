import { formatDate } from '@/lib/date'
import { roundMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'
import { UNIT_LABELS } from '@/lib/units'
import type { Unit } from '@/types/database'
import type { CashierRow, DailyRow, VatRow } from './api'

const bold = (value: string) => ({ value, fontWeight: 'bold' as const })
const money = (value: number) => ({ value, type: Number, format: '0.00' })
const int = (value: number) => ({ value, type: Number })

/** Excel with one sheet per section: days, products, VAT, cashiers. */
export async function exportSalesReport(from: string, to: string, daily: DailyRow[], vat: VatRow[], cashiers: CashierRow[]) {
  // All products of the period, not only the top ones shown on screen.
  const { data, error } = await supabase.rpc('report_top_products', { p_from: from, p_to: to, p_limit: 100000, p_order: 'revenue' })
  if (error) throw error
  const products = (data as Record<string, unknown>[]).map((r) => ({
    name: String(r.name),
    unit: r.unit as Unit | null,
    quantity: Number(r.quantity),
    revenue: Number(r.revenue),
    cost: Number(r.cost),
  }))

  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const sheets = [
    {
      sheet: 'Ditët',
      columns: [12, 10, 12, 10, 12, 12, 12, 12].map((width) => ({ width })),
      data: [
        ['Data', 'Fatura', 'Shitjet', 'TVSH', 'Kostoja', 'Fitimi', 'Kesh', 'Kartelë'].map(bold),
        ...daily.map((d) => [
          { value: formatDate(d.day) },
          int(d.salesCount),
          money(d.total),
          money(d.totalVat),
          money(d.cost),
          money(roundMoney(d.total - d.cost)),
          money(d.cash),
          money(d.card),
        ]),
      ],
    },
    {
      sheet: 'Produktet',
      columns: [34, 10, 8, 12, 12, 12].map((width) => ({ width })),
      data: [
        ['Produkti', 'Sasia', 'Njësia', 'Shitjet', 'Kostoja', 'Fitimi'].map(bold),
        ...products.map((p) => [
          { value: p.name },
          int(p.quantity),
          { value: p.unit ? UNIT_LABELS[p.unit] : '' },
          money(p.revenue),
          money(p.cost),
          money(roundMoney(p.revenue - p.cost)),
        ]),
      ],
    },
    {
      sheet: 'TVSH',
      columns: [10, 12, 12, 12].map((width) => ({ width })),
      data: [
        ['Norma', 'Baza', 'TVSH', 'Bruto'].map(bold),
        ...vat.map((v) => [{ value: `${v.rate}%` }, money(roundMoney(v.gross - v.vat)), money(v.vat), money(v.gross)]),
      ],
    },
    {
      sheet: 'Arkëtarët',
      columns: [24, 10, 12].map((width) => ({ width })),
      data: [['Arkëtari', 'Fatura', 'Shitjet'].map(bold), ...cashiers.map((c) => [{ value: c.name }, int(c.salesCount), money(c.total)])],
    },
  ]
  await writeXlsxFile(sheets as never).toFile(`raporti-${from}_${to}.xlsx`)
}
