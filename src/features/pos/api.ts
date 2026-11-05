import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PosProduct } from '@/types/database'
import { productKeys } from '@/features/products/api'
import { cached } from '@/lib/offlineCache'
import { submitSale, type SaleRequest, type SaleResult } from './offlineSales'

export const posKeys = {
  products: ['pos-products'] as const,
  nextNumber: ['sales', 'next-number'] as const,
}

const PAGE = 1000

async function fetchPosProducts(): Promise<PosProduct[]> {
  const all: PosProduct[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('pos_products')
      .select('*') // the view exposes only what the register may see; kind/duration_min after migration 08
      .order('name')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(
      ...data.map((r) => ({
        ...r,
        sale_price: Number(r.sale_price),
        vat_rate: Number(r.vat_rate) as PosProduct['vat_rate'],
        stock: Number(r.stock),
        min_stock: Number(r.min_stock),
        kind: r.kind === 'service' ? 'service' : 'product',
        duration_min: r.duration_min == null ? null : Number(r.duration_min),
      })),
    )
    if (data.length < PAGE) return all
  }
}

export function usePosProducts() {
  return useQuery({
    queryKey: posKeys.products,
    // The last copy is kept on the device so the register opens and sells without internet.
    ...cached('pos-products', fetchPosProducts),
    // Prices and stock change from other devices; keep the register reasonably fresh.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })
}

/** Next receipt number as a hint for the header; the real one comes back from create_sale. */
export function useNextSaleNumber() {
  return useQuery({
    queryKey: posKeys.nextNumber,
    queryFn: async () => {
      const { data, error } = await supabase.from('sales').select('number').order('number', { ascending: false }).limit(1)
      if (error) throw error
      return (data[0]?.number ?? 0) + 1
    },
  })
}

export interface CreateSaleArgs extends SaleRequest {
  /** Total shown at the till; kept for sales queued offline. */
  total: number
}

export function useCreateSale() {
  const qc = useQueryClient()
  return useMutation({
    // Must run while offline too: submitSale queues the sale instead of failing.
    networkMode: 'always',
    mutationFn: ({ total, ...req }: CreateSaleArgs): Promise<SaleResult> => submitSale(req, total),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: posKeys.products })
      void qc.invalidateQueries({ queryKey: posKeys.nextNumber })
      void qc.invalidateQueries({ queryKey: productKeys.all })
    },
  })
}
