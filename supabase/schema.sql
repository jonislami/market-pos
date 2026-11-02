-- Market POS – skema fillestare për Supabase
-- Ekzekutoje një herë në Supabase → SQL Editor.

-- ============ ROLET & PËRDORUESIT ============
create type public.user_role as enum ('admin', 'manager', 'cashier');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'cashier',
  pin_hash text,                       -- PIN-i i arkëtarit (hash, kurrë tekst i thjeshtë)
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create or replace function public.app_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and active
$$;

create or replace function public.is_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.app_role() in ('admin', 'manager'), false)
$$;

-- ============ CILËSIMET ============
create table public.store_settings (
  id int primary key default 1 check (id = 1),   -- vetëm një rresht
  store_name text not null default '[Emri i Marketit]',
  nui text,
  address text,
  phone text,
  receipt_footer text default 'Faleminderit për blerjen!',
  show_logo boolean not null default true,
  show_vat_breakdown boolean not null default true,
  paper_width int not null default 80 check (paper_width in (58, 80)),
  auto_print boolean not null default true,
  open_cash_drawer boolean not null default true,
  updated_at timestamptz not null default now()
);
insert into public.store_settings (id) values (1);

create table public.registers (
  id serial primary key,
  name text not null,                 -- "Arka 1 – Hyrja kryesore"
  active boolean not null default true
);
insert into public.registers (name) values ('Arka 1');

-- ============ PRODUKTET ============
create table public.categories (
  id serial primary key,
  name text not null unique,
  sort_order int not null default 0
);

create type public.unit as enum ('cope', 'kg', 'pako', 'liter');

