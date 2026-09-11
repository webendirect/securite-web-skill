# Rapport de correction — compétence `securite-web`

**Date :** 2026-09-11
**Périmètre :** l'intégralité du dépôt `webendirect/securite-web-skill`
**Objet :** fiabilisation du code livré avant utilisation sur des projets clients en production

**Environnement de vérification**
PostgreSQL 16.13 (instance locale, base vierge) · Node 22.22.2 · jsdom 26.1.0 ·
TypeScript 5.9.3 · Bash 5.2.21

> Ce rapport ne prétend ni à l'exhaustivité ni à la sécurité absolue. Il décrit
> ce qui a été corrigé, comment chaque correction a été vérifiée, et ce qui
> **n'a pas pu** l'être. La section « Tests non exécutés » fait partie du
> résultat autant que les autres.

---

## Corrections critiques

### C1 — La migration du registre RGPD ne pouvait pas s'exécuter

| | |
|---|---|
| **Fichier** | `conformite/code/effacement/migration-demandes.sql:30` (avant correction) |
| **Gravité** | CRITIQUE — panne d'installation |
| **Cause** | `echeance_le timestamptz generated always as (cree_le + interval '1 month') stored`. PostgreSQL exige qu'une expression `GENERATED` soit `IMMUTABLE` ; `timestamptz + interval` passe par `timestamptz_pl_interval`, marqué `STABLE` parce que l'arithmétique en mois dépend du fuseau de session. |
| **Effet** | `ERROR: generation expression is not immutable`. Le `CREATE TABLE` échouait, donc **aucun** élément du module effacement ne s'installait. |
| **Second défaut, masqué par le premier** | `GENERATED ALWAYS` interdit toute mise à jour de la colonne. Or le RGPD (art. 12.3) autorise la prolongation du délai de réponse à 3 mois. La colonne rendait impossible le cas d'usage que son propre commentaire décrivait. |
| **Correction** | Colonne ordinaire alimentée par un déclencheur `before insert or update`, qui ne calcule l'échéance que si elle n'a pas été fixée explicitement. Le calcul par défaut est préservé ; la prolongation devient possible. |
| **Choix : corriger sur place plutôt qu'ajouter une migration corrective** | La migration **échouait systématiquement** : aucune base ne peut la porter, il n'existe donc aucun historique de production à ménager. Une migration corrective aurait été du bruit. Le choix aurait été inverse si la migration avait pu s'exécuter quelque part. |
| **Test** | `tests/sql/01-test-migrations.sql` — assertions 1.2 à 1.5 |
| **Résultat** | **RÉUSSI.** Échéance par défaut à J+1 mois ; passage de mois court correct (31 janvier → 28 février) ; prolongation à 3 mois acceptée ; la colonne n'est plus générée. |

### C2 — L'anonymisation de la purge violait l'index unique dès le deuxième compte

| | |
|---|---|
| **Fichier** | `conformite/code/retention/purge.ts:60` (avant correction) |
| **Gravité** | CRITIQUE — panne de la purge, donc non-conformité sur les durées de conservation |
| **Cause** | `randomUUID()` était évalué **une seule fois**, à la construction de la requête. Le littéral produit était appliqué à toutes les lignes du même `UPDATE`. |
| **Effet** | Dès que deux comptes étaient à anonymiser dans la même nuit, violation de contrainte d'unicité sur `utilisateurs.email` et purge en échec. Le commentaire situé juste au-dessus annonçait pourtant que la valeur devait rester unique. |
| **Correction** | Introduction du type `Remplacement = string \| null \| { sql: string }`. La forme `{ sql }` est injectée telle quelle et réévaluée par PostgreSQL **pour chaque ligne** : `'supprime+' \|\| gen_random_uuid() \|\| '@invalide.local'`. |
| **Test** | `tests/sql/02-test-purge.sql` — assertions 2.1, 2.2 et 2.4 |
| **Résultat** | **RÉUSSI.** 5 comptes anonymisés en une passe, 5 adresses distinctes. L'assertion 2.4 rejoue volontairement l'ancienne forme et **confirme** qu'elle produit bien une `unique_violation` : le test attrape la régression. |

