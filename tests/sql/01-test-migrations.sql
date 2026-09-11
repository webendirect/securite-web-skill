-- Test 1 — les migrations s'appliquent et le calcul d'échéance est correct.
--
-- Couvre la régression : « generation expression is not immutable » sur
-- demandes_rgpd.echeance_le (migration-demandes.sql).
--
-- Chaque assertion utilise un DO ... raise exception, donc le script s'arrête
-- au premier échec et psql -v ON_ERROR_STOP=1 renvoie un code non nul.

\set ON_ERROR_STOP on

-- 1.1 pgcrypto est bien disponible (digest() et gen_random_uuid()).
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    raise exception 'ECHEC 1.1 : extension pgcrypto absente';
  end if;
  perform encode(digest('test', 'sha256'), 'hex');
  perform gen_random_uuid();
end $$;

-- 1.2 echeance_le est une colonne ordinaire, pas une colonne générée.
--     Une colonne GENERATED interdirait la prolongation légale à 3 mois.
do $$
declare v_gen text;
begin
  select attgenerated into v_gen
    from pg_attribute
   where attrelid = 'demandes_rgpd'::regclass
     and attname  = 'echeance_le';
  if v_gen is null then
    raise exception 'ECHEC 1.2 : colonne echeance_le introuvable';
  end if;
  if v_gen <> '' then
    raise exception 'ECHEC 1.2 : echeance_le est encore une colonne generee (%)', v_gen;
  end if;
end $$;

-- 1.3 L'échéance par défaut est bien fixée à un mois après la création.
do $$
declare v_ech timestamptz; v_cree timestamptz; v_id bigint;
begin
  insert into demandes_rgpd (type, canal) values ('acces', 'application')
    returning id, cree_le, echeance_le into v_id, v_cree, v_ech;
  if v_ech is null then
    raise exception 'ECHEC 1.3 : echeance_le non renseignee par le trigger';
  end if;
  if v_ech <> v_cree + interval '1 month' then
    raise exception 'ECHEC 1.3 : echeance % attendue %', v_ech, v_cree + interval '1 month';
  end if;
  delete from demandes_rgpd where id = v_id;
end $$;

-- 1.4 Le passage de mois court est correct (31 janvier -> 28 février).
do $$
declare v_ech timestamptz; v_id bigint;
begin
  insert into demandes_rgpd (type, cree_le) values ('effacement', '2026-01-31T12:00:00Z')
    returning id, echeance_le into v_id, v_ech;
  if v_ech::date <> date '2026-02-28' then
    raise exception 'ECHEC 1.4 : echeance %, attendue 2026-02-28', v_ech::date;
  end if;
  delete from demandes_rgpd where id = v_id;
end $$;

-- 1.5 La prolongation à 3 mois (RGPD art. 12.3) est possible.
--     C'est ce que la colonne GENERATED ALWAYS d'origine rendait impossible.
do $$
declare v_ech timestamptz; v_id bigint; v_cree timestamptz;
begin
  insert into demandes_rgpd (type) values ('portabilite')
    returning id, cree_le into v_id, v_cree;
  update demandes_rgpd set echeance_le = v_cree + interval '3 months' where id = v_id;
  select echeance_le into v_ech from demandes_rgpd where id = v_id;
  if v_ech <> v_cree + interval '3 months' then
    raise exception 'ECHEC 1.5 : prolongation refusee, echeance = %', v_ech;
  end if;
  delete from demandes_rgpd where id = v_id;
end $$;

-- 1.6 Les vues de supervision existent et sont interrogeables.
do $$
begin
  perform 1 from demandes_rgpd_a_traiter limit 1;
  perform 1 from comptes_a_purger        limit 1;
end $$;

-- 1.7 Les colonnes du cycle de suppression sont présentes.
do $$
declare v_manquantes text;
begin
  select string_agg(c, ', ') into v_manquantes
    from unnest(array['supprime_le','purge_prevue_le','purge_effectuee_le',
                      'email_original_hash','anonymise_le','actif']) as c
   where not exists (
     select 1 from information_schema.columns
      where table_name = 'utilisateurs' and column_name = c
   );
  if v_manquantes is not null then
    raise exception 'ECHEC 1.7 : colonnes manquantes : %', v_manquantes;
  end if;
end $$;

select 'TEST 1 — migrations : OK' as resultat;
