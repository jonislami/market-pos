-- Multi-tenant: many markets (stores) in one database, each seeing only its own data.
--
-- * Every user (profile) belongs to exactly one store; current_store_id() is that store.
-- * Every data table gets store_id (filled automatically on insert) and RLS limits rows to the user's store.
-- * Receipt numbers count per store (#00001 for each market).
-- * Platform admins (you) create new stores with create_store().
-- * Existing data is moved into one store named after the current store settings.
--
-- Run once in Supabase → SQL Editor (after migrations 01–05). It runs in a transaction:
-- if anything fails, nothing changes.

begin;

-- ============ STORES & PLATFORM ADMINS ============
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  active boolean not null default true,
  last_sale_number bigint not null default 0,   -- per-store receipt counter
  created_at timestamptz not null default now()
);
alter table public.stores enable row level security;

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.platform_admins enable row level security;

-- Existing data becomes the first store.
insert into public.stores (name, last_sale_number)
select coalesce((select store_name from public.store_settings limit 1), 'Marketi im'),
       coalesce((select max(number) from public.sales), 0);

create temp table _first_store on commit drop as select id from public.stores;

-- Everyone who is admin today can create and manage stores.
insert into public.platform_admins (user_id) select id from public.profiles where role = 'admin';

-- ============ PROFILES → STORE ============
alter table public.profiles add column store_id uuid references public.stores(id) on delete cascade;
update public.profiles set store_id = (select id from _first_store);
alter table public.profiles alter column store_id set not null;
create index profiles_store_idx on public.profiles (store_id);

-- The signed-in user's store (null when the user or the store is inactive).
create or replace function public.current_store_id()
returns uuid language sql stable security definer set search_path = public as $$
  select p.store_id
    from public.profiles p
    join public.stores s on s.id = p.store_id
   where p.id = auth.uid() and p.active and s.active
$$;

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- New profiles added by a store admin land in the admin's store.
alter table public.profiles alter column store_id set default public.current_store_id();

-- ============ store_id ON EVERY DATA TABLE ============
do $$
declare
  t text;
  first_store uuid := (select id from _first_store);
begin
  foreach t in array array[
    'categories', 'products', 'suppliers', 'registers', 'stock_entries', 'stock_entry_items',
    'sales', 'sale_items', 'stock_movements'
  ] loop
    execute format('alter table public.%I add column store_id uuid references public.stores(id) on delete cascade', t);
    execute format('update public.%I set store_id = %L', t, first_store);
    execute format('alter table public.%I alter column store_id set not null', t);
    execute format('alter table public.%I alter column store_id set default public.current_store_id()', t);
    execute format('create index %I on public.%I (store_id)', t || '_store_idx', t);
  end loop;
end $$;

-- Store settings: one row per store instead of the single row with id = 1.
alter table public.store_settings add column store_id uuid references public.stores(id) on delete cascade;
update public.store_settings set store_id = (select id from _first_store);
alter table public.store_settings drop column id;   -- drops the old primary key and the id = 1 check
alter table public.store_settings alter column store_id set not null;
alter table public.store_settings alter column store_id set default public.current_store_id();
alter table public.store_settings add primary key (store_id);

-- Uniqueness is per store now.
alter table public.categories drop constraint categories_name_key;
alter table public.categories add constraint categories_store_name_key unique (store_id, name);
alter table public.products drop constraint products_barcode_key;
alter table public.products add constraint products_store_barcode_key unique (store_id, barcode);
alter table public.sales drop constraint sales_number_key;
alter table public.sales add constraint sales_store_number_key unique (store_id, number);
alter table public.sales alter column number drop default;
drop sequence if exists public.sale_number_seq;

create index sales_store_created_idx on public.sales (store_id, created_at);

-- ============ RLS: replace every policy with a store-scoped one ============
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
     where schemaname = 'public'
       and tablename in ('categories', 'products', 'suppliers', 'registers', 'stock_entries', 'stock_entry_items',
                         'sales', 'sale_items', 'stock_movements', 'store_settings', 'profiles')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Readable by every active user of the store
create policy store_read on public.store_settings for select to authenticated using (store_id = public.current_store_id());
create policy store_read on public.registers      for select to authenticated using (store_id = public.current_store_id());
create policy store_read on public.categories     for select to authenticated using (store_id = public.current_store_id());
create policy store_read on public.sales          for select to authenticated using (store_id = public.current_store_id());

