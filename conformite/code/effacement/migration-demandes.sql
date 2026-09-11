-- Registre des demandes d'exercice de droits + cycle de suppression de compte.
--
-- Le délai légal d'un mois se prouve ; un refus partiel doit être motivé
-- et retrouvable. Sans ce registre, ni l'un ni l'autre n'est démontrable.
--
-- Ordre d'application : cette migration d'abord, puis retention/migration.sql.
-- Les deux sont idempotentes et peuvent être rejouées sans dommage.

-- 0. Extensions requises ------------------------------------------------------
-- digest() sert à conserver une empreinte de l'email sans l'adresse en clair.
-- Ne jamais supposer que l'extension est déjà présente chez l'hébergeur du
-- client. Sur Supabase, pgcrypto est fournie dans le schéma "extensions" et
-- le « if not exists » rend l'instruction inoffensive.

create extension if not exists pgcrypto;

-- 1. Registre des demandes ----------------------------------------------------

create table if not exists demandes_rgpd (
  id              bigserial   primary key,
  utilisateur_id  uuid        references utilisateurs(id) on delete set null,

  -- Pour une demande venue par email, sans compte associé :
  demandeur_email text,
  identite_verifiee_par text,   -- 'session' | 'piece_identite' | 'email_confirme'

  type text not null check (type in (
    'acces',        -- art. 15
    'rectification',-- art. 16
    'effacement',   -- art. 17
    'limitation',   -- art. 18
    'portabilite',  -- art. 20
    'opposition'    -- art. 21
  )),

  statut text not null default 'recue' check (statut in (
    'recue', 'en_cours', 'traitee', 'refusee', 'partiellement_traitee', 'annulee'
  )),

  canal text,                   -- 'application' | 'email' | 'courrier'
  note  text,                   -- motivation d'un refus, échecs sous-traitants

  -- Rétractation d'une demande d'effacement. Le compte étant désactivé dès la
  -- phase 1, la personne ne peut plus se connecter : le lien reçu par email
  -- est le seul chemin de retour. Le jeton est stocké HACHÉ — si la base
  -- fuite, les jetons ne sont pas rejouables.
  annulation_token_hash text,
  annulation_expire_le  timestamptz,

  cree_le      timestamptz not null default now(),

  -- Délai légal de réponse. Colonne ORDINAIRE alimentée par un déclencheur,
  -- et non colonne générée, pour deux raisons :
  --
  --   1. PostgreSQL exige qu'une expression GENERATED soit IMMUTABLE.
  --      « cree_le + interval '1 month' » sur un timestamptz passe par
  --      timestamptz_pl_interval, qui est STABLE (l'arithmétique en mois
  --      dépend du fuseau de session). Le CREATE TABLE échouait donc avec
  --      « generation expression is not immutable ».
  --
  --   2. Une colonne GENERATED ALWAYS ne peut jamais être mise à jour. Or le
  --      RGPD autorise la prolongation du délai à 3 mois (art. 12.3) si la
  --      personne en est informée dans le premier mois. Le déclencheur ne
  --      calcule l'échéance que si elle n'a pas été fixée explicitement, ce
  --      qui rend cette prolongation possible.
  echeance_le  timestamptz,

  traitee_le   timestamptz
);

create or replace function demandes_rgpd_echeance()
returns trigger
language plpgsql
as $$
begin
  if new.echeance_le is null then
    new.echeance_le := new.cree_le + interval '1 month';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_demandes_rgpd_echeance on demandes_rgpd;
create trigger trg_demandes_rgpd_echeance
  before insert or update of cree_le, echeance_le on demandes_rgpd
  for each row execute function demandes_rgpd_echeance();

-- Rattrapage des lignes éventuellement insérées avant la pose du déclencheur.
update demandes_rgpd
   set echeance_le = cree_le + interval '1 month'
 where echeance_le is null;

-- Rattrapage pour une base où la table existait déjà sans ces colonnes.
alter table demandes_rgpd
  add column if not exists annulation_token_hash text,
  add column if not exists annulation_expire_le  timestamptz;

create index if not exists idx_demandes_rgpd_statut on demandes_rgpd (statut, cree_le);
create index if not exists idx_demandes_rgpd_user   on demandes_rgpd (utilisateur_id);
create index if not exists idx_demandes_rgpd_annulation
  on demandes_rgpd (annulation_token_hash)
  where annulation_token_hash is not null;

comment on column demandes_rgpd.echeance_le is
  'Delai legal de reponse : 1 mois par defaut (pose par trigger), prolongeable '
  'a 3 mois si la personne est informee dans le premier mois (RGPD art. 12.3). '
  'Renseigner explicitement la colonne pour acter la prolongation.';

-- 2. Cycle de suppression de compte -------------------------------------------
-- Modèle en deux temps :
--   Phase 1 (immédiate) : le compte est désactivé, les accès sont coupés.
--   Phase 2 (différée)  : les données sont réellement détruites/anonymisées.
-- La fenêtre entre les deux est la fenêtre de rétractation.

alter table utilisateurs
  add column if not exists supprime_le         timestamptz,
  add column if not exists purge_prevue_le     timestamptz,
  add column if not exists purge_effectuee_le  timestamptz,
  add column if not exists email_original_hash text,
  add column if not exists anonymise_le        timestamptz,
  add column if not exists actif               boolean not null default true;

