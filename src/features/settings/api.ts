import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { businessProfile, type BusinessProfile, type BusinessType } from '@/lib/business'
import { getDeviceStoreId } from '@/lib/deviceStore'
import { cached } from '@/lib/offlineCache'
import { useDeviceSettings } from '@/lib/printer/deviceSettings'
import { supabase } from '@/lib/supabase'
import type { Profile, Register, Store, StoreSettings, UserRole } from '@/types/database'

export const settingsKeys = {
  store: ['store-settings'] as const,
  registers: ['registers'] as const,
  profiles: ['profiles', 'all'] as const,
  platformAdmin: ['platform-admin'] as const,
  stores: ['stores'] as const,
  business: ['business-type'] as const,
}

export const DEFAULT_STORE_NAME = '[Emri i Marketit]'
const NAME_CACHE_KEY = 'market-pos.store-name'

export const defaultSettings: StoreSettings = {
  store_name: DEFAULT_STORE_NAME,
  nui: null,
  address: null,
  phone: null,
  receipt_footer: 'Faleminderit për blerjen!',
  show_logo: true,
  show_vat_breakdown: true,
  show_barcode: true,
  receipt_copies: 1,
  paper_width: 80,
  auto_print: true,
  open_cash_drawer: true,
}

/**
 * Settings of the user's store. RLS returns only that store's row (one row per store since migration 06,
 * the single id = 1 row before). `select('*')` so it works before and after migration 04.
 */
export function useStoreSettings(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.store,
    enabled,
    staleTime: 5 * 60_000,
    // Cached on the device: receipts print offline with the store's details.
    ...cached('store-settings', async (): Promise<StoreSettings> => {
      const { data, error } = await supabase.from('store_settings').select('*').limit(1).maybeSingle()
      if (error) throw error
      const s = { ...defaultSettings, ...(data ?? {}) } as StoreSettings
      s.paper_width = Number(s.paper_width) === 58 ? 58 : 80
      try {
        // The login screen can't read settings (RLS), so it shows the last known name.
        localStorage.setItem(NAME_CACHE_KEY, s.store_name)
      } catch {
        // Not critical.
      }
      return s
    }),
  })
}

export function cachedStoreName(): string {
  try {
    return localStorage.getItem(NAME_CACHE_KEY) || DEFAULT_STORE_NAME
  } catch {
    return DEFAULT_STORE_NAME
  }
}

/** Store name for headers: live settings when signed in, otherwise the cached one. */
export function useStoreName(enabled = true): string {
  const s = useStoreSettings(enabled)
  return s.data?.store_name ?? cachedStoreName()
}

/** Business type of the signed-in store; "market" until migration 07 has been run. */
export function useBusiness(enabled = true): BusinessProfile {
  const q = useQuery({
    queryKey: settingsKeys.business,
    enabled,
    staleTime: 10 * 60_000,
    ...cached('business-type', async (): Promise<BusinessType> => {
      const storeId = getDeviceStoreId()
      if (!storeId) return 'market'
      const { data, error } = await supabase.from('stores').select('business_type').eq('id', storeId).maybeSingle()
      if (error?.code === '42703') return 'market' // column added by migration 07
      if (error) throw error
      return (data?.business_type as BusinessType | undefined) ?? 'market'
    }),
  })
  return businessProfile(q.data)
}

export function useSaveStoreSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<StoreSettings>) => {
      const storeId = getDeviceStoreId()
      const query = supabase.from('store_settings').update(patch)
      const { error } = storeId ? await query.eq('store_id', storeId) : await query.eq('id', 1)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.store }),
  })
}

// ---------- Registers ----------

/**
 * The register this device sells on: the one chosen in Cilësimet → Arkat if it belongs to the store,
 * otherwise the store's first active register (e.g. right after moving to another store).
 */
