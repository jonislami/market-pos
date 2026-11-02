import { useCallback, useEffect, useMemo, useState } from 'react'
import { roundMoney } from '@/lib/money'
import { allowsDecimals } from '@/lib/units'
import type { PosProduct, VatRate } from '@/types/database'

/** The cart stores only ids and quantities; prices always come from the latest product data. */
export interface CartLine {
  productId: number
  qty: number
}

export interface CartItem {
  productId: number
  qty: number
  /** Undefined when the product is no longer sold at the register. */
  product?: PosProduct
  lineTotal: number
}

export interface VatGroup {
  rate: VatRate
  base: number
  vat: number
}

export interface CartTotals {
  items: CartItem[]
  total: number
  totalVat: number
  net: number
  vatGroups: VatGroup[]
  /** Pieces in the cart; weighed (kg) lines count as one each. */
  articleCount: number
  hasUnavailable: boolean
}

/**
 * Mirrors create_sale: line = round(price × qty); VAT is computed once per rate on the
 * gross sum of that rate (vat = round(gross − gross / (1 + rate))), as shown on the receipt.
 */
export function computeTotals(lines: CartLine[], products: Map<number, PosProduct>): CartTotals {
  const grossByRate = new Map<VatRate, number>()
  let total = 0
  let articleCount = 0
  let hasUnavailable = false

  const items = lines.map((line) => {
    const product = products.get(line.productId)
    if (!product) {
      hasUnavailable = true
      return { ...line, lineTotal: 0 }
    }
    const lineTotal = roundMoney(product.sale_price * line.qty)
    total += lineTotal
    articleCount += allowsDecimals(product.unit) ? 1 : line.qty
    grossByRate.set(product.vat_rate, (grossByRate.get(product.vat_rate) ?? 0) + lineTotal)
    return { ...line, product, lineTotal }
  })

  const vatGroups: VatGroup[] = [...grossByRate.entries()]
    .map(([rate, gross]) => {
      const g = roundMoney(gross)
      const vat = roundMoney(g - g / (1 + rate / 100))
      return { rate, base: roundMoney(g - vat), vat }
    })
    .sort((a, b) => a.rate - b.rate)

  total = roundMoney(total)
  const totalVat = roundMoney(vatGroups.reduce((s, g) => s + g.vat, 0))
  return { items, total, totalVat, net: roundMoney(total - totalVat), vatGroups, articleCount, hasUnavailable }
}

/** Rounds a quantity to what the unit allows (3 decimals for kg, whole otherwise). */
export function normalizeQty(qty: number, decimals: boolean): number {
  return decimals ? Math.round(qty * 1000) / 1000 : Math.round(qty)
}

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the cart still works for this session.
  }
}

const CART_KEY = 'market-pos.cart'
const HELD_KEY = 'market-pos.held-carts'

export interface HeldCart {
  id: string
  savedAt: string
  lines: CartLine[]
}

/** Current cart plus carts parked with "Ruaj në pritje"; both survive a page reload on this device. */
export function useCart() {
  const [lines, setLines] = useState<CartLine[]>(() => readStorage(CART_KEY, []))
  const [held, setHeld] = useState<HeldCart[]>(() => readStorage(HELD_KEY, []))

  useEffect(() => writeStorage(CART_KEY, lines), [lines])
  useEffect(() => writeStorage(HELD_KEY, held), [held])

  /** Adds qty to an existing line (moving it to the top) or creates one. */
  const add = useCallback((productId: number, qty = 1) => {
    setLines((ls) => {
      const existing = ls.find((l) => l.productId === productId)
      if (!existing) return [{ productId, qty }, ...ls]
      return [{ productId, qty: existing.qty + qty }, ...ls.filter((l) => l.productId !== productId)]
    })
  }, [])

  const setQty = useCallback((productId: number, qty: number) => {
    setLines((ls) => (qty <= 0 ? ls.filter((l) => l.productId !== productId) : ls.map((l) => (l.productId === productId ? { ...l, qty } : l))))
  }, [])

  const remove = useCallback((productId: number) => setLines((ls) => ls.filter((l) => l.productId !== productId)), [])
  const clear = useCallback(() => setLines([]), [])

  const hold = useCallback(() => {
    if (!lines.length) return
    const cart: HeldCart = { id: crypto.randomUUID(), savedAt: new Date().toISOString(), lines }
    setHeld((h) => [cart, ...h])
    setLines([])
  }, [lines])

  /** Brings a parked cart back; the current cart (if any) is parked in its place. */
  const restore = useCallback(
    (id: string) => {
      const cart = held.find((c) => c.id === id)
      if (!cart) return
      const parked: HeldCart[] = lines.length ? [{ id: crypto.randomUUID(), savedAt: new Date().toISOString(), lines }] : []
      setHeld((h) => [...parked, ...h.filter((c) => c.id !== id)])
      setLines(cart.lines)
    },
    [held, lines],
  )

  const discardHeld = useCallback((id: string) => setHeld((h) => h.filter((c) => c.id !== id)), [])

  return useMemo(
    () => ({ lines, held, add, setQty, remove, clear, hold, restore, discardHeld }),
    [lines, held, add, setQty, remove, clear, hold, restore, discardHeld],
  )
}

export type Cart = ReturnType<typeof useCart>
