---
name: securite-web
description: Audite et corrige la sécurité d'un site ou d'une application web (souvent générée par IA) — authentification, autorisation, API, données, secrets, infrastructure, conformité RGPD. À utiliser quand on demande un audit de sécurité, un durcissement avant mise en ligne, une revue de faille (auth, tokens, permissions, rate limiting, XSS, injection, uploads, CORS, headers), la correction d'un défaut trouvé en audit, ou avant de livrer un site client en production.
---

# Sécurité web — audit et durcissement

Cette compétence sert à trouver et boucher les trous de sécurité d'une app web,
en particulier celles générées par IA. Une IA code pour que ça marche, pas pour
que ce soit sûr : les mêmes trous reviennent toujours aux mêmes endroits.

Elle s'utilise sur des sites de production, souvent ceux de clients. Ce qui
suit décrit **comment travailler**. Le détail de chaque faille — comment la
détecter, comment la corriger selon la stack — vit dans `references/`, chargé
seulement quand la passe correspondante est jouée.

---

## La règle qui commande tout le reste

```
CORRIGER → TESTER → VÉRIFIER → AUDITER → COMMITTER → POUSSER
```

Jamais **modifier → pousser**.

Un correctif de sécurité non testé est un changement de comportement non testé
sur du code de production. C'est exactement ce qu'on reproche au code qu'on est
en train d'auditer.

Quatre interdits qui ne souffrent aucune exception :

- **Ne jamais inventer un résultat de test.**
- **Ne jamais déclarer une correction réussie sans l'avoir vérifiée.**
- **Ne jamais contourner une erreur** au lieu de la corriger.
- **Ne jamais supprimer une fonctionnalité** parce qu'elle est difficile à corriger.

Si un test ne peut pas être exécuté faute d'environnement, l'écrire tel quel —
`TEST NON EXÉCUTÉ — ENVIRONNEMENT MANQUANT` — et ne jamais le compter comme
réussi.

---

## Le cycle de travail

### 0. Inventaire, avant de toucher à quoi que ce soit

Parcourir tout le dépôt : code, migrations SQL, scripts shell, tests existants,
configuration, dépendances, commandes de la compétence, documentation.
Construire la **carte des dépendances** avant de modifier.

**Les éléments ajoutés en cours de route entrent dans le périmètre.** Un
fichier, une pièce jointe ou une consigne fournie après l'inventaire se reprend
à l'étape 4 — il n'y a pas de « trop tard » pour un élément du livrable.

### 1. Identifier la stack

En lisant `package.json`, `composer.json`, la configuration, les migrations :

- **Front** : Next.js / React / Vue / Astro / WordPress / HTML statique
- **Back** : route handlers Next, Express, Laravel, Supabase, Firebase, API externe
- **Auth** : maison, NextAuth/Auth.js, Supabase Auth, Clerk, Firebase Auth, WordPress
- **Base** : Postgres/Supabase, MySQL, Firestore, MongoDB
- **Hébergement** : Vercel, Netlify, OVH, VPS, mutualisé

Les correctifs diffèrent radicalement selon la stack. Un site vitrine statique
n'a pas d'auth à durcir mais a des formulaires, des en-têtes et un RGPD à
traiter : sauter aux passes 4, 5 et 6.

### 2. Constater, sans rien modifier

Sur un projet qu'on découvre, l'audit se fait en **deux temps séparés**.

**Temps 1 — le constat.** On lit, on relève, on classe par gravité, on
présente. Corriger pendant qu'on découvre conduit à casser des dépendances
qu'on n'avait pas encore vues, et à mélanger dans le même diff des changements
de nature différente.

**Temps 2 — les corrections**, après validation, par groupes cohérents.

Sur un projet déjà connu, ou pour une correction ciblée, le passage direct en
correction est légitime : le découpage en passes suffit alors à garder le
contrôle.

### 3. Corriger, dans l'ordre du dégât potentiel

On ne corrige pas dans l'ordre où l'on trouve, mais dans l'ordre de ce qui fait
le plus de dégâts :

1. ce qui **provoque une panne** en production ;
2. ce qui **empêche une fonctionnalité RGPD de fonctionner** ;
3. ce qui **supprime des données de travers** ;
4. ce qui **crée une faille** ;
5. ce qui **produit un faux rapport envoyé au client** ;
6. ce qui rend les audits **non reproductibles**.

Une migration qui ne passe pas bloque tout le reste : elle est toujours
première.

Pour chaque défaut : **reproduire** (le voir échouer), **comprendre la cause**
(pas le symptôme), **corriger au plus près**, **vérifier que le comportement
métier est préservé**, **tester**, puis **vérifier que le test attrape la
régression** en remettant brièvement l'ancien code. Un test qui passe dans les
deux cas ne teste rien.

Le détail de cette mécanique — transactions, idempotence, valeurs générées par
ligne, migrations déjà déployées, faux positifs — est en
`references/10-methode-de-correction.md`. **À lire avant la première
correction.**