-- Managers of the store only
create policy mgr_read on public.products          for select to authenticated using (public.is_manager() and store_id = public.current_store_id());
create policy mgr_read on public.sale_items        for select to authenticated using (public.is_manager() and store_id = public.current_store_id());
create policy mgr_read on public.suppliers         for select to authenticated using (public.is_manager() and store_id = public.current_store_id());
create policy mgr_read on public.stock_entries     for select to authenticated using (public.is_manager() and store_id = public.current_store_id());
create policy mgr_read on public.stock_entry_items for select to authenticated using (public.is_manager() and store_id = public.current_store_id());
create policy mgr_read on public.stock_movements   for select to authenticated using (public.is_manager() and store_id = public.current_store_id());

create policy mgr_write on public.store_settings for update to authenticated
  using (public.is_manager() and store_id = public.current_store_id())
  with check (public.is_manager() and store_id = public.current_store_id());
create policy mgr_write on public.registers for all to authenticated
  using (public.is_manager() and store_id = public.current_store_id())
  with check (public.is_manager() and store_id = public.current_store_id());
create policy mgr_write on public.categories for all to authenticated
  using (public.is_manager() and store_id = public.current_store_id())
  with check (public.is_manager() and store_id = public.current_store_id());
create policy mgr_write on public.suppliers for all to authenticated
  using (public.is_manager() and store_id = public.current_store_id())
  with check (public.is_manager() and store_id = public.current_store_id());

-- Entries: drafts are edited directly; confirmation only through the RPC
create policy mgr_write on public.stock_entries for all to authenticated
  using (public.is_manager() and store_id = public.current_store_id() and status = 'draft')
  with check (public.is_manager() and store_id = public.current_store_id() and status = 'draft');
create policy mgr_write on public.stock_entry_items for all to authenticated
  using (public.is_manager() and store_id = public.current_store_id()
         and exists (select 1 from public.stock_entries e where e.id = entry_id and e.status = 'draft' and e.store_id = public.current_store_id()))
  with check (public.is_manager() and store_id = public.current_store_id()
         and exists (select 1 from public.stock_entries e where e.id = entry_id and e.status = 'draft' and e.store_id = public.current_store_id()));

-- Products: managers add/edit; stock is still protected by the trigger
create policy mgr_insert on public.products for insert to authenticated
  with check (public.is_manager() and store_id = public.current_store_id());
create policy mgr_update on public.products for update to authenticated
  using (public.is_manager() and store_id = public.current_store_id())
  with check (public.is_manager() and store_id = public.current_store_id());

-- Profiles: everyone sees themself; managers see their store; the store admin manages their store
create policy self_read on public.profiles for select to authenticated
  using (id = auth.uid() or (public.is_manager() and store_id = public.current_store_id()));
create policy admin_write on public.profiles for all to authenticated
  using (public.app_role() = 'admin' and store_id = public.current_store_id())
  with check (public.app_role() = 'admin' and store_id = public.current_store_id());

-- Stores: users see their own store, platform admins see all
create policy store_read on public.stores for select to authenticated
  using (id = public.current_store_id() or public.is_platform_admin());
create policy self_read on public.platform_admins for select to authenticated using (user_id = auth.uid());

-- Register view: only the user's store
create or replace view public.pos_products as
  select id, barcode, name, category_id, unit, sale_price, vat_rate, stock, min_stock
    from public.products
   where active and show_in_pos and store_id = public.current_store_id();

-- ============ RPC: SALE (per-store numbers, store checks, cashier of offline sales) ============
drop function if exists public.create_sale(jsonb, public.payment_method, numeric, int, uuid, timestamptz);

create or replace function public.create_sale(
  p_items jsonb,
  p_payment public.payment_method,
  p_paid numeric default null,
  p_register int default null,
  p_client_id uuid default null,
  p_created_at timestamptz default null,
  p_cashier_id uuid default null
) returns public.sales
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := public.current_store_id();
  v_sale public.sales;
  v_item jsonb;
  v_p public.products;
  v_qty numeric;
  v_total numeric := 0;
  v_vat numeric := 0;
  v_line numeric;
  v_at timestamptz;
  v_register int;
  v_cashier uuid := auth.uid();
  v_number bigint;
