create type public.app_role as enum ('admin', 'client');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.user_roles where user_id = _user_id and role = _role) $$;

create policy "own roles readable" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own profile readable" on public.profiles for select to authenticated using (id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)));
  if not exists (select 1 from public.user_roles where role = 'admin') then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'client');
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  title text not null,
  description text,
  status text not null default 'À faire',
  agent text not null default 'default',
  result text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tasks to authenticated;
grant all on public.tasks to service_role;
alter table public.tasks enable row level security;
create policy "clients read own tasks" on public.tasks for select to authenticated using (client_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "clients create own tasks" on public.tasks for insert to authenticated with check (client_id = auth.uid() and status = 'À faire');
create policy "admin updates tasks" on public.tasks for update to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin deletes tasks" on public.tasks for delete to authenticated using (public.has_role(auth.uid(),'admin'));

create table public.agents (
  id text primary key,
  role text not null,
  status text not null default 'hors ligne',
  current_task text,
  last_seen timestamptz
);
grant select on public.agents to authenticated;
grant all on public.agents to service_role;
alter table public.agents enable row level security;
create policy "agents readable" on public.agents for select to authenticated using (true);

insert into public.agents (id, role) values
 ('default','Orchestrateur + fullstack'),('architecte','Conception, découpage'),('dev-web','API + frontend web'),
 ('dev-mobile','Application Expo'),('qa','Tests, rapports de bugs'),('devops','Déploiement'),
 ('secu','Audit de sécurité'),('maintenance','Corrections + santé');

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.agents;