### C3 — La purge n'était pas idempotente

| | |
|---|---|
| **Fichier** | `conformite/code/retention/politique-retention.ts:85` (avant correction) |
| **Gravité** | CRITIQUE — aggrave C2 et fausse le journal de preuve |
| **Cause** | La règle `utilisateurs` filtrait sur `supprime_le is null` sans `anonymise_le is null`. Un compte anonymisé conservait sa `derniere_connexion_le`, donc restait éligible à chaque exécution. La requête de vérification en bas de `retention/migration.sql` contenait pourtant la bonne clause : le SQL connaissait la condition que le TypeScript avait oubliée. |
| **Effet** | Retraitement sans fin des mêmes lignes ; compteurs du `journal_purge` faux — donc preuve de conformité fausse ; et, combiné à C2, collision d'unicité dès la deuxième nuit. |
| **Correction** | Champ `marqueurTraite` ajouté au type `Regle`, systématiquement injecté par `clauseEchue()` sous la forme `and <marqueur> is null`. Rendu **obligatoire** pour les actions `anonymiser` et `procedure` par `validerPolitique()`, qui s'exécute avant toute écriture et refuse de tourner si une règle y manque. Le marqueur est posé dans le **même** `UPDATE` que l'anonymisation, pour qu'une interruption ne laisse pas de ligne traitée mais non marquée. |
| **Test** | `tests/sql/02-test-purge.sql` — assertions 2.3 et 2.5 ; `tests/sql/03-test-effacement.sql` — assertion 3.5 |
| **Résultat** | **RÉUSSI.** Deuxième exécution : 0 ligne traitée. Les dates de dernière connexion ne sont pas réécrites. |

### C4 — La suppression de compte n'était pas transactionnelle

| | |
|---|---|
| **Fichier** | `conformite/code/effacement/route-suppression.ts` (avant correction) |
| **Gravité** | CRITIQUE — perte de données irréversible sur état partiel |
| **Cause** | Une douzaine d'instructions SQL successives sans `BEGIN`/`COMMIT`, plus une suppression d'objets du stockage. |
| **Effet** | Un échec au milieu (par exemple sur `update commandes`) laissait sessions, paniers, favoris, adresses et **fichiers du stockage objet** détruits, le compte toujours actif, et la demande figée en `en_cours`. La personne perdait des données sans que sa demande soit enregistrée. Le fichier contredisait la règle que la compétence énonce elle-même en passe 3.11. |
| **Correction** | Réécriture en deux phases (voir C5). Phase 1 : une seule transaction `sql.begin`, qui ne touche qu'aux accès. Phase 2 : fonction PL/pgSQL `purger_comptes_supprimes()`, atomique par construction, qui **remonte** les chemins du stockage objet à l'appelant au lieu de les supprimer — le stockage n'étant pas transactionnel, il est traité après validation. |
| **Test** | `tests/sql/03-test-effacement.sql` — assertion 3.7 |
| **Résultat** | **RÉUSSI.** Une contrainte est posée pour forcer l'échec au milieu de la phase 2 : après l'erreur, aucune donnée n'a été détruite. Le rollback est effectif. |

---

## Corrections importantes

### H1 — La fenêtre de rétractation annoncée n'existait pas

