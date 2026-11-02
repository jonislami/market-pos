import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Profile, Register, StoreSettings, UserRole } from '@/types/database'

export const settingsKeys = {
  store: ['store-settings'] as const,
  registers: ['registers'] as const,
  profiles: ['profiles', 'all'] as const,
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

/** Store settings (one row). `select('*')` so it works before and after migration 04. */
export function useStoreSettings(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.store,
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<StoreSettings> => {
      const { data, error } = await supabase.from('store_settings').select('*').eq('id', 1).maybeSingle()
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
    },
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

export function useSaveStoreSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (patch: Partial<StoreSettings>) => {
      const { error } = await supabase.from('store_settings').update(patch).eq('id', 1)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.store }),
  })
}

// ---------- Registers ----------

export function useRegisters() {
  return useQuery({
    queryKey: settingsKeys.registers,
    queryFn: async (): Promise<Register[]> => {
      const { data, error } = await supabase.from('registers').select('id, name, active').order('id')
      if (error) throw error
      return data
    },
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

export function useProfiles(enabled = true) {
  return useQuery({
    queryKey: settingsKeys.profiles,
    enabled,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase.from('profiles').select('id, full_name, role, active, created_at').order('full_name')
      if (error) throw error
      return data as Profile[]
    },
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
