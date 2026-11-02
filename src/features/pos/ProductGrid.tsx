import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { stockStatus } from '@/lib/stock'
import { formatQty, UNIT_LABELS } from '@/lib/units'
import type { PosProduct } from '@/types/database'

const stockText = {
  critical: 'font-semibold text-warn-700',
  low: 'font-semibold text-amber-700',
  ok: 'text-muted',
}

export function StockLabel({ p, className }: { p: PosProduct; className?: string }) {
  return (
    <span className={cn('text-xs tabular-nums', stockText[stockStatus(p.stock, p.min_stock)], className)}>
      {formatQty(p.stock)} {UNIT_LABELS[p.unit]}
    </span>
  )
}

interface Props {
  products: PosProduct[]
  categoryName: (id: number | null) => string
  onAdd: (p: PosProduct) => void
}

/** Desktop tiles: one click adds the product to the cart. */
export function ProductGrid({ products, categoryName, onAdd }: Props) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
      {products.map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => onAdd(p)}
          className="flex min-h-[118px] flex-col gap-1.5 rounded-xl border border-line bg-white p-3.5 text-left transition-colors hover:border-brand-600 active:bg-brand-100"
        >
          <span className="truncate text-xs text-muted">{categoryName(p.category_id)}</span>
          <span className="line-clamp-2 text-sm font-semibold leading-[1.3]">{p.name}</span>
          <span className="mt-auto flex items-baseline justify-between gap-2">
            <span className="text-[17px] font-bold tabular-nums">{formatMoney(p.sale_price)}</span>
            <StockLabel p={p} />
          </span>
        </button>
      ))}
    </div>
  )
}

/** Phone: compact search results shown above the cart while typing. */
export function ProductResults({ products, onAdd }: Omit<Props, 'categoryName'>) {
  return (
    <ul className="flex flex-col divide-y divide-[#EEF1EE] rounded-card border border-line bg-white">
      {products.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => onAdd(p)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-brand-100">
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-semibold">{p.name}</span>
              <StockLabel p={p} />
            </span>
            <span className="shrink-0 text-base font-bold tabular-nums">{formatMoney(p.sale_price)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}
