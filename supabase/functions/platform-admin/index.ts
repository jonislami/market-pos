// Supabase Edge Function "platform-admin": the platform admin creates businesses and their logins.
//
//   { action: "create_store", name, type, owner_name, email, password } -> { store_id, user_id }
//   { action: "reset_password", store_id, password }                     -> { email }
//
// Only platform admins (table platform_admins, migration 06) may call it. Creating a login needs the
// service role, which never leaves this function. Deploy with "Verify JWT" turned ON.
import { createClient } from 'npm:@supabase/supabase-js@2.49.1'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const TYPES = ['market', 'restaurant', 'pharmacy', 'boutique', 'salon']

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !anonKey || !serviceKey) return json({ error: 'Funksioni nuk është konfiguruar.' }, 500)

  const authorization = req.headers.get('Authorization') ?? ''
  // The caller's own session: create_store and is_platform_admin check who is asking.
  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  const { data: isAdmin } = await caller.rpc('is_platform_admin')
  if (isAdmin !== true) return json({ error: 'Vetëm administratori i platformës.' }, 403)

  let body: Record<string, string | undefined>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Kërkesë e pavlefshme.' }, 400)
  }

  const password = body.password ?? ''
  if (password && password.length < 8) return json({ error: 'Fjalëkalimi duhet të ketë së paku 8 karaktere.' }, 400)

  if (body.action === 'create_store') {
    const name = (body.name ?? '').trim()
    const ownerName = (body.owner_name ?? '').trim()
    const email = (body.email ?? '').trim().toLowerCase()
    if (!name || !ownerName) return json({ error: 'Shkruaj emrin e biznesit dhe të pronarit.' }, 400)
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Email i pavlefshëm.' }, 400)
    if (!TYPES.includes(body.type ?? '')) return json({ error: 'Zgjidh llojin e biznesit.' }, 400)
    if (!password) return json({ error: 'Vendos fjalëkalimin.' }, 400)

    const { data: created, error: userError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: ownerName },
    })
    if (userError || !created.user) {
      const taken = /already|registered|exists/i.test(userError?.message ?? '')
      return json({ error: taken ? 'Ky email ka tashmë llogari.' : (userError?.message ?? 'Llogaria nuk u krijua.') }, 400)
    }

    const { data: storeId, error: storeError } = await caller.rpc('create_store', {
      p_name: name,
      p_owner_id: created.user.id,
      p_owner_name: ownerName,
      p_type: body.type,
    })
    if (storeError) {
      // Don't leave a login without a business behind.
      await admin.auth.admin.deleteUser(created.user.id)
      return json({ error: storeError.message }, 400)
    }
    return json({ store_id: storeId, user_id: created.user.id })
  }

  if (body.action === 'reset_password') {
    if (!body.store_id || !password) return json({ error: 'Mungon biznesi ose fjalëkalimi.' }, 400)
    const { data: owner, error } = await admin
      .from('profiles')
      .select('id')
      .eq('store_id', body.store_id)
      .eq('role', 'admin')
      .order('created_at')
      .limit(1)
      .maybeSingle()
    if (error) return json({ error: error.message }, 500)
    if (!owner) return json({ error: 'Ky biznes nuk ka pronar.' }, 404)
    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(owner.id, { password })
    if (updateError) return json({ error: updateError.message }, 400)
    return json({ email: updated.user?.email ?? '' })
  }

  return json({ error: 'Veprim i panjohur.' }, 400)
})
