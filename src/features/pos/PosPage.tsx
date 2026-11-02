import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Barcode, LoaderCircle, PauseCircle, ScanBarcode, Search, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Dialog } from '@/components/ui'
import { useCategories } from '@/features/products/api'
import { beep } from '@/lib/beep'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import { formatMoney, formatReceiptNo } from '@/lib/money'
import { formatTime } from '@/lib/date'
import { normalizeText } from '@/lib/text'
import { allowsDecimals } from '@/lib/units'
import type { PosProduct, Sale } from '@/types/database'
import { useAuth } from '@/features/auth/AuthProvider'
import { defaultSettings, useActiveRegister, useStoreSettings } from '@/features/settings/api'
import { bluetoothSupported } from '@/lib/printer/bluetooth'
import { preferredPrintMethod, printReceipt } from '@/lib/printer/print'
import type { ReceiptData, ReceiptItem } from '@/lib/printer/receipt'
import { supabase } from '@/lib/supabase'
import { useCreateSale, useNextSaleNumber, usePosProducts } from './api'
import { CameraScanner } from './CameraScanner'
import { computeTotals, useCart, type HeldCart } from './cart'
import { CartLines, CartTotalsBox } from './CartLines'
import { cashInfo, Kbd, PaymentDialog, PaymentPanel, SaleDoneDialog, type PaymentState, type PrintStatus } from './Payment'
import { ProductGrid, ProductResults } from './ProductGrid'

const GRID_STEP = 60
const SEARCH_ID = 'pos-search'

type Notice = { kind: 'ok' | 'error' | 'warn'; text: string } | null

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

const isWide = () => window.matchMedia('(min-width: 1024px)').matches