create table public.products (
  id bigserial primary key,
  barcode text unique,
  name text not null,
  category_id int references public.categories(id) on delete set null,
  unit public.unit not null default 'cope',
  cost_price numeric(12,2) not null default 0,     -- çmimi i blerjes (me TVSH)
  sale_price numeric(12,2) not null default 0,     -- çmimi i shitjes (me TVSH)
  vat_rate numeric(4,2) not null default 8 check (vat_rate in (0, 8, 18)),
  stock numeric(12,3) not null default 0,          -- ndryshohet vetëm nga RPC-të
  min_stock numeric(12,3) not null default 0,
  show_in_pos boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.products (category_id);
create index on public.products using gin (to_tsvector('simple', name));

-- ============ FURNITORËT & HYRJET ============
create table public.suppliers (
  id serial primary key,
  name text not null,
  nui text,
  phone text,
  payment_days int default 0
);

create type public.entry_status as enum ('draft', 'confirmed');

create table public.stock_entries (
  id bigserial primary key,
  supplier_id int references public.suppliers(id),
  invoice_no text,
  entry_date date not null default current_date,
  payment_terms text,
  note text,
  status public.entry_status not null default 'draft',
  total_net numeric(12,2) not null default 0,
  total_vat numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  created_by uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create table public.stock_entry_items (
  id bigserial primary key,
  entry_id bigint not null references public.stock_entries(id) on delete cascade,
  product_id bigint not null references public.products(id),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(12,2) not null check (unit_cost >= 0),   -- pa TVSH
  vat_rate numeric(4,2) not null
);

-- ============ SHITJET ============
create sequence public.sale_number_seq;
create type public.payment_method as enum ('cash', 'card');

create table public.sales (
  id bigserial primary key,
  number bigint not null unique default nextval('public.sale_number_seq'),
  register_id int references public.registers(id),
  cashier_id uuid references public.profiles(id) default auth.uid(),
  payment_method public.payment_method not null,
  total numeric(12,2) not null,
  total_vat numeric(12,2) not null,
  paid numeric(12,2),
  change numeric(12,2),
  created_at timestamptz not null default now()
);
create index on public.sales (created_at);

create table public.sale_items (
  id bigserial primary key,
  sale_id bigint not null references public.sales(id) on delete cascade,
  product_id bigint not null references public.products(id),
  name text not null,                        -- emri në momentin e shitjes
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null,         -- me TVSH
  unit_cost numeric(12,2) not null,          -- për fitimin
  vat_rate numeric(4,2) not null,
  line_total numeric(12,2) not null
);

-- ============ LËVIZJET E STOKUT ============
create type public.movement_type as enum ('sale', 'entry', 'writeoff', 'inventory', 'return');

create table public.stock_movements (
  id bigserial primary key,
  product_id bigint not null references public.products(id),
  type public.movement_type not null,
  quantity numeric(12,3) not null,           -- + hyn, − del
  ref_id bigint,                             -- sale_id / entry_id
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index on public.stock_movements (product_id, created_at);

-- ============ RPC: SHITJA ============
-- p_items: [{"product_id":1,"quantity":2}, ...]  – çmimet merren nga DB, jo nga klienti
create or replace function public.create_sale(
  p_items jsonb, p_payment public.payment_method, p_paid numeric default null, p_register int default 1
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
begin
  if public.app_role() is null then raise exception 'Nuk ke qasje'; end if;
  if jsonb_array_length(p_items) = 0 then raise exception 'Fatura është bosh'; end if;

  insert into public.sales (register_id, payment_method, total, total_vat)
  values (p_register, p_payment, 0, 0) returning * into v_sale;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'quantity')::numeric;
    select * into v_p from public.products where id = (v_item->>'product_id')::bigint and active for update;
    if not found then raise exception 'Produkti % nuk ekziston', v_item->>'product_id'; end if;

    v_line := round(v_p.sale_price * v_qty, 2);
    v_total := v_total + v_line;
    v_vat := v_vat + round(v_line - v_line / (1 + v_p.vat_rate / 100), 2);

    insert into public.sale_items (sale_id, product_id, name, quantity, unit_price, unit_cost, vat_rate, line_total)
    values (v_sale.id, v_p.id, v_p.name, v_qty, v_p.sale_price, v_p.cost_price, v_p.vat_rate, v_line);

    update public.products set stock = stock - v_qty, updated_at = now() where id = v_p.id;
    insert into public.stock_movements (product_id, type, quantity, ref_id) values (v_p.id, 'sale', -v_qty, v_sale.id);
  end loop;

  if p_payment = 'cash' and p_paid is not null and p_paid < v_total then
    raise exception 'Shuma e paguar është më e vogël se totali';
  end if;

  update public.sales
     set total = v_total, total_vat = v_vat, paid = coalesce(p_paid, v_total),
         change = coalesce(p_paid, v_total) - v_total
   where id = v_sale.id
  returning * into v_sale;

  return v_sale;
end $$;

-- ============ RPC: KONFIRMIMI I HYRJES ============
create or replace function public.confirm_stock_entry(p_entry_id bigint)
returns public.stock_entries
language plpgsql security definer set search_path = public as $$
declare
  v_entry public.stock_entries;
  r record;
begin
  if not public.is_manager() then raise exception 'Vetëm menaxheri mund të konfirmojë hyrjet'; end if;

  select * into v_entry from public.stock_entries where id = p_entry_id for update;
  if not found then raise exception 'Hyrja nuk ekziston'; end if;
  if v_entry.status = 'confirmed' then raise exception 'Hyrja është konfirmuar më parë'; end if;

  for r in select * from public.stock_entry_items where entry_id = p_entry_id loop
    update public.products
       set stock = stock + r.quantity,
           cost_price = round(r.unit_cost * (1 + r.vat_rate / 100), 2),
           updated_at = now()
     where id = r.product_id;
    insert into public.stock_movements (product_id, type, quantity, ref_id)
    values (r.product_id, 'entry', r.quantity, p_entry_id);
  end loop;

  update public.stock_entries e
     set status = 'confirmed', confirmed_at = now(),
         total_net = s.net, total_vat = s.vat, total = s.net + s.vat
    from (select coalesce(sum(round(quantity * unit_cost, 2)), 0) as net,
                 coalesce(sum(round(quantity * unit_cost * vat_rate / 100, 2)), 0) as vat
            from public.stock_entry_items where entry_id = p_entry_id) s
   where e.id = p_entry_id
  returning e.* into v_entry;

  return v_entry;
end $$;

-- ============ RPC: SHKARKIM / INVENTARIZIM ============
create or replace function public.adjust_stock(
  p_product_id bigint, p_quantity numeric, p_type public.movement_type, p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_manager() then raise exception 'Vetëm menaxheri'; end if;
  if p_type not in ('writeoff', 'inventory', 'return') then raise exception 'Lloj i pavlefshëm'; end if;
  update public.products set stock = stock + p_quantity, updated_at = now() where id = p_product_id;
  insert into public.stock_movements (product_id, type, quantity, note) values (p_product_id, p_type, p_quantity, p_note);
end $$;

-- ============ RLS ============
alter table public.profiles enable row level security;
alter table public.store_settings enable row level security;
alter table public.registers enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.suppliers enable row level security;
alter table public.stock_entries enable row level security;
alter table public.stock_entry_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;

-- leximi: çdo përdorues aktiv
create policy "read_all" on public.store_settings for select to authenticated using (public.app_role() is not null);
create policy "read_all" on public.registers      for select to authenticated using (public.app_role() is not null);
create policy "read_all" on public.categories     for select to authenticated using (public.app_role() is not null);
create policy "read_all" on public.sales          for select to authenticated using (public.app_role() is not null);

-- vetëm menaxheri
create policy "mgr_read" on public.products          for select to authenticated using (public.is_manager());
create policy "mgr_read" on public.sale_items        for select to authenticated using (public.is_manager());
create policy "mgr_read" on public.suppliers         for select to authenticated using (public.is_manager());
create policy "mgr_read" on public.stock_entries     for select to authenticated using (public.is_manager());
create policy "mgr_read" on public.stock_entry_items for select to authenticated using (public.is_manager());
create policy "mgr_read" on public.stock_movements   for select to authenticated using (public.is_manager());

create policy "mgr_write" on public.store_settings for update to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "mgr_write" on public.registers   for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "mgr_write" on public.categories  for all to authenticated using (public.is_manager()) with check (public.is_manager());
create policy "mgr_write" on public.suppliers   for all to authenticated using (public.is_manager()) with check (public.is_manager());
-- hyrjet: menaxheri krijon/ndryshon draftet; konfirmimi bëhet vetëm me RPC
create policy "mgr_write" on public.stock_entries for all to authenticated
  using (public.is_manager() and status = 'draft') with check (public.is_manager() and status = 'draft');
create policy "mgr_write" on public.stock_entry_items for all to authenticated
  using (public.is_manager() and exists (select 1 from public.stock_entries e where e.id = entry_id and e.status = 'draft'))
  with check (public.is_manager() and exists (select 1 from public.stock_entries e where e.id = entry_id and e.status = 'draft'));

-- produktet: menaxheri shton/ndryshon, por stoku mbrohet nga trigger-i më poshtë
create policy "mgr_insert" on public.products for insert to authenticated with check (public.is_manager());
create policy "mgr_update" on public.products for update to authenticated using (public.is_manager()) with check (public.is_manager());

create or replace function public.protect_product_stock()
returns trigger language plpgsql as $$
begin
  -- RPC-të (security definer) ekzekutohen si pronari i tabelës; klienti jo
  if current_user = 'authenticated' then
    if tg_op = 'INSERT' then new.stock := 0;
    elsif new.stock is distinct from old.stock then
      raise exception 'Stoku ndryshohet vetëm përmes hyrjeve, shitjeve ose inventarizimit';
    end if;
  end if;
  return new;
end $$;
create trigger trg_protect_product_stock before insert or update on public.products
  for each row execute function public.protect_product_stock();

-- profilet: secili sheh veten; admini menaxhon të gjithë
create policy "self_read" on public.profiles for select to authenticated using (id = auth.uid() or public.is_manager());
create policy "admin_write" on public.profiles for all to authenticated
  using (public.app_role() = 'admin') with check (public.app_role() = 'admin');

-- shitjet krijohen vetëm me create_sale (nuk ka policy insert)
grant execute on function public.create_sale(jsonb, public.payment_method, numeric, int) to authenticated;
grant execute on function public.confirm_stock_entry(bigint) to authenticated;
grant execute on function public.adjust_stock(bigint, numeric, public.movement_type, text) to authenticated;

-- ============ KOLONA E FSHEHUR PËR ARKËTARIN ============
-- Arkëtari nuk e lexon tabelën products (ka cost_price). Arka lexon këtë view,
-- që ekzekutohet si pronari dhe kthen vetëm fushat e arkës për përdoruesit aktivë.
create view public.pos_products as
  select id, barcode, name, category_id, unit, sale_price, vat_rate, stock, min_stock
    from public.products
   where active and show_in_pos and public.app_role() is not null;
revoke all on public.pos_products from anon;
grant select on public.pos_products to authenticated;

-- ============ PËRDORUESI I PARË (ADMIN) ============
-- Pasi të krijosh përdoruesin e parë te Authentication → Users, ekzekuto:
-- insert into public.profiles (id, full_name, role) values ('<UUID>', 'Admin', 'admin');
