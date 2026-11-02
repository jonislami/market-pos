import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

const REMEMBER_KEY = 'market-pos.remember'

/** Whether the session should survive closing the browser ("Më mbaj të kyçur"). */
export function setRememberSession(remember: boolean) {
  localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0')
}

function sessionStore(): Storage {
  return localStorage.getItem(REMEMBER_KEY) === '0' ? sessionStorage : localStorage
}

// Routes the auth session to localStorage or sessionStorage depending on "remember me".
const authStorage = {
  getItem: (key: string) => localStorage.getItem(key) ?? sessionStorage.getItem(key),
  setItem: (key: string, value: string) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
    sessionStore().setItem(key, value)
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
  },
}

// Placeholder values keep the app bootable without .env.local; the UI shows a setup notice instead.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'missing-anon-key', {
  auth: { storage: authStorage, persistSession: true, autoRefreshToken: true },
})
