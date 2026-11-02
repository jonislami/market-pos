// Hand-written subset of the schema in supabase/schema.sql.
// Replace with `supabase gen types typescript` output once the project is linked.

export type UserRole = 'admin' | 'manager' | 'cashier'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  active: boolean
  created_at: string
}

export type Unit = 'cope' | 'kg' | 'pako' | 'liter'

export type VatRate = 0 | 8 | 18

export interface Category {
  id: number
  name: string
  sort_order: number
}

export interface Product {
  id: number
  barcode: string | null
  name: string
  category_id: number | null
  unit: Unit
  cost_price: number
  sale_price: number
  vat_rate: VatRate
  stock: number
  min_stock: number
  show_in_pos: boolean
  active: boolean
}

/** Columns a manager may write; `stock` changes only through RPCs. */
export type ProductInput = Omit<Product, 'id' | 'stock'>

/** Row of the `pos_products` view: what the register may see (no purchase price). */
export type PosProduct = Pick<
  Product,
  'id' | 'barcode' | 'name' | 'category_id' | 'unit' | 'sale_price' | 'vat_rate' | 'stock' | 'min_stock'
>

export type PaymentMethod = 'cash' | 'card'

export interface Sale {
  id: number
  number: number
  register_id: number | null
  cashier_id: string | null
  payment_method: PaymentMethod
  total: number
  total_vat: number
  paid: number | null
  change: number | null
  created_at: string
}
