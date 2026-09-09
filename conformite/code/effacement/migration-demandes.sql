-- Registre des demandes d'exercice de droits.
-- Le délai légal d'un mois se prouve ; un refus partiel doit être motivé
-- et retrouvable. Sans ce registre, ni l'un ni l'autre n'est démontrable.

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
    'recue', 'en_cours', 'traitee', 'refusee', 'partiellement_traitee'
  )),

  canal text,                   -- 'application' | 'email' | 'courrier'
  note  text,                   -- motivation d'un refus, échecs sous-traitants

  cree_le      timestamptz not null default now(),
  echeance_le  timestamptz generated always as (cree_le + interval '1 month') stored,
  traitee_le   timestamptz
);

create index if not exists idx_demandes_rgpd_statut on demandes_rgpd (statut, cree_le);
create index if not exists idx_demandes_rgpd_user   on demandes_rgpd (utilisateur_id);

comment on column demandes_rgpd.echeance_le is
  'Délai légal de réponse : 1 mois, prolongeable à 3 mois si notifié dans le premier mois';

-- Colonnes de suppression sur la table utilisateurs -------------------------

alter table utilisateurs
  add column if not exists supprime_le         timestamptz,
  add column if not exists purge_prevue_le     timestamptz,
  add column if not exists email_original_hash text,
  add column if not exists actif               boolean not null default true;

create index if not exists idx_utilisateurs_purge
  on utilisateurs (purge_prevue_le) where supprime_le is not null;

-- Supervision ---------------------------------------------------------------
-- Demandes en retard ou proches de l'échéance : à surveiller, idéalement
-- avec une alerte, car le dépassement du délai est un manquement en soi.

create or replace view demandes_rgpd_a_traiter as
  select id, type, statut, cree_le, echeance_le,
         (echeance_le < now())                     as en_retard,
         (echeance_le - now() < interval '7 days') as urgente
    from demandes_rgpd
   where statut in ('recue', 'en_cours')
   order by echeance_le asc;
