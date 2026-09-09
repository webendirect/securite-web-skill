-- Rétention — colonnes de suivi, journal des purges, index.
-- Adapter les noms de tables au projet.

-- 1. Suivre l'anonymisation ---------------------------------------------------
-- Distingue un compte anonymisé d'un compte encore actif, et date l'opération.

alter table utilisateurs
  add column if not exists anonymise_le timestamptz,
  add column if not exists supprime_le  timestamptz,
  add column if not exists derniere_connexion_le timestamptz;

comment on column utilisateurs.anonymise_le is
  'Date d''anonymisation au titre de la politique de conservation (purge automatique)';
comment on column utilisateurs.supprime_le is
  'Date de suppression à la demande de la personne (droit à l''effacement)';

-- 2. Index sur les colonnes de purge ------------------------------------------
-- Sans eux, la purge fait un balayage complet chaque nuit.

create index if not exists idx_utilisateurs_derniere_connexion
  on utilisateurs (derniere_connexion_le) where supprime_le is null;

create index if not exists idx_prospects_dernier_contact
  on prospects (dernier_contact_le);

create index if not exists idx_messages_contact_cree
  on messages_contact (cree_le);

create index if not exists idx_journal_acces_cree
  on journal_acces (cree_le);

-- 3. Journal des purges -------------------------------------------------------
-- Preuve que la politique est réellement appliquée, et pas seulement écrite.

create table if not exists journal_purge (
  id            bigserial   primary key,
  execute_le    timestamptz not null default now(),
  resultats     jsonb       not null,
  lignes_total  integer     not null default 0,
  erreurs       integer     not null default 0
);

create index if not exists idx_journal_purge_execute
  on journal_purge (execute_le desc);

-- 4. Planification native Postgres (optionnelle) ------------------------------
-- Sur Supabase, activer l'extension pg_cron puis :
--
--   select cron.schedule(
--     'purge-quotidienne',
--     '0 3 * * *',
--     $$ select purge_quotidienne(); $$
--   );
--
-- Une fonction SQL est plus robuste qu'un script externe si l'hébergement ne
-- garantit pas l'exécution d'un cron applicatif. Exemple minimal :

create or replace function purge_quotidienne() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  n_total integer := 0;
  n integer;
begin
  delete from sessions where expire_le < now();
  get diagnostics n = row_count; n_total := n_total + n;

  delete from tokens_reinitialisation where cree_le < now() - interval '7 days';
  get diagnostics n = row_count; n_total := n_total + n;

  delete from journal_acces where cree_le < now() - interval '12 months';
  get diagnostics n = row_count; n_total := n_total + n;

  insert into journal_purge (resultats, lignes_total)
  values ('{"source":"purge_quotidienne"}'::jsonb, n_total);
end;
$$;

-- 5. Vérification -------------------------------------------------------------
-- Ce que la prochaine purge traiterait, sans rien modifier :
--
--   select 'prospects' as table_cible, count(*)
--     from prospects where dernier_contact_le < now() - interval '3 years'
--   union all
--   select 'utilisateurs inactifs', count(*)
--     from utilisateurs
--    where derniere_connexion_le < now() - interval '3 years'
--      and supprime_le is null and anonymise_le is null;
