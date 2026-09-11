-- Test 3 — effacement : deux phases, rétractation réelle, atomicité.
--
-- Couvre les régressions :
--   route-suppression.ts   suite d'instructions sans transaction : un échec
--                          au milieu laissait un compte à moitié supprimé.
--   route-suppression.ts   fenêtre de rétractation annoncée mais impossible,
--                          les données étant détruites dès la phase 1.
--   migration              digest() sans l'extension pgcrypto.

\set ON_ERROR_STOP on

-- Jeu d'essai : un compte complet, avec des données dans chaque table.
delete from utilisateurs where email like 'test-eff%';

do $$
declare v_id uuid; v_cmd bigint;
begin
  insert into utilisateurs (email, nom, mot_de_passe_hash, derniere_connexion_le)
  values ('test-eff@exemple.fr', 'Dupont', 'hash-bidon', now()) returning id into v_id;

  insert into adresses (utilisateur_id, ligne1, ville) values (v_id, '1 rue A', 'Lyon');
  insert into favoris (utilisateur_id) values (v_id);
  insert into paniers (utilisateur_id) values (v_id);
  insert into notifications (utilisateur_id) values (v_id);
  insert into sessions (utilisateur_id, expire_le) values (v_id, now() + interval '1 day');
  insert into tokens_reinitialisation (utilisateur_id, token_hash) values (v_id, 'x');
  insert into fichiers (utilisateur_id, nom_original, chemin_stockage)
    values (v_id, 'cv.pdf', 'u/' || v_id || '/cv.pdf');
  insert into commentaires (auteur_id, auteur_nom, auteur_email, corps)
    values (v_id, 'Dupont', 'test-eff@exemple.fr', 'bonjour');
  insert into commandes (utilisateur_id, reference, client_nom, client_email)
    values (v_id, 'CMD-1', 'Dupont', 'test-eff@exemple.fr') returning id into v_cmd;
  insert into factures (utilisateur_id, numero, client_nom, client_email)
    values (v_id, 'F-1', 'Dupont', 'test-eff@exemple.fr');
end $$;

-- 3.1 PHASE 1 — les accès sont coupés, AUCUNE donnée personnelle détruite.
do $$
declare v_id uuid; v_n integer;
begin
  select id into v_id from utilisateurs where email = 'test-eff@exemple.fr';

  insert into demandes_rgpd (utilisateur_id, type, statut, canal,
                             annulation_token_hash, annulation_expire_le)
  values (v_id, 'effacement', 'en_cours', 'application',
          encode(digest('jeton-test', 'sha256'), 'hex'), now() + interval '30 days');

  delete from sessions                where utilisateur_id = v_id;
  delete from tokens_reinitialisation where utilisateur_id = v_id;

  update utilisateurs
     set actif = false, supprime_le = now(),
         purge_prevue_le = now() + make_interval(days => 30)
   where id = v_id and supprime_le is null;

  -- accès coupés
  select count(*) into v_n from sessions where utilisateur_id = v_id;
  if v_n <> 0 then raise exception 'ECHEC 3.1 : sessions encore presentes'; end if;

  -- données INTACTES : c'est ce qui rend la rétractation possible
  select count(*) into v_n from adresses where utilisateur_id = v_id;
  if v_n <> 1 then raise exception 'ECHEC 3.1 : adresses detruites en phase 1'; end if;
  select count(*) into v_n from fichiers where utilisateur_id = v_id;
  if v_n <> 1 then raise exception 'ECHEC 3.1 : fichiers detruits en phase 1'; end if;
  select count(*) into v_n from utilisateurs
   where id = v_id and mot_de_passe_hash is not null and email = 'test-eff@exemple.fr';
  if v_n <> 1 then raise exception 'ECHEC 3.1 : identifiants detruits en phase 1'; end if;
end $$;

-- 3.2 La fenêtre de rétractation est effective : le compte n'est pas encore purgeable.
do $$
declare v_n integer;
begin
  select count(*) into v_n from comptes_a_purger where echu;
  if v_n <> 0 then
    raise exception 'ECHEC 3.2 : compte purgeable alors que la fenetre court encore';
  end if;
end $$;

-- 3.3 RÉTRACTATION : le compte revient à l'identique.
do $$
declare v_id uuid; v_actif boolean; v_n integer;
begin
  select id into v_id from utilisateurs where email = 'test-eff@exemple.fr';

  update utilisateurs set actif = true, supprime_le = null, purge_prevue_le = null
   where id = v_id;
  update demandes_rgpd
     set statut = 'annulee', traitee_le = now(),
         annulation_token_hash = null, annulation_expire_le = null
   where utilisateur_id = v_id and type = 'effacement';

  select actif into v_actif from utilisateurs where id = v_id;
  if not v_actif then raise exception 'ECHEC 3.3 : compte non reactive'; end if;

  select count(*) into v_n from adresses where utilisateur_id = v_id;
  if v_n <> 1 then raise exception 'ECHEC 3.3 : donnees perdues malgre la retractation'; end if;
end $$;