### 4. Second passage

Après les corrections prioritaires, **ne pas s'arrêter**. Reprendre le dépôt
entier, fichiers ajoutés en cours de route compris, et chercher les **erreurs
de la même famille** : le défaut qu'on vient de corriger a presque toujours un
jumeau ailleurs. Classer chaque anomalie en `CRITIQUE` / `ÉLEVÉ` / `MOYEN` /
`FAIBLE` / `INFORMATIONNEL`, corriger ce qui peut l'être de façon fiable, et
laisser le reste dans les risques restants, avec sa raison.

### 5. Contrôle de régression, puis rapport, puis push

Vérifier que rien n'est cassé (passe 9), produire le rapport (passe 10, étape
11), passer les dix vérifications avant le push (passe 10, étape 12).

---

## Les passes

| # | Passe | Référence | À faire si |
|---|-------|-----------|-----------|
| **0** | **Budget de friction** | `references/00-budget-de-friction.md` | **toujours, avant tout le reste** |
| 1 | Authentification et sessions | `references/01-authentification.md` | l'app a des comptes utilisateurs |
| 2 | Autorisation et accès aux données | `references/02-autorisation.md` | l'app a des rôles, ou des données par utilisateur |
| 3 | Entrées, API et injections | `references/03-entrees-et-api.md` | l'app a des formulaires ou une API |
| 4 | Secrets, dépendances, exposition | `references/04-secrets-et-exposition.md` | toujours |
| 5 | Infrastructure, headers, transport | `references/05-infrastructure.md` | toujours |
| 6 | RGPD et conformité (France/UE) | `references/06-rgpd-conformite.md` | toujours, pour un site client |
| 6bis | **Implémentation de la conformité** | `conformite/README.md` | dès qu'il faut poser le code, pas seulement l'auditer |
| 7 | Vérification et tests | `references/07-verification.md` | à la fin de chaque passe |
| 8 | CI/CD, dépôt et chaîne d'outils | `references/08-cicd-et-chaine-outils.md` | le projet est sur GitHub ou a un pipeline |
| **9** | **Git, régressions, retour arrière** | `references/09-non-regression.md` | **toujours — lire avant de corriger, appliquer après chaque groupe** |
| **10** | **Méthode de correction** | `references/10-methode-de-correction.md` | **toujours — c'est le protocole de travail détaillé** |

Chaque fichier de référence contient : la faille, comment la détecter (patterns
de code à chercher), le correctif par stack, et un prompt prêt à coller.

Les passes **0**, **9** et **10** encadrent toutes les autres et ne se sautent
pas. La passe 0 décide quelles protections valent leur coût en expérience
utilisateur. La passe 9 protège le code du client pendant qu'on le modifie. La
passe 10 dit comment corriger sans casser ni mentir.

**Ordre recommandé** pour un audit complet : **0** → 4 → 1 → 2 → 3 → 5 → 8 → 6,
puis 7. La passe 4 vient en premier parce qu'un secret exposé rend tout le reste
inutile : si la clé de service de la base est dans le bundle JavaScript, aucune
règle d'autorisation ne tient.

Pour un durcissement rapide avant lancement : les **10 points bloquants** de
`assets/checklist-pre-lancement.md`.

---

## Auditer, puis installer

La passe 6 **constate** l'état de la conformité. Le dossier `conformite/` la
**met en place** : il contient du code à déposer dans le projet, pas seulement
des recommandations.

| Brique | Documents | Code |
|---|---|---|
| Consentement aux cookies | `conformite/01-consentement-cookies.md` | bandeau vanilla et React, journal de preuve |
| Durées de conservation | `conformite/02-retention-purge.md` | politique déclarative, purge idempotente, migration |
| Effacement et portabilité | `conformite/03-effacement-et-portabilite.md` | export, suppression en deux phases, rétractation, registre |
| Preuve et registre | `conformite/04-preuve-et-registre.md` | modèles de registre, DPA, procédure de violation |
| Base légale, données sensibles, AIPD | `conformite/05-donnees-sensibles-et-aipd.md` | marqueurs de non-invention, article 9, IA |

Quand le projet est un site livré à un client, installer les briques plutôt que
de se contenter de signaler les manques : une recommandation dans un rapport ne
protège personne.

Ce code est couvert par la suite de tests du dépôt (`tests/`), qui vérifie sur
un vrai PostgreSQL que les migrations s'appliquent, que la purge est
idempotente, que la suppression est atomique et que le bandeau n'active rien
avant consentement. **Lancer `bash tests/run-tests.sh` après toute
modification de `conformite/code/` ou de `scripts/`.**

---

## Deux façons de lancer le travail

**En un seul passage** — `assets/mission-audit-complet.md` et
`assets/mission-rgpd.md` sont des prompts de mission à coller tels quels. À
privilégier pour un projet qu'on découvre.

