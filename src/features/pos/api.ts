import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PaymentMethod, PosProduct } from '@/types/database'
import { productKeys } from '@/features/products/api'
import { cached } from '@/lib/offlineCache'
import { getDeviceSettings } from '@/lib/printer/deviceSettings'
import { submitSale, type SaleResult } from './offlineSales'

export const posKeys = {
  products: ['pos-products'] as const,
  nextNumber: ['sales', 'next-number'] as const,
  register: (id: number) => ['registers', id] as const,
}

const PAGE = 1000

async function fetchPosProducts(): Promise<PosProduct[]> {
  const all: PosProduct[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('pos_products')
      .select('id, barcode, name, category_id, unit, sale_price, vat_rate, stock, min_stock')
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

export function useRegisterName(id: number) {
  return useQuery({
    queryKey: posKeys.register(id),
    ...cached(`register-name-${id}`, async () => {
      const { data, error } = await supabase.from('registers').select('name').eq('id', id).maybeSingle()
      if (error) throw error
      return (data?.name as string | undefined) ?? `Arka ${id}`
    }),
    staleTime: Infinity,
  })
}

export interface CreateSaleArgs {
  items: { product_id: number; quantity: number }[]
  payment: PaymentMethod
  paid: number | null
  /** Total shown at the till; kept for sales queued offline. */
  total: number
}

export function useCreateSale() {
  const qc = useQueryClient()
  return useMutation({
    // Must run while offline too: submitSale queues the sale instead of failing.
    networkMode: 'always',
    mutationFn: ({ items, payment, paid, total }: CreateSaleArgs): Promise<SaleResult> =>
      // Each device sells on the register chosen in Cilësimet → Arkat.
      submitSale({ items, payment, paid, registerId: getDeviceSettings().registerId }, total),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: posKeys.products })
      void qc.invalidateQueries({ queryKey: posKeys.nextNumber })
      void qc.invalidateQueries({ queryKey: productKeys.all })
    },
  })
}
