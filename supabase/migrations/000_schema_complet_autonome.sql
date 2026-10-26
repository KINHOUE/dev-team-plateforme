-- =====================================================================
-- Dev-Team — schéma complet, autonome (sans Lovable)
-- À exécuter dans le SQL Editor d'un projet Supabase NEUF.
-- Idempotent : peut être relancé sans casser l'existant.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. Enum des rôles
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'client');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------

-- Profils (miroir de auth.users)
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- Rôles applicatifs
create table if not exists public.user_roles (
  id      uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role    public.app_role not null,
  unique (user_id, role)
);

-- Agents de l'équipe
create table if not exists public.agents (
  id           text primary key,
  role         text not null,
  status       text not null default 'hors ligne',
  current_task text,
  last_seen    timestamptz
);

-- Demandes clients
create table if not exists public.tasks (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references auth.users(id) on delete cascade,
  title       text not null,
  description text,
  status      text not null default 'À faire',
  agent       text not null default '',
  result      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Abonnements Paddle
create table if not exists public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users(id) on delete cascade,
  paddle_subscription_id text not null unique,
  paddle_customer_id     text not null,
  product_id             text not null,
  price_id               text not null,
  status                 text not null default 'active',
  environment            text not null default 'sandbox',
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Index
-- ---------------------------------------------------------------------
create index if not exists tasks_client_idx        on public.tasks (client_id);
create index if not exists tasks_status_idx        on public.tasks (status);
create index if not exists tasks_created_idx       on public.tasks (created_at desc);
create index if not exists subs_user_idx           on public.subscriptions (user_id);
create index if not exists subs_status_idx         on public.subscriptions (status);
create index if not exists user_roles_user_idx     on public.user_roles (user_id);

-- ---------------------------------------------------------------------
-- 4. Fonctions utilitaires
-- ---------------------------------------------------------------------

-- L'utilisateur courant est-il administrateur ?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

-- Un utilisateur donné possède-t-il un rôle donné ?
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  );
$$;

-- Un utilisateur donné a-t-il un abonnement actif ?
create or replace function public.has_active_subscription(user_uuid uuid, check_env text default null)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = user_uuid
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
      and (check_env is null or s.environment = check_env)
  );
$$;

-- Quota de demandes actives selon la formule
create or replace function public.plan_task_limit(p_user uuid)
returns integer
language sql stable security definer set search_path = public
as $$
  select case
    when exists (select 1 from public.user_roles where user_id = p_user and role = 'admin') then 1000
    when public.has_active_subscription(p_user) then 1000
    else 1
  end;
$$;

-- Création automatique du profil et du rôle à l'inscription
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'client')
  on conflict (user_id, role) do nothing;

  return new;
end;
$$;

-- Met à jour updated_at automatiquement
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Bloque l'insertion d'une demande au-delà du quota de la formule
create or replace function public.enforce_task_quota()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  active_count integer;
  max_allowed  integer;
begin
  select count(*) into active_count
  from public.tasks
  where client_id = new.client_id and status <> 'Terminé';

  max_allowed := public.plan_task_limit(new.client_id);

  if active_count >= max_allowed then
    raise exception
      'Limite de demandes actives atteinte pour votre formule (% maximum). Terminez une demande ou passez a une formule superieure.',
      max_allowed
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists tasks_touch_updated_at on public.tasks;
create trigger tasks_touch_updated_at
  before update on public.tasks
  for each row execute function public.touch_updated_at();

drop trigger if exists subs_touch_updated_at on public.subscriptions;
create trigger subs_touch_updated_at
  before update on public.subscriptions
  for each row execute function public.touch_updated_at();

drop trigger if exists tasks_quota_check on public.tasks;
create trigger tasks_quota_check
  before insert on public.tasks
  for each row execute function public.enforce_task_quota();

-- ---------------------------------------------------------------------
-- 6. Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.user_roles    enable row level security;
alter table public.tasks         enable row level security;
alter table public.agents        enable row level security;
alter table public.subscriptions enable row level security;

-- PROFILES
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- USER_ROLES
drop policy if exists "roles_select_own" on public.user_roles;
create policy "roles_select_own" on public.user_roles
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "roles_admin_manage" on public.user_roles;
create policy "roles_admin_manage" on public.user_roles
  for all using (public.is_admin()) with check (public.is_admin());

-- TASKS
drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own" on public.tasks
  for select using (auth.uid() = client_id or public.is_admin());

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own" on public.tasks
  for insert with check (auth.uid() = client_id);

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own" on public.tasks
  for update using (auth.uid() = client_id or public.is_admin())
  with check (auth.uid() = client_id or public.is_admin());

drop policy if exists "tasks_delete_admin" on public.tasks;
create policy "tasks_delete_admin" on public.tasks
  for delete using (public.is_admin());

-- AGENTS
drop policy if exists "agents_select_authenticated" on public.agents;
create policy "agents_select_authenticated" on public.agents
  for select to authenticated using (true);

drop policy if exists "agents_admin_manage" on public.agents;
create policy "agents_admin_manage" on public.agents
  for all using (public.is_admin()) with check (public.is_admin());

-- SUBSCRIPTIONS
drop policy if exists "subs_select_own" on public.subscriptions;
create policy "subs_select_own" on public.subscriptions
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "subs_admin_manage" on public.subscriptions;
create policy "subs_admin_manage" on public.subscriptions
  for all using (public.is_admin()) with check (public.is_admin());

-- Le webhook Paddle écrit avec la clé service_role : elle contourne la RLS.

-- ---------------------------------------------------------------------
-- 7. Données initiales — les 8 agents de l'unité dev
-- ---------------------------------------------------------------------
insert into public.agents (id, role, status) values
  ('default',    'Orchestrateur + fullstack', 'hors ligne'),
  ('architecte', 'Conception, découpage',     'hors ligne'),
  ('dev-web',    'API + frontend web',        'hors ligne'),
  ('dev-mobile', 'Application Expo',          'hors ligne'),
  ('qa',         'Tests, rapports de bugs',   'hors ligne'),
  ('secu',       'Audit de sécurité',         'hors ligne'),
  ('devops',     'Déploiement',               'hors ligne'),
  ('maintenance','Corrections + santé',       'hors ligne')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 8. Droits d'accès (RLS filtre ensuite ligne par ligne)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

-- Les rôles authentifiés peuvent manipuler les tables ; la RLS décide quoi.
grant select, insert, update, delete on public.profiles      to authenticated;
grant select, insert, update, delete on public.user_roles    to authenticated;
grant select, insert, update, delete on public.tasks         to authenticated;
grant select, insert, update, delete on public.agents        to authenticated;
grant select, insert, update, delete on public.subscriptions to authenticated;

-- Les visiteurs non connectés n'ont accès à rien
revoke all on public.profiles      from anon;
revoke all on public.user_roles    from anon;
revoke all on public.tasks         from anon;
revoke all on public.agents        from anon;
revoke all on public.subscriptions from anon;

-- Les tables créées plus tard auront les mêmes droits par défaut
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

grant execute on function public.is_admin()                          to authenticated, anon;
grant execute on function public.has_role(uuid, public.app_role)     to authenticated, anon;
grant execute on function public.has_active_subscription(uuid, text) to authenticated, anon;
grant execute on function public.plan_task_limit(uuid)               to authenticated, anon;

-- =====================================================================
-- Fin. Vérification rapide :
--   select count(*) from public.agents;          -- doit renvoyer 8
--   select public.plan_task_limit(auth.uid());   -- doit renvoyer 1
-- =====================================================================
