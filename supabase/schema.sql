-- ═══════════════════════════════════════════════════════════════
--  MIJOTÉ — schéma Supabase (v1.0.3) — relançable sans danger
--  1 compte Auth = 1 famille · family_id = auth.uid() · isolation RLS
--  v1.0.3 : ajout des droits (GRANT) pour le rôle authenticated
--           (corrige « 42501 permission denied for table records »)
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.records (
  family_id   uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  collection  text        not null check (collection in ('settings','members','recipes','meals','items','purchases','favorites')),
  id          text        not null check (char_length(id) between 1 and 200),
  data        jsonb       not null default '{}'::jsonb check (pg_column_size(data) < 3000000),
  deleted     boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default clock_timestamp(),
  version     integer     not null default 1,
  primary key (family_id, collection, id)
);

create index if not exists records_family_updated_idx on public.records (family_id, updated_at);

alter table public.records enable row level security;

drop policy if exists "famille: lecture"      on public.records;
drop policy if exists "famille: insertion"    on public.records;
drop policy if exists "famille: modification" on public.records;

create policy "famille: lecture" on public.records
  for select to authenticated using (family_id = auth.uid());
create policy "famille: insertion" on public.records
  for insert to authenticated with check (family_id = auth.uid());
create policy "famille: modification" on public.records
  for update to authenticated using (family_id = auth.uid()) with check (family_id = auth.uid());

-- Droits : anon n'a rien ; authenticated lit/écrit (filtré par RLS) ; pas de DELETE
revoke all on public.records from anon;
grant usage on schema public to authenticated;
grant select, insert, update on public.records to authenticated;
grant all on public.records to service_role;

create or replace function public.patch_record(
  p_collection text, p_id text, p_patch jsonb, p_deleted boolean default false
) returns public.records
language plpgsql security invoker set search_path = public
as $$
declare r public.records;
begin
  if auth.uid() is null then raise exception 'Non authentifié' using errcode = '28000'; end if;
  if jsonb_typeof(p_patch) <> 'object' then raise exception 'Patch invalide' using errcode = '22023'; end if;
  insert into public.records as t (family_id, collection, id, data, deleted)
  values (auth.uid(), p_collection, p_id, p_patch, coalesce(p_deleted, false))
  on conflict (family_id, collection, id) do update
     set data = t.data || excluded.data, deleted = excluded.deleted,
         updated_at = clock_timestamp(), version = t.version + 1
  returning * into r;
  return r;
end;
$$;

revoke all on function public.patch_record(text, text, jsonb, boolean) from public, anon;
grant execute on function public.patch_record(text, text, jsonb, boolean) to authenticated;

alter table public.records replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'records') then
    alter publication supabase_realtime add table public.records;
  end if;
end $$;

create or replace view public.v_recipes with (security_invoker = true) as
  select family_id, id, data->>'title' as title, data->>'authorId' as author_member_id,
         (data->>'servings')::int as servings, data->>'createdAt' as created_at,
         coalesce((data->>'archived')::boolean, false) as is_archived, updated_at
    from public.records where collection = 'recipes' and not deleted;

create or replace view public.v_meal_plans with (security_invoker = true) as
  select family_id, id, (data->>'date')::date as date, data->>'slot' as meal_type,
         data->>'recipeId' as recipe_id, data->>'title' as custom_title,
         (data->>'servings')::int as servings, updated_at
    from public.records where collection = 'meals' and not deleted;

grant select on public.v_recipes, public.v_meal_plans to authenticated;
