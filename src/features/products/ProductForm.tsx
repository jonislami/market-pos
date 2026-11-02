import { useState, type FormEvent } from 'react'
import { Button, CloseButton, Input, Select, Toggle } from '@/components/ui'
import { nextInternalBarcode } from '@/lib/barcode'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { formatPercent, parseDecimal } from '@/lib/text'
import { allowsDecimals, formatQty, UNIT_LABELS, UNITS } from '@/lib/units'
import { margin, VAT_RATES } from '@/lib/vat'
import type { Category, Product, ProductInput, Unit, VatRate } from '@/types/database'
import { useSaveProduct } from './api'

interface Props {
  product: Product | null
  categories: Category[]
  /** Used to generate the next free in-store barcode. */
  allProducts: Product[]
  defaultCategoryId: number | null
  onClose: () => void
  onSaved: (product: Product) => void
}

interface FormState {
  name: string
  barcode: string
  categoryId: string
  unit: Unit
  cost: string
  sale: string
  vat: string
  minStock: string
  showInPos: boolean
  active: boolean
}

type Errors = Partial<Record<'name' | 'cost' | 'sale' | 'minStock', string>>

const priceText = (n: number) => n.toFixed(2)

function initialState(p: Product | null, defaultCategoryId: number | null): FormState {
  return {
    name: p?.name ?? '',
    barcode: p?.barcode ?? '',
    categoryId: String(p ? (p.category_id ?? '') : (defaultCategoryId ?? '')),
    unit: p?.unit ?? 'cope',
    cost: p ? priceText(p.cost_price) : '',
    sale: p ? priceText(p.sale_price) : '',
    vat: String(p?.vat_rate ?? 8),
    minStock: p ? formatQty(p.min_stock) : '',
    showInPos: p?.show_in_pos ?? true,
    active: p?.active ?? true,
  }
}

function validate(s: FormState): { errors: Errors; input?: ProductInput } {
  const errors: Errors = {}
  const cost = parseDecimal(s.cost) ?? 0
  const sale = parseDecimal(s.sale)
  const minStock = parseDecimal(s.minStock) ?? 0

  if (!s.name.trim()) errors.name = 'Shkruaj emrin e produktit.'
  if (parseDecimal(s.cost) === null && s.cost.trim() !== '') errors.cost = 'Çmim i pavlefshëm.'
  else if (cost < 0) errors.cost = 'Çmimi nuk mund të jetë negativ.'
  if (sale === null) errors.sale = s.sale.trim() ? 'Çmim i pavlefshëm.' : 'Shkruaj çmimin e shitjes.'
  else if (sale <= 0) errors.sale = 'Çmimi duhet të jetë më i madh se 0.'
  if (parseDecimal(s.minStock) === null && s.minStock.trim() !== '') errors.minStock = 'Numër i pavlefshëm.'
  else if (minStock < 0) errors.minStock = 'Nuk mund të jetë negativ.'
  else if (!allowsDecimals(s.unit) && !Number.isInteger(minStock)) errors.minStock = 'Për këtë njësi lejohen vetëm numra të plotë.'

  if (Object.keys(errors).length || sale === null) return { errors }
  return {
    errors,
    input: {
      name: s.name.trim(),
      barcode: s.barcode.trim() || null,
      category_id: s.categoryId ? Number(s.categoryId) : null,
      unit: s.unit,
      cost_price: Math.round(cost * 100) / 100,
      sale_price: Math.round(sale * 100) / 100,
      vat_rate: Number(s.vat) as VatRate,
      min_stock: minStock,
      show_in_pos: s.showInPos,
      active: s.active,
    },
  }
}

