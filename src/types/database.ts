// Hand-written subset of the schema in supabase/schema.sql.
// Replace with `supabase gen types typescript` output once the project is linked.

export type UserRole = 'admin' | 'manager' | 'cashier'

export interface Profile {
  id: string
  full_name: string
  role: UserRole
  active: boolean
  created_at: string
  /** The user's store (migration 06); undefined before multi-tenant was enabled. */
  store_id?: string
}

export interface Store {
  id: string
  name: string
  active: boolean
  /** Missing before migration 07 (then every store is a market). */
  business_type?: string
  created_at: string
  users: number
  sales: number
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

export interface StoreSettings {
  store_name: string
  nui: string | null
  address: string | null
  phone: string | null
  receipt_footer: string | null
  show_logo: boolean
  show_vat_breakdown: boolean
  /** Added by migration 04; undefined until it has been run. */
  show_barcode?: boolean
  receipt_copies?: number
  paper_width: 58 | 80
  auto_print: boolean
  open_cash_drawer: boolean
}

export interface Register {
  id: number
  name: string
  active: boolean
}

export interface Supplier {
  id: number
  name: string
  nui: string | null
  phone: string | null
  payment_days: number | null
}

export type EntryStatus = 'draft' | 'confirmed'

export interface StockEntry {
  id: number
  supplier_id: number | null
  invoice_no: string | null
  entry_date: string
  payment_terms: string | null
  note: string | null
  status: EntryStatus
  total_net: number
  total_vat: number
  total: number
  created_at: string
  confirmed_at: string | null
}

export interface StockEntryItem {
  id: number
  entry_id: number
  product_id: number
  quantity: number
  /** Without VAT. */
  unit_cost: number
  vat_rate: VatRate
}

export type MovementType = 'sale' | 'entry' | 'writeoff' | 'inventory' | 'return'

export interface StockMovement {
  id: number
  product_id: number
  type: MovementType
  /** Positive in, negative out. */
  quantity: number
  ref_id: number | null
  note: string | null
  created_by: string | null
  created_at: string
}

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
