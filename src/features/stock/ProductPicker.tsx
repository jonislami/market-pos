import { useMemo, useRef, useState } from 'react'
import { Barcode } from 'lucide-react'
import { beep } from '@/lib/beep'
import { cn } from '@/lib/cn'
import { formatMoney } from '@/lib/money'
import { normalizeText } from '@/lib/text'
import { formatQty, UNIT_LABELS } from '@/lib/units'
import type { Product } from '@/types/database'

interface Props {
  products: Product[]
  onPick: (p: Product) => void
  placeholder?: string
  className?: string
}

const MAX_RESULTS = 12

/** Search box with a dropdown; a scanned barcode (exact match + Enter) picks immediately. */
export function ProductPicker({ products, onPick, placeholder = 'Skano barkodin ose kërko produktin për ta shtuar', className }: Props) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [open, setOpen] = useState(false)
  const [notFound, setNotFound] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const q = normalizeText(query)
    if (!q) return []
    return products
      .filter((p) => p.active && (normalizeText(p.name).includes(q) || (p.barcode ?? '').startsWith(q)))
      .slice(0, MAX_RESULTS)
  }, [products, query])

  function pick(p: Product) {
    onPick(p)
    setQuery('')
    setActive(0)
    setNotFound(null)
    inputRef.current?.focus()
  }

  function onEnter() {
    const code = query.trim()
    const exact = products.find((p) => p.barcode === code)
    if (exact) {
      beep('ok')
      return pick(exact)
    }
    if (results[active]) return pick(results[active])
    if (/^\d{6,}$/.test(code)) {
      beep('error')
      setNotFound(code)
      setQuery('')
    }
  }

  return (
    <div className={cn('relative', className)}>
      <label className="flex min-h-[46px] items-center gap-2.5 rounded-[10px] border-2 border-brand-600 bg-white px-3">
        <Barcode className="size-5 shrink-0 text-ink" aria-hidden />
        <span className="sr-only">Shto produkt</span>
        <input
          ref={inputRef}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
            setNotFound(null)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onEnter()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Escape') setQuery('')
          }}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#8A968F]"
        />
      </label>
      {notFound && <p className="mt-1.5 text-[13px] text-warn-700">Barkodi {notFound} nuk u gjet te produktet.</p>}
      {open && results.length > 0 && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-30 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-lg">
          {results.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(p)}
                onMouseEnter={() => setActive(i)}
                className={cn('flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left', i === active && 'bg-brand-100')}
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-semibold">{p.name}</span>
                  <span className="text-xs tabular-nums text-muted">{p.barcode ?? 'pa barkod'}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end text-xs text-muted">
                  <span className="tabular-nums">
                    Stoku {formatQty(p.stock)} {UNIT_LABELS[p.unit]}
                  </span>
                  <span className="tabular-nums">Blerja {formatMoney(p.cost_price)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
