-- Migration initiale Diang-Anglais : profils synchronisés, RLS, limites et fonctions utilitaires

create extension if not exists pgcrypto;

create table if not exists public.learner_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  kind text not null check (kind in ('adult', 'child')),
  data jsonb not null default '{}'::jsonb,
  version int not null default 2 check (version >= 1),
  updated_at timestamptz not null default now(),
  constraint learner_profiles_data_max_500kb check (pg_column_size(data) <= 512000)
);

create index if not exists learner_profiles_user_id_idx
  on public.learner_profiles (user_id, updated_at desc);

-- Limite stricte : 4 profils maximum par utilisateur
create or replace function public.enforce_max_learner_profiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_count int;
begin
  select count(*) into existing_count
  from public.learner_profiles
  where user_id = new.user_id;

  if existing_count >= 4 then
    raise exception 'Limite de 4 profils maximum par compte atteinte.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_max_learner_profiles on public.learner_profiles;
create trigger trg_enforce_max_learner_profiles
  before insert on public.learner_profiles
  for each row
  execute function public.enforce_max_learner_profiles();

-- Row Level Security : chaque utilisateur n'accède qu'à ses propres lignes
alter table public.learner_profiles enable row level security;

drop policy if exists "learner_profiles_select_own" on public.learner_profiles;
create policy "learner_profiles_select_own"
  on public.learner_profiles
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "learner_profiles_insert_own" on public.learner_profiles;
create policy "learner_profiles_insert_own"
  on public.learner_profiles
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "learner_profiles_update_own" on public.learner_profiles;
create policy "learner_profiles_update_own"
  on public.learner_profiles
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "learner_profiles_delete_own" on public.learner_profiles;
create policy "learner_profiles_delete_own"
  on public.learner_profiles
  for delete
  to authenticated
  using (user_id = auth.uid());

-- Suppression complète du compte utilisateur courant (cascade sur learner_profiles)
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_uid uuid := auth.uid();
begin
  if current_uid is null then
    raise exception 'Authentification requise pour supprimer le compte.';
  end if;

  delete from auth.users where id = current_uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

-- Keep-alive léger exécutable par anon (renvoie l'heure serveur)
create or replace function public.ping()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select now();
$$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
