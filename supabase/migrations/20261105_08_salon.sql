-- Salon / services (B1): services without stock, workers (staff) with commission, appointments.
-- Also useful for any business type: a product can now be a service.
--
-- Run once in Supabase → SQL Editor (after migration 07). It runs in a transaction.

begin;

-- ============ SERVICES ============
alter table public.products
  add column kind text not null default 'product' check (kind in ('product', 'service')),
  add column duration_min int check (duration_min is null or duration_min between 5 and 600);

-- The register needs kind and duration; columns are added at the end of the view.
create or replace view public.pos_products as
  select id, barcode, name, category_id, unit, sale_price, vat_rate, stock, min_stock, kind, duration_min
    from public.products
   where active and show_in_pos and store_id = public.current_store_id();

-- ============ STAFF (workers, not necessarily app users) ============
create table public.staff (
  id bigint generated always as identity primary key,
  store_id uuid not null default public.current_store_id() references public.stores(id) on delete cascade,
  name text not null check (trim(name) <> ''),
  commission_pct numeric(5,2) not null default 0 check (commission_pct between 0 and 100),
  color text not null default '#0E6B4E',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index staff_store_idx on public.staff (store_id);
alter table public.staff enable row level security;

-- Everyone in the store sees the workers (the register picks them); managers manage them.
create policy store_read on public.staff for select to authenticated using (store_id = public.current_store_id());
create policy mgr_write on public.staff for all to authenticated
  using (public.is_manager() and store_id = public.current_store_id())
  with check (public.is_manager() and store_id = public.current_store_id());

-- Who did each line, and the commission earned at the time of the sale.
alter table public.sale_items
  add column staff_id bigint references public.staff(id),
  add column commission numeric(12,2) not null default 0;
create index sale_items_staff_idx on public.sale_items (staff_id) where staff_id is not null;

-- ============ APPOINTMENTS ============
create table public.appointments (
  id bigint generated always as identity primary key,
  store_id uuid not null default public.current_store_id() references public.stores(id) on delete cascade,
  staff_id bigint references public.staff(id),
  product_id bigint references public.products(id),
  customer_name text not null check (trim(customer_name) <> ''),
  customer_phone text,
  starts_at timestamptz not null,
  duration_min int not null default 30 check (duration_min between 5 and 600),
  status text not null default 'booked' check (status in ('booked', 'done', 'cancelled', 'no_show')),
  note text,
  created_by uuid default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now()
);
create index appointments_store_time_idx on public.appointments (store_id, starts_at);
alter table public.appointments enable row level security;

-- Cashiers/receptionists book too; only managers delete.
create policy store_read on public.appointments for select to authenticated using (store_id = public.current_store_id());
create policy store_insert on public.appointments for insert to authenticated with check (store_id = public.current_store_id());
create policy store_update on public.appointments for update to authenticated
  using (store_id = public.current_store_id()) with check (store_id = public.current_store_id());
create policy mgr_delete on public.appointments for delete to authenticated
  using (public.is_manager() and store_id = public.current_store_id());

-- ============ RPC: SALE (services skip stock, worker + commission per line) ============
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
  v_staff public.staff;
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

  select id into v_register from public.registers where id = p_register and store_id = v_store;
  if v_register is null then
    select id into v_register from public.registers where store_id = v_store and active order by id limit 1;
  end if;

  if p_cashier_id is not null and exists (select 1 from public.profiles where id = p_cashier_id and store_id = v_store) then
    v_cashier := p_cashier_id;
  end if;

  update public.stores set last_sale_number = last_sale_number + 1 where id = v_store returning last_sale_number into v_number;

  insert into public.sales (store_id, number, register_id, cashier_id, payment_method, total, total_vat, client_id, created_at)
  values (v_store, v_number, v_register, v_cashier, p_payment, 0, 0, p_client_id, v_at) returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric;
    if v_qty is null or v_qty <= 0 then raise exception 'Sasi e pavlefshme'; end if;
    select * into v_p from public.products
     where id = (v_item->>'product_id')::bigint and store_id = v_store and active for update;
    if not found then raise exception 'Produkti % nuk ekziston', v_item->>'product_id'; end if;

    -- Optional worker of this line; an unknown worker is ignored rather than failing the sale.
    v_staff := null;
    if nullif(v_item->>'staff_id', '') is not null then
      select * into v_staff from public.staff where id = (v_item->>'staff_id')::bigint and store_id = v_store;
    end if;

    v_line := round(v_p.sale_price * v_qty, 2);
    v_total := v_total + v_line;

    insert into public.sale_items (store_id, sale_id, product_id, name, quantity, unit_price, unit_cost, vat_rate, line_total, staff_id, commission)
    values (v_store, v_sale.id, v_p.id, v_p.name, v_qty, v_p.sale_price, v_p.cost_price, v_p.vat_rate, v_line,
            v_staff.id, coalesce(round(v_line * v_staff.commission_pct / 100, 2), 0));

    -- Services have no stock.
    if v_p.kind <> 'service' then
      update public.products set stock = stock - v_qty, updated_at = now() where id = v_p.id;
      insert into public.stock_movements (store_id, product_id, type, quantity, ref_id, created_at)
      values (v_store, v_p.id, 'sale', -v_qty, v_sale.id, v_at);
    end if;
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

-- ============ REPORT: commission per worker ============
create or replace function public.staff_commissions(p_from date, p_to date)
returns table (staff_id bigint, name text, lines bigint, revenue numeric, commission numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  v_store uuid := public.current_store_id();
begin
  if not public.is_manager() then raise exception 'Vetëm menaxheri'; end if;
  return query
    select s.id, s.name, count(t.id), coalesce(sum(t.line_total), 0), coalesce(sum(t.commission), 0)
      from public.staff s
      left join (
        select i.id, i.staff_id, i.line_total, i.commission
          from public.sale_items i
          join public.sales x on x.id = i.sale_id
         where x.store_id = v_store
           and x.created_at >= (p_from::timestamp at time zone 'Europe/Belgrade')
           and x.created_at <  ((p_to + 1)::timestamp at time zone 'Europe/Belgrade')
      ) t on t.staff_id = s.id
     where s.store_id = v_store
     group by s.id, s.name
     order by coalesce(sum(t.commission), 0) desc, s.name;
end $$;

revoke all on function public.staff_commissions(date, date) from public, anon;
grant execute on function public.staff_commissions(date, date) to authenticated;

commit;
