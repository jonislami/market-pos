import { useEffect, useMemo, useState } from 'react'
import { ListFilter, LoaderCircle, Plus, Search } from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button, Card, Dialog, Input, Pagination, Select } from '@/components/ui'
import { cn } from '@/lib/cn'
import { errorMessage } from '@/lib/errors'
import type { Product, VatRate } from '@/types/database'
import { useCategories, useProducts } from './api'
import { CategoryChips, CategoryList, type CategoryCounts } from './CategoryList'
import {
  defaultFilters,
  filterProducts,
  hasActiveFilters,
  STOCK_FILTER_OPTIONS,
  VAT_FILTER_OPTIONS,
  type ProductFilters,
  type StockFilter,
} from './filters'
import { ImportDialog } from './ImportDialog'
import { ProductForm } from './ProductForm'
import { ProductCards, ProductTable } from './ProductList'

const PAGE_SIZE = 25

type Editing = Product | 'new' | null

function FilterSelects({ filters, onChange }: { filters: ProductFilters; onChange: (f: Partial<ProductFilters>) => void }) {
  return (
    <>
      <Select
        label="Stoku"
        value={filters.stock}
        onChange={(e) => onChange({ stock: e.target.value as StockFilter })}
        options={STOCK_FILTER_OPTIONS}
      />
      <Select
        label="TVSH"
        value={String(filters.vat)}
        onChange={(e) => onChange({ vat: e.target.value === 'all' ? 'all' : (Number(e.target.value) as VatRate) })}
        options={VAT_FILTER_OPTIONS}
      />
    </>
  )
}