begin
  if v_store is null then raise exception 'Nuk ke qasje'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Fatura është bosh'; end if;

  if p_client_id is not null then
    select * into v_sale from public.sales where client_id = p_client_id and store_id = v_store;
    if found then return v_sale; end if;
  end if;

  v_at := case
    when p_created_at is null or p_created_at > now() + interval '5 minutes' or p_created_at < now() - interval '7 days' then now()
    else p_created_at
  end;

  -- The register must belong to this store; otherwise use the store's first active register.
  select id into v_register from public.registers where id = p_register and store_id = v_store;
  if v_register is null then
    select id into v_register from public.registers where store_id = v_store and active order by id limit 1;
  end if;

  -- An offline sale keeps the cashier who made it, if they belong to this store.
  if p_cashier_id is not null and exists (select 1 from public.profiles where id = p_cashier_id and store_id = v_store) then
    v_cashier := p_cashier_id;
  end if;

  -- Next receipt number of this store (the row lock serialises concurrent sales).
  update public.stores set last_sale_number = last_sale_number + 1 where id = v_store returning last_sale_number into v_number;

  insert into public.sales (store_id, number, register_id, cashier_id, payment_method, total, total_vat, client_id, created_at)
  values (v_store, v_number, v_register, v_cashier, p_payment, 0, 0, p_client_id, v_at) returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Sasi e pavlefshme'; end if;
    select * into v_p from public.products
     where id = (v_item->>'product_id')::bigint and store_id = v_store and active for update;
    if not found then raise exception 'Produkti % nuk ekziston', v_item->>'product_id'; end if;

    v_line := round(v_p.sale_price * v_qty, 2);
    v_total := v_total + v_line;

    insert into public.sale_items (store_id, sale_id, product_id, name, quantity, unit_price, unit_cost, vat_rate, line_total)
    values (v_store, v_sale.id, v_p.id, v_p.name, v_qty, v_p.sale_price, v_p.cost_price, v_p.vat_rate, v_line);

    update public.products set stock = stock - v_qty, updated_at = now() where id = v_p.id;
    insert into public.stock_movements (store_id, product_id, type, quantity, ref_id, created_at)
    values (v_store, v_p.id, 'sale', -v_qty, v_sale.id, v_at);
  end loop;

  select coalesce(sum(round(g.gross - g.gross / (1 + g.vat_rate / 100), 2)), 0) into v_vat
    from (select vat_rate, sum(line_total) as gross
            from public.sale_items where sale_id = v_sale.id group by vat_rate) g;

  if p_payment = 'cash' and p_paid is not null and p_paid < v_total then
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

grant execute on function public.create_sale(jsonb, public.payment_method, numeric, int, uuid, timestamptz, uuid) to authenticated;

-- ============ RPC: STOCK (store checks) ============
create or replace function public.confirm_stock_entry(p_entry_id bigint)
returns public.stock_entries
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := public.current_store_id();
  v_entry public.stock_entries;
  r record;
begin
  if not public.is_manager() or v_store is null then raise exception 'Vetëm menaxheri mund të konfirmojë hyrjet'; end if;

  select * into v_entry from public.stock_entries where id = p_entry_id and store_id = v_store for update;
  if not found then raise exception 'Hyrja nuk ekziston'; end if;
  if v_entry.status = 'confirmed' then raise exception 'Hyrja është konfirmuar më parë'; end if;
  if not exists (select 1 from public.stock_entry_items where entry_id = p_entry_id) then
    raise exception 'Hyrja nuk ka asnjë produkt';
  end if;

  for r in select * from public.stock_entry_items where entry_id = p_entry_id loop
    update public.products
       set stock = stock + r.quantity,
           cost_price = round(r.unit_cost * (1 + r.vat_rate / 100), 2),
           updated_at = now()
     where id = r.product_id and store_id = v_store;
    if not found then raise exception 'Produkti % nuk ekziston', r.product_id; end if;
    insert into public.stock_movements (store_id, product_id, type, quantity, ref_id)
    values (v_store, r.product_id, 'entry', r.quantity, p_entry_id);
  end loop;

  update public.stock_entries e
     set status = 'confirmed', confirmed_at = now(),
         total_net = s.net, total_vat = s.vat, total = s.net + s.vat
    from (select coalesce(sum(g.net), 0) as net,
                 coalesce(sum(round(g.net * g.vat_rate / 100, 2)), 0) as vat
            from (select vat_rate, sum(round(quantity * unit_cost, 2)) as net
                    from public.stock_entry_items where entry_id = p_entry_id
                   group by vat_rate) g) s
   where e.id = p_entry_id
  returning e.* into v_entry;

  return v_entry;
end $$;