export function PosPage() {
  const productsQuery = usePosProducts()
  const categoriesQuery = useCategories()
  const nextNumber = useNextSaleNumber()
  const register = useActiveRegister()
  const settings = useStoreSettings()
  const { profile } = useAuth()
  const createSale = useCreateSale()
  const cart = useCart()
  const [lastReceipt, setLastReceipt] = useState<ReceiptData | null>(null)
  /** Temporary number of a sale saved offline. */
  const [saleLabel, setSaleLabel] = useState<string | null>(null)
  const [printStatus, setPrintStatus] = useState<PrintStatus>({ state: 'idle' })

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<number | 'all'>('all')
  const [gridLimit, setGridLimit] = useState(GRID_STEP)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const [focusId, setFocusId] = useState<number | null>(null)
  const [payment, setPayment] = useState<PaymentState>({ method: 'cash', paidText: '' })
  const [payOpen, setPayOpen] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [sale, setSale] = useState<Sale | null>(null)
  const [heldOpen, setHeldOpen] = useState(false)

  const searchRef = useRef<HTMLInputElement>(null)
  const paidRef = useRef<HTMLInputElement>(null)

  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data])
  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const byBarcode = useMemo(() => new Map(products.filter((p) => p.barcode).map((p) => [p.barcode!, p])), [products])
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const categoryNames = useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories])
  const categoryName = useCallback((id: number | null) => (id === null ? '' : (categoryNames.get(id) ?? '')), [categoryNames])

  const totals = useMemo(() => computeTotals(cart.lines, productMap), [cart.lines, productMap])
  const canPay = totals.items.length > 0 && !totals.hasUnavailable && totals.total > 0

  const results = useMemo(() => {
    const q = normalizeText(search)
    return products.filter(
      (p) =>
        (category === 'all' || p.category_id === category) &&
        (!q || normalizeText(p.name).includes(q) || (p.barcode ?? '').startsWith(q)),
    )
  }, [products, search, category])

  // Notices fade after a few seconds.
  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 3500)
    return () => window.clearTimeout(t)
  }, [notice])

  useEffect(() => setGridLimit(GRID_STEP), [search, category])

  const focusSearch = useCallback(() => searchRef.current?.focus(), [])

  const addProduct = useCallback(
    (p: PosProduct, opts: { fromScan?: boolean } = {}) => {
      cart.add(p.id, 1)
      setPayError(null)
      if (opts.fromScan) beep('ok')
      // Weighed products: jump to the quantity field so the cashier types the weight.
      if (allowsDecimals(p.unit)) setFocusId(p.id)
      else setFocusId(null)
    },
    [cart],
  )

  /** Barcode from the USB scanner (typed into search + Enter) or the camera. */
  const handleCode = useCallback(
    (code: string): boolean => {
      const p = byBarcode.get(code.trim())
      if (p) {
        addProduct(p, { fromScan: true })
        setNotice({ kind: 'ok', text: `U shtua: ${p.name}` })
        return true
      }
      beep('error')
      setNotice({ kind: 'error', text: `Barkodi ${code} nuk u gjet` })
      return false
    },
    [byBarcode, addProduct],
  )

  function onSearchEnter() {
    const q = search.trim()
    if (!q) return
    if (byBarcode.has(q)) {
      handleCode(q)
      setSearch('')
    } else if (results.length === 1) {
      addProduct(results[0])
      setSearch('')
    } else if (/^\d{6,}$/.test(q)) {
      handleCode(q) // looks like a barcode that is not in the catalogue
      setSearch('')
    }
  }

  const pay = useCallback(() => {
    if (!canPay || createSale.isPending) return
    const cash = cashInfo(totals.total, payment.paidText)
    if (payment.method === 'cash' && cash.missing > 0) {
      setPayError(`Mungojnë ${formatMoney(cash.missing)}`)
      return
    }
    setPayError(null)
    const expected = totals.total
    // Snapshot for the receipt: the cart is cleared as soon as the sale succeeds.
    const lines: ReceiptItem[] = totals.items.map((i) => ({
      name: i.product!.name,
      qty: i.qty,
      unitPrice: i.product!.sale_price,
      total: i.lineTotal,
      vatRate: i.product!.vat_rate,
    }))
    createSale.mutate(
      {
        items: totals.items.map((i) => ({ product_id: i.productId, quantity: i.qty })),
        payment: payment.method,
        paid: payment.method === 'cash' ? (cash.paid ?? expected) : null,
        registerId: register.id,
        cashierId: profile?.id ?? null,
        total: expected,
      },
      {
        onSuccess: (result) => {
          cart.clear()
          setPayment({ method: 'cash', paidText: '' })
          setPayOpen(false)
          if (result.kind === 'offline') {
            // Saved on this device; it gets a real receipt number when the connection returns.
            const p = result.pending
            const paid = p.paid ?? p.total
            const s: Sale = {
              id: 0,
              number: 0,
              register_id: p.registerId,
              cashier_id: profile?.id ?? null,
              payment_method: p.payment,
              total: p.total,
              total_vat: 0,
              paid,
              change: Math.max(0, Math.round((paid - p.total) * 100) / 100),
              created_at: p.createdAt,
            }
            setSale(s)
            setSaleLabel(p.label)
            void prepareReceipt(s, lines, false, p.label)
            return
          }
          const s = result.sale
          setSale(s)
          setSaleLabel(null)
          if (Math.abs(s.total - expected) > 0.001) {
            setNotice({ kind: 'warn', text: `Çmimet ishin përditësuar: totali i faturës është ${formatMoney(s.total)}` })
          }
          void prepareReceipt(s, lines, Math.abs(s.total - expected) > 0.001)
        },
        onError: (err) => setPayError(errorMessage(err)),
      },
    )
  }, [canPay, createSale, totals, payment, cart])

  async function runPrint(receipt: ReceiptData) {
    const store = settings.data ?? defaultSettings
    setPrintStatus({ state: 'printing' })
    try {
      await printReceipt(receipt, {
        copies: store.receipt_copies ?? 1,
        openDrawer: store.open_cash_drawer && receipt.payment === 'cash',
      })
      setPrintStatus({ state: 'done' })
    } catch (err) {
      setPrintStatus({ state: 'error', message: errorMessage(err) })
    }
  }

  /** Builds the receipt for a finished sale and prints it when auto-print is on. */
  async function prepareReceipt(s: Sale, lines: ReceiptItem[], pricesChanged: boolean, offlineLabel?: string) {
    let items = lines
    if (pricesChanged) {
      // The server used newer prices: take the lines it stored (managers can read them; cashiers keep the cart lines).
      const { data } = await supabase.from('sale_items').select('name, quantity, unit_price, line_total, vat_rate').eq('sale_id', s.id).order('id')
      if (data?.length) {
        items = data.map((r) => ({
          name: r.name as string,
          qty: Number(r.quantity),
          unitPrice: Number(r.unit_price),
          total: Number(r.line_total),
          vatRate: Number(r.vat_rate) as ReceiptItem['vatRate'],
        }))
      }
    }
    const receipt: ReceiptData = {
      store: settings.data ?? defaultSettings,
      number: s.number,
      numberLabel: offlineLabel,
      date: new Date(s.created_at),
      registerName: register.name,
      cashierName: profile?.full_name ?? '',
      items,
      total: s.total,
      payment: s.payment_method,
      paid: s.paid,
      change: s.change,
    }
    setLastReceipt(receipt)
    setPrintStatus({ state: 'idle' })
    // Auto-print through a paired Bluetooth printer, or through the browser where Bluetooth doesn't exist (iPhone).
    // A computer with no printer paired would otherwise pop the print dialog after every sale.
    const canAutoPrint = preferredPrintMethod() === 'bluetooth' || !bluetoothSupported
    if ((settings.data ?? defaultSettings).auto_print && canAutoPrint) await runPrint(receipt)
  }

  function startPay() {
    if (!canPay) return
    if (isWide()) pay()
    else setPayOpen(true)
  }

  function closeSale() {
    setSale(null)
    window.setTimeout(focusSearch, 0)
  }

  function clearCart() {
    if (cart.lines.length && window.confirm('Fshi të gjitha artikujt nga fatura?')) {
      cart.clear()
      setPayment({ method: 'cash', paidText: '' })
    }
  }

  // Keyboard: F2 search, F12 pay, and scanner input while focus is elsewhere.
  const startPayRef = useRef(startPay)
  startPayRef.current = startPay
  const dialogOpen = payOpen || sale !== null || heldOpen
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F2') {
        e.preventDefault()
        focusSearch()
      } else if (e.key === 'F12') {
        e.preventDefault()
        if (!dialogOpen) startPayRef.current()
      } else if (!dialogOpen && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault()
        setSearch((s) => s + e.key)
        focusSearch()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialogOpen, focusSearch])

  useEffect(() => {
    if (isWide()) focusSearch()
  }, [focusSearch])

  const receiptNo = nextNumber.data ? formatReceiptNo(nextNumber.data) : 'e re'
  const summary = `${totals.items.length} produkte · ${totals.articleCount} artikuj`
  const loading = productsQuery.isPending

  const holdButton = (compact: boolean) =>
    cart.lines.length ? (
      <Button variant="secondary" size={compact ? 'md' : 'sm'} className={cn(compact ? 'size-11 px-0' : 'min-h-btn flex-1')} onClick={cart.hold} aria-label="Ruaj në pritje" title="Ruaj në pritje">
        {compact ? <PauseCircle className="size-5" aria-hidden /> : 'Ruaj në pritje'}
      </Button>
    ) : (
      <Button
        variant="secondary"
        size={compact ? 'md' : 'sm'}
        className={cn(compact ? 'relative size-11 px-0' : 'min-h-btn flex-1')}
        disabled={!cart.held.length}
        onClick={() => setHeldOpen(true)}
        aria-label={`Në pritje (${cart.held.length})`}
        title="Faturat në pritje"
      >
        {compact ? <PauseCircle className="size-5" aria-hidden /> : `Në pritje (${cart.held.length})`}
        {compact && cart.held.length > 0 && (
          <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-brand-600 text-[11px] text-white">
            {cart.held.length}
          </span>
        )}
      </Button>
    )

  return (
    <div className="flex flex-col gap-4 lg:-my-2 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(360px,400px)] lg:items-start lg:gap-6">
      {/* ===== Left: header (phone), search, products ===== */}
      <section className="flex min-w-0 flex-col gap-4">
        <header className="flex items-start justify-between gap-3 lg:hidden">
          <div className="flex flex-col">
            <h1 className="text-2xl font-bold tracking-[-0.02em]">Fatura {receiptNo}</h1>
            <span className="text-sm text-muted">
              {register.name} · {totals.articleCount} artikuj
            </span>
          </div>
          <div className="flex gap-2">
            {holdButton(true)}
            <Button variant="secondary" className="size-11 px-0" aria-label="Fshi faturën" disabled={!cart.lines.length} onClick={clearCart}>
              <Trash2 className="size-5" aria-hidden />
            </Button>
          </div>
        </header>

        <div className="flex gap-2.5">
          <label className="flex min-h-[52px] flex-1 items-center gap-2.5 rounded-xl border-2 border-field bg-white px-3.5 focus-within:border-brand-600">
            <Search className="size-[18px] shrink-0 text-muted" aria-hidden />
            <span className="sr-only">Kërko produktin</span>
            <input
              id={SEARCH_ID}
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSearchEnter()
                if (e.key === 'Escape') setSearch('')
              }}
              placeholder="Skano barkodin ose shkruaj emrin e produktit…"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[#8A968F]"
            />
            <Kbd className="hidden border-field text-muted lg:inline">F2</Kbd>
          </label>
          <Button
            variant={scannerOpen ? 'primary' : 'secondary'}
            className="min-h-[52px] px-4 max-lg:bg-brand-600 max-lg:text-white max-lg:border-0"
            aria-pressed={scannerOpen}
            onClick={() => setScannerOpen((o) => !o)}
            icon={<ScanBarcode className="size-5" aria-hidden />}
          >
            <span className="hidden lg:inline">Kamera</span>
          </Button>
        </div>

        {notice && (
          <p
            role="status"
            className={cn(
              'rounded-[10px] px-3 py-2 text-sm font-medium',
              notice.kind === 'ok' && 'bg-brand-100 text-brand-600',
              notice.kind === 'error' && 'bg-warn-100 text-warn-700',
              notice.kind === 'warn' && 'bg-amber-100 text-amber-700',
            )}
          >
            {notice.text}
          </p>
        )}

        {scannerOpen && <CameraScanner onDetect={handleCode} />}

        {productsQuery.error ? (
          <Card className="text-sm text-warn-700">Produktet nuk u ngarkuan: {errorMessage(productsQuery.error)}</Card>
        ) : loading ? (
          <div className="flex justify-center py-16">
            <LoaderCircle className="size-7 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
          </div>
        ) : (
          <>
            {/* Desktop: category chips + product tiles */}
            <div className="hidden flex-wrap gap-2 lg:flex">
              {[{ id: 'all' as const, name: 'Të gjitha' }, ...categories].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  className={cn(
                    'min-h-10 rounded-full border px-3.5 text-[13px] font-medium',
                    category === c.id ? 'border-ink bg-ink text-white' : 'border-field bg-white text-ink hover:bg-[#F0F3F1]',
                  )}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="hidden flex-col gap-3 lg:flex">
              {results.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted">
                  {products.length ? 'Asnjë produkt nuk u gjet.' : 'Nuk ka produkte për arkë. Shtoji te Produktet.'}
                </p>
              ) : (
                <ProductGrid products={results.slice(0, gridLimit)} categoryName={categoryName} onAdd={(p) => addProduct(p)} />
              )}
              {results.length > gridLimit && (
                <Button variant="secondary" className="self-center" onClick={() => setGridLimit((l) => l + GRID_STEP)}>
                  Shfaq më shumë ({results.length - gridLimit})
                </Button>
              )}
            </div>

            {/* Phone/tablet: search results while typing, otherwise the cart */}
            <div className="flex flex-col gap-3 lg:hidden">
              {search.trim() ? (
                results.length ? (
                  <ProductResults
                    products={results.slice(0, 30)}
                    onAdd={(p) => {
                      addProduct(p)
                      setSearch('')
                    }}
                  />
                ) : (
                  <p className="py-6 text-center text-sm text-muted">Asnjë produkt nuk u gjet.</p>
                )
              ) : totals.items.length ? (
                <CartLines items={totals.items} onQty={cart.setQty} onRemove={cart.remove} focusId={focusId} size="lg" />
              ) : (
                <div className="flex flex-col items-center gap-2 py-12 text-center text-muted">
                  <Barcode className="size-10" aria-hidden />
                  <p className="text-sm">Skano ose kërko një produkt për të filluar.</p>
                </div>
              )}
            </div>
          </>
        )}

        {/* Phone/tablet bottom bar, pinned above the tab bar (phones) or the screen edge (tablets) */}
        <div className="h-40 lg:hidden" aria-hidden />
        <div className="fixed inset-x-0 bottom-[calc(63px+max(env(safe-area-inset-bottom),6px))] z-20 flex flex-col gap-3 border-t border-line bg-white px-4 pb-4 pt-3 md:bottom-0 md:left-[232px] lg:hidden">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">Totali (TVSH {formatMoney(totals.totalVat)} e përfshirë)</span>
            <span className="text-[32px] font-bold tabular-nums tracking-[-0.02em]">{formatMoney(totals.total)}</span>
          </div>
          <div className="flex gap-2.5">
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              disabled={!canPay}
              onClick={() => {
                setPayment({ method: 'card', paidText: '' })
                setPayError(null)
                setPayOpen(true)
              }}
            >
              Kartelë
            </Button>
            <Button
              size="lg"
              className="flex-[2]"
              disabled={!canPay}
              onClick={() => {
                setPayment({ method: 'cash', paidText: '' })
                setPayError(null)
                setPayOpen(true)
              }}
            >
              Paguaj kesh
            </Button>
          </div>
        </div>
      </section>

      {/* ===== Right: cart panel (desktop) ===== */}
      <aside className="sticky top-6 hidden max-h-[calc(100vh-48px)] flex-col overflow-hidden rounded-card border border-line bg-white lg:flex">
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex flex-col">
            <h2 className="text-lg font-bold">Fatura {receiptNo}</h2>
            <span className="text-[13px] text-muted">{summary}</span>
          </div>
          <Button variant="secondary" className="size-11 px-0" aria-label="Fshi faturën" disabled={!cart.lines.length} onClick={clearCart}>
            <Trash2 className="size-[18px]" aria-hidden />
          </Button>
        </div>

        <div className="min-h-[120px] flex-1 overflow-y-auto px-5">
          {totals.items.length ? (
            <CartLines items={totals.items} onQty={cart.setQty} onRemove={cart.remove} focusId={focusId} size="sm" />
          ) : (
            <p className="py-10 text-center text-sm text-muted">Fatura është bosh.</p>
          )}
        </div>

        <div className="border-t border-line bg-[#F7F9F7] px-5 py-4">
          <CartTotalsBox totals={totals} />
        </div>

        <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
          <PaymentPanel
            total={totals.total}
            state={payment}
            onState={(s) => {
              setPayment(s)
              setPayError(null)
            }}
            onPay={pay}
            canPay={canPay}
            pending={createSale.isPending}
            paidRef={paidRef}
          />
          {payError && <p className="rounded-[10px] bg-warn-100 px-3 py-2 text-sm font-medium text-warn-700">{payError}</p>}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" className="min-h-btn flex-1" disabled title="Vjen në një fazë të mëvonshme">
              Zbritje
            </Button>
            {holdButton(false)}
            <Button variant="secondary" size="sm" className="min-h-btn flex-1" disabled title="Vjen në një fazë të mëvonshme">
              Kthim
            </Button>
          </div>
        </div>
      </aside>

      <PaymentDialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        total={totals.total}
        state={payment}
        onState={(s) => {
          setPayment(s)
          setPayError(null)
        }}
        onPay={pay}
        pending={createSale.isPending}
        error={payError}
      />

      <SaleDoneDialog
        sale={sale}
        offlineLabel={saleLabel}
        onClose={closeSale}
        printStatus={printStatus}
        onPrint={lastReceipt ? () => void runPrint({ ...lastReceipt, reprint: printStatus.state === 'done' }) : undefined}
      />

      <HeldCartsDialog
        open={heldOpen}
        onClose={() => setHeldOpen(false)}
        held={cart.held}
        productMap={productMap}
        onRestore={(id) => {
          cart.restore(id)
          setHeldOpen(false)
        }}
        onDiscard={cart.discardHeld}
      />
    </div>
  )
}

function HeldCartsDialog({
  open,
  onClose,
  held,
  productMap,
  onRestore,
  onDiscard,
}: {
  open: boolean
  onClose: () => void
  held: HeldCart[]
  productMap: Map<number, PosProduct>
  onRestore: (id: string) => void
  onDiscard: (id: string) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Faturat në pritje" size="sm">
      {held.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nuk ka fatura në pritje.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[#EEF1EE]">
          {held.map((h) => {
            const t = computeTotals(h.lines, productMap)
            return (
              <li key={h.id} className="flex items-center gap-3 py-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold tabular-nums">{formatMoney(t.total)}</span>
                  <span className="truncate text-xs text-muted">
                    {formatTime(h.savedAt)} · {t.items.length} produkte
                    {t.hasUnavailable && ' · '}
                    {t.hasUnavailable && <Badge tone="low">ka produkte të hequra</Badge>}
                  </span>
                </div>
                <Button variant="ghost" size="sm" aria-label="Fshi" onClick={() => onDiscard(h.id)}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
                <Button size="sm" onClick={() => onRestore(h.id)}>
                  Rikthe
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </Dialog>
  )
}
