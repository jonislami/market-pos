import { normalizeText } from '@/lib/text'
import { stockStatus } from '@/lib/stock'
import type { Product, VatRate } from '@/types/database'

/** 'all', 'none' (uncategorised) or a category id. */
export type CategoryFilter = 'all' | 'none' | number
export type StockFilter = 'all' | 'low' | 'out' | 'inactive'
export type VatFilter = 'all' | VatRate

export interface ProductFilters {
  search: string
  category: CategoryFilter
  stock: StockFilter
  vat: VatFilter
}

export const defaultFilters: ProductFilters = { search: '', category: 'all', stock: 'all', vat: 'all' }

export const STOCK_FILTER_OPTIONS: { value: StockFilter; label: string }[] = [
  { value: 'all', label: 'Të gjitha' },
  { value: 'low', label: 'Stok i ulët' },
  { value: 'out', label: 'Pa stok' },
  { value: 'inactive', label: 'Joaktive' },
]

export const VAT_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Të gjitha' },
  { value: '8', label: '8%' },
  { value: '18', label: '18%' },
  { value: '0', label: '0%' },
]

export function filterProducts(products: Product[], f: ProductFilters): Product[] {
  const q = normalizeText(f.search)
  return products.filter((p) => {
    // Inactive products are hidden unless explicitly asked for.
    if (f.stock === 'inactive' ? p.active : !p.active) return false
    if (f.category === 'none' ? p.category_id !== null : f.category !== 'all' && p.category_id !== f.category) return false
    if (f.vat !== 'all' && p.vat_rate !== f.vat) return false
    // Services have no stock, so they never count as low or out of stock.
    if ((f.stock === 'low' || f.stock === 'out') && p.kind === 'service') return false
    if (f.stock === 'low' && stockStatus(p.stock, p.min_stock) === 'ok') return false
    if (f.stock === 'out' && p.stock > 0) return false
    if (q && !normalizeText(p.name).includes(q) && !(p.barcode ?? '').includes(q)) return false
    return true
  })
}

export function hasActiveFilters(f: ProductFilters): boolean {
  return f.stock !== 'all' || f.vat !== 'all'
}
