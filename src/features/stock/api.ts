import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { productKeys } from '@/features/products/api'
import { posKeys } from '@/features/pos/api'
import type { MovementType, StockEntry, StockEntryItem, StockMovement, Supplier, VatRate } from '@/types/database'

export const stockKeys = {
  suppliers: ['suppliers'] as const,
  entries: ['stock-entries'] as const,
  entry: (id: number) => ['stock-entries', id] as const,
  movements: ['stock-movements'] as const,
  profiles: ['profiles', 'names'] as const,
}

const num = (v: unknown) => Number(v ?? 0)

/** Everything that shows stock or cost must refresh after a stock change. */
function invalidateStock(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: productKeys.all })
  void qc.invalidateQueries({ queryKey: posKeys.products })
  void qc.invalidateQueries({ queryKey: stockKeys.movements })
  void qc.invalidateQueries({ queryKey: stockKeys.entries })
}

// ---------- Suppliers ----------

export function useSuppliers() {
  return useQuery({
    queryKey: stockKeys.suppliers,
    queryFn: async (): Promise<Supplier[]> => {
      const { data, error } = await supabase.from('suppliers').select('id, name, nui, phone, payment_days').order('name')
      if (error) throw error
      return data
    },
  })
}

export type SupplierInput = Omit<Supplier, 'id'>

export function useSaveSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, input }: { id?: number; input: SupplierInput }) => {
      const { error } = id
        ? await supabase.from('suppliers').update(input).eq('id', id)
        : await supabase.from('suppliers').insert(input)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: stockKeys.suppliers }),
  })
}

export function useDeleteSupplier() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('suppliers').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: stockKeys.suppliers }),
  })
}

// ---------- Entries ----------

export interface EntryListRow extends StockEntry {
  supplier_name: string | null
  item_count: number
}

export function useEntries() {
  return useQuery({
    queryKey: stockKeys.entries,
    queryFn: async (): Promise<EntryListRow[]> => {
      const { data, error } = await supabase
        .from('stock_entries')
        .select(
          'id, supplier_id, invoice_no, entry_date, payment_terms, note, status, total_net, total_vat, total, created_at, confirmed_at, suppliers(name), stock_entry_items(count)',
        )
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return data.map((r) => {
        const row = r as unknown as StockEntry & {
          suppliers: { name: string } | null
          stock_entry_items: { count: number }[]
        }
        return {
          ...row,
          total_net: num(row.total_net),
          total_vat: num(row.total_vat),
          total: num(row.total),
          supplier_name: row.suppliers?.name ?? null,
          item_count: row.stock_entry_items[0]?.count ?? 0,
        }
      })
    },
  })
}

export async function fetchEntryItems(entryId: number): Promise<StockEntryItem[]> {
  const { data, error } = await supabase
    .from('stock_entry_items')
    .select('id, entry_id, product_id, quantity, unit_cost, vat_rate')
    .eq('entry_id', entryId)
    .order('id')
  if (error) throw error
  return data.map((r) => ({ ...r, quantity: num(r.quantity), unit_cost: num(r.unit_cost), vat_rate: num(r.vat_rate) as VatRate }))
}

export function useEntryItems(entryId: number | null) {
  return useQuery({
    queryKey: stockKeys.entry(entryId ?? 0),
    queryFn: () => fetchEntryItems(entryId!),
    enabled: entryId !== null,
  })
}

export interface EntryHeader {
  supplier_id: number | null
  invoice_no: string | null
  entry_date: string
  payment_terms: string | null
  note: string | null
}

export interface EntryItemInput {
  product_id: number
  quantity: number
  unit_cost: number
  vat_rate: VatRate
}

/** Creates or updates a draft and replaces its items. Returns the entry id. */
async function saveDraft(id: number | undefined, header: EntryHeader, items: EntryItemInput[]): Promise<number> {
  let entryId = id
  if (entryId) {
    const { error } = await supabase.from('stock_entries').update(header).eq('id', entryId)
    if (error) throw error
    const { error: delError } = await supabase.from('stock_entry_items').delete().eq('entry_id', entryId)
    if (delError) throw delError
  } else {
    const { data, error } = await supabase.from('stock_entries').insert(header).select('id').single()
    if (error) throw error
    entryId = data.id as number
  }
  if (items.length) {
    const { error } = await supabase.from('stock_entry_items').insert(items.map((i) => ({ ...i, entry_id: entryId })))
    if (error) throw error
  }
  return entryId!
}

export function useSaveEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      header,
      items,
      confirm,
    }: {
      id?: number
      header: EntryHeader
      items: EntryItemInput[]
      confirm: boolean
    }): Promise<number> => {
      const entryId = await saveDraft(id, header, items)
      if (confirm) {
        const { error } = await supabase.rpc('confirm_stock_entry', { p_entry_id: entryId })
        if (error) throw Object.assign(error, { entryId })
      }
      return entryId
    },
    onSettled: () => invalidateStock(qc),
  })
}

export function useDeleteDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('stock_entries').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: stockKeys.entries }),
  })
}

// ---------- Movements ----------

export interface MovementFilters {
  type: MovementType | 'all'
  productId: number | null
  page: number
  pageSize: number
}

export function useMovements(f: MovementFilters) {
  return useQuery({
    queryKey: [...stockKeys.movements, f],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<{ rows: StockMovement[]; total: number }> => {
      let q = supabase
        .from('stock_movements')
        .select('id, product_id, type, quantity, ref_id, note, created_by, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1)
      if (f.type !== 'all') q = q.eq('type', f.type)
      if (f.productId !== null) q = q.eq('product_id', f.productId)
      const { data, error, count } = await q
      if (error) throw error
      return { rows: data.map((m) => ({ ...m, quantity: num(m.quantity) })), total: count ?? 0 }
    },
  })
}

/** Latest non-sale movements for the "Lëvizjet e fundit" card. */
export function useRecentMovements(limit = 40) {
  return useQuery({
    queryKey: [...stockKeys.movements, 'recent', limit],
    queryFn: async (): Promise<StockMovement[]> => {
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id, product_id, type, quantity, ref_id, note, created_by, created_at')
        .neq('type', 'sale')
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) throw error
      return data.map((m) => ({ ...m, quantity: num(m.quantity) }))
    },
  })
}

export function useProfileNames() {
  return useQuery({
    queryKey: stockKeys.profiles,
    queryFn: async (): Promise<Map<string, string>> => {
      const { data, error } = await supabase.from('profiles').select('id, full_name')
      if (error) throw error
      return new Map(data.map((p) => [p.id as string, p.full_name as string]))
    },
    staleTime: 5 * 60_000,
  })
}

// ---------- Adjustments (inventory count, write-off) ----------

export interface Adjustment {
  productId: number
  quantity: number
  type: Extract<MovementType, 'writeoff' | 'inventory' | 'return'>
  note: string | null
}

/** Applies adjustments one by one through adjust_stock; returns how many failed. */
export function useAdjustStock() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (items: Adjustment[]): Promise<{ ok: number; failed: { productId: number; message: string }[] }> => {
      const failed: { productId: number; message: string }[] = []
      let ok = 0
      for (const a of items) {
        const { error } = await supabase.rpc('adjust_stock', {
          p_product_id: a.productId,
          p_quantity: a.quantity,
          p_type: a.type,
          p_note: a.note,
        })
        if (error) failed.push({ productId: a.productId, message: error.message })
        else ok++
      }
      return { ok, failed }
    },
    onSettled: () => invalidateStock(qc),
  })
}
