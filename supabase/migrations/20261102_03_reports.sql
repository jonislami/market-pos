-- Phase 5: report functions for the dashboard and /raportet.
-- Days are counted in Kosovo time (Europe/Belgrade), not UTC.
-- The functions run with the caller's rights (RLS applies): sale_items, and so cost/profit,
-- are visible to managers only.
-- Run once in Supabase → SQL Editor.

create index if not exists sale_items_sale_id_idx on public.sale_items (sale_id);
create index if not exists sales_cashier_idx on public.sales (cashier_id, created_at);

-- Per-day totals between two local dates (inclusive). Days without sales are returned with zeros.
create or replace function public.report_daily(p_from date, p_to date)
returns table (
  day date,
  sales_count bigint,
  total numeric,
  total_vat numeric,
  cost numeric,
  cash numeric,
  card numeric
)
language sql stable set search_path = public as $$
  with s as (
    select id, total, total_vat, payment_method,
           (created_at at time zone 'Europe/Belgrade')::date as day
      from public.sales
     where created_at >= (p_from::timestamp at time zone 'Europe/Belgrade')
       and created_at <  ((p_to + 1)::timestamp at time zone 'Europe/Belgrade')
  ), c as (
    select si.sale_id, sum(round(si.unit_cost * si.quantity, 2)) as cost
      from public.sale_items si
      join s on s.id = si.sale_id
     group by si.sale_id
  )
  select d::date,
         count(s.id),
         coalesce(sum(s.total), 0),
         coalesce(sum(s.total_vat), 0),
         coalesce(sum(c.cost), 0),
         coalesce(sum(s.total) filter (where s.payment_method = 'cash'), 0),
         coalesce(sum(s.total) filter (where s.payment_method = 'card'), 0)
    from generate_series(p_from, p_to, interval '1 day') d
    left join s on s.day = d::date
    left join c on c.sale_id = s.id
   group by d
   order by d
$$;

-- Best sellers in a period, ordered by quantity ('qty') or revenue ('revenue').
create or replace function public.report_top_products(
  p_from date, p_to date, p_limit int default 10, p_order text default 'qty'
)
returns table (
  product_id bigint,
  name text,
  unit public.unit,
  quantity numeric,
  revenue numeric,
  cost numeric
)
language sql stable set search_path = public as $$
  select si.product_id,
         max(si.name),
         max(p.unit),
         sum(si.quantity),
         sum(si.line_total),
         sum(round(si.unit_cost * si.quantity, 2))
    from public.sale_items si
    join public.sales s on s.id = si.sale_id
    left join public.products p on p.id = si.product_id
   where s.created_at >= (p_from::timestamp at time zone 'Europe/Belgrade')
     and s.created_at <  ((p_to + 1)::timestamp at time zone 'Europe/Belgrade')
   group by si.product_id
   order by case when p_order = 'revenue' then sum(si.line_total) else sum(si.quantity) end desc
   limit p_limit
$$;

-- VAT per rate, computed per sale and rate exactly like create_sale does.
create or replace function public.report_vat(p_from date, p_to date)
returns table (vat_rate numeric, gross numeric, vat numeric)
language sql stable set search_path = public as $$
  select x.vat_rate, sum(x.gross), sum(x.vat)
    from (
      select si.sale_id, si.vat_rate,
             sum(si.line_total) as gross,
             round(sum(si.line_total) - sum(si.line_total) / (1 + si.vat_rate / 100), 2) as vat
        from public.sale_items si
        join public.sales s on s.id = si.sale_id
       where s.created_at >= (p_from::timestamp at time zone 'Europe/Belgrade')
         and s.created_at <  ((p_to + 1)::timestamp at time zone 'Europe/Belgrade')
       group by si.sale_id, si.vat_rate
    ) x
   group by x.vat_rate
   order by x.vat_rate
$$;

-- Sales per cashier in a period.
create or replace function public.report_by_cashier(p_from date, p_to date)
returns table (cashier_id uuid, full_name text, sales_count bigint, total numeric)
language sql stable set search_path = public as $$
  select s.cashier_id, coalesce(max(pr.full_name), '—'), count(*), sum(s.total)
    from public.sales s
    left join public.profiles pr on pr.id = s.cashier_id
   where s.created_at >= (p_from::timestamp at time zone 'Europe/Belgrade')
     and s.created_at <  ((p_to + 1)::timestamp at time zone 'Europe/Belgrade')
   group by s.cashier_id
   order by sum(s.total) desc
$$;

grant execute on function public.report_daily(date, date) to authenticated;
grant execute on function public.report_top_products(date, date, int, text) to authenticated;
grant execute on function public.report_vat(date, date) to authenticated;
grant execute on function public.report_by_cashier(date, date) to authenticated;
