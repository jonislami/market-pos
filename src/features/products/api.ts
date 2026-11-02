import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cached } from '@/lib/offlineCache'
import { supabase } from '@/lib/supabase'
import type { Category, Product, ProductInput } from '@/types/database'

export const PRODUCT_COLUMNS =
  'id, barcode, name, category_id, unit, cost_price, sale_price, vat_rate, stock, min_stock, show_in_pos, active'

export const productKeys = {
  all: ['products'] as const,
  categories: ['categories'] as const,
}

const PAGE = 1000 // PostgREST's default max rows per request

function toProduct(row: Record<string, unknown>): Product {
  return {
    ...(row as unknown as Product),
    // numeric columns can arrive as strings depending on PostgREST settings
    cost_price: Number(row.cost_price),
    sale_price: Number(row.sale_price),
    vat_rate: Number(row.vat_rate) as Product['vat_rate'],
    stock: Number(row.stock),
    min_stock: Number(row.min_stock),
  }
}

/**
 * Loads the whole catalogue (a market has a few thousand products at most), so search and
 * filters such as "stock <= min_stock" run instantly on the client.
 */
async function fetchAllProducts(): Promise<Product[]> {
  const all: Product[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('products')
      .select(PRODUCT_COLUMNS)
      .order('name')
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...data.map(toProduct))
    if (data.length < PAGE) return all
  }
}

export function useProducts(enabled = true) {
  return useQuery({ queryKey: productKeys.all, queryFn: fetchAllProducts, enabled })
}

export function useCategories() {
  return useQuery({
    queryKey: productKeys.categories,
    // Cached on the device: the register uses categories offline.
    ...cached('categories', async (): Promise<Category[]> => {
      const { data, error } = await supabase.from('categories').select('id, name, sort_order').order('sort_order').order('name')
      if (error) throw error
      return data
    }),
  })
}

export function useSaveProduct() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: ProductInput }): Promise<Product> => {
      const query = id
        ? supabase.from('products').update({ ...input, updated_at: new Date().toISOString() }).eq('id', id)
        : supabase.from('products').insert(input)
      const { data, error } = await query.select(PRODUCT_COLUMNS).single()
      if (error) throw error
      return toProduct(data)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.all }),
  })
}

export function useCreateCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (name: string): Promise<Category> => {
      const { data, error } = await supabase.from('categories').insert({ name }).select('id, name, sort_order').single()
      if (error) throw error
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.categories }),
  })
}

export function useRenameCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name }: { id: number; name: string }) => {
      const { error } = await supabase.from('categories').update({ name }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: productKeys.categories }),
  })
}

export function useDeleteCategory() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      // products.category_id is "on delete set null", so products stay, just uncategorised.
      const { error } = await supabase.from('categories').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: productKeys.categories })
      void qc.invalidateQueries({ queryKey: productKeys.all })
    },
  })
}
