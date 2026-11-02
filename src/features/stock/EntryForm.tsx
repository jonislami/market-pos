import { useCallback, useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { Badge, Button, Card, Dialog, Input, Select } from '@/components/ui'
import { cn } from '@/lib/cn'
import { todayISO } from '@/lib/date'
import { errorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { stockStatus, STOCK_BADGE } from '@/lib/stock'
import { parseDecimal } from '@/lib/text'
import { allowsDecimals, formatQty, UNIT_LABELS } from '@/lib/units'
import type { Product, StockEntry, StockEntryItem, Supplier, VatRate } from '@/types/database'
import { useSaveEntry, type EntryItemInput } from './api'
import { entryTotals, lineNet, netCost } from './entryMath'
import { ProductPicker } from './ProductPicker'

export interface EntryLine {
  productId: number
  qty: string
  /** Net unit cost (without VAT), as typed. */
  cost: string
  vatRate: VatRate
}

export interface EntryFormState {
  /** Set when editing a saved draft. */
  id?: number
  supplierId: string
  invoiceNo: string
  date: string
  paymentTerms: string
  note: string
  lines: EntryLine[]
}

const STORAGE_KEY = 'market-pos.entry-form'

const emptyForm = (): EntryFormState => ({
  supplierId: '',
  invoiceNo: '',
  date: todayISO(),
  paymentTerms: 'Kesh',
  note: '',
  lines: [],
})

function termsFor(days: number | null | undefined): string {
  return days && days > 0 ? `Me afat (${days} ditë)` : 'Kesh'
}

/** Form state for "Hyrje e re", kept in localStorage so switching tabs or reloading does not lose it. */
export function useEntryForm() {
  const [form, setForm] = useState<EntryFormState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? { ...emptyForm(), ...(JSON.parse(raw) as EntryFormState) } : emptyForm()
    } catch {
      return emptyForm()
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form))
    } catch {
      // Not critical.
    }
  }, [form])

  const reset = useCallback(() => setForm(emptyForm()), [])

  const loadDraft = useCallback((entry: StockEntry, items: StockEntryItem[]) => {
    setForm({
      id: entry.id,
      supplierId: entry.supplier_id ? String(entry.supplier_id) : '',
      invoiceNo: entry.invoice_no ?? '',
      date: entry.entry_date,
      paymentTerms: entry.payment_terms ?? 'Kesh',
      note: entry.note ?? '',
      lines: items.map((i) => ({
        productId: i.product_id,
        qty: formatQty(i.quantity),
        cost: i.unit_cost.toFixed(2),
        vatRate: i.vat_rate,
      })),
    })
  }, [])

  /** Adds products that are not in the entry yet (existing lines are kept). */
  const addProducts = useCallback((items: { product: Product; qty?: number }[]) => {
    setForm((f) => {
      const have = new Set(f.lines.map((l) => l.productId))
      const added = items
        .filter(({ product }) => !have.has(product.id))
        .map(({ product, qty }) => ({
          productId: product.id,
          qty: qty ? formatQty(qty) : '',
          cost: netCost(product.cost_price, product.vat_rate).toFixed(2),
          vatRate: product.vat_rate,
        }))
      return { ...f, lines: [...f.lines, ...added] }
    })
  }, [])

  return { form, setForm, reset, loadDraft, addProducts }
}

export type EntryFormApi = ReturnType<typeof useEntryForm>

type LineErrors = Record<number, { qty?: string; cost?: string }>

function validate(form: EntryFormState, productMap: Map<number, Product>) {
  const errors: LineErrors = {}
  const items: EntryItemInput[] = []
  for (const l of form.lines) {
    const p = productMap.get(l.productId)
    const qty = parseDecimal(l.qty)
    const cost = parseDecimal(l.cost)
    const e: { qty?: string; cost?: string } = {}
    if (qty === null || qty <= 0) e.qty = 'Sasia > 0'
    else if (p && !allowsDecimals(p.unit) && !Number.isInteger(qty)) e.qty = 'Numër i plotë'
    if (cost === null || cost < 0) e.cost = 'Kosto e pavlefshme'
    if (e.qty || e.cost) errors[l.productId] = e
    else items.push({ product_id: l.productId, quantity: qty!, unit_cost: Math.round(cost! * 100) / 100, vat_rate: l.vatRate })
  }
  return { errors, items }
}