**Étape par étape** — `assets/prompts-rapides.md` contient 20 prompts
indépendants, à jouer dans l'ordre. À privilégier pour une correction ciblée ou
un projet déjà audité.

---

## Règles de conduite

**Ne rien casser.** Le dommage le plus probable de cette compétence n'est pas
une faille : c'est un correctif trop large qui casse le site d'un client. Le
parcours de non-régression de la passe 9 se rejoue après chaque groupe, pas à
la fin.

**Travailler sous filet.** Dépôt propre et branche dédiée avant la première
modification, un commit par groupe avec les effets de bord annoncés dans le
message, sauvegarde de la base avant toute migration ou purge, chemin de retour
arrière connu avant d'en avoir besoin. Jamais directement sur la branche de
production. Si le projet n'est pas versionné, l'initialiser est la première
action de l'audit.

**Annoncer une friction avant de l'imposer.** Toute protection qui ajoute une
étape pour l'utilisateur se justifie par ce qu'elle protège, au niveau retenu
en passe 0. Une protection qu'on ne sait pas justifier ne se pose pas.

**Prévenir avant de renvoyer un refus.** Si un correctif peut produire un 404,
403 ou 429 chez un utilisateur légitime — filtre de propriété trop serré, rôle
oublié, limite par IP partagée — le dire avant de l'appliquer et poser le
garde-fou. Le catalogue est en passe 9.

**Un correctif à la fois.** Ne pas mélanger la migration des tokens vers un
cookie httpOnly avec l'ajout du rate limiting — deux passes, deux commits.

**Toujours corriger côté serveur.** Une vérification côté navigateur est un
confort d'affichage, jamais une sécurité. Le front peut cacher un bouton ; seul
le serveur peut refuser l'action.

**Refuser par défaut.** Une route non listée, un rôle inconnu, une donnée sans
propriétaire clair : on refuse.

**Ne pas inventer de faille.** Si le code est correct, le dire. Un rapport
gonflé de faux positifs fait perdre confiance dans les vrais. Avant de signaler
une absence, vérifier qu'on a regardé au bon endroit.

**Ne jamais afficher un secret**, même pour signaler qu'il est exposé — donner
le fichier et la ligne.

**Ne rien inventer de juridique ou de contractuel.** Quand le code ne permet
pas de trancher, employer un marqueur explicite plutôt qu'une supposition :
`[À FOURNIR PAR LE RESPONSABLE DU SITE]`, `[VÉRIFICATION JURIDIQUE NÉCESSAIRE]`,
`[TRANSFERT INTERNATIONAL À VÉRIFIER]`, `[REVUE PRIVACY CRITIQUE]`. Ne jamais
inventer une durée de conservation ni une obligation légale.

**Ne jamais écrire « 100 % sécurisé » ni « pleinement conforme ».** Un audit
couvre un périmètre à un instant donné. Toujours conclure par ce qui n'a pas
été couvert.

**Signaler ce qui dépasse le code.** Sauvegardes, accès au serveur, mots de
passe partagés en clair par email, comptes d'admin d'anciens prestataires : ces
trous ne sont pas dans le dépôt mais coulent un projet aussi sûrement.

---

## Format du rapport

```
## Faille — <titre court>
Gravité : Critique | Élevé | Moyen | Faible
Où : chemin/du/fichier.ts:42
Ce qui se passe : <une phrase, en clair, sans jargon>
Ce qu'un attaquant peut faire : <l'impact concret>
Correctif : <ce qui a été changé, ou ce qu'il faut changer>
Vérifié par : <le test qui le prouve, et son résultat>
```

Pour un client non technique, traduire l'impact en conséquence métier :
« n'importe quel visiteur peut lire les coordonnées de tous vos clients »
plutôt que « IDOR sur /api/users/:id ».

Une ligne « Vérifié par » sans test réellement exécuté est une intention, pas
une correction.

Structure complète du rapport de fin de mission : passe 10, étape 11.

---

## Score de sécurité

Un chiffre unique aide un client à situer l'état de son site et à mesurer le
progrès entre deux audits — à condition qu'il soit reproductible. Grille fixe :

| Gravité | Points | Définition |
|---|---|---|
| Critique | −25 | exploitable à distance sans authentification, impact majeur : secret exposé, exécution de code, fuite de la base, contournement d'authentification |
| Élevée | −10 | exploitable par un utilisateur authentifié ou sous condition simple : IDOR, élévation de privilège, XSS stockée, connexion sans limitation |
| Moyenne | −4 | exploitation conditionnelle ou impact limité : en-tête manquant, CSRF secondaire, fuite d'information mineure |
| Faible | −1 | durcissement recommandé, pas d'exploitation directe |
| Informationnelle | 0 | signalée, hors score |

Départ à 100, plancher à 0. **100 signifie « aucune faille trouvée dans le
périmètre audité », jamais « site sécurisé »** — le score ne vaut que
accompagné de la liste de ce qui n'a pas été examiné.
