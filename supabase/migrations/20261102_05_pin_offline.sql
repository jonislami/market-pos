-- Phase 7: cashier PIN login and offline sales.
-- Run once in Supabase → SQL Editor (after migrations 01–04).

create extension if not exists pgcrypto with schema extensions;

-- ============ OFFLINE SALES ============
-- A sale made without internet is sent later with its own id (client_id) and the time it happened.
-- Sending the same client_id twice returns the first sale instead of creating a duplicate.
alter table public.sales add column if not exists client_id uuid unique;

drop function if exists public.create_sale(jsonb, public.payment_method, numeric, int);

create or replace function public.create_sale(
  p_items jsonb,
  p_payment public.payment_method,
  p_paid numeric default null,
  p_register int default 1,
  p_client_id uuid default null,
  p_created_at timestamptz default null
) returns public.sales
language plpgsql security definer set search_path = public as $$
declare
  v_sale public.sales;
  v_item jsonb;
  v_p public.products;
  v_qty numeric;
  v_total numeric := 0;
  v_vat numeric := 0;
  v_line numeric;
  v_at timestamptz;
begin
  if public.app_role() is null then raise exception 'Nuk ke qasje'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Fatura është bosh'; end if;

  if p_client_id is not null then
    select * into v_sale from public.sales where client_id = p_client_id;
    if found then return v_sale; end if;
  end if;

  -- Offline time is trusted only within a week and not in the future.
  v_at := case
    when p_created_at is null or p_created_at > now() + interval '5 minutes' or p_created_at < now() - interval '7 days' then now()
    else p_created_at
  end;

  insert into public.sales (register_id, payment_method, total, total_vat, client_id, created_at)
  values (p_register, p_payment, 0, 0, p_client_id, v_at) returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Sasi e pavlefshme'; end if;
    select * into v_p from public.products where id = (v_item->>'product_id')::bigint and active for update;
    if not found then raise exception 'Produkti % nuk ekziston', v_item->>'product_id'; end if;

    v_line := round(v_p.sale_price * v_qty, 2);
    v_total := v_total + v_line;

    insert into public.sale_items (sale_id, product_id, name, quantity, unit_price, unit_cost, vat_rate, line_total)
    values (v_sale.id, v_p.id, v_p.name, v_qty, v_p.sale_price, v_p.cost_price, v_p.vat_rate, v_line);

    update public.products set stock = stock - v_qty, updated_at = now() where id = v_p.id;
    insert into public.stock_movements (product_id, type, quantity, ref_id, created_at)
    values (v_p.id, 'sale', -v_qty, v_sale.id, v_at);
  end loop;

  select coalesce(sum(round(g.gross - g.gross / (1 + g.vat_rate / 100), 2)), 0) into v_vat
    from (select vat_rate, sum(line_total) as gross
            from public.sale_items where sale_id = v_sale.id group by vat_rate) g;

  if p_payment = 'cash' and p_paid is not null and p_paid < v_total then
    -- An offline sale was already paid at the till; only reject short payment for live sales.
    if p_client_id is null or p_created_at is null then
      raise exception 'Shuma e paguar është më e vogël se totali';
    end if;
  end if;

  update public.sales
     set total = v_total, total_vat = v_vat, paid = greatest(coalesce(p_paid, v_total), v_total),
         change = greatest(coalesce(p_paid, v_total) - v_total, 0)
   where id = v_sale.id
  returning * into v_sale;

  return v_sale;
end $$;

grant execute on function public.create_sale(jsonb, public.payment_method, numeric, int, uuid, timestamptz) to authenticated;

-- ============ PIN ============
-- Failed and successful PIN attempts, for lockout. Only the server (service role) reads it.
create table if not exists public.pin_attempts (
  id bigserial primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists pin_attempts_profile_idx on public.pin_attempts (profile_id, created_at);
alter table public.pin_attempts enable row level security;

-- "has_pin" as a computed column, so the app never reads the hash itself.
create or replace function public.has_pin(p public.profiles)
returns boolean language sql stable as $$
  select p.pin_hash is not null
$$;

-- Admin sets any PIN; a manager only cashiers' PINs.
create or replace function public.set_pin(p_profile_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_role public.user_role;
begin
  if not public.is_manager() then raise exception 'Vetëm menaxheri mund të vendosë PIN'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'PIN-i duhet të ketë saktësisht 4 shifra'; end if;
  select role into v_role from public.profiles where id = p_profile_id;
  if not found then raise exception 'Përdoruesi nuk ekziston'; end if;
  if v_role <> 'cashier' and public.app_role() <> 'admin' then
    raise exception 'Vetëm administratori mund të vendosë PIN për menaxherët';
  end if;
  update public.profiles set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf', 8)) where id = p_profile_id;
  delete from public.pin_attempts where profile_id = p_profile_id;
end $$;

create or replace function public.clear_pin(p_profile_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'Vetëm menaxheri mund të heqë PIN'; end if;
  update public.profiles set pin_hash = null where id = p_profile_id;
end $$;

-- Used only by the pin-login Edge Function (service role): who can log in with a PIN.
create or replace function public.pin_users()
returns table (id uuid, full_name text, role public.user_role)
language sql stable security definer set search_path = public as $$
  select id, full_name, role from public.profiles where active and pin_hash is not null order by full_name
$$;

-- Checks a PIN with lockout (5 wrong in 15 minutes) and returns the user's email.
create or replace function public.pin_login_check(p_profile_id uuid, p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
  v_failures int;
  v_ok boolean;
  v_email text;
begin
  select pin_hash into v_hash from public.profiles where id = p_profile_id and active;
  if v_hash is null then raise exception 'Ky përdorues nuk ka PIN aktiv'; end if;

  select count(*) into v_failures from public.pin_attempts
   where profile_id = p_profile_id and not success and created_at > now() - interval '15 minutes';
  if v_failures >= 5 then raise exception 'Shumë tentativa të gabuara. Provo pas 15 minutash ose thirr menaxherin.'; end if;

  v_ok := v_hash = extensions.crypt(coalesce(p_pin, ''), v_hash);
  insert into public.pin_attempts (profile_id, success) values (p_profile_id, v_ok);
  if not v_ok then raise exception 'PIN i gabuar'; end if;

  select email into v_email from auth.users where id = p_profile_id;
  if v_email is null then raise exception 'Përdoruesi nuk ka email në Authentication'; end if;
  return v_email;
end $$;

revoke all on function public.pin_users() from public, anon, authenticated;
revoke all on function public.pin_login_check(uuid, text) from public, anon, authenticated;
grant execute on function public.pin_users() to service_role;
grant execute on function public.pin_login_check(uuid, text) to service_role;
grant execute on function public.set_pin(uuid, text) to authenticated;
grant execute on function public.clear_pin(uuid) to authenticated;
