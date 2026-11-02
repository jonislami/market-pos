import { useMemo } from 'react'
import { ArrowDown, ArrowUp, Equal, TriangleAlert } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { cn } from '@/lib/cn'
import { formatRelativeDateTime } from '@/lib/date'
import { formatMoney, roundMoney } from '@/lib/money'
import { stockStatus } from '@/lib/stock'
import { formatQty } from '@/lib/units'
import type { MovementType, Product, StockMovement } from '@/types/database'
import type { EntryListRow } from './api'

/** Products at or below their minimum, most urgent first. */
export function lowStockProducts(products: Product[]): Product[] {
  return products
    .filter((p) => p.active && p.min_stock > 0 && stockStatus(p.stock, p.min_stock) !== 'ok')
    .sort((a, b) => a.stock / a.min_stock - b.stock / b.min_stock)
}

/** Suggested order: back up to twice the minimum. */
export function suggestedQty(p: Product): number {
  const q = Math.max(p.min_stock * 2 - p.stock, 1)
  return p.unit === 'kg' ? Math.round(q * 10) / 10 : Math.ceil(q)
}

const SHOWN = 6

export function LowStockCard({ products, onAddAll }: { products: Product[]; onAddAll: (items: Product[]) => void }) {
  if (products.length === 0) {
    return (
      <Card className="text-sm text-muted">
        <h2 className="mb-1 text-[17px] font-semibold text-ink">Stoku në rregull</h2>
        Asnjë produkt nuk është nën minimum.
      </Card>
    )
  }
  return (
    <div className="flex flex-col gap-3 rounded-card border border-[#F6C9A8] bg-[#FFF6EF] p-5">
      <h2 className="text-[17px] font-semibold text-warn-700">{products.length} produkte nën minimum</h2>
      <ul className="flex flex-col gap-1.5 text-sm">
        {products.slice(0, SHOWN).map((p) => (
          <li key={p.id} className="flex justify-between gap-3">
            <span className="truncate">{p.name}</span>
            <span className={cn('shrink-0 font-semibold tabular-nums', stockStatus(p.stock, p.min_stock) === 'critical' ? 'text-warn-700' : 'text-amber-700')}>
              {formatQty(p.stock)} / {formatQty(p.min_stock)}
            </span>
          </li>
        ))}
      </ul>
      {products.length > SHOWN && <span className="text-xs text-muted">dhe {products.length - SHOWN} të tjera</span>}
      <Button variant="secondary" className="border-[#F6C9A8] text-warn-700 hover:text-warn-700" onClick={() => onAddAll(products)}>
        Shto të gjitha në hyrje
      </Button>
    </div>
  )
}

interface ActivityItem {
  key: string
  type: MovementType
  title: string
  subtitle: string
  value: number
}

const typeLabels: Record<MovementType, string> = {
  entry: 'Hyrje',
  writeoff: 'Shkarkim',
  inventory: 'Inventarizim',
  return: 'Kthim',
  sale: 'Shitje',
}

/** Groups entry movements by entry; other movements are shown one by one. */
function toActivity(movements: StockMovement[], productMap: Map<number, Product>, entries: Map<number, EntryListRow>): ActivityItem[] {
  const out: ActivityItem[] = []
  const seenEntries = new Set<number>()
  for (const m of movements) {
    if (m.type === 'entry' && m.ref_id !== null) {
      if (seenEntries.has(m.ref_id)) continue
      seenEntries.add(m.ref_id)
      const e = entries.get(m.ref_id)
      out.push({
        key: `e${m.ref_id}`,
        type: 'entry',
        title: `Hyrje · ${e?.invoice_no ?? `#${m.ref_id}`}`,
        subtitle: `${formatRelativeDateTime(m.created_at)} · ${e?.item_count ?? '?'} produkte`,
        value: e?.total ?? 0,
      })
    } else {
      const p = productMap.get(m.product_id)
      out.push({
        key: `m${m.id}`,
        type: m.type,
        title: `${typeLabels[m.type]}${m.note ? ` · ${m.note}` : ''}`,
        subtitle: `${formatRelativeDateTime(m.created_at)} · ${p?.name ?? 'Produkt'} ${m.quantity > 0 ? '+' : '−'}${formatQty(Math.abs(m.quantity))}`,
        value: roundMoney(m.quantity * (p?.cost_price ?? 0)),
      })
    }
  }
  return out
}

const icons: Record<MovementType, { icon: typeof ArrowDown; className: string }> = {
  entry: { icon: ArrowDown, className: 'bg-brand-100 text-brand-600' },
  return: { icon: ArrowUp, className: 'bg-[#EEF1EE] text-muted' },
  writeoff: { icon: TriangleAlert, className: 'bg-warn-100 text-warn-700' },
  inventory: { icon: Equal, className: 'bg-[#EEF1EE] text-muted' },
  sale: { icon: ArrowUp, className: 'bg-[#EEF1EE] text-muted' },
}

export function RecentMovementsCard({
  movements,
  products,
  entries,
  onShowAll,
}: {
  movements: StockMovement[]
  products: Product[]
  entries: EntryListRow[]
  onShowAll: () => void
}) {
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const entryMap = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries])
  const items = useMemo(() => toActivity(movements, productMap, entryMap).slice(0, 5), [movements, productMap, entryMap])

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">Lëvizjet e fundit</h2>
        <button type="button" onClick={onShowAll} className="text-[13px] font-semibold text-brand-600 underline">
          Të gjitha
        </button>
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-sm text-muted">Ende nuk ka lëvizje.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#EEF1EE]">
          {items.map((a) => {
            const { icon: Icon, className } = icons[a.type]
            return (
              <li key={a.key} className="flex items-center gap-3 py-3">
                <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', className)}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold">{a.title}</span>
                  <span className="truncate text-xs text-muted">{a.subtitle}</span>
                </span>
                <span className={cn('shrink-0 text-sm font-bold tabular-nums', a.value >= 0 ? 'text-brand-600' : 'text-warn-700')}>
                  {a.value >= 0 ? '+' : '−'}
                  {formatMoney(Math.abs(a.value))}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