comment on column utilisateurs.supprime_le is
  'Phase 1 : date de la demande de suppression. Le compte est desactive mais '
  'les donnees sont encore presentes : la retractation est possible.';
comment on column utilisateurs.purge_prevue_le is
  'Fin de la fenetre de retractation. Au-dela, purger_comptes_supprimes() '
  'detruit les donnees. Duree : choix metier, pas une duree legale.';
comment on column utilisateurs.purge_effectuee_le is
  'Phase 2 : date de la destruction effective. Une fois renseignee, la '
  'retractation n''est plus possible.';

create index if not exists idx_utilisateurs_purge
  on utilisateurs (purge_prevue_le)
  where supprime_le is not null and purge_effectuee_le is null;

-- 3. Phase 2 — destruction définitive, atomique -------------------------------
-- Écrite en SQL plutôt qu'en TypeScript : une fonction PL/pgSQL s'exécute dans
-- une transaction implicite, donc soit tout passe, soit rien. C'est exactement
-- la garantie qu'il faut sur une opération irréversible.
--
-- Les ressources NON transactionnelles (fichiers du stockage objet, contacts
-- chez les sous-traitants) ne sont PAS traitées ici : leurs chemins sont
-- remontés à l'appelant, qui les supprime APRÈS validation de la transaction.

create or replace function purger_comptes_supprimes(p_limite integer default 500)
returns table (
  compte_id        uuid,
  fichiers_chemins text[]
)
language plpgsql
security invoker
set search_path = public, extensions
as $$
declare
  v_id    uuid;
  v_email text;
begin
  for v_id, v_email in
    select u.id, u.email
      from utilisateurs u
     where u.supprime_le is not null
       and u.purge_effectuee_le is null
       and u.purge_prevue_le <= now()
     order by u.purge_prevue_le
     limit p_limite
     for update skip locked
  loop
    compte_id := v_id;

    -- Chemins des objets à supprimer hors base, relevés AVANT que les lignes
    -- ne disparaissent.
    select coalesce(array_agg(f.chemin_stockage), '{}')
      into fichiers_chemins
      from fichiers f
     where f.utilisateur_id = v_id;

    -- 3.1 Données sans valeur légale : suppression sèche.
    delete from sessions                where utilisateur_id = v_id;
    delete from tokens_reinitialisation where utilisateur_id = v_id;
    delete from paniers                 where utilisateur_id = v_id;
    delete from favoris                 where utilisateur_id = v_id;
    delete from adresses                where utilisateur_id = v_id;
    delete from notifications           where utilisateur_id = v_id;
    delete from fichiers                where utilisateur_id = v_id;

    -- 3.2 Contenus publics : on coupe le lien sans casser les fils des autres.
    update commentaires
       set auteur_id = null, auteur_nom = 'Utilisateur supprimé', auteur_email = null
     where auteur_id = v_id;

    -- 3.3 Pièces à conservation légale : on garde le document, on retire
    -- l'identité vivante. La durée de conservation de la pièce comptable
    -- elle-même est pilotée par politique-retention.ts.
    update commandes
       set client_nom = 'Client supprimé', client_email = null, client_telephone = null
     where utilisateur_id = v_id;
    update factures
       set client_nom = 'Client supprimé', client_email = null
     where utilisateur_id = v_id;

    -- 3.4 Le compte lui-même. L'email est remplacé par une valeur unique
    -- PAR LIGNE — gen_random_uuid() est réévalué à chaque appel — pour ne
    -- pas heurter l'index unique sur email.
    update utilisateurs
       set email               = 'supprime+' || gen_random_uuid() || '@invalide.local',
           email_original_hash = encode(digest(v_email, 'sha256'), 'hex'),
           nom = 'Compte supprimé', prenom = null, telephone = null,
           avatar_url = null, mot_de_passe_hash = null,
           actif = false,
           anonymise_le = now(),
           purge_effectuee_le = now()
     where id = v_id;

    -- La rétractation n'est plus possible : on invalide le jeton en même
    -- temps qu'on clôt la demande, dans la même transaction.
    update demandes_rgpd d
       set statut = 'traitee', traitee_le = now(),
           annulation_token_hash = null, annulation_expire_le = null
     where d.utilisateur_id = v_id
       and d.type = 'effacement'
       and d.statut in ('recue', 'en_cours');

    return next;
  end loop;
end;
$$;

comment on function purger_comptes_supprimes(integer) is
  'Phase 2 de la suppression de compte : destruction definitive des comptes '
  'dont la fenetre de retractation est echue. Atomique. Retourne les chemins '
  'des fichiers a supprimer du stockage objet par l''appelant.';

-- 4. Supervision ---------------------------------------------------------------
-- Demandes en retard ou proches de l'échéance : à surveiller, idéalement
-- avec une alerte, car le dépassement du délai est un manquement en soi.

create or replace view demandes_rgpd_a_traiter as
  select id, type, statut, cree_le, echeance_le,
         (echeance_le < now())                     as en_retard,
         (echeance_le - now() < interval '7 days') as urgente
    from demandes_rgpd
   where statut in ('recue', 'en_cours')
   order by echeance_le asc;

-- Comptes en attente de purge définitive : ce que la prochaine exécution
-- de purger_comptes_supprimes() traiterait.
create or replace view comptes_a_purger as
  select id, supprime_le, purge_prevue_le,
         (purge_prevue_le <= now()) as echu
    from utilisateurs
   where supprime_le is not null
     and purge_effectuee_le is null
   order by purge_prevue_le asc;
