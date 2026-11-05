import { FunctionsHttpError } from '@supabase/supabase-js'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { BusinessType } from '@/lib/business'
import { supabase } from '@/lib/supabase'
import { settingsKeys } from '@/features/settings/api'

/** Calls the "platform-admin" Edge Function with the signed-in platform admin's session. */
async function callPlatform<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('platform-admin', { body })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as { error?: string } | null
      throw new Error(payload?.error ?? 'Veprimi dështoi.')
    }
    throw new Error(
      navigator.onLine ? 'Mungon funksioni "platform-admin" në Supabase (Edge Functions).' : 'Nuk ka internet.',
    )
  }
  return data as T
}

export interface NewBusiness {
  name: string
  type: BusinessType
  ownerName: string
  email: string
  password: string
}

export function useCreateBusiness() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (b: NewBusiness) =>
      callPlatform<{ store_id: string }>({
        action: 'create_store',
        name: b.name,
        type: b.type,
        owner_name: b.ownerName,
        email: b.email,
        password: b.password,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: settingsKeys.stores }),
  })
}

export function useResetOwnerPassword() {
  return useMutation({
    mutationFn: ({ storeId, password }: { storeId: string; password: string }) =>
      callPlatform<{ email: string }>({ action: 'reset_password', store_id: storeId, password }),
  })
}

/** Readable temporary password: no 0/O or 1/l, 10 characters. */
export function generatePassword(): string {
  const letters = 'abcdefghjkmnpqrstuvwxyz'
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const digits = '23456789'
  const all = letters + upper + digits
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0] % set.length]
  const chars = [pick(upper), pick(digits), ...Array.from({ length: 8 }, () => pick(all))]
  // Shuffle so the upper-case letter and digit aren't always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

/** What the client receives: where to log in and with what. */
export function credentialsText(business: string, email: string, password: string): string {
  return [
    `${business} – llogaria juaj`,
    `Adresa: ${window.location.origin}/login`,
    `Email: ${email}`,
    `Fjalëkalimi: ${password}`,
    'Pas hyrjes së parë mund të shtoni arkëtarët dhe PIN-et te Cilësimet.',
  ].join('\n')
}
