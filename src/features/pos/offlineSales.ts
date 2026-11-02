import { useSyncExternalStore } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { getDeviceStoreId } from '@/lib/deviceStore'
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
  /** Who made the sale; kept so an offline sale synced later is not credited to another cashier. */
  cashierId: string | null
}

export interface PendingSale extends SaleRequest {
  /** Store of the device when the sale was made; only synced while signed in to that store. */
  storeId: string | null
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

/**
 * create_sale with idempotency key and original cashier. Falls back to older signatures while
 * migrations 06 (p_cashier_id) or 05 (p_client_id, p_created_at) have not been run.
 */
async function callCreateSale(req: SaleRequest, clientId: string, createdAt: string | null): Promise<Sale> {
  const base = { p_items: req.items, p_payment: req.payment, p_paid: req.paid, p_register: req.registerId }
  const attempts = [
    { ...base, p_client_id: clientId, p_created_at: createdAt, p_cashier_id: req.cashierId },
    { ...base, p_client_id: clientId, p_created_at: createdAt },
    base,
  ]
  for (const args of attempts) {
    const { data, error } = await supabase.rpc('create_sale', args)
    if (error?.code === 'PGRST202') continue // this signature doesn't exist (yet)
    if (error) throw error
    return toSale(data)
  }
  throw new Error('Funksioni create_sale mungon në databazë.')
}

export type SaleResult = { kind: 'online'; sale: Sale } | { kind: 'offline'; pending: PendingSale }

/** Sends the sale now, or queues it when there is no connection. Database errors are thrown. */
export async function submitSale(req: SaleRequest, total: number): Promise<SaleResult> {
  const clientId = crypto.randomUUID()
  const enqueue = (): SaleResult => {
    const pending: PendingSale = {
      ...req,
      storeId: getDeviceStoreId(),
      clientId,
      createdAt: new Date().toISOString(),
      label: nextLabel(req.registerId),
      total,
    }
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

/** Queued sales that may be sent with the current sign-in (same store as when they were made). */
function sendable(p: PendingSale): boolean {
  const store = getDeviceStoreId()
  return !p.error && (!p.storeId || !store || p.storeId === store)
}

/** Sends queued sales oldest first; stops at the first network failure. */
export async function syncOfflineSales(): Promise<void> {
  if (syncing || !navigator.onLine || !queue.some(sendable)) return
  // Without a session the server would reject every sale as "no access"; wait for the next sign-in.
  const { data } = await supabase.auth.getSession()
  if (!data.session) return
  syncing = true
  emit()
  let sent = 0
  try {
    for (const p of [...queue]) {
      if (!sendable(p)) continue
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
