-- Phase 6: receipt options that the settings screen needs but the first schema lacked.
-- Run once in Supabase → SQL Editor.

alter table public.store_settings
  add column if not exists show_barcode boolean not null default true,
  add column if not exists receipt_copies int not null default 1 check (receipt_copies between 1 and 3);

-- Managers edit the single settings row; keep updated_at current.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_store_settings_updated on public.store_settings;
create trigger trg_store_settings_updated before update on public.store_settings
  for each row execute function public.touch_updated_at();