export function useActiveRegister(): { id: number; name: string } {
  const device = useDeviceSettings()
  const registers = useRegisters()
  const list = registers.data ?? []
  const chosen = list.find((r) => r.id === device.registerId && r.active) ?? list.find((r) => r.active)
  return chosen ? { id: chosen.id, name: chosen.name } : { id: device.registerId, name: `Arka ${device.registerId}` }
}

export function useRegisters() {
  return useQuery({
    queryKey: settingsKeys.registers,
    ...cached('registers', async (): Promise<Register[]> => {
      const { data, error } = await supabase.from('registers').select('id, name, active').order('id')
      if (error) throw error
      return data
    }),
  })
}

export function useSaveRegister() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, active }: { id?: number; name: string; active: boolean }) => {
      const { error } = id
        ? await supabase.from('registers').update({ name, active }).eq('id', id)
        : await supabase.from('registers').insert({ name, active })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKeys.registers })
      void qc.invalidateQueries({ queryKey: ['registers'] })
    },
  })
}

// ---------- Users ----------

export interface ProfileRow extends Profile {
  /** Null until migration 05 (computed column has_pin) has been run. */
  has_pin: boolean | null
}

export function useProfiles(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.profiles,
    enabled,
    queryFn: async (): Promise<ProfileRow[]> => {
      const withPin = await supabase.from('profiles').select('id, full_name, role, active, created_at, has_pin').order('full_name')
      if (!withPin.error) return withPin.data as ProfileRow[]
      const { data, error } = await supabase.from('profiles').select('id, full_name, role, active, created_at').order('full_name')
      if (error) throw error
      return (data as Profile[]).map((p) => ({ ...p, has_pin: null }))
    },
  })
}

export function useSetPin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, pin }: { id: string; pin: string | null }) => {
      const { error } = pin
        ? await supabase.rpc('set_pin', { p_profile_id: id, p_pin: pin })
        : await supabase.rpc('clear_pin', { p_profile_id: id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.profiles }),
  })
}

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, full_name, role, active }: { id: string; full_name: string; role: UserRole; active: boolean }) => {
      const { error } = await supabase.from('profiles').update({ full_name, role, active }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKeys.profiles })
      void qc.invalidateQueries({ queryKey: ['profiles', 'names'] })
    },
  })
}

// ---------- Platform: stores (multi-tenant, migration 06) ----------

/** True for platform admins, who create and manage stores. False before migration 06. */
export function useIsPlatformAdmin(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.platformAdmin,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await supabase.rpc('is_platform_admin')
      return !error && data === true
    },
  })
}

export function useStores(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.stores,
    enabled,
    queryFn: async (): Promise<Store[]> => {
      const { data, error } = await supabase.rpc('list_stores')
      if (error) throw error
      return (data as Store[]).map((s) => ({ ...s, users: Number(s.users), sales: Number(s.sales) }))
    },
  })
}

export function useCreateStore() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, ownerId, ownerName, type }: { name: string; ownerId: string; ownerName: string; type: BusinessType }) => {
      const args = { p_name: name, p_owner_id: ownerId, p_owner_name: ownerName }
      const { error } = await supabase.rpc('create_store', { ...args, p_type: type })
      if (error?.code === 'PGRST202' && type === 'market') {
        // Before migration 07 create_store has no type; only markets exist then.
        const { error: e } = await supabase.rpc('create_store', args)
        if (e) throw e
        return
      }
      if (error?.code === 'PGRST202') throw new Error('Llojet e bizneseve kërkojnë migrimin 07 në Supabase.')
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.stores }),
  })
}

export function useSetStoreActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.rpc('set_store_active', { p_store: id, p_active: active })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.stores }),
  })
}

export function useSetStoreType() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, type }: { id: string; type: BusinessType }) => {
      const { error } = await supabase.rpc('set_store_type', { p_store: id, p_type: type })
      if (error?.code === 'PGRST202') throw new Error('Llojet e bizneseve kërkojnë migrimin 07 në Supabase.')
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: settingsKeys.stores })
      void qc.invalidateQueries({ queryKey: settingsKeys.business })
    },
  })
}