interface Props {
  api: EntryFormApi
  products: Product[]
  suppliers: Supplier[]
  onSaved: (message: string) => void
}

export function EntryForm({ api, products, suppliers, onSaved }: Props) {
  const { form, setForm, reset, addProducts } = api
  const save = useSaveEntry()
  const [errors, setErrors] = useState<LineErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const set = <K extends keyof EntryFormState>(key: K, value: EntryFormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const setLine = (productId: number, patch: Partial<EntryLine>) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.productId === productId ? { ...l, ...patch } : l)) }))
  const removeLine = (productId: number) => setForm((f) => ({ ...f, lines: f.lines.filter((l) => l.productId !== productId) }))

  const values = form.lines.map((l) => ({
    quantity: parseDecimal(l.qty) ?? 0,
    unitCost: parseDecimal(l.cost) ?? 0,
    vatRate: l.vatRate,
  }))
  const totals = entryTotals(values)
  const unitCount = values.reduce((s, v) => s + v.quantity, 0)

  const supplier = suppliers.find((s) => String(s.id) === form.supplierId)
  const termOptions = useMemo(() => {
    const opts = new Set(['Kesh', 'Me afat (15 ditë)', 'Me afat (30 ditë)', 'Me afat (60 ditë)'])
    if (supplier) opts.add(termsFor(supplier.payment_days))
    if (form.paymentTerms) opts.add(form.paymentTerms)
    return [...opts]
  }, [supplier, form.paymentTerms])

  function submit(confirm: boolean) {
    setFormError(null)
    if (!form.lines.length) {
      setFormError('Shto të paktën një produkt.')
      return
    }
    const { errors: next, items } = validate(form, productMap)
    setErrors(next)
    if (Object.keys(next).length) {
      setFormError('Kontrollo sasitë dhe kostot e shënuara me të kuqe.')
      return
    }
    if (confirm && !confirmOpen) {
      setConfirmOpen(true)
      return
    }
    setConfirmOpen(false)
    save.mutate(
      {
        id: form.id,
        confirm,
        items,
        header: {
          supplier_id: form.supplierId ? Number(form.supplierId) : null,
          invoice_no: form.invoiceNo.trim() || null,
          entry_date: form.date || todayISO(),
          payment_terms: form.paymentTerms || null,
          note: form.note.trim() || null,
        },
      },
      {
        onSuccess: (id) => {
          if (confirm) {
            reset()
            setErrors({})
            onSaved(`Hyrja u konfirmua: stoku u rrit për ${items.length} produkte.`)
          } else {
            set('id', id)
            onSaved('Drafti u ruajt. E gjen te "Historiku i hyrjeve".')
          }
        },
        onError: (err) => {
          // The draft may have been created before confirmation failed: keep its id to avoid duplicates.
          const entryId = (err as { entryId?: number }).entryId
          if (entryId) set('id', entryId)
          setFormError(errorMessage(err))
        },
      },
    )
  }

  function discard() {
    if ((!form.lines.length && !form.invoiceNo) || window.confirm('Pastro formularin? Ndryshimet e paruajtura humbin.')) {
      reset()
      setErrors({})
      setFormError(null)
    }
  }

  return (
    <Card padded={false} className="flex flex-col">
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Hyrje malli nga furnitori
            {form.id && (
              <Badge tone="neutral" className="ml-2 align-middle">
                Draft #{form.id}
              </Badge>
            )}
          </h2>
          {(form.lines.length > 0 || form.id) && (
            <button type="button" onClick={discard} className="text-[13px] font-semibold text-muted hover:text-ink">
              {form.id ? 'Mbyll draftin' : 'Pastro'}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Select
            label="Furnitori"
            wrapperClassName="col-span-2 md:col-span-1"
            value={form.supplierId}
            onChange={(e) => {
              const s = suppliers.find((x) => String(x.id) === e.target.value)
              setForm((f) => ({ ...f, supplierId: e.target.value, paymentTerms: s ? termsFor(s.payment_days) : f.paymentTerms }))
            }}
          >
            <option value="">— Pa furnitor —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input label="Nr. i faturës" placeholder="p.sh. F-2026/1184" value={form.invoiceNo} onChange={(e) => set('invoiceNo', e.target.value)} />
          <Input label="Data" type="date" value={form.date} onChange={(e) => set('date', e.target.value)} />
          <Select
            label="Pagesa"
            wrapperClassName="col-span-2 md:col-span-1"
            value={form.paymentTerms}
            onChange={(e) => set('paymentTerms', e.target.value)}
            options={termOptions.map((t) => ({ value: t, label: t }))}
          />
        </div>
      </div>

      <div className="border-t border-[#EEF1EE] px-5 py-4">
        <ProductPicker products={products} onPick={(p) => addProducts([{ product: p }])} />
      </div>

      {form.lines.length === 0 ? (
        <p className="border-t border-[#EEF1EE] px-5 py-10 text-center text-sm text-muted">
          Skano ose kërko produktet e faturës së furnitorit.
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-x-auto border-t border-[#EEF1EE] md:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#F7F9F7] text-left text-xs font-semibold text-muted">
                  <th className="px-3 py-2.5 pl-5">Produkti</th>
                  <th className="px-3 py-2.5 text-right">Stoku aktual</th>
                  <th className="px-3 py-2.5 text-right">Sasia hyrëse</th>
                  <th className="px-3 py-2.5 text-right">Kosto / njësi</th>
                  <th className="px-3 py-2.5 text-right">TVSH</th>
                  <th className="px-3 py-2.5 text-right">Vlera</th>
                  <th className="w-12" />
                </tr>
              </thead>
              <tbody>
                {form.lines.map((l, i) => {
                  const p = productMap.get(l.productId)
                  return (
                    <tr key={l.productId} className="border-t border-[#EEF1EE]">
                      <td className="px-3 py-2.5 pl-5 font-semibold">{p?.name ?? `Produkti #${l.productId}`}</td>
                      <td className="px-3 py-2.5 text-right">{p && <CurrentStock p={p} />}</td>
                      <td className="px-3 py-2.5 text-right">
                        <NumberCell value={l.qty} error={errors[l.productId]?.qty} onChange={(qty) => setLine(l.productId, { qty })} suffix={p ? UNIT_LABELS[p.unit] : ''} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <NumberCell value={l.cost} error={errors[l.productId]?.cost} onChange={(cost) => setLine(l.productId, { cost })} />
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{l.vatRate}%</td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums">{formatMoney(lineNet(values[i]))}</td>
                      <td className="pr-3 text-center">
                        <button type="button" aria-label="Hiq" onClick={() => removeLine(l.productId)} className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-[#F0F3F1] hover:text-ink">
                          <X className="size-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Phone cards */}
          <ul className="flex flex-col gap-3 border-t border-[#EEF1EE] bg-bg p-4 md:hidden">
            {form.lines.map((l, i) => {
              const p = productMap.get(l.productId)
              return (
                <li key={l.productId} className="flex flex-col gap-3 rounded-card border border-line bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold">{p?.name ?? `Produkti #${l.productId}`}</span>
                    <div className="flex items-center gap-1">
                      {p && <CurrentStock p={p} label />}
                      <button type="button" aria-label="Hiq" onClick={() => removeLine(l.productId)} className="flex size-8 items-center justify-center rounded-md text-muted">
                        <X className="size-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-end gap-3">
                    <Input label="Sasia" inputMode="decimal" value={l.qty} error={errors[l.productId]?.qty} onChange={(e) => setLine(l.productId, { qty: e.target.value })} wrapperClassName="flex-1" className="tabular-nums" />
                    <Input label="Kosto / njësi" inputMode="decimal" value={l.cost} error={errors[l.productId]?.cost} onChange={(e) => setLine(l.productId, { cost: e.target.value })} wrapperClassName="flex-1" className="tabular-nums" />
                    <span className="min-w-[72px] pb-3 text-right text-base font-bold tabular-nums">{formatMoney(lineNet(values[i]))}</span>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <div className="flex flex-col gap-4 border-t border-[#EEF1EE] bg-[#FAFBFA] p-5 md:flex-row md:items-end">
        <Input label="Shënim" placeholder="p.sh. malli erdhi i plotë" value={form.note} onChange={(e) => set('note', e.target.value)} wrapperClassName="flex-1" />
        <div className="flex flex-col gap-1 text-sm md:w-[300px]">
          <span className="text-[13px] text-muted">
            {form.lines.length} produkte · {formatQty(unitCount)} njësi
          </span>
          <div className="flex justify-between text-muted">
            <span>Vlera pa TVSH</span>
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
            <span className="font-semibold">Totali i faturës</span>
            <span className="text-[26px] font-bold tabular-nums">{formatMoney(totals.total)}</span>
          </div>
        </div>
      </div>

      {formError && <p role="alert" className="mx-5 mb-1 rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm font-medium text-warn-700">{formError}</p>}

      {/* Actions: inline on desktop, pinned above the tab bar on phones */}
      <div className="fixed inset-x-0 bottom-[calc(63px+max(env(safe-area-inset-bottom),6px))] z-20 flex gap-2.5 border-t border-line bg-white px-4 py-3 md:static md:justify-end md:border-0 md:bg-transparent md:px-5 md:pb-5 md:pt-2">
        <Button variant="secondary" className="min-h-12 md:min-h-btn" loading={save.isPending && !confirmOpen} onClick={() => submit(false)}>
          Ruaj si draft
        </Button>
        <Button className="min-h-12 flex-1 md:min-h-btn md:flex-none" onClick={() => submit(true)} disabled={save.isPending}>
          Konfirmo hyrjen në stok
        </Button>
      </div>
      <div className="h-20 md:hidden" aria-hidden />

      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Konfirmo hyrjen"
        size="sm"
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => setConfirmOpen(false)}>
              Anulo
            </Button>
            <Button className="flex-[2]" loading={save.isPending} onClick={() => submit(true)}>
              Po, konfirmo
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm">
          <p>
            Stoku do të rritet për <strong>{form.lines.length} produkte</strong> ({formatQty(unitCount)} njësi), me vlerë{' '}
            <strong>{formatMoney(totals.total)}</strong>.
          </p>
          <p className="text-muted">
            Çmimi i blerjes së çdo produkti përditësohet me koston e kësaj fature (me TVSH). Pas konfirmimit hyrja nuk mund të
            ndryshohet.
          </p>
        </div>
      </Dialog>
    </Card>
  )
}

function CurrentStock({ p, label }: { p: Product; label?: boolean }) {
  const status = stockStatus(p.stock, p.min_stock)
  const text = `${label ? 'Stoku: ' : ''}${formatQty(p.stock)}`
  if (status === 'ok') return <span className="text-sm tabular-nums text-muted">{text}</span>
  return (
    <Badge tone={STOCK_BADGE[status].tone} className="tabular-nums">
      {text}
    </Badge>
  )
}

function NumberCell({ value, onChange, error, suffix }: { value: string; onChange: (v: string) => void; error?: string; suffix?: string }) {
  return (
    <div className="inline-flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-1.5">
        <input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.target.select()}
          aria-invalid={error ? true : undefined}
          title={error}
          className={cn(
            'min-h-10 w-[84px] rounded-[10px] border bg-white px-2.5 text-right tabular-nums focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20',
            error ? 'border-warn-700' : 'border-field',
          )}
        />
        {suffix !== undefined && <span className="w-8 text-left text-xs text-muted">{suffix}</span>}
      </div>
      {error && <span className="text-[11px] text-warn-700">{error}</span>}
    </div>
  )
}
