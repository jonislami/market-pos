import { useEffect, useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Badge, Button, Card, Dialog, Input, Pagination, Select, Tabs } from '@/components/ui'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { formatMoney, roundMoney } from '@/lib/money'
import { supabase } from '@/lib/supabase'
import { normalizeText, parseDecimal } from '@/lib/text'
import { allowsDecimals, formatQty, UNIT_LABELS } from '@/lib/units'
import type { Category, Product } from '@/types/database'
import { useAdjustStock, type Adjustment } from './api'
import { ProductPicker } from './ProductPicker'

type Mode = 'count' | 'writeoff'

interface Props {
  products: Product[]
  categories: Category[]
  onDone: (message: string) => void
}

export function InventoryTab({ products, categories, onDone }: Props) {
  const [mode, setMode] = useState<Mode>('count')
  return (
    <div className="flex flex-col gap-4">
      <Tabs
        variant="segmented"
        className="max-w-md"
        label="Lloji i veprimit"
        value={mode}
        onChange={setMode}
        items={[
          { value: 'count', label: 'Numërimi i stokut' },
          { value: 'writeoff', label: 'Shkarkim malli' },
        ]}
      />
      {mode === 'count' ? (
        <CountForm products={products} categories={categories} onDone={onDone} />
      ) : (
        <WriteOffForm products={products} onDone={onDone} />
      )}
    </div>
  )
}

// ---------- Stock count ----------

const COUNTS_KEY = 'market-pos.inventory-counts'
const PAGE_SIZE = 50

function readCounts(): Record<number, string> {
  try {
    return JSON.parse(localStorage.getItem(COUNTS_KEY) ?? '{}') as Record<number, string>
  } catch {
    return {}
  }
}

