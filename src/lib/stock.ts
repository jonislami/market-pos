import type { BadgeTone } from '@/components/ui'

export type StockStatus = 'critical' | 'low' | 'ok'

/** Low: stock <= min_stock; critical: stock <= min_stock / 2. */
export function stockStatus(stock: number, minStock: number): StockStatus {
  if (stock <= minStock / 2) return 'critical'
  if (stock <= minStock) return 'low'
  return 'ok'
}

export const STOCK_BADGE: Record<Exclude<StockStatus, 'ok'>, { tone: BadgeTone; label: string }> = {
  critical: { tone: 'critical', label: 'Kritik' },
  low: { tone: 'low', label: 'I ulët' },
}
