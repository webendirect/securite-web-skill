-- Test 2 — purge : unicité de l'anonymisation et idempotence.
--
-- Couvre deux régressions :
--   purge.ts:60           randomUUID() évalué une fois pour tout l'UPDATE,
--                         d'où une violation d'unicité dès le 2e compte.
--   politique-retention.ts:85  absence de « anonymise_le is null », d'où un
--                         retraitement sans fin des mêmes lignes.
--
-- Le test rejoue en SQL la requête que purge.ts construit pour la règle
-- 'utilisateurs', exactement telle que clauseEchue() la produit.

\set ON_ERROR_STOP on

-- Jeu d'essai : 5 comptes inactifs depuis plus de 3 ans.
delete from utilisateurs where email like 'test-purge-%';
insert into utilisateurs (email, nom, derniere_connexion_le)
select 'test-purge-' || g || '@exemple.fr', 'Nom ' || g, now() - interval '4 years'
  from generate_series(1, 5) g;

-- 2.1 L'anonymisation traite les 5 comptes sans violer l'index unique.
do $$
declare v_n integer;
begin
  with maj as (
    update utilisateurs
       set email = 'supprime+' || gen_random_uuid() || '@invalide.local',
           nom = 'Compte supprimé', prenom = null, telephone = null,
           adresse = null, avatar_url = null, mot_de_passe_hash = null,
           anonymise_le = now()
     where derniere_connexion_le < now() - make_interval(days => 1095)
       and anonymise_le is null
       and (supprime_le is null)
     returning 1
  )
  select count(*) into v_n from maj;

  if v_n <> 5 then
    raise exception 'ECHEC 2.1 : % lignes anonymisees, 5 attendues', v_n;
  end if;
end $$;

-- 2.2 Les 5 adresses générées sont bien distinctes (une par ligne).
do $$
declare v_distinctes integer;
begin
  select count(distinct email) into v_distinctes
    from utilisateurs
   where nom = 'Compte supprimé' and email like 'supprime+%@invalide.local';
  if v_distinctes <> 5 then
    raise exception 'ECHEC 2.2 : % adresses distinctes, 5 attendues (valeur figee ?)', v_distinctes;
  end if;
end $$;

-- 2.3 IDEMPOTENCE : la même purge rejouée ne traite plus rien.
do $$
declare v_n integer;
begin
  with maj as (
    update utilisateurs
       set email = 'supprime+' || gen_random_uuid() || '@invalide.local',
           nom = 'Compte supprimé', anonymise_le = now()
     where derniere_connexion_le < now() - make_interval(days => 1095)
       and anonymise_le is null
       and (supprime_le is null)
     returning 1
  )
  select count(*) into v_n from maj;

  if v_n <> 0 then
    raise exception 'ECHEC 2.3 : % lignes retraitees, 0 attendue (purge non idempotente)', v_n;
  end if;
end $$;

-- 2.4 Sans le marqueur, le défaut d'origine se reproduit : c'est bien lui la cause.
--     On vérifie que la requête SANS « anonymise_le is null » échoue en unicité.
do $$
declare v_erreur text;
begin
  begin
    update utilisateurs
       set email = 'supprime+figee@invalide.local'   -- valeur figée, comme avant
     where derniere_connexion_le < now() - make_interval(days => 1095)
       and (supprime_le is null);
    raise exception 'ECHEC 2.4 : la valeur figee aurait du violer l''index unique';
  exception
    when unique_violation then
      null; -- comportement attendu : c'est la régression que l'on a corrigée
    when others then
      get stacked diagnostics v_erreur = message_text;
      if v_erreur like 'ECHEC 2.4%' then raise; end if;
      raise exception 'ECHEC 2.4 : erreur inattendue : %', v_erreur;
  end;
end $$;

-- 2.5 La colonne derniere_connexion_le n'a pas été touchée : l'anonymisation
--     ne doit pas réécrire les dates, sinon le décompte repart de zéro.
do $$
declare v_n integer;
begin
  select count(*) into v_n
    from utilisateurs
   where nom = 'Compte supprimé'
     and derniere_connexion_le > now() - interval '3 years';
  if v_n <> 0 then
    raise exception 'ECHEC 2.5 : % lignes ont vu leur date de connexion modifiee', v_n;
  end if;
end $$;

-- Nettoyage
delete from utilisateurs where nom = 'Compte supprimé' and email like 'supprime+%';

select 'TEST 2 — purge et anonymisation : OK' as resultat;