| | |
|---|---|
| **Fichiers** | `route-suppression.ts` ; nouveau `route-annulation.ts` ; `migration-demandes.sql` |
| **Gravité** | ÉLEVÉE — promesse fausse faite à la personne, dans un dispositif RGPD |
| **Cause** | L'en-tête annonçait « désactivation immédiate, purge définitive après 30 jours » et « une fenêtre de rétractation ». Le code détruisait immédiatement adresses, favoris, paniers, notifications, fichiers et hash du mot de passe. Il n'y avait rien à rétracter, et aucune route ne permettait de le faire. |
| **Décision** | Le comportement documenté a été retenu contre le code, pour trois raisons : il est cohérent avec `conformite/03-effacement-et-portabilite.md:85`, il correspond à la pratique courante, et il protège des suppressions impulsives ou malveillantes. |
| **Correction** | Séparation explicite en cinq états : **désactivation** (phase 1) → **suppression différée** (fenêtre) → **anonymisation** et **suppression définitive** (phase 2) → **conservation légale** (factures, 10 ans). Ajout de `route-annulation.ts` : jeton de 32 octets issu d'un CSPRNG, stocké haché, à usage unique, expirant avec la fenêtre, transaction avec verrou, message d'erreur identique dans tous les cas d'échec. Le hash du mot de passe est conservé pendant la fenêtre, sans quoi la rétractation serait inutilisable. |
| **Durée** | `RGPD_FENETRE_RETRACTATION_JOURS`, 30 jours par défaut. **Choix métier, pas durée légale** — voir la section « Vérification juridique nécessaire ». |
| **Test** | `tests/sql/03-test-effacement.sql` — assertions 3.1 à 3.4 et 3.6 ; `tests/js/test-syntaxe-ts.mjs` — invariants 6.2 |
| **Résultat** | **RÉUSSI.** Phase 1 : accès coupés, données intactes. Rétractation : compte rétabli, données présentes. Phase 2 : données détruites, factures conservées mais anonymisées, commentaires détachés, emails de remplacement distincts pour 3 comptes purgés ensemble. |

### H2 — `pgcrypto` utilisé sans être déclaré

