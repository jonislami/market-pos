import { useMemo } from 'react'
import { useProducts } from '@/features/products/api'
import { lowStockProducts } from './SideCards'

/** Number of active products at or below their minimum (managers only; cashiers can't read products). */
export function useLowStockCount(enabled: boolean): number {
  const products = useProducts(enabled)
  return useMemo(() => (products.data ? lowStockProducts(products.data).length : 0), [products.data])
}
