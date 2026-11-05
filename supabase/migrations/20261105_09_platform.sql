-- Platform (after migrations 07 and 08):
-- * The business type is fixed once the business is created (no more set_store_type).
-- * list_stores shows each business's owner (name + login email) for the platform admin.
-- Creating a business together with its owner's login happens in the Edge Function "platform-admin".
--
-- Run once in Supabase → SQL Editor. It runs in a transaction.

begin;

drop function if exists public.set_store_type(uuid, public.business_type);

create or replace function public.lock_business_type()
returns trigger language plpgsql as $$
begin
  if new.business_type is distinct from old.business_type then
    raise exception 'Lloji i biznesit nuk mund të ndryshohet pasi është zgjedhur';
  end if;
  return new;
end $$;

drop trigger if exists stores_lock_business_type on public.stores;
create trigger stores_lock_business_type before update on public.stores
  for each row execute function public.lock_business_type();

drop function if exists public.list_stores();
create or replace function public.list_stores()
returns table (
  id uuid, name text, active boolean, business_type public.business_type, created_at timestamptz,
  users bigint, sales bigint, owner_name text, owner_email text
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'Vetëm administratori i platformës'; end if;
  return query
    select s.id, s.name, s.active, s.business_type, s.created_at,
           (select count(*) from public.profiles p where p.store_id = s.id),
           (select count(*) from public.sales x where x.store_id = s.id),
           o.full_name, o.email::text
      from public.stores s
      left join lateral (
        select p.full_name, u.email
          from public.profiles p join auth.users u on u.id = p.id
         where p.store_id = s.id and p.role = 'admin'
         order by p.created_at
         limit 1
      ) o on true
     order by s.created_at;
end $$;

revoke all on function public.list_stores() from public, anon;
grant execute on function public.list_stores() to authenticated;

commit;
