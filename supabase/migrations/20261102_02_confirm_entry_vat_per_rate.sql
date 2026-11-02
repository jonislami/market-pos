-- Phase 4: compute a stock entry's VAT once per VAT rate (as on the supplier invoice),
-- instead of rounding it on every line. Example: €114.28 net at 8% gives €9.14 VAT,
-- while per-line rounding gave €9.13. Also rejects confirming an empty entry.
-- Run once in Supabase → SQL Editor.

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
  if not exists (select 1 from public.stock_entry_items where entry_id = p_entry_id) then
    raise exception 'Hyrja nuk ka asnjë produkt';
  end if;

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
    from (select coalesce(sum(g.net), 0) as net,
                 coalesce(sum(round(g.net * g.vat_rate / 100, 2)), 0) as vat
            from (select vat_rate, sum(round(quantity * unit_cost, 2)) as net
                    from public.stock_entry_items where entry_id = p_entry_id
                   group by vat_rate) g) s
   where e.id = p_entry_id
  returning e.* into v_entry;

  return v_entry;
end $$;
