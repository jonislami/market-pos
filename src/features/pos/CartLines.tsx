import { useEffect, useRef, useState } from 'react'
import { Minus, Plus, X } from 'lucide-react'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { parseDecimal } from '@/lib/text'
import { allowsDecimals, formatQty, UNIT_LABELS } from '@/lib/units'
import type { CartItem, CartTotals } from './cart'
import { normalizeQty } from './cart'

interface QtyProps {
  item: CartItem
  onChange: (qty: number) => void
  /** Focus and select the field, e.g. right after adding a weighed product. */
  autoFocus?: boolean
  size: 'sm' | 'lg'
}

function QtyControl({ item, onChange, autoFocus, size }: QtyProps) {
  const decimals = item.product ? allowsDecimals(item.product.unit) : false
  const step = decimals ? 0.1 : 1
  const [text, setText] = useState(formatQty(item.qty))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => setText(formatQty(item.qty)), [item.qty])
  useEffect(() => {
    if (autoFocus) inputRef.current?.select()
  }, [autoFocus])

  function commit() {
    const n = parseDecimal(text)
    if (n === null || n < 0) return setText(formatQty(item.qty))
    const q = normalizeQty(n, decimals)
    if (q !== item.qty) onChange(q)
    else setText(formatQty(item.qty))
  }

  const btn = cn(
    'flex shrink-0 items-center justify-center rounded-lg border border-field bg-white text-ink hover:bg-[#F0F3F1]',
    size === 'lg' ? 'size-11' : 'size-8',
  )

  return (
    <div className={cn('flex items-center', size === 'lg' ? 'gap-2' : 'gap-1.5')}>
      <button type="button" aria-label="Zvogëlo" className={btn} onClick={() => onChange(normalizeQty(item.qty - step, decimals))}>
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        ref={inputRef}
        aria-label="Sasia"
        inputMode={decimals ? 'decimal' : 'numeric'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur()
            document.getElementById('pos-search')?.focus()
          }
        }}
        className={cn(
          'rounded-md bg-transparent text-center font-semibold tabular-nums focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600/30',
          size === 'lg' ? 'w-12 text-lg' : decimals ? 'w-14 text-[15px]' : 'w-9 text-base',
        )}
      />
      <button type="button" aria-label="Rrit" className={btn} onClick={() => onChange(normalizeQty(item.qty + step, decimals))}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  )
}

interface LinesProps {
  items: CartItem[]
  onQty: (productId: number, qty: number) => void
  onRemove: (productId: number) => void
  focusId: number | null
  size: 'sm' | 'lg'
}

export function CartLines({ items, onQty, onRemove, focusId, size }: LinesProps) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => {
        const p = item.product
        const overStock = p && item.qty > p.stock
        return (
          <li key={item.productId} className={cn('flex items-center gap-3 border-b border-[#EEF1EE] last:border-b-0', size === 'lg' ? 'py-3.5' : 'py-3')}>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className={cn('truncate font-semibold', size === 'lg' ? 'text-base' : 'text-sm')}>
                {p?.name ?? 'Produkt i padisponueshëm'}
              </span>
              {p ? (
                <span className={cn('text-muted', size === 'lg' ? 'text-sm' : 'text-xs')}>
                  {formatMoney(p.sale_price)} / {UNIT_LABELS[p.unit]}
                  {size === 'lg' && <strong className="text-ink"> · {formatMoney(item.lineTotal)}</strong>}
                  {overStock && <span className="text-amber-700"> · stoku {formatQty(p.stock)}</span>}
                </span>
              ) : (
                <span className="text-xs text-warn-700">Nuk shitet më në arkë – hiqe nga fatura</span>
              )}
            </div>
            {p ? (
              <QtyControl item={item} size={size} autoFocus={focusId === item.productId} onChange={(q) => onQty(item.productId, q)} />
            ) : (
              <button type="button" aria-label="Hiq" onClick={() => onRemove(item.productId)} className="flex size-8 items-center justify-center rounded-lg bg-warn-100 text-warn-700">
                <X className="size-4" aria-hidden />
              </button>
            )}
            {size === 'sm' && <span className="w-16 shrink-0 text-right text-[15px] font-semibold tabular-nums">{formatMoney(item.lineTotal)}</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** "Pa TVSH / TVSH 8% / TVSH 18%" breakdown and the big total. */
export function CartTotalsBox({ totals }: { totals: CartTotals }) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex justify-between text-muted">
        <span>Pa TVSH</span>
        <span className="tabular-nums">{formatMoney(totals.net)}</span>
      </div>
      {totals.vatGroups
        .filter((g) => g.rate > 0)
        .map((g) => (
          <div key={g.rate} className="flex justify-between text-muted">
            <span>TVSH {g.rate}%</span>
            <span className="tabular-nums">{formatMoney(g.vat)}</span>
          </div>
        ))}
      <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-field pt-2">
        <span className="text-base font-semibold">Totali</span>
        <span className="text-[32px] font-bold tabular-nums tracking-[-0.02em]">{formatMoney(totals.total)}</span>
      </div>
    </div>
  )
}
