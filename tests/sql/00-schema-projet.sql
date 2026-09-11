-- Schéma minimal d'un projet type, sur lequel les migrations de la compétence
-- s'appliquent. Il ne fait PAS partie de ce qu'on livre à un client : il sert
-- uniquement de support aux tests, pour vérifier que les migrations
-- s'exécutent réellement sur une base PostgreSQL vierge.
--
-- Il reproduit les tables et les contraintes que le code de conformite/
-- suppose : notamment l'index UNIQUE sur utilisateurs.email, qui est ce qui
-- faisait échouer l'anonymisation.

create extension if not exists pgcrypto;

create table utilisateurs (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null unique,          -- l'unicité est le point sensible
  mot_de_passe_hash  text,
  nom                text,
  prenom             text,
  telephone          text,
  adresse            text,
  code_postal        text,
  ville              text,
  pays               text,
  avatar_url         text,
  langue             text default 'fr',
  newsletter         boolean not null default false,
  cree_le            timestamptz not null default now(),
  derniere_connexion_le timestamptz
);

create table sessions (
  id              bigserial primary key,
  utilisateur_id  uuid not null references utilisateurs(id) on delete cascade,
  expire_le       timestamptz not null
);

create table tokens_reinitialisation (
  id              bigserial primary key,
  utilisateur_id  uuid not null references utilisateurs(id) on delete cascade,
  token_hash      text not null,
  cree_le         timestamptz not null default now()
);

create table paniers (
  id bigserial primary key,
  utilisateur_id uuid not null references utilisateurs(id) on delete cascade,
  cree_le timestamptz not null default now()
);

create table favoris (
  id bigserial primary key,
  utilisateur_id uuid not null references utilisateurs(id) on delete cascade
);

create table adresses (
  id bigserial primary key,
  utilisateur_id uuid not null references utilisateurs(id) on delete cascade,
  libelle text, ligne1 text, ligne2 text,
  code_postal text, ville text, pays text,
  cree_le timestamptz not null default now()
);

create table notifications (
  id bigserial primary key,
  utilisateur_id uuid not null references utilisateurs(id) on delete cascade
);

create table fichiers (
  id bigserial primary key,
  utilisateur_id uuid not null references utilisateurs(id) on delete cascade,
  nom_original text, type_mime text, taille_octets bigint,
  chemin_stockage text not null,
  cree_le timestamptz not null default now()
);

create table commentaires (
  id bigserial primary key,
  auteur_id uuid references utilisateurs(id) on delete set null,
  auteur_nom text, auteur_email text,
  corps text
);

create table commandes (
  id bigserial primary key,
  utilisateur_id uuid references utilisateurs(id) on delete set null,
  reference text, statut text, total_ttc numeric, devise text,
  client_nom text, client_email text, client_telephone text,
  cree_le timestamptz not null default now(),
  livree_le timestamptz
);

create table lignes_commande (
  id bigserial primary key,
  commande_id bigint not null references commandes(id) on delete cascade,
  libelle text, quantite integer, prix_unitaire_ttc numeric
);

create table factures (
  id bigserial primary key,
  utilisateur_id uuid references utilisateurs(id) on delete set null,
  numero text, emise_le timestamptz not null default now(),
  total_ttc numeric, devise text,
  client_nom text, client_email text
);

create table messages (
  id bigserial primary key,
  expediteur_id uuid references utilisateurs(id) on delete set null,
  sujet text, corps text, cree_le timestamptz not null default now()
);

create table prospects (
  id bigserial primary key,
  email text, dernier_contact_le timestamptz
);

create table messages_contact (
  id bigserial primary key,
  email text, corps text, statut text default 'sans_suite',
  cree_le timestamptz not null default now()
);

create table abonnes_newsletter (
  id bigserial primary key,
  email text unique, desinscrit_le timestamptz
);

create table journal_acces (
  id bigserial primary key,
  utilisateur_id uuid, ip_empreinte text,
  cree_le timestamptz not null default now()
);

create table candidatures (
  id bigserial primary key,
  email text, recue_le timestamptz not null default now()
);

create table journal_consentement (
  id              bigserial primary key,
  visiteur_id     uuid        not null,
  action          text        not null
                    check (action in ('accepter','refuser','personnaliser','retirer')),
  categories      jsonb       not null,
  version_bandeau integer     not null,
  chemin          text,
  ip_empreinte    text,
  agent           text,
  horodatage      timestamptz not null default now(),
  cree_le         timestamptz not null default now()
);
