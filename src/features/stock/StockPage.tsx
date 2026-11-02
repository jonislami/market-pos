import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button, Card, Tabs } from '@/components/ui'
import { useCategories, useProducts } from '@/features/products/api'
import { errorMessage } from '@/lib/errors'
import { formatMoney } from '@/lib/money'
import { useEntries, useRecentMovements, useSuppliers } from './api'
import { EntriesHistory } from './EntriesHistory'
import { EntryForm, useEntryForm } from './EntryForm'
import { exportStockReport, stockValue } from './exportStock'
import { InventoryTab } from './InventoryTab'
import { MovementsTab } from './MovementsTab'
import { LowStockCard, lowStockProducts, RecentMovementsCard, suggestedQty } from './SideCards'
import { SuppliersTab } from './SuppliersTab'

type StockTab = 'entry' | 'history' | 'movements' | 'inventory' | 'suppliers'

const tabs: { value: StockTab; label: string }[] = [
  { value: 'entry', label: 'Hyrje e re' },
  { value: 'history', label: 'Historiku i hyrjeve' },
  { value: 'movements', label: 'Lëvizjet e stokut' },
  { value: 'inventory', label: 'Inventarizimi' },
  { value: 'suppliers', label: 'Furnitorët' },
]

const isTab = (v: string | null): v is StockTab => tabs.some((t) => t.value === v)

export function StockPage() {
  const [params, setParams] = useSearchParams()
  const tab: StockTab = isTab(params.get('tab')) ? (params.get('tab') as StockTab) : 'entry'
  const setTab = (t: StockTab) => setParams(t === 'entry' ? {} : { tab: t }, { replace: true })

  const products = useProducts()
  const categories = useCategories()
  const suppliers = useSuppliers()
  const entries = useEntries()
  const recent = useRecentMovements()
  const entryForm = useEntryForm()
  const [notice, setNotice] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(t)
  }, [notice])

  const allProducts = useMemo(() => products.data ?? [], [products.data])
  const low = useMemo(() => lowStockProducts(allProducts), [allProducts])
  const value = useMemo(() => stockValue(allProducts), [allProducts])

  async function onExport() {
    setExporting(true)
    try {
      await exportStockReport(allProducts, categories.data ?? [])
    } catch (err) {
      setNotice(`Eksporti dështoi: ${errorMessage(err)}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Stoku & Hyrjet"
        subtitle={
          products.isPending ? (
            ' '
          ) : (
            <>
              Vlera e stokut: <strong className="font-bold text-ink tabular-nums">{formatMoney(value)}</strong> (me çmim blerjeje)
            </>
          )
        }
        actions={
          <Button variant="secondary" className="hidden md:inline-flex" loading={exporting} disabled={!allProducts.length} onClick={() => void onExport()}>
            Eksporto raportin
          </Button>
        }
      />

      <Tabs items={tabs} value={tab} onChange={setTab} label="Seksionet e stokut" />

      {notice && (
        <p role="status" className="rounded-[10px] bg-brand-100 px-3 py-2.5 text-sm font-medium text-brand-600">
          {notice}
        </p>
      )}

      {products.error ? (
        <Card className="text-sm text-warn-700">Produktet nuk u ngarkuan: {errorMessage(products.error)}</Card>
      ) : products.isPending ? (
        <div className="flex justify-center py-16">
          <LoaderCircle className="size-7 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
        </div>
      ) : tab === 'entry' ? (
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1">
            <EntryForm api={entryForm} products={allProducts} suppliers={suppliers.data ?? []} onSaved={setNotice} />
          </div>
          <div className="flex flex-col gap-5 xl:w-[320px] xl:shrink-0">
            <LowStockCard
              products={low}
              onAddAll={(items) => {
                entryForm.addProducts(items.map((p) => ({ product: p, qty: suggestedQty(p) })))
                setNotice(`U shtuan në hyrje produktet nën minimum (sasi e sugjeruar: deri në 2× minimumin).`)
              }}
            />
            <RecentMovementsCard
              movements={recent.data ?? []}
              products={allProducts}
              entries={entries.data ?? []}
              onShowAll={() => setTab('movements')}
            />
          </div>
        </div>
      ) : tab === 'history' ? (
        <EntriesHistory products={allProducts} form={entryForm} onOpenDraft={() => setTab('entry')} />
      ) : tab === 'movements' ? (
        <MovementsTab products={allProducts} />
      ) : tab === 'inventory' ? (
        <InventoryTab products={allProducts} categories={categories.data ?? []} onDone={setNotice} />
      ) : (
        <SuppliersTab />
      )}
    </>
  )
}
