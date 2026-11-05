-- Business types: every store is a market, café/restaurant, pharmacy, boutique or salon.
-- The app shows the modules and wording of the store's type; existing stores stay "market".
--
-- Run once in Supabase → SQL Editor (after migration 06). It runs in a transaction.

begin;

create type public.business_type as enum ('market', 'restaurant', 'pharmacy', 'boutique', 'salon');

alter table public.stores add column business_type public.business_type not null default 'market';

-- create_store now takes the business type.
drop function if exists public.create_store(text, uuid, text);
create or replace function public.create_store(
  p_name text, p_owner_id uuid, p_owner_name text, p_type public.business_type default 'market'
)
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

  insert into public.stores (name, business_type) values (trim(p_name), coalesce(p_type, 'market')) returning id into v_store;
  insert into public.store_settings (store_id, store_name) values (v_store, trim(p_name));
  insert into public.registers (store_id, name) values (v_store, 'Arka 1');
  insert into public.profiles (id, full_name, role, store_id)
  values (p_owner_id, coalesce(nullif(trim(p_owner_name), ''), 'Admin'), 'admin', v_store);
  return v_store;
end $$;

drop function if exists public.list_stores();
create or replace function public.list_stores()
returns table (id uuid, name text, active boolean, business_type public.business_type, created_at timestamptz, users bigint, sales bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Vetëm administratori i platformës'; end if;
  return query
    select s.id, s.name, s.active, s.business_type, s.created_at,
           (select count(*) from public.profiles p where p.store_id = s.id),
           (select count(*) from public.sales x where x.store_id = s.id)
      from public.stores s
     order by s.created_at;
end $$;

create or replace function public.set_store_type(p_store uuid, p_type public.business_type)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Vetëm administratori i platformës'; end if;
  update public.stores set business_type = p_type where id = p_store;
end $$;

revoke all on function public.create_store(text, uuid, text, public.business_type) from public, anon;
revoke all on function public.list_stores() from public, anon;
revoke all on function public.set_store_type(uuid, public.business_type) from public, anon;
grant execute on function public.create_store(text, uuid, text, public.business_type) to authenticated;
grant execute on function public.list_stores() to authenticated;
grant execute on function public.set_store_type(uuid, public.business_type) to authenticated;

commit;
