-- Phase 3: compute a sale's VAT once per VAT rate (as printed on the receipt),
-- instead of rounding it on every line. Example: 4 lines at 8% totalling €8.00
-- give €0.59 VAT, while per-line rounding gave €0.60.
-- Run once in Supabase → SQL Editor.

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
    if v_qty is null or v_qty <= 0 then raise exception 'Sasi e pavlefshme'; end if;
    select * into v_p from public.products where id = (v_item->>'product_id')::bigint and active for update;
    if not found then raise exception 'Produkti % nuk ekziston', v_item->>'product_id'; end if;

    v_line := round(v_p.sale_price * v_qty, 2);
    v_total := v_total + v_line;

    insert into public.sale_items (sale_id, product_id, name, quantity, unit_price, unit_cost, vat_rate, line_total)
    values (v_sale.id, v_p.id, v_p.name, v_qty, v_p.sale_price, v_p.cost_price, v_p.vat_rate, v_line);

    update public.products set stock = stock - v_qty, updated_at = now() where id = v_p.id;
    insert into public.stock_movements (product_id, type, quantity, ref_id) values (v_p.id, 'sale', -v_qty, v_sale.id);
  end loop;

  -- VAT per rate: vat = round(gross − gross / (1 + rate), 2), summed over rates.
  select coalesce(sum(round(g.gross - g.gross / (1 + g.vat_rate / 100), 2)), 0) into v_vat
    from (select vat_rate, sum(line_total) as gross
            from public.sale_items where sale_id = v_sale.id group by vat_rate) g;

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
