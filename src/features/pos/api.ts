import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PaymentMethod, PosProduct, Sale } from '@/types/database'
import { productKeys } from '@/features/products/api'

export const posKeys = {
  products: ['pos-products'] as const,
  nextNumber: ['sales', 'next-number'] as const,
  register: (id: number) => ['registers', id] as const,
}

/** Until Phase 6 adds register selection, every device sells on register 1. */
export const REGISTER_ID = 1

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
    queryFn: fetchPosProducts,
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
    queryFn: async () => {
      const { data, error } = await supabase.from('registers').select('name').eq('id', id).maybeSingle()
      if (error) throw error
      return data?.name ?? `Arka ${id}`
    },
    staleTime: Infinity,
  })
}

export interface CreateSaleArgs {
  items: { product_id: number; quantity: number }[]
  payment: PaymentMethod
  paid: number | null
}

export function useCreateSale() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ items, payment, paid }: CreateSaleArgs): Promise<Sale> => {
      const { data, error } = await supabase.rpc('create_sale', {
        p_items: items,
        p_payment: payment,
        p_paid: paid,
        p_register: REGISTER_ID,
      })
      if (error) throw error
      const s = data as Sale
      return { ...s, total: Number(s.total), total_vat: Number(s.total_vat), paid: Number(s.paid), change: Number(s.change) }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: posKeys.products })
      void qc.invalidateQueries({ queryKey: posKeys.nextNumber })
      void qc.invalidateQueries({ queryKey: productKeys.all })
    },
  })
}