| | |
|---|---|
| **Fichiers** | `route-suppression.ts:128` (avant correction) ; les deux migrations |
| **Gravité** | ÉLEVÉE — échec au moment le plus coûteux |
| **Cause** | `encode(digest(email, 'sha256'), 'hex')` exige l'extension `pgcrypto`. Le mot n'apparaissait nulle part dans le dépôt. |
| **Effet** | `ERROR: function digest(...) does not exist` au milieu d'une suppression de compte, sur une base où l'extension n'est pas préinstallée. |
| **Correction** | `create extension if not exists pgcrypto;` en tête de `migration-demandes.sql`, avec une note sur le cas Supabase (schéma `extensions`, déjà activée). `gen_random_uuid()` en dépend également. |
| **Test** | `tests/sql/01-test-migrations.sql` — assertion 1.1 (présence de l'extension + appel effectif de `digest()` et `gen_random_uuid()`) |
| **Résultat** | **RÉUSSI** sur une base PostgreSQL 16 vierge. |

### H3 — Faux positif SPF/DMARC sur tout site servi en `www`

| | |
|---|---|
| **Fichiers** | `scripts/audit-express.sh:103-104` (avant correction) ; nouveau `scripts/lib-domaine.sh` |
| **Gravité** | ÉLEVÉE — rapport client erroné |
| **Cause** | `HOST` conservait le préfixe `www.`. Le script interrogeait `TXT www.exemple.fr` et `_dmarc.www.exemple.fr`, alors que ces enregistrements se publient sur le domaine racine. |
| **Effet** | « MANQUE SPF — usurpation d'expéditeur possible » annoncé sur un domaine correctement configuré. C'est exactement ce que la compétence s'interdit ailleurs (« ne pas inventer de faille »), et un faux positif dans un rapport client décrédibilise les vrais constats. |
| **Correction** | Extraction de la logique dans `scripts/lib-domaine.sh`, testable sans réseau. `normaliser_hote()` retire schéma, identifiants, port, chemin, requête, ancre, point final et met en minuscules ; `domaine_racine()` remonte à l'eTLD+1 en tenant compte des suffixes composés (`co.uk`, `com.au`, `asso.fr`…) ; `domaines_a_tester()` renvoie l'hôte **puis** sa racine, sans doublon. Le script indique désormais quels domaines ont été interrogés et lequel porte l'enregistrement trouvé. Une entrée malformée est rejetée avec un code d'erreur au lieu d'être interrogée. |
| **Correction annexe** | En l'absence de `dig`, le script affiche « contrôle NON EXÉCUTÉ » au lieu de rester muet. |
| **Test** | `tests/shell/test-domaine.sh` — 32 assertions (apex, www, sous-domaine, slash final, déjà normalisé, malformé, suffixes composés, absence de doublon) |
| **Résultat** | **RÉUSSI.** |

### H4 — Un seul substitut masqué pour toutes les iframes d'une catégorie

| | |
|---|---|
| **Fichier** | `conformite/code/consentement/consentement.js:152` (avant correction) |
| **Gravité** | ÉLEVÉE — défaut visible par tout visiteur |
| **Cause** | `document.querySelector('[data-consentement-substitut="…"]')` appelé **dans** la boucle sur les iframes renvoyait le même premier élément à chaque tour. |
| **Effet** | Avec trois vidéos, deux placeholders restaient affichés par-dessus les vidéos activées. |
| **Correction** | Fonction `substitutPour(cadre, dejaApparies)` : appariement explicite par `data-substitut="<id>"`, sinon substitut le plus proche en remontant les ancêtres du cadre, sinon aucun — ce qui n'est pas une erreur. Un substitut déjà apparié n'est jamais réutilisé. Le substitut est résolu **avant** l'activation du cadre, puisque le retrait de `data-src` rend ensuite le cadre méconnaissable. |
| **Test** | `tests/js/test-consentement.mjs` — 33 assertions dans un vrai DOM (jsdom) : 1, 2 et 3 iframes, plusieurs fournisseurs, deux catégories, refus, personnalisation, rechargement, appariement explicite en ordre inversé, cadre sans substitut |
| **Résultat** | **RÉUSSI.** Contrôle de validité du test : l'ancien code réintroduit produit **6 échecs** aux emplacements exacts prévus. Le test attrape bien la régression. |
| **Vérifié et NON modifié** | `ConsentementProvider.tsx` n'est pas concerné : `CadreConsenti` rend soit le substitut, soit le cadre, jamais les deux, et chaque instance porte le sien. Une note le précise dans le fichier pour éviter une « harmonisation » qui casserait le composant. |

---

## Autres corrections

| # | Gravité | Fichier | Problème | Correction | Test |
|---|---|---|---|---|---|
| M1 | MOYENNE | `route-journal.ts` | Route publique écrivant en base sans aucune limite : moyen gratuit de faire grossir la table. | Rate limiting ajouté, réponse 204 silencieuse en cas de dépassement. Limite sur l'IP **complète** et non sur le /24, pour ne pas grouper un bureau entier et faire perdre des preuves de consentement à des visiteurs légitimes. | 6.2 |
| M2 | MOYENNE | `route-journal.ts` | Le fichier promet qu'aucune IP ne circule en clair, mais la clé de rate limiting que M1 introduisait en contenait une, envoyée au magasin du limiteur. | Clé hachée avec le même sel serveur. Cohérence rétablie. | 6.2 |
| M3 | MOYENNE | `route-journal.ts` | `categories` acceptait un nombre illimité de clés ; `chemin` acceptait n'importe quelle chaîne, URL absolue comprise. | Plafond de 20 catégories ; `chemin` contraint à un chemin relatif. | 6.1 |
| M4 | MOYENNE | `route-export.ts` | `where visiteur_id = ${session.user.consentementId ?? null}` — en SQL, `= null` n'est jamais vrai : la requête renvoyait silencieusement une liste vide pour tout le monde. Un export d'accès qui affiche « aucun consentement » à tort est une réponse fausse à une demande légale. | La requête n'est lancée que si l'identifiant existe. Sinon, un champ `_non_inclus` **dit** pourquoi l'historique est absent. | 6.2 |
| M5 | MOYENNE | `route-export.ts` | Neuf lectures successives hors transaction : un export daté pouvait décrire un état qui n'a jamais existé. | Toutes les lectures et la journalisation de la demande dans une transaction `repeatable read`. | 6.1 |
| M6 | MOYENNE | `migration.sql` | `purge_quotidienne()` en `SECURITY DEFINER` exécutable par `public` — donc par le rôle `anon` sur Supabase, celui du navigateur. Un visiteur pouvait déclencher des suppressions. | `revoke all ... from public` sur les deux fonctions, avec le `grant` à adapter en commentaire. | inspection |
| M7 | FAIBLE | `consentement.js` | Consent Mode v2 n'émettait que `update`. L'état `default` en `denied`, qui doit précéder le chargement de gtag, n'était documenté nulle part. | Extrait `consent 'default'` fourni, à coller dans le `<head>`, avec l'explication de pourquoi `update` seul ne suffit pas. | inspection |
| M8 | FAIBLE | `politique-retention.ts` | `resumeLisible()` affichait « 1275 jours » pour la rétention du journal de consentement (6 mois + 3 ans), aucun diviseur ne tombant juste. | `formatDuree()` réécrite : « 3 ans et 6 mois ». | inspection |
| M9 | FAIBLE | `purge.ts` | Le nombre de lignes affiché provenait d'un pré-comptage, qui peut dériver entre le `count` et l'écriture. | Comptage par `RETURNING` : le chiffre est celui des lignes réellement affectées. | 6.2 |
| M10 | FAIBLE | `purge.ts` | Interpolation de noms de tables dans `sql.unsafe` sans garde-fou (valeurs de configuration, donc pas d'injection externe, mais aucun filet). | `validerPolitique()` refuse tout identifiant hors `[A-Za-z_][A-Za-z0-9_]*` **avant** toute écriture, et `ident()` revérifie au point exact de l'interpolation. Le choix et sa raison sont documentés en tête de fichier. | 6.2 |
| M11 | FAIBLE | `purge.ts` | Un échec sur une règle interrompait le traitement sans annuler proprement. | Une transaction par règle : l'échec d'une règle est annulé entièrement et n'empêche pas les suivantes. | 6.2 |
| M12 | FAIBLE | `.gitignore` | Ne contenait pas `.env`, `*.pem`, `*.key` — motifs que la passe 4.2 de cette même compétence impose à tout projet audité. | Ajoutés, avec `!.env.example`. | inspection |

---

## Tests

**Suite créée pour cette mission** — le dépôt n'en contenait aucun.
Lancement : `bash tests/run-tests.sh`

| Test | Couvre | Assertions | Résultat |
|---|---|---|---|
| Migrations sur base vierge | installation complète | — | **RÉUSSI** |
| Migrations en rejeu | idempotence des migrations | — | **RÉUSSI** |
| 1 — migrations | C1, H2 | 7 blocs | **RÉUSSI** |
| 2 — purge | C2, C3 | 5 blocs | **RÉUSSI** |
| 3 — effacement | C4, H1 | 7 blocs | **RÉUSSI** |
| 4 — consentement (jsdom) | H4 | 33 | **RÉUSSI** |
| 5 — domaines | H3 | 32 | **RÉUSSI** |
| 6 — syntaxe TS et invariants | tous | 29 | **RÉUSSI** |
| Syntaxe `audit-express.sh` | — | 1 | **RÉUSSI** |
| Syntaxe `lib-domaine.sh` | — | 1 | **RÉUSSI** |

```
TESTS PASSED  : 10
TESTS FAILED  : 0
TESTS NOT RUN : 0
```

**Validité des tests, vérifiée et non supposée.** Trois tests ont été confrontés
au code d'origine pour s'assurer qu'ils détectent bien la régression :

- test 4 : l'ancien `consentement.js` produit **6 échecs** ;
- assertion 2.4 : rejoue la valeur figée et **confirme** la `unique_violation` ;
- assertion 1.2 : échouerait si la colonne redevenait `GENERATED`.

Un test qui passe avec et sans le correctif ne teste rien.

### Tests NON exécutés — environnement manquant

Ces points **ne sont pas validés**. Ne pas les compter comme réussis.

| Point | Raison | Conséquence |
|---|---|---|
| **Typage TypeScript complet** | `TEST NON EXÉCUTÉ — ENVIRONNEMENT MANQUANT.` Les fichiers livrés sont des modèles important `@/lib/db`, `@/lib/auth`, `next/server`, `zod` : ces modules n'existent pas dans ce dépôt et ne peuvent pas y exister. Seule la **syntaxe** est vérifiée. | Une erreur de type ne serait vue qu'à l'intégration dans un projet réel. |
| **Résolution DNS réelle (SPF/DMARC)** | `TEST NON EXÉCUTÉ — ENVIRONNEMENT MANQUANT.` `dig` n'est pas installé et l'environnement n'a pas d'accès DNS sortant. Seule la **normalisation de domaine** est testée — c'est là que se trouvait le défaut. | La branche `dig` du script n'a pas tourné contre un vrai résolveur. |
| **Requêtes HTTP de `audit-express.sh`** | `TEST NON EXÉCUTÉ — ENVIRONNEMENT MANQUANT.` Pas de site cible. Seule la syntaxe et la gestion des arguments sont vérifiées. | Les sections en-têtes, cookies, fichiers exposés et sourcemaps n'ont pas été exercées. |
| **Sous-traitants** | Non testable : emailing, stockage objet, Stripe, Sentry sont des services externes. Le code les traite explicitement comme non transactionnels. | Les chemins d'échec des sous-traitants sont écrits mais non exercés. |
| **`purge.ts` de bout en bout** | `TEST NON EXÉCUTÉ — ENVIRONNEMENT MANQUANT.` Le script importe `@/lib/db`. Les **requêtes SQL qu'il construit** sont testées à l'identique dans `tests/sql/02-test-purge.sql`, mais son orchestration TypeScript ne l'est pas. | Une erreur dans la boucle principale ou la gestion d'erreurs ne serait pas vue. |
| **Build d'un projet réel** | `BUILD VÉRIFIÉ : NON.` Le dépôt est une compétence, pas une application : il n'y a rien à construire. Le `package.json` ajouté ne sert qu'à la suite de tests. | — |

---

## Risques restants

1. **Le blocage du consentement ne couvre que ce qui est marqué.** Le mécanisme
   `type="text/plain"` suppose que tous les scripts tiers passent par ce
   marquage. Un plugin, un tag injecté par GTM ou un script ajouté plus tard par
   quelqu'un d'autre passe à travers sans bruit. Contrôle manuel obligatoire :
   navigation privée, onglet Application → Cookies, avant tout clic.
2. **Les cookies tiers ne sont pas effaçables.** `effacerCookiesDe()` ne peut
   agir ni sur un cookie posé sur un autre domaine, ni sur un cookie `httpOnly`.
   Le rechargement après retrait limite les dégâts sans les annuler.
3. **La liste de suffixes publics est partielle.** `lib-domaine.sh` couvre les
   suffixes composés courants, pas la Public Suffix List complète. Un domaine
   exotique peut être mal réduit — le script affiche les domaines interrogés,
   ce qui rend l'erreur visible plutôt que silencieuse.
4. **Le code de `conformite/` vise Next.js App Router + PostgreSQL.** Les autres
   stacks citées par la compétence (WordPress, Laravel, Firebase, mutualisé)
   n'ont pas de brique équivalente à déposer.
5. **`purge_quotidienne()` duplique trois durées** déjà déclarées dans
   `politique-retention.ts`. La duplication est volontaire et documentée
   (robustesse si le cron applicatif n'est pas garanti), mais deux définitions
   finissent par diverger. À revoir si les durées changent.
6. **Le score de sécurité reste un jugement.** La grille est fixe donc
   reproductible, mais classer une faille en Élevé plutôt que Moyen relève de
   l'appréciation. Deux auditeurs peuvent produire 72 et 86 sur le même site.

---

## Actions manuelles requises

Avant d'utiliser ce code sur un projet client :

1. **Définir `SEL_JOURNAL_CONSENTEMENT`** (`openssl rand -hex 32`). Sans ce sel,
   le journal de consentement ne stocke aucune empreinte d'IP — comportement
   volontaire, mais il faut le savoir.
2. **Définir `APP_URL`**, faute de quoi le lien de rétractation pointe vers
   `exemple.fr` et la fenêtre devient inutilisable.
3. **Définir `CONTACT_RGPD`** et vérifier que l'adresse est réellement relevée.
4. **Adapter les noms de tables et de colonnes** des migrations au schéma réel.
   `tests/sql/00-schema-projet.sql` documente ce qui est supposé.
5. **Brancher `supprimerFichiers()`** sur le client de stockage du projet dans
   `purge.ts` : le point d'accroche est en place, l'implémentation ne l'est pas.
6. **Adapter le `grant execute`** sur `purge_quotidienne()` au rôle réel de
   l'ordonnanceur, après le `revoke` de M6.
7. **Coller l'extrait `consent 'default'`** dans le `<head>` si le projet
   utilise GTM ou gtag (M7).
8. **Sauvegarder la base** avant la première exécution réelle de la purge, et
   la lancer d'abord en simulation.

---

## Informations à fournir par le client

- **[INFORMATION À FOURNIR PAR LE CLIENT]** Durée de rétractation souhaitée
  avant suppression définitive. La valeur par défaut de 30 jours est un choix
  technique, pas une recommandation juridique.
- **[INFORMATION À FOURNIR PAR LE CLIENT]** Liste réelle des sous-traitants,
  pour compléter les étapes de la phase 2 (Stripe, CRM, analytics…).
- **[INFORMATION À FOURNIR PAR LE CLIENT]** Durée de rotation des sauvegardes,
  annoncée en dur comme « 30 jours » dans l'email de confirmation.
- **[INFORMATION À FOURNIR PAR LE CLIENT]** Rôles réellement présents en base,
  avant toute centralisation des contrôles d'autorisation (passe 9).

---

## Vérification juridique nécessaire

- **[VÉRIFICATION JURIDIQUE NÉCESSAIRE]** La fenêtre de rétractation. Le RGPD
  impose un effacement « dans les meilleurs délais » sans fixer de durée. Un
  délai de grâce est une pratique courante, mais plus il est long, plus il faut
  pouvoir démontrer que le traitement a cessé pendant celui-ci. À valider avec
  un juriste ou un DPO avant de dépasser nettement 30 jours.
- **[VÉRIFICATION JURIDIQUE NÉCESSAIRE]** L'anonymisation des factures. Le code
  retire l'identité vivante en conservant la pièce comptable. L'articulation
  exacte entre l'obligation de conservation du code de commerce et le droit à
  l'effacement mérite une validation, en particulier sur les mentions
  obligatoires de la facture.
- **[VÉRIFICATION JURIDIQUE NÉCESSAIRE]** Les durées de
  `politique-retention.ts` sont des repères usuels, à confronter aux finalités
  réelles du client.

---

## Conclusion

Quatre défauts critiques et quatre défauts élevés corrigés, douze corrections
de moindre gravité, une suite de tests créée là où il n'y en avait aucune.
Les dix tests passent, dont trois dont la capacité à détecter la régression a
été vérifiée en réintroduisant l'ancien code.

**Ce rapport n'affirme ni que la compétence est « sécurisée », ni qu'elle est
« conforme ».** Il constate que les défauts identifiés sont corrigés et
prouvés, et il énumère ce qui n'a pas pu être vérifié dans cet environnement —
typage complet, DNS réel, requêtes HTTP, sous-traitants. Ces points restent à
couvrir lors de la première intégration dans un projet réel.

**Prochaine revue recommandée :** à la première utilisation sur un projet
client, pour exercer les chemins qui n'ont pas pu l'être ici.