function CountForm({ products, categories, onDone }: Props) {
  const adjust = useAdjustStock()
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  /** Counted quantity per product id, as typed. Kept in localStorage so a long count survives a reload. */
  const [counts, setCounts] = useState<Record<number, string>>(readCounts)
  const [note, setNote] = useState('')
  const [reviewOpen, setReviewOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(COUNTS_KEY, JSON.stringify(counts))
    } catch {
      // Not critical.
    }
  }, [counts])

  const active = useMemo(() => products.filter((p) => p.active), [products])
  const productMap = useMemo(() => new Map(active.map((p) => [p.id, p])), [active])

  const rows = useMemo(() => {
    const q = normalizeText(search)
    return active.filter(
      (p) =>
        (category === 'all' || String(p.category_id ?? 'none') === category) &&
        (!q || normalizeText(p.name).includes(q) || (p.barcode ?? '').startsWith(q)),
    )
  }, [active, category, search])

  /** Products with a valid count that differs from the system stock. */
  const changes = useMemo(() => {
    const out: { product: Product; counted: number; diff: number }[] = []
    for (const [id, text] of Object.entries(counts)) {
      const p = productMap.get(Number(id))
      const counted = parseDecimal(text)
      if (!p || counted === null || counted < 0) continue
      const diff = Math.round((counted - p.stock) * 1000) / 1000
      if (diff !== 0) out.push({ product: p, counted, diff })
    }
    return out
  }, [counts, productMap])

  const countedCount = Object.values(counts).filter((v) => v.trim() !== '').length
  const valueDiff = roundMoney(changes.reduce((s, c) => s + c.diff * c.product.cost_price, 0))

  async function apply() {
    setError(null)
    // Sales may have happened while counting: compare with the stock as it is right now.
    const ids = changes.map((c) => c.product.id)
    const { data, error: fetchError } = await supabase.from('products').select('id, stock').in('id', ids)
    if (fetchError) return setError(errorMessage(fetchError))
    const fresh = new Map(data.map((r) => [r.id as number, Number(r.stock)]))
    const items: Adjustment[] = changes
      .map((c) => ({
        productId: c.product.id,
        quantity: Math.round((c.counted - (fresh.get(c.product.id) ?? c.product.stock)) * 1000) / 1000,
        type: 'inventory' as const,
        note: note.trim() || 'Inventarizim',
      }))
      .filter((a) => a.quantity !== 0)

    adjust.mutate(items, {
      onSuccess: ({ ok, failed }) => {
        setReviewOpen(false)
        if (failed.length) {
          setError(`${failed.length} produkte nuk u përditësuan: ${failed[0].message}`)
          // Keep only the counts that failed, so they can be retried.
          const failedIds = new Set(failed.map((f) => f.productId))
          setCounts((c) => Object.fromEntries(Object.entries(c).filter(([id]) => failedIds.has(Number(id)))))
        } else {
          setCounts({})
          setNote('')
        }
        if (ok) onDone(`Inventarizimi u ruajt: u korrigjua stoku për ${ok} produkte.`)
      },
      onError: (err) => setError(errorMessage(err)),
    })
  }

  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-end gap-2.5 border-b border-[#EEF1EE] p-4">
        <Input
          type="search"
          aria-label="Kërko"
          placeholder="Kërko ose skano produktin"
          leftIcon={<Search className="size-[18px]" aria-hidden />}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          onKeyDown={(e) => {
            // Scanner: jump to the count field of an exact barcode match.
            if (e.key === 'Enter') {
              const p = active.find((x) => x.barcode === search.trim())
              if (p) document.getElementById(`count-${p.id}`)?.focus()
            }
          }}
          wrapperClassName="flex-[1_1_240px]"
        />
        <Select
          aria-label="Kategoria"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            setPage(1)
          }}
          wrapperClassName="w-52"
        >
          <option value="all">Të gjitha kategoritë</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          <option value="none">Pa kategori</option>
        </Select>
      </div>

      <p className="border-b border-[#EEF1EE] px-4 py-3 text-[13px] text-muted">
        Shkruaj sasinë e numëruar vetëm për produktet që i ke numëruar. Produktet pa vlerë nuk ndryshohen.
      </p>

      <ul className="flex flex-col divide-y divide-[#EEF1EE]">
        {pageRows.map((p) => {
          const text = counts[p.id] ?? ''
          const counted = parseDecimal(text)
          const diff = counted === null ? null : Math.round((counted - p.stock) * 1000) / 1000
          return (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{p.name}</span>
                <span className="text-xs tabular-nums text-muted">
                  Në sistem: {formatQty(p.stock)} {UNIT_LABELS[p.unit]}
                </span>
              </span>
              <span
                className={cn(
                  'w-16 text-right text-sm font-semibold tabular-nums',
                  diff === null || diff === 0 ? 'text-muted' : diff > 0 ? 'text-brand-600' : 'text-warn-700',
                )}
              >
                {diff === null ? '' : diff === 0 ? '✓' : `${diff > 0 ? '+' : '−'}${formatQty(Math.abs(diff))}`}
              </span>
              <input
                id={`count-${p.id}`}
                aria-label={`Numëruar: ${p.name}`}
                inputMode={allowsDecimals(p.unit) ? 'decimal' : 'numeric'}
                placeholder="—"
                value={text}
                onChange={(e) => setCounts((c) => ({ ...c, [p.id]: e.target.value }))}
                className="min-h-btn w-24 rounded-[10px] border border-field bg-white px-2.5 text-right tabular-nums focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
              />
            </li>
          )
        })}
      </ul>
      {rows.length === 0 && <p className="px-4 py-10 text-center text-sm text-muted">Asnjë produkt.</p>}
      <Pagination page={page} pageSize={PAGE_SIZE} total={rows.length} onChange={setPage} className="border-t border-[#EEF1EE] px-4 py-3.5" />

      <div className="flex flex-col gap-3 border-t border-[#EEF1EE] bg-[#FAFBFA] p-4 md:flex-row md:items-end">
        <Input label="Shënim" placeholder="p.sh. Inventarizimi mujor – Pije" value={note} onChange={(e) => setNote(e.target.value)} wrapperClassName="flex-1" />
        <div className="flex gap-2.5">
          <Button variant="secondary" disabled={!countedCount} onClick={() => window.confirm('Fshi të gjitha sasitë e numëruara?') && setCounts({})}>
            Pastro
          </Button>
          <Button disabled={!changes.length} onClick={() => setReviewOpen(true)}>
            Ruaj inventarizimin ({changes.length})
          </Button>
        </div>
      </div>
      {error && <p className="mx-4 mb-4 rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}

      <Dialog
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title="Konfirmo inventarizimin"
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setReviewOpen(false)}>
              Anulo
            </Button>
            <Button className="flex-[2]" loading={adjust.isPending} onClick={() => void apply()}>
              Korrigjo stokun
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <p>
            Stoku do të korrigjohet për <strong>{changes.length} produkte</strong>. Diferenca në vlerë (me çmim blerjeje):{' '}
            <strong className={valueDiff < 0 ? 'text-warn-700' : 'text-brand-600'}>
              {valueDiff < 0 ? '−' : '+'}
              {formatMoney(Math.abs(valueDiff))}
            </strong>
          </p>
          <ul className="flex max-h-72 flex-col divide-y divide-[#EEF1EE] overflow-y-auto rounded-[10px] border border-line">
            {changes.map((c) => (
              <li key={c.product.id} className="flex justify-between gap-3 px-3 py-2">
                <span className="truncate">{c.product.name}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {formatQty(c.product.stock)} → <strong className="text-ink">{formatQty(c.counted)}</strong>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Dialog>
    </Card>
  )
}

// ---------- Write-off ----------

const REASONS = ['Skadim', 'Dëmtim', 'Humbje / vjedhje', 'Përdorim i brendshëm', 'Tjetër']

interface WriteOffLine {
  productId: number
  qty: string
}

function WriteOffForm({ products, onDone }: Omit<Props, 'categories'>) {
  const adjust = useAdjustStock()
  const [lines, setLines] = useState<WriteOffLine[]>([])
  const [reason, setReason] = useState(REASONS[0])
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const parsed = lines.map((l) => {
    const p = productMap.get(l.productId)
    const qty = parseDecimal(l.qty)
    const invalid = !p || qty === null || qty <= 0 || (!allowsDecimals(p.unit) && !Number.isInteger(qty))
    return { ...l, p, qty: qty ?? 0, invalid }
  })
  const value = roundMoney(parsed.reduce((s, l) => s + l.qty * (l.p?.cost_price ?? 0), 0))

  function submit() {
    setError(null)
    if (!parsed.length) return setError('Shto të paktën një produkt.')
    if (parsed.some((l) => l.invalid)) return setError('Kontrollo sasitë (më të mëdha se 0; numra të plotë përveç kg).')
    if (!window.confirm(`Shkarko ${parsed.length} produkte me vlerë ${formatMoney(value)}?`)) return
    const label = note.trim() ? `${reason} – ${note.trim()}` : reason
    adjust.mutate(
      parsed.map((l) => ({ productId: l.productId, quantity: -l.qty, type: 'writeoff', note: label })),
      {
        onSuccess: ({ ok, failed }) => {
          if (failed.length) setError(`${failed.length} produkte nuk u shkarkuan: ${failed[0].message}`)
          const failedIds = new Set(failed.map((f) => f.productId))
          setLines((ls) => ls.filter((l) => failedIds.has(l.productId)))
          if (!failed.length) setNote('')
          if (ok) onDone(`U shkarkuan ${ok} produkte (${reason.toLowerCase()}).`)
        },
        onError: (err) => setError(errorMessage(err)),
      },
    )
  }

  return (
    <Card padded={false}>
      <div className="flex flex-col gap-3 border-b border-[#EEF1EE] p-4">
        <p className="text-[13px] text-muted">Malli i skaduar, i dëmtuar ose i humbur del nga stoku dhe regjistrohet si shkarkim.</p>
        <ProductPicker
          products={products}
          onPick={(p) => setLines((ls) => (ls.some((l) => l.productId === p.id) ? ls : [...ls, { productId: p.id, qty: '1' }]))}
        />
      </div>
      {parsed.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted">Skano ose kërko produktet që do të shkarkohen.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#EEF1EE]">
          {parsed.map((l) => (
            <li key={l.productId} className="flex items-center gap-3 px-4 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold">{l.p?.name ?? `#${l.productId}`}</span>
                {l.p && (
                  <span className="text-xs tabular-nums text-muted">
                    Stoku {formatQty(l.p.stock)} {UNIT_LABELS[l.p.unit]} · {formatMoney(l.p.cost_price)} / njësi
                  </span>
                )}
              </span>
              {l.p && l.qty > l.p.stock && <Badge tone="low">Mbi stokun</Badge>}
              <input
                aria-label="Sasia"
                inputMode="decimal"
                value={l.qty}
                onChange={(e) => setLines((ls) => ls.map((x) => (x.productId === l.productId ? { ...x, qty: e.target.value } : x)))}
                className={cn(
                  'min-h-btn w-20 rounded-[10px] border bg-white px-2.5 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-brand-600/20',
                  l.invalid ? 'border-warn-700' : 'border-field',
                )}
              />
              <button
                type="button"
                aria-label="Hiq"
                onClick={() => setLines((ls) => ls.filter((x) => x.productId !== l.productId))}
                className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-[#F0F3F1]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-3 border-t border-[#EEF1EE] bg-[#FAFBFA] p-4 md:flex-row md:items-end">
        <Select label="Arsyeja" value={reason} onChange={(e) => setReason(e.target.value)} options={REASONS.map((r) => ({ value: r, label: r }))} wrapperClassName="md:w-56" />
        <Input label="Shënim" placeholder="opsional" value={note} onChange={(e) => setNote(e.target.value)} wrapperClassName="flex-1" />
        <Button variant="danger" disabled={!parsed.length} loading={adjust.isPending} onClick={submit}>
          Shkarko {parsed.length ? `(${formatMoney(value)})` : ''}
        </Button>
      </div>
      {error && <p className="mx-4 mb-4 rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm text-warn-700">{error}</p>}
    </Card>
  )
}
