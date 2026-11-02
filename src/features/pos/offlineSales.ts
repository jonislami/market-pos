import { useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { isNetworkError } from '@/lib/offlineCache'
import { supabase } from '@/lib/supabase'
import type { PaymentMethod, Sale } from '@/types/database'

/**
 * Sales made without internet wait here (localStorage) and are sent to create_sale when the connection
 * returns. Each carries a client id, so a sale that reached the server before the connection dropped
 * is not created twice (needs migration 05).
 */
export interface SaleRequest {
  items: { product_id: number; quantity: number }[]
  payment: PaymentMethod
  paid: number | null
  registerId: number
}

export interface PendingSale extends SaleRequest {
  clientId: string
  createdAt: string
  /** Temporary receipt number, e.g. "OFF-1-0003". */
  label: string
  /** Total as computed at the till (the server recomputes it from current prices). */
  total: number
  /** Set when the server rejected the sale (not a network problem); needs a manager. */
  error?: string
}

const KEY = 'market-pos.offline-sales'
const COUNTER_KEY = 'market-pos.offline-counter'

function load(): PendingSale[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as PendingSale[]
  } catch {
    return []
  }
}

let queue = load()
let syncing = false
let snapshot = { queue, syncing }
const listeners = new Set<() => void>()

function emit() {
  snapshot = { queue, syncing }
  try {
    localStorage.setItem(KEY, JSON.stringify(queue))
  } catch {
    // If storage is full the sale is still in memory until the page closes.
  }
  listeners.forEach((l) => l())
}

export function useOfflineQueue() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => snapshot,
  )
}

function nextLabel(registerId: number): string {
  let n = 1
  try {
    n = Number(localStorage.getItem(COUNTER_KEY) ?? '0') + 1
    localStorage.setItem(COUNTER_KEY, String(n))
  } catch {
    n = Date.now() % 10000
  }
  return `OFF-${registerId}-${String(n).padStart(4, '0')}`
}

function toSale(data: unknown): Sale {
  const s = data as Sale
  return { ...s, total: Number(s.total), total_vat: Number(s.total_vat), paid: Number(s.paid), change: Number(s.change) }
}

/** create_sale with idempotency key; falls back to the old signature if migration 05 is missing. */
async function callCreateSale(req: SaleRequest, clientId: string, createdAt: string | null): Promise<Sale> {
  const base = { p_items: req.items, p_payment: req.payment, p_paid: req.paid, p_register: req.registerId }
  const { data, error } = await supabase.rpc('create_sale', { ...base, p_client_id: clientId, p_created_at: createdAt })
  if (error?.code === 'PGRST202') {
    const retry = await supabase.rpc('create_sale', base)
    if (retry.error) throw retry.error
    return toSale(retry.data)
  }
  if (error) throw error
  return toSale(data)
}

export type SaleResult = { kind: 'online'; sale: Sale } | { kind: 'offline'; pending: PendingSale }

/** Sends the sale now, or queues it when there is no connection. Database errors are thrown. */
export async function submitSale(req: SaleRequest, total: number): Promise<SaleResult> {
  const clientId = crypto.randomUUID()
  const enqueue = (): SaleResult => {
    const pending: PendingSale = { ...req, clientId, createdAt: new Date().toISOString(), label: nextLabel(req.registerId), total }
    queue = [...queue, pending]
    emit()
    return { kind: 'offline', pending }
  }
  if (!navigator.onLine) return enqueue()
  try {
    return { kind: 'online', sale: await callCreateSale(req, clientId, null) }
  } catch (err) {
    if (isNetworkError(err)) return enqueue()
    throw err
  }
}

let queryClient: QueryClient | null = null

/** Sends queued sales oldest first; stops at the first network failure. */
export async function syncOfflineSales(): Promise<void> {
  if (syncing || !navigator.onLine || !queue.some((p) => !p.error)) return
  syncing = true
  emit()
  let sent = 0
  try {
    for (const p of [...queue]) {
      if (p.error) continue
      try {
        await callCreateSale(p, p.clientId, p.createdAt)
        queue = queue.filter((q) => q.clientId !== p.clientId)
        sent++
      } catch (err) {
        if (isNetworkError(err)) break
        queue = queue.map((q) => (q.clientId === p.clientId ? { ...q, error: (err as Error).message ?? 'Gabim' } : q))
      }
      emit()
    }
  } finally {
    syncing = false
    emit()
    if (sent && queryClient) {
      void queryClient.invalidateQueries({ queryKey: ['pos-products'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
      void queryClient.invalidateQueries({ queryKey: ['sales'] })
      void queryClient.invalidateQueries({ queryKey: ['reports'] })
    }
  }
}

export function retryOfflineSale(clientId: string) {
  queue = queue.map((q) => (q.clientId === clientId ? { ...q, error: undefined } : q))
  emit()
  void syncOfflineSales()
}

export function discardOfflineSale(clientId: string) {
  queue = queue.filter((q) => q.clientId !== clientId)
  emit()
}

/** Call once at startup: syncs now, whenever the connection returns, and every 30 seconds. */
export function startOfflineSync(qc: QueryClient) {
  queryClient = qc
  window.addEventListener('online', () => void syncOfflineSales())
  window.setInterval(() => void syncOfflineSales(), 30_000)
  void syncOfflineSales()
}
