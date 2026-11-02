import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { setRememberSession, supabase } from '@/lib/supabase'
import type { Profile } from '@/types/database'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  /** True until the stored session (and its profile) has been resolved. */
  loading: boolean
  signInWithPassword: (email: string, password: string, remember: boolean) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, active, created_at')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

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
      let p: Profile | null = null
      try {
        p = await fetchProfile(next.user.id)
      } catch (err) {
        console.error('Failed to load profile', err)
      }
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
  }, [])

  const signInWithPassword = useCallback(async (email: string, password: string, remember: boolean) => {
    setRememberSession(remember)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo(
    () => ({ session, profile, loading, signInWithPassword, signOut }),
    [session, profile, loading, signInWithPassword, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
