-- Rétention — colonnes de suivi, journal des purges, index.
-- Adapter les noms de tables au projet.
--
-- S'applique APRÈS effacement/migration-demandes.sql, qui crée pgcrypto et les
-- colonnes du cycle de suppression. Les deux sont idempotentes et peuvent être
-- rejouées sans dommage.

-- 1. Suivre l'anonymisation ---------------------------------------------------
-- Distingue un compte anonymisé d'un compte encore actif, et date l'opération.
--
-- anonymise_le n'est pas qu'une trace : c'est le `marqueurTraite` de la règle
-- de rétention. La purge exclut les lignes dont il est renseigné, ce qui la
-- rend idempotente. Le supprimer casserait cette garantie.

alter table utilisateurs
  add column if not exists anonymise_le timestamptz,
  add column if not exists supprime_le  timestamptz,
  add column if not exists derniere_connexion_le timestamptz;

comment on column utilisateurs.anonymise_le is
  'Date d''anonymisation au titre de la politique de conservation (purge '
  'automatique). Sert aussi de marqueur d''idempotence : une ligne renseignee '
  'n''est plus reprise par la purge.';
comment on column utilisateurs.supprime_le is
  'Date de suppression a la demande de la personne (droit a l''effacement)';

-- 2. Index sur les colonnes de purge ------------------------------------------
-- Sans eux, la purge fait un balayage complet chaque nuit.
-- Les index partiels reprennent exactement la clause de la règle
-- correspondante dans politique-retention.ts, marqueur compris.

create index if not exists idx_utilisateurs_derniere_connexion
  on utilisateurs (derniere_connexion_le)
  where supprime_le is null and anonymise_le is null;

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
  erreurs       integer     not null default 0,
  -- Chemins du stockage objet restant à supprimer : le stockage n'est pas
  -- transactionnel, un échec de suppression doit pouvoir être repris.
  fichiers_en_attente jsonb not null default '[]'::jsonb
);

alter table journal_purge
  add column if not exists fichiers_en_attente jsonb not null default '[]'::jsonb;

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
-- garantit pas l'exécution d'un cron applicatif.
--
-- ATTENTION — cette fonction ne couvre QUE les trois purges techniques sans
-- enjeu (sessions, jetons, journaux). Elle ne duplique volontairement pas la
-- politique complète : deux définitions des mêmes durées finiraient par
-- diverger, et c'est politique-retention.ts qui fait foi. Tout ce qui touche
-- aux données personnelles passe par purge.ts ou par
-- purger_comptes_supprimes().

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

-- SECURITY DEFINER fait tourner la fonction avec les droits de son
-- propriétaire. Laissée exécutable par tout le monde, elle offrirait à
-- n'importe quel rôle — y compris `anon` sur Supabase, qui est le rôle du
-- navigateur — un moyen de déclencher des suppressions. On retire donc le
-- droit par défaut et on ne l'accorde qu'au rôle qui planifie la tâche.
revoke all on function purge_quotidienne() from public;
-- À décommenter en l'adaptant au rôle réel de votre ordonnanceur :
-- grant execute on function purge_quotidienne() to postgres;

-- purger_comptes_supprimes() est en SECURITY INVOKER (elle s'exécute avec les
-- droits de l'appelant, donc sans élévation), mais il n'y a aucune raison de
-- l'exposer au rôle public non plus.
revoke all on function purger_comptes_supprimes(integer) from public;

-- 5. Vérification -------------------------------------------------------------
-- Ce que la prochaine purge traiterait, sans rien modifier. Les clauses
-- reproduisent celles de politique-retention.ts, marqueur d'idempotence inclus.
--
--   select 'prospects' as table_cible, count(*)
--     from prospects where dernier_contact_le < now() - interval '3 years'
--   union all
--   select 'utilisateurs inactifs', count(*)
--     from utilisateurs
--    where derniere_connexion_le < now() - interval '3 years'
--      and supprime_le is null and anonymise_le is null
--   union all
--   select 'comptes a purger (retractation echue)', count(*)
--     from comptes_a_purger where echu;