create or replace function public.adjust_stock(
  p_product_id bigint, p_quantity numeric, p_type public.movement_type, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_store uuid := public.current_store_id();
begin
  if not public.is_manager() or v_store is null then raise exception 'Vetëm menaxheri'; end if;
  if p_type not in ('writeoff', 'inventory', 'return') then raise exception 'Lloj i pavlefshëm'; end if;
  update public.products set stock = stock + p_quantity, updated_at = now() where id = p_product_id and store_id = v_store;
  if not found then raise exception 'Produkti nuk ekziston'; end if;
  insert into public.stock_movements (store_id, product_id, type, quantity, note) values (v_store, p_product_id, p_type, p_quantity, p_note);
end $$;

-- ============ PIN (store checks) ============
create or replace function public.set_pin(p_profile_id uuid, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare
  v_role public.user_role;
begin
  if not public.is_manager() then raise exception 'Vetëm menaxheri mund të vendosë PIN'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then raise exception 'PIN-i duhet të ketë saktësisht 4 shifra'; end if;
  select role into v_role from public.profiles where id = p_profile_id and store_id = public.current_store_id();
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
  update public.profiles set pin_hash = null where id = p_profile_id and store_id = public.current_store_id();
end $$;

-- PIN users of one store, for the login screen of a device that belongs to that store.
-- Called without a session: it reveals only names, and only to someone who knows the store's id.
drop function if exists public.pin_users();
create or replace function public.pin_users(p_store uuid)
returns table (id uuid, full_name text, role public.user_role)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.role
    from public.profiles p
    join public.stores s on s.id = p.store_id
   where p.store_id = p_store and p.active and s.active and p.pin_hash is not null
   order by p.full_name
$$;
revoke all on function public.pin_users(uuid) from public;
grant execute on function public.pin_users(uuid) to anon, authenticated;

create or replace function public.pin_login_check(p_profile_id uuid, p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
  v_failures int;
  v_ok boolean;
  v_email text;
begin
  select p.pin_hash into v_hash
    from public.profiles p join public.stores s on s.id = p.store_id
   where p.id = p_profile_id and p.active and s.active;
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

-- ============ PLATFORM: stores ============
-- Creates a store with its settings, "Arka 1" and its admin (an existing user from Authentication → Users).
create or replace function public.create_store(p_name text, p_owner_id uuid, p_owner_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_store uuid;
begin
  if not public.is_platform_admin() then raise exception 'Vetëm administratori i platformës krijon dyqane'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Shkruaj emrin e dyqanit'; end if;
  if not exists (select 1 from auth.users where id = p_owner_id) then
    raise exception 'Ky UID nuk ekziston te Authentication → Users';
  end if;
  if exists (select 1 from public.profiles where id = p_owner_id) then
    raise exception 'Ky përdorues i përket tashmë një dyqani';
  end if;

  insert into public.stores (name) values (trim(p_name)) returning id into v_store;
  insert into public.store_settings (store_id, store_name) values (v_store, trim(p_name));
  insert into public.registers (store_id, name) values (v_store, 'Arka 1');
  insert into public.profiles (id, full_name, role, store_id)
  values (p_owner_id, coalesce(nullif(trim(p_owner_name), ''), 'Admin'), 'admin', v_store);
  return v_store;
end $$;

create or replace function public.list_stores()
returns table (id uuid, name text, active boolean, created_at timestamptz, users bigint, sales bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Vetëm administratori i platformës'; end if;
  return query
    select s.id, s.name, s.active, s.created_at,
           (select count(*) from public.profiles p where p.store_id = s.id),
           (select count(*) from public.sales x where x.store_id = s.id)
      from public.stores s
     order by s.created_at;
end $$;

create or replace function public.set_store_active(p_store uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Vetëm administratori i platformës'; end if;
  if not p_active and p_store = public.current_store_id() then
    raise exception 'Nuk mund të çaktivizosh dyqanin ku je i kyçur';
  end if;
  update public.stores set active = p_active where id = p_store;
end $$;

revoke all on function public.create_store(text, uuid, text) from public, anon;
revoke all on function public.list_stores() from public, anon;
revoke all on function public.set_store_active(uuid, boolean) from public, anon;
grant execute on function public.create_store(text, uuid, text) to authenticated;
grant execute on function public.list_stores() to authenticated;
grant execute on function public.set_store_active(uuid, boolean) to authenticated;
grant execute on function public.current_store_id() to authenticated;
grant execute on function public.is_platform_admin() to authenticated;

commit;
