interface PostgrestLikeError {
  code?: string
  message?: string
  details?: string
}

/** Turns a Supabase/Postgres error into a short Albanian message for the UI. */
export function errorMessage(err: unknown): string {
  const e = (err ?? {}) as PostgrestLikeError
  const text = `${e.message ?? ''} ${e.details ?? ''}`
  if (e.code === '23505') {
    if (/barcode/i.test(text)) return 'Ky barkod ekziston tashmë te një produkt tjetër.'
    if (/categories|name/i.test(text)) return 'Ky emër ekziston tashmë.'
    return 'Ky regjistrim ekziston tashmë.'
  }
  if (e.code === '42501' || /row-level security/i.test(text)) return 'Nuk ke leje për këtë veprim.'
  if (e.code === 'PGRST204' || e.code === '42703') {
    return 'Mungon një kolonë në databazë. Ekzekuto migrimet e reja te supabase/migrations në Supabase SQL Editor.'
  }
  if (e.code === 'PGRST202' || e.code === '42883') {
    return 'Mungon një funksion në databazë. Ekzekuto migrimet te supabase/migrations në Supabase SQL Editor.'
  }
  if (e.code === '23503') return 'Regjistrimi përdoret diku tjetër dhe nuk mund të ndryshohet.'
  if (/fetch|network/i.test(text)) return 'Nuk u lidh me serverin. Kontrollo internetin.'
  // Exceptions raised in our SQL functions are already in Albanian.
  if (e.code === 'P0001' && e.message) return e.message
  return e.message || 'Ndodhi një gabim. Provo përsëri.'
}