export function ProductsPage() {
  const products = useProducts()
  const categories = useCategories()
  const [filters, setFilters] = useState<ProductFilters>(defaultFilters)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Editing>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const allProducts = useMemo(() => products.data ?? [], [products.data])
  const allCategories = useMemo(() => categories.data ?? [], [categories.data])

  const updateFilters = (patch: Partial<ProductFilters>) => {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  const filtered = useMemo(() => filterProducts(allProducts, filters), [allProducts, filters])
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Keep the page in range after a save or import shrinks the list.
  useEffect(() => {
    const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
    if (page > pages) setPage(pages)
  }, [filtered.length, page])

  const counts: CategoryCounts = useMemo(() => {
    const byId = new Map<number, number>()
    let none = 0
    let all = 0
    for (const p of allProducts) {
      if (!p.active) continue
      all++
      if (p.category_id === null) none++
      else byId.set(p.category_id, (byId.get(p.category_id) ?? 0) + 1)
    }
    return { all, none, byId }
  }, [allProducts])

  const categoryNames = useMemo(() => new Map(allCategories.map((c) => [c.id, c.name])), [allCategories])
  const categoryName = (id: number | null) => (id === null ? '—' : (categoryNames.get(id) ?? '—'))

  /** A barcode scanner types the code and presses Enter: jump straight to that product. */
  function onSearchEnter() {
    const code = filters.search.trim()
    const match = code && allProducts.find((p) => p.barcode === code)
    if (match) setEditing(match)
  }

  const loading = products.isPending || categories.isPending
  const loadError = products.error ?? categories.error
  const selectedId = editing && editing !== 'new' ? editing.id : null
  const formOpen = editing !== null

  return (
    <>
      <PageHeader
        title="Produktet"
        subtitle={
          loading ? ' ' : `${counts.all} produkte në ${allCategories.length} kategori`
        }
        actions={
          <>
            <Button variant="secondary" className="hidden md:inline-flex" onClick={() => setImportOpen(true)}>
              Importo nga Excel
            </Button>
            <Button
              className="hidden md:inline-flex"
              icon={<Plus className="size-4" strokeWidth={2.2} aria-hidden />}
              onClick={() => setEditing('new')}
            >
              Produkt i ri
            </Button>
            <button
              type="button"
              aria-label="Filtrat"
              onClick={() => setFiltersOpen(true)}
              className={cn(
                'relative flex size-11 items-center justify-center rounded-xl border border-line bg-white md:hidden',
                hasActiveFilters(filters) && 'border-brand-600 text-brand-600',
              )}
            >
              <ListFilter className="size-5" aria-hidden />
              {hasActiveFilters(filters) && <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-brand-600" />}
            </button>
          </>
        }
      />

      {loadError ? (
        <Card className="text-sm text-warn-700">Produktet nuk u ngarkuan: {errorMessage(loadError)}</Card>
      ) : (
        <div className="flex items-start gap-5">
          <CategoryList
            categories={allCategories}
            counts={counts}
            value={filters.category}
            onChange={(category) => updateFilters({ category })}
          />

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            {/* Phone: search + chips above the cards */}
            <div className="flex flex-col gap-3 md:hidden">
              <Input
                size="lg"
                type="search"
                placeholder="Emri ose barkodi"
                leftIcon={<Search className="size-5" aria-hidden />}
                value={filters.search}
                onChange={(e) => updateFilters({ search: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && onSearchEnter()}
              />
            </div>
            <CategoryChips
              categories={allCategories}
              counts={counts}
              value={filters.category}
              onChange={(category) => updateFilters({ category })}
            />

            <section aria-label="Lista e produkteve" className="flex flex-col md:overflow-hidden md:rounded-card md:border md:border-line md:bg-white">
              <div className="hidden flex-wrap items-end gap-2.5 border-b border-[#EEF1EE] p-4 md:flex">
                <Input
                  type="search"
                  aria-label="Kërko produktet"
                  placeholder="Kërko sipas emrit ose barkodit"
                  leftIcon={<Search className="size-[18px]" aria-hidden />}
                  value={filters.search}
                  onChange={(e) => updateFilters({ search: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && onSearchEnter()}
                  wrapperClassName="flex-[1_1_260px]"
                />
                <div className="flex gap-2.5">
                  <FilterSelects filters={filters} onChange={updateFilters} />
                </div>
              </div>

              {loading ? (
                <div className="flex justify-center py-16">
                  <LoaderCircle className="size-7 animate-spin text-brand-600" aria-label="Duke u ngarkuar" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-card bg-white px-4 py-14 text-center md:rounded-none">
                  <p className="text-sm text-muted">
                    {allProducts.length === 0 ? 'Ende nuk ka produkte.' : 'Asnjë produkt nuk përputhet me filtrat.'}
                  </p>
                  {allProducts.length === 0 && (
                    <div className="flex flex-wrap justify-center gap-2.5">
                      <Button variant="secondary" onClick={() => setImportOpen(true)}>
                        Importo nga Excel
                      </Button>
                      <Button onClick={() => setEditing('new')}>Shto produktin e parë</Button>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <ProductTable products={pageItems} categoryName={categoryName} selectedId={selectedId} onSelect={setEditing} />
                  <ProductCards products={pageItems} categoryName={categoryName} selectedId={selectedId} onSelect={setEditing} />
                  <Pagination
                    page={page}
                    pageSize={PAGE_SIZE}
                    total={filtered.length}
                    onChange={(p) => {
                      setPage(p)
                      window.scrollTo({ top: 0 })
                    }}
                    className="py-3.5 md:px-4"
                  />
                </>
              )}
            </section>
          </div>

          {formOpen && (
            // Below lg the form takes the whole screen; on wide screens it is a side panel.
            <div className="fixed inset-0 z-40 overflow-y-auto bg-bg p-4 pb-8 lg:sticky lg:top-8 lg:z-auto lg:w-[340px] lg:shrink-0 lg:overflow-visible lg:bg-transparent lg:p-0">
              <Card className="mx-auto max-w-lg lg:max-w-none">
                <ProductForm
                  key={editing === 'new' ? 'new' : editing.id}
                  product={editing === 'new' ? null : editing}
                  categories={allCategories}
                  allProducts={allProducts}
                  defaultCategoryId={typeof filters.category === 'number' ? filters.category : null}
                  onClose={() => setEditing(null)}
                  onSaved={() => setEditing(null)}
                />
              </Card>
            </div>
          )}
        </div>
      )}

      {/* Phone: floating "new product" button above the tab bar */}
      {!formOpen && (
        <Button
          size="lg"
          className="fixed bottom-24 right-4 z-20 rounded-2xl shadow-[0_8px_24px_rgba(14,107,78,.35)] md:hidden"
          icon={<Plus className="size-5" strokeWidth={2.4} aria-hidden />}
          onClick={() => setEditing('new')}
        >
          Produkt i ri
        </Button>
      )}

      <Dialog
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filtrat"
        size="sm"
        footer={
          <>
            <Button variant="secondary" className="flex-1" onClick={() => updateFilters({ stock: 'all', vat: 'all' })}>
              Pastro
            </Button>
            <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
              Shfaq {filtered.length}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <FilterSelects filters={filters} onChange={updateFilters} />
          <Button variant="secondary" onClick={() => { setFiltersOpen(false); setImportOpen(true) }}>
            Importo nga Excel
          </Button>
        </div>
      </Dialog>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} products={allProducts} categories={allCategories} />
    </>
  )
}
