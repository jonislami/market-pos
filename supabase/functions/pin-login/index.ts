// Supabase Edge Function "pin-login": cashier login with a 4-digit PIN.
//
//   { action: "list" }                         -> { users: [{ id, full_name, role }] }
//   { action: "login", user_id, pin }          -> { token_hash }   (client calls auth.verifyOtp)
//
// The PIN is checked in the database (bcrypt + lockout after 5 wrong tries in 15 minutes, see
// migration 05). On success a one-time magic-link token is generated for that user; no email is sent.
// Deploy with "Verify JWT" turned OFF: the login screen has no session yet.
import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) return json({ error: 'Funksioni nuk është konfiguruar.' }, 500)
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let body: { action?: string; user_id?: string; pin?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Kërkesë e pavlefshme.' }, 400)
  }

  if (body.action === 'list') {
    const { data, error } = await admin.rpc('pin_users')
    if (error) return json({ error: error.message }, 500)
    return json({ users: data })
  }

  if (body.action === 'login') {
    if (!body.user_id || !/^[0-9]{4}$/.test(body.pin ?? '')) return json({ error: 'PIN i pavlefshëm.' }, 400)
    const { data: email, error } = await admin.rpc('pin_login_check', { p_profile_id: body.user_id, p_pin: body.pin })
    if (error) return json({ error: error.message }, 401)

    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: email as string })
    if (linkError || !link?.properties?.hashed_token) return json({ error: linkError?.message ?? 'Hyrja dështoi.' }, 500)
    return json({ token_hash: link.properties.hashed_token })
  }

  return json({ error: 'Veprim i panjohur.' }, 400)
})
