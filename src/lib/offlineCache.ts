import { useSyncExternalStore } from 'react'

/**
 * Last good copy of data the register needs offline (products, categories, settings), in localStorage.
 * Used as TanStack Query `initialData`, so the register opens with it and refreshes when online.
 */
interface Entry<T> {
  data: T
  updatedAt: number
}

const PREFIX = 'market-pos.cache.'

export function readCache<T>(key: string): Entry<T> | undefined {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    return raw ? (JSON.parse(raw) as Entry<T>) : undefined
  } catch {
    return undefined
  }
}

export function writeCache<T>(key: string, data: T) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ data, updatedAt: Date.now() }))
  } catch {
    // Quota exceeded: the register still works online.
  }
}

/** Query options that seed a query from the cache and keep the cache updated. */
export function cached<T>(key: string, fetcher: () => Promise<T>) {
  // Functions, so the (possibly large) cache is parsed only when the query is created, not on every render.
  return {
    queryFn: async () => {
      const data = await fetcher()
      writeCache(key, data)
      return data
    },
    initialData: () => readCache<T>(key)?.data,
    initialDataUpdatedAt: () => readCache<T>(key)?.updatedAt,
  }
}

// ---------- Online status ----------

function subscribe(cb: () => void) {
  window.addEventListener('online', cb)
  window.addEventListener('offline', cb)
  return () => {
    window.removeEventListener('online', cb)
    window.removeEventListener('offline', cb)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine)
}

/** fetch() failures (no internet, DNS, server unreachable), as opposed to errors returned by the database. */
export function isNetworkError(err: unknown): boolean {
  if (!navigator.onLine) return true
  const msg = String((err as { message?: string })?.message ?? err)
  return /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(msg)
}