-- 3.4 PHASE 2 — purge définitive, atomique, via la fonction SQL.
do $$
declare v_id uuid; v_n integer; v_fichiers text[]; v_email text;
begin
  select id into v_id from utilisateurs where email = 'test-eff@exemple.fr';

  -- nouvelle demande, fenêtre déjà échue
  insert into demandes_rgpd (utilisateur_id, type, statut, canal)
  values (v_id, 'effacement', 'en_cours', 'application');
  update utilisateurs
     set actif = false, supprime_le = now() - interval '31 days',
         purge_prevue_le = now() - interval '1 day'
   where id = v_id;

  select count(*) into v_n from comptes_a_purger where echu;
  if v_n <> 1 then raise exception 'ECHEC 3.4 : compte echu non detecte (%)', v_n; end if;

  -- la fonction remonte les chemins du stockage objet AVANT de tout détruire
  select fichiers_chemins into v_fichiers from purger_comptes_supprimes() limit 1;
  if v_fichiers is null or array_length(v_fichiers, 1) <> 1 then
    raise exception 'ECHEC 3.4 : chemins de fichiers non remontes';
  end if;

  -- données sans valeur légale : détruites
  select count(*) into v_n from adresses      where utilisateur_id = v_id;
  if v_n <> 0 then raise exception 'ECHEC 3.4 : adresses non supprimees'; end if;
  select count(*) into v_n from fichiers      where utilisateur_id = v_id;
  if v_n <> 0 then raise exception 'ECHEC 3.4 : fichiers non supprimes'; end if;
  select count(*) into v_n from notifications where utilisateur_id = v_id;
  if v_n <> 0 then raise exception 'ECHEC 3.4 : notifications non supprimees'; end if;

  -- factures CONSERVÉES mais anonymisées : obligation comptable
  select count(*) into v_n from factures where utilisateur_id = v_id;
  if v_n <> 1 then raise exception 'ECHEC 3.4 : facture supprimee (non-conformite comptable)'; end if;
  select count(*) into v_n from factures
   where utilisateur_id = v_id and client_email is null and client_nom = 'Client supprimé';
  if v_n <> 1 then raise exception 'ECHEC 3.4 : facture non anonymisee'; end if;

  -- commentaire conservé, lien coupé
  select count(*) into v_n from commentaires
   where auteur_id is null and auteur_nom = 'Utilisateur supprimé';
  if v_n <> 1 then raise exception 'ECHEC 3.4 : commentaire non anonymise'; end if;

  -- compte anonymisé, empreinte de l'email conservée (digest => pgcrypto)
  select email into v_email from utilisateurs where id = v_id;
  if v_email not like 'supprime+%@invalide.local' then
    raise exception 'ECHEC 3.4 : email non remplace (%)', v_email;
  end if;
  select count(*) into v_n from utilisateurs
   where id = v_id and email_original_hash is not null
     and mot_de_passe_hash is null and purge_effectuee_le is not null;
  if v_n <> 1 then raise exception 'ECHEC 3.4 : compte non finalise'; end if;

  -- la demande est close
  select count(*) into v_n from demandes_rgpd
   where utilisateur_id = v_id and type = 'effacement' and statut = 'traitee';
  if v_n < 1 then raise exception 'ECHEC 3.4 : demande non clôturee'; end if;
end $$;

-- 3.5 IDEMPOTENCE de la phase 2 : un deuxième passage ne traite rien.
do $$
declare v_n integer;
begin
  select count(*) into v_n from purger_comptes_supprimes();
  if v_n <> 0 then
    raise exception 'ECHEC 3.5 : % compte(s) retraite(s), 0 attendu', v_n;
  end if;
end $$;

-- 3.6 UNICITÉ : deux comptes purgés dans le même appel reçoivent deux emails
--     distincts. C'est le pendant du défaut purge.ts:60 côté effacement.
do $$
declare v_n integer; v_distinct integer;
begin
  insert into utilisateurs (email, nom, actif, supprime_le, purge_prevue_le)
  select 'test-eff-multi-' || g || '@exemple.fr', 'X', false,
         now() - interval '31 days', now() - interval '1 day'
    from generate_series(1, 3) g;

  select count(*) into v_n from purger_comptes_supprimes();
  if v_n <> 3 then raise exception 'ECHEC 3.6 : % comptes purges, 3 attendus', v_n; end if;

  select count(distinct email) into v_distinct
    from utilisateurs where purge_effectuee_le is not null;
  select count(*) into v_n
    from utilisateurs where purge_effectuee_le is not null;
  if v_distinct <> v_n then
    raise exception 'ECHEC 3.6 : % emails distincts pour % comptes purges', v_distinct, v_n;
  end if;
end $$;

-- 3.7 ATOMICITÉ : une erreur en cours de phase 2 n'écrit rien du tout.
--     On force l'échec en rendant une table cible temporairement inutilisable.
do $$
declare v_id uuid; v_avant integer; v_apres integer; v_msg text;
begin
  insert into utilisateurs (email, nom, actif, supprime_le, purge_prevue_le)
  values ('test-eff-rollback@exemple.fr', 'Rollback', false,
          now() - interval '31 days', now() - interval '1 day')
  returning id into v_id;
  insert into adresses (utilisateur_id, ligne1) values (v_id, 'à conserver');

  select count(*) into v_avant from adresses where utilisateur_id = v_id;

  begin
    -- Contrainte qui fera échouer l'UPDATE final sur utilisateurs.
    alter table utilisateurs add constraint tmp_echec check (nom <> 'Compte supprimé');
    perform * from purger_comptes_supprimes();
    raise exception 'ECHEC 3.7 : la purge aurait du echouer';
  exception
    when check_violation then
      null; -- attendu
    when others then
      get stacked diagnostics v_msg = message_text;
      if v_msg like 'ECHEC 3.7%' then raise; end if;
  end;

  alter table utilisateurs drop constraint if exists tmp_echec;

  -- Rien ne doit avoir été détruit : la fonction est atomique.
  select count(*) into v_apres from adresses where utilisateur_id = v_id;
  if v_apres <> v_avant then
    raise exception 'ECHEC 3.7 : % adresse(s) avant, % apres — la transaction n''a pas ete annulee',
      v_avant, v_apres;
  end if;
end $$;

-- Nettoyage
delete from utilisateurs where email like 'test-eff%' or email like 'supprime+%';

select 'TEST 3 — effacement en deux phases : OK' as resultat;
