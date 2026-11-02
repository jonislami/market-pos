import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { FunctionsHttpError, type Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { bindDeviceToStore, getDeviceStoreId } from '@/lib/deviceStore'
import { errorMessage } from '@/lib/errors'
import { setRememberSession, supabase } from '@/lib/supabase'
import type { Profile, UserRole } from '@/types/database'

export interface PinUser {
  id: string
  full_name: string
  role: UserRole
}

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  /** True until the stored session (and its profile) has been resolved. */
  loading: boolean
  signInWithPassword: (email: string, password: string, remember: boolean) => Promise<void>
  signInWithPin: (userId: string, pin: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const PROFILE_CACHE = 'market-pos.profile'

function cacheProfile(p: Profile | null) {
  try {
    if (p) localStorage.setItem(PROFILE_CACHE, JSON.stringify(p))
    else localStorage.removeItem(PROFILE_CACHE)
  } catch {
    // Not critical.
  }
}

function cachedProfile(userId: string): Profile | null {
  try {
    const p = JSON.parse(localStorage.getItem(PROFILE_CACHE) ?? 'null') as Profile | null
    return p?.id === userId ? p : null
  } catch {
    return null
  }
}

/** Throws only on network problems, so the caller can fall back to the cached profile. */
async function fetchProfile(userId: string): Promise<Profile | null> {
  const columns = 'id, full_name, role, active, created_at'
  const withStore = await supabase.from('profiles').select(`${columns}, store_id`).eq('id', userId).maybeSingle()
  // Before migration 06 there is no store_id column.
  if (withStore.error?.code === '42703') {
    const { data, error } = await supabase.from('profiles').select(columns).eq('id', userId).maybeSingle()
    if (error) throw error
    return data as Profile | null
  }
  if (withStore.error) throw withStore.error
  return withStore.data as Profile | null
}

/** Calls the pin-login Edge Function and returns its JSON, turning HTTP errors into readable messages. */
async function callPinFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('pin-login', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(payload?.error ?? 'Hyrja me PIN dështoi.')
    }
    // Relay/fetch errors: the function is missing or there is no internet.
    throw new Error(
      navigator.onLine
        ? 'Hyrja me PIN nuk është aktivizuar ende (mungon funksioni "pin-login" në Supabase).'
        : 'Nuk ka internet. Hyrja me PIN kërkon lidhje.',
    )
  }
  return data as T
}

/** Cashiers with a PIN in this device's store. */
export async function fetchPinUsers(): Promise<PinUser[]> {
  const storeId = getDeviceStoreId()
  if (storeId) {
    const { data, error } = await supabase.rpc('pin_users', { p_store: storeId })
    if (!error) return data as PinUser[]
    if (error.code !== 'PGRST202') {
      throw new Error(navigator.onLine ? errorMessage(error) : 'Nuk ka internet. Hyrja me PIN kërkon lidhje.')
    }
    // Before migration 06 the list comes from the Edge Function.
  }
  try {
    const { users } = await callPinFunction<{ users: PinUser[] }>({ action: 'list' })
    return users
  } catch (err) {
    // After migration 06 the list is per store, so the device must know its store first.
    if (!storeId && navigator.onLine) {
      throw new Error('Kjo pajisje nuk është lidhur ende me dyqanin. Menaxheri duhet të hyjë njëherë këtu me email, pastaj arkëtarët hyjnë me PIN.')
    }
    throw err
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()

  useEffect(() => {
    let cancelled = false

    async function apply(next: Session | null) {
      if (!next) {
        if (!cancelled) {
          setSession(null)
          setProfile(null)
          setLoading(false)
        }
        return
      }
      let p: Profile | null
      try {
        p = await fetchProfile(next.user.id)
        cacheProfile(p)
      } catch (err) {
        // Offline: keep working at the register with the last known profile.
        console.warn('Profile not loaded, using cached profile', err)
        p = cachedProfile(next.user.id)
      }
      // A user of another store signed in on this device: drop everything cached for the old store.
      if (p?.store_id && bindDeviceToStore(p.store_id)) queryClient.clear()
      if (!cancelled) {
        setSession(next)
        setProfile(p)
        setLoading(false)
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      // Token refreshes keep the same user; avoid refetching the profile.
      if (event === 'TOKEN_REFRESHED') {
        setSession(next)
        return
      }
      // Defer out of the auth callback: awaiting Supabase calls inside it can deadlock.
      setTimeout(() => void apply(next), 0)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [queryClient])

  const signInWithPassword = useCallback(async (email: string, password: string, remember: boolean) => {
    setRememberSession(remember)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signInWithPin = useCallback(async (userId: string, pin: string) => {
    const { token_hash } = await callPinFunction<{ token_hash: string }>({ action: 'login', user_id: userId, pin })
    // The register stays signed in until the cashier signs out or switches.
    setRememberSession(true)
    const { error } = await supabase.auth.verifyOtp({ token_hash, type: 'email' })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    // Local sign-out also works offline; the next cashier signs in on this device.
    await supabase.auth.signOut({ scope: 'local' })
    cacheProfile(null)
    // The next user must not see data fetched for this one (e.g. a manager's reports).
    queryClient.clear()
  }, [queryClient])

  const value = useMemo(
    () => ({ session, profile, loading, signInWithPassword, signInWithPin, signOut }),
    [session, profile, loading, signInWithPassword, signInWithPin, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
