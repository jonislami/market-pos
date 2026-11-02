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
