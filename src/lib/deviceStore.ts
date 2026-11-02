/**
 * The store (market) this device belongs to: remembered after any sign-in, so the PIN screen can list
 * that store's cashiers before anyone is signed in, and so cached data never mixes two stores.
 */
const STORE_KEY = 'market-pos.store-id'

/** Device data that belongs to one store and must not survive a switch to another store. */
const STORE_SCOPED_KEYS = [
  'market-pos.cart',
  'market-pos.held-carts',
  'market-pos.entry-form',
  'market-pos.inventory-counts',
  'market-pos.last-pin-user',
  'market-pos.store-name',
]

export function getDeviceStoreId(): string | null {
  try {
    return localStorage.getItem(STORE_KEY)
  } catch {
    return null
  }
}

/**
 * Binds the device to `storeId`. Returns true when it was bound to a different store before,
 * in which case the cached data of the old store has been removed.
 */
export function bindDeviceToStore(storeId: string): boolean {
  try {
    const previous = localStorage.getItem(STORE_KEY)
    localStorage.setItem(STORE_KEY, storeId)
    if (!previous || previous === storeId) return false
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('market-pos.cache.') || STORE_SCOPED_KEYS.includes(key)) localStorage.removeItem(key)
    }
    return true
  } catch {
    return false
  }
}
