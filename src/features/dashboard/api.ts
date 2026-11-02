import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PaymentMethod, Unit } from '@/types/database'

export const reportKeys = {
  daily: (from: string, to: string) => ['reports', 'daily', from, to] as const,
  top: (from: string, to: string, limit: number, order: string) => ['reports', 'top', from, to, limit, order] as const,
  vat: (from: string, to: string) => ['reports', 'vat', from, to] as const,
  cashiers: (from: string, to: string) => ['reports', 'cashiers', from, to] as const,
  sales: (from: string, to: string, page: number) => ['reports', 'sales', from, to, page] as const,
  saleItems: (id: number) => ['reports', 'sale-items', id] as const,
}

const n = (v: unknown) => Number(v ?? 0)

/** Sales change constantly; refresh report data every minute while it is on screen. */
const LIVE = { refetchInterval: 60_000, refetchOnWindowFocus: true, placeholderData: keepPreviousData }

export interface DailyRow {
  day: string
  salesCount: number
  total: number
  totalVat: number
  cost: number
  cash: number
  card: number
}

export function useDailyReport(from: string, to: string) {
  return useQuery({
    queryKey: reportKeys.daily(from, to),
    ...LIVE,
    queryFn: async (): Promise<DailyRow[]> => {
      const { data, error } = await supabase.rpc('report_daily', { p_from: from, p_to: to })
      if (error) throw error
      return (data as Record<string, unknown>[]).map((r) => ({
        day: String(r.day),
        salesCount: n(r.sales_count),
        total: n(r.total),
        totalVat: n(r.total_vat),
        cost: n(r.cost),
        cash: n(r.cash),
        card: n(r.card),
      }))
    },
  })
}

export interface TopProduct {
  productId: number
  name: string
  unit: Unit | null
  quantity: number
  revenue: number
  cost: number
}

export function useTopProducts(from: string, to: string, limit = 5, order: 'qty' | 'revenue' = 'qty') {
  return useQuery({
    queryKey: reportKeys.top(from, to, limit, order),
    ...LIVE,
    queryFn: async (): Promise<TopProduct[]> => {
      const { data, error } = await supabase.rpc('report_top_products', { p_from: from, p_to: to, p_limit: limit, p_order: order })
      if (error) throw error
      return (data as Record<string, unknown>[]).map((r) => ({
        productId: n(r.product_id),
        name: String(r.name),
        unit: (r.unit as Unit | null) ?? null,
        quantity: n(r.quantity),
        revenue: n(r.revenue),
        cost: n(r.cost),
      }))
    },
  })
}

export interface VatRow {
  rate: number
  gross: number
  vat: number
}

export function useVatReport(from: string, to: string) {
  return useQuery({
    queryKey: reportKeys.vat(from, to),
    ...LIVE,
    queryFn: async (): Promise<VatRow[]> => {
      const { data, error } = await supabase.rpc('report_vat', { p_from: from, p_to: to })
      if (error) throw error
      return (data as Record<string, unknown>[]).map((r) => ({ rate: n(r.vat_rate), gross: n(r.gross), vat: n(r.vat) }))
    },
  })
}

export interface CashierRow {
  cashierId: string | null
  name: string
  salesCount: number
  total: number
}

export function useCashierReport(from: string, to: string) {
  return useQuery({
    queryKey: reportKeys.cashiers(from, to),
    ...LIVE,
    queryFn: async (): Promise<CashierRow[]> => {
      const { data, error } = await supabase.rpc('report_by_cashier', { p_from: from, p_to: to })
      if (error) throw error
      return (data as Record<string, unknown>[]).map((r) => ({
        cashierId: (r.cashier_id as string | null) ?? null,
        name: String(r.full_name),
        salesCount: n(r.sales_count),
        total: n(r.total),
      }))
    },
  })
}

export interface SaleRow {
  id: number
  number: number
  createdAt: string
  payment: PaymentMethod
  total: number
  totalVat: number
  paid: number | null
  change: number | null
  itemCount: number
  cashierId: string | null
}

/** Local day boundaries as ISO timestamps for filtering `created_at`. */
function dayRange(from: string, to: string) {
  const start = new Date(`${from}T00:00:00`)
  const end = new Date(`${to}T00:00:00`)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}

export function useSalesList(from: string, to: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: [...reportKeys.sales(from, to, page), pageSize],
    ...LIVE,
    queryFn: async (): Promise<{ rows: SaleRow[]; total: number }> => {
      const { start, end } = dayRange(from, to)
      const { data, error, count } = await supabase
        .from('sales')
        .select('id, number, created_at, payment_method, total, total_vat, paid, change, cashier_id, sale_items(count)', { count: 'exact' })
        .gte('created_at', start)
        .lt('created_at', end)
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1)
      if (error) throw error
      return {
        total: count ?? 0,
        rows: data.map((r) => ({
          id: r.id as number,
          number: n(r.number),
          createdAt: r.created_at as string,
          payment: r.payment_method as PaymentMethod,
          total: n(r.total),
          totalVat: n(r.total_vat),
          paid: r.paid === null ? null : n(r.paid),
          change: r.change === null ? null : n(r.change),
          cashierId: (r.cashier_id as string | null) ?? null,
          itemCount: (r.sale_items as { count: number }[])[0]?.count ?? 0,
        })),
      }
    },
  })
}

export interface SaleItemRow {
  id: number
  name: string
  quantity: number
  unitPrice: number
  vatRate: number
  lineTotal: number
}

export function useSaleItems(saleId: number | null) {
  return useQuery({
    queryKey: reportKeys.saleItems(saleId ?? 0),
    enabled: saleId !== null,
    staleTime: Infinity, // a sale never changes
    queryFn: async (): Promise<SaleItemRow[]> => {
      const { data, error } = await supabase
        .from('sale_items')
        .select('id, name, quantity, unit_price, vat_rate, line_total')
        .eq('sale_id', saleId!)
        .order('id')
      if (error) throw error
      return data.map((r) => ({
        id: r.id as number,
        name: r.name as string,
        quantity: n(r.quantity),
        unitPrice: n(r.unit_price),
        vatRate: n(r.vat_rate),
        lineTotal: n(r.line_total),
      }))
    },
  })
}
