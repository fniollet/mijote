-- ═══════════════════════════════════════════════════════════════
--  MIJOTÉ — mise à jour v1.0.x → v1.1  (à lancer UNE fois)
--  Supabase → SQL Editor → New query → coller → Run
--  Sans risque : n'efface aucune donnée, relançable.
-- ═══════════════════════════════════════════════════════════════

-- 1. Autoriser la nouvelle collection « stock »
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.records'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%collection%' loop
    execute format('alter table public.records drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.records add constraint records_collection_check
  check (collection in ('settings','members','recipes','meals','items','purchases','favorites','stock'));

-- 2. Droits (déjà corrigés en v1.0.3 — rappel sans effet si déjà fait)
grant usage on schema public to authenticated;
grant select, insert, update on public.records to authenticated;
grant execute on function public.patch_record(text, text, jsonb, boolean) to authenticated;

-- 3. Vue de lecture du stock (pour le suivi administrateur)
create or replace view public.v_stock with (security_invoker = true) as
  select family_id, id, data->>'name' as name, (data->>'qty')::numeric as qty, data->>'unit' as unit,
         data->>'location' as location, (data->>'expires')::date as expires, data->>'source' as source, updated_at
    from public.records where collection = 'stock' and not deleted;
grant select on public.v_stock to authenticated;

-- 4. Vérification : doit afficher la contrainte avec 'stock'
select pg_get_constraintdef(oid) as contrainte
from pg_constraint where conname = 'records_collection_check';