export function ProductForm({ product, categories, allProducts, defaultCategoryId, onClose, onSaved }: Props) {
  const [state, setState] = useState(() => initialState(product, defaultCategoryId))
  const [errors, setErrors] = useState<Errors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const save = useSaveProduct()

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setState((s) => ({ ...s, [key]: value }))

  const sale = parseDecimal(state.sale)
  const m = sale !== null ? margin(sale, parseDecimal(state.cost) ?? 0) : null

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setSaveError(null)
    const { errors: next, input } = validate(state)
    setErrors(next)
    if (!input) return
    save.mutate({ id: product?.id, input }, { onSuccess: onSaved, onError: (err) => setSaveError(errorMessage(err)) })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3.5" noValidate>
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold">{product ? 'Ndrysho produktin' : 'Produkt i ri'}</h2>
        <CloseButton onClick={onClose} />
      </div>

      <Input
        label="Emri i produktit"
        placeholder="p.sh. Qumësht i freskët 1L"
        value={state.name}
        onChange={(e) => set('name', e.target.value)}
        error={errors.name}
        autoFocus={!product}
      />

      <div className="flex items-end gap-2">
        <Input
          label="Barkodi"
          placeholder="Skano ose shkruaj"
          inputMode="numeric"
          value={state.barcode}
          onChange={(e) => set('barcode', e.target.value)}
          // A scanner "types" the code and presses Enter; don't submit the form on that.
          onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
          wrapperClassName="flex-1"
          className="tabular-nums"
        />
        <Button variant="secondary" size="md" className="px-3 text-[13px]" onClick={() => set('barcode', nextInternalBarcode(allProducts.map((p) => p.barcode)))}>
          Gjenero
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Select label="Kategoria" value={state.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
          <option value="">Pa kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          label="Njësia"
          value={state.unit}
          onChange={(e) => set('unit', e.target.value as Unit)}
          options={UNITS.map((u) => ({ value: u, label: UNIT_LABELS[u] }))}
        />
        <Input
          label="Çmimi i blerjes"
          placeholder="€0.00"
          inputMode="decimal"
          value={state.cost}
          onChange={(e) => set('cost', e.target.value)}
          error={errors.cost}
          className="tabular-nums"
        />
        <Input
          label="Çmimi i shitjes"
          placeholder="€0.00"
          inputMode="decimal"
          value={state.sale}
          onChange={(e) => set('sale', e.target.value)}
          error={errors.sale}
          className="tabular-nums"
        />
        <Select
          label="TVSH"
          value={state.vat}
          onChange={(e) => set('vat', e.target.value)}
          options={VAT_RATES.map((r) => ({ value: String(r), label: `${r}%` }))}
        />
        <Input
          label="Stoku minimal"
          placeholder="p.sh. 10"
          inputMode="decimal"
          value={state.minStock}
          onChange={(e) => set('minStock', e.target.value)}
          error={errors.minStock}
          className="tabular-nums"
        />
      </div>

      <div className="flex justify-between rounded-[10px] bg-[#F0F7F3] p-3 text-[13px]">
        <span className="text-[#33413A]">Marzha e llogaritur</span>
        <span className={cn('font-bold tabular-nums', m !== null && m < 0 ? 'text-warn-700' : 'text-brand-600')}>
          {m === null ? '—' : formatPercent(m)}
        </span>
      </div>

      {product && (
        <div className="flex justify-between rounded-[10px] border border-line p-3 text-[13px]">
          <span className="text-[#33413A]">Stoku aktual</span>
          <span className="font-bold tabular-nums">
            {formatQty(product.stock)} {UNIT_LABELS[product.unit]}
          </span>
        </div>
      )}
      {!product && (
        <p className="text-xs text-muted">Stoku fillon nga 0 dhe shtohet përmes hyrjeve të mallit.</p>
      )}

      <div className="flex flex-col">
        <Toggle checked={state.showInPos} onChange={(v) => set('showInPos', v)} label="Shfaq në arkë (POS)" />
        {product && (
          <Toggle checked={state.active} onChange={(v) => set('active', v)} label="Produkt aktiv (çaktivizo në vend që ta fshish)" />
        )}
      </div>

      {saveError && (
        <p role="alert" className="rounded-[10px] bg-warn-100 px-3 py-2.5 text-sm font-medium text-warn-700">
          {saveError}
        </p>
      )}

      <div className="flex gap-2.5">
        <Button variant="secondary" className="min-h-12 flex-1" onClick={onClose}>
          Anulo
        </Button>
        <Button type="submit" className="min-h-12 flex-[2]" loading={save.isPending}>
          Ruaj produktin
        </Button>
      </div>
    </form>
  )
}
