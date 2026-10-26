-- =====================================================================
-- Correctif : droits des rôles sur les tables du schéma public
-- À exécuter APRÈS le schéma complet. Idempotent.
-- =====================================================================

-- Le rôle serveur (service_role) doit pouvoir tout faire : il contourne la RLS
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- Les utilisateurs connectés passent par la RLS
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Les visiteurs non connectés n'ont aucun accès aux données
revoke all on all tables in schema public from anon;

-- Les futures tables créées garderont ces droits
alter default privileges in schema public
  grant all on tables to service_role;
alter default privileges in schema public
  grant all on sequences to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- Vérification
select
  tablename,
  has_table_privilege('service_role', 'public.' || tablename, 'SELECT') as service_role_select,
  has_table_privilege('authenticated', 'public.' || tablename, 'SELECT') as authenticated_select
from pg_tables
where schemaname = 'public'
order by tablename;
