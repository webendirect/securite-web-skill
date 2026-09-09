---
name: securite-web
description: Audite et corrige la sécurité d'un site ou d'une application web (souvent générée par IA) — authentification, autorisation, API, données, secrets, infrastructure, conformité RGPD. À utiliser quand on demande un audit de sécurité, un durcissement avant mise en ligne, une revue de faille (auth, tokens, permissions, rate limiting, XSS, injection, uploads, CORS, headers), ou avant de livrer un site client en production.
---

# Sécurité web — audit et durcissement

Cette compétence sert à trouver et boucher les trous de sécurité d'une app web, en particulier celles générées par IA. Une IA code pour que ça marche, pas pour que ce soit sûr : les mêmes trous reviennent toujours aux mêmes endroits.

## Principe de fonctionnement

L'audit se fait en **passes numérotées**, une passe à la fois, jamais tout d'un coup. Chaque passe :

1. **Constate** — lire le code réel, ne jamais supposer. Chercher les patterns listés dans le fichier de référence.
2. **Rapporte** — dire ce qui est trouvé, avec fichier + ligne, et classer en Critique / Élevé / Moyen / Faible.
3. **Corrige** — appliquer le correctif, front et back.
4. **Vérifie** — prouver que la faille est bouchée (test, requête, capture).

Ne jamais enchaîner deux passes sans avoir vérifié la première. Ne jamais annoncer « c'est corrigé » sans avoir relu le code après modification.

## Audit d'abord, corrections ensuite

Sur un projet qu'on découvre, ou repris de quelqu'un d'autre, l'audit se fait en **deux temps séparés** :

**Temps 1 — constat, sans modifier un seul fichier.** On lit, on relève, on classe par gravité, on présente. C'est le moment où l'on comprend l'architecture ; corriger pendant qu'on découvre conduit à casser des dépendances qu'on n'avait pas encore vues, et à mélanger dans le même diff des changements de nature différente.

**Temps 2 — corrections**, après validation, par groupes cohérents, avec vérification après chaque groupe.

Sur un projet déjà connu, ou pour une correction ciblée, le passage direct en correction est légitime — le découpage en passes suffit alors à garder le contrôle.

## Avant de commencer : identifier la stack

Toujours établir d'abord, en lisant les fichiers du projet (`package.json`, `composer.json`, fichiers de config, migrations) :

- **Framework front** : Next.js / React / Vue / Astro / WordPress / HTML statique
- **Backend** : route handlers Next, Express, Laravel, Supabase, Firebase, API externe
- **Auth** : maison, NextAuth/Auth.js, Supabase Auth, Clerk, Firebase Auth, WordPress
- **Base de données** : Postgres/Supabase, MySQL, Firestore, MongoDB
- **Hébergement** : Vercel, Netlify, OVH, VPS, o2switch, hébergeur mutualisé

Les correctifs diffèrent radicalement selon la stack. Un site vitrine statique n'a pas d'auth à durcir mais a des formulaires, des headers et un RGPD à traiter — dans ce cas sauter directement aux passes 4, 5 et 6.

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

Chaque fichier de référence contient : la faille, comment la détecter (patterns de code à chercher), le correctif par stack, et un prompt prêt à coller.

Les passes **0** et **9** encadrent toutes les autres et ne se sautent pas. La passe 0 décide quelles protections valent leur coût en expérience utilisateur — sans elle, l'audit produit un site plus sûr et moins utilisé. La passe 9 protège le code du client pendant qu'on le modifie : elle se lit avant de corriger, et s'applique après chaque groupe de correctifs.

## Auditer, puis installer

La passe 6 **constate** l'état de la conformité. Le dossier `conformite/` la **met en place** : il contient du code à déposer dans le projet, pas seulement des recommandations.

| Brique | Documents | Code |
|---|---|---|
| Consentement aux cookies | `conformite/01-consentement-cookies.md` | bandeau vanilla et React, journal de preuve |
| Durées de conservation | `conformite/02-retention-purge.md` | politique déclarative, purge automatique, migration |
| Effacement et portabilité | `conformite/03-effacement-et-portabilite.md` | routes d'export et de suppression, registre des demandes |
| Preuve et registre | `conformite/04-preuve-et-registre.md` | modèles de registre, DPA, procédure de violation |
| Base légale, données sensibles, AIPD | `conformite/05-donnees-sensibles-et-aipd.md` | marqueurs de non-invention, article 9, IA |

Ces trois premières briques couvrent l'essentiel des sanctions CNIL sur les sites de petite et moyenne taille ; la quatrième les rend démontrables — ce qui, en contrôle, est la seule chose qui compte.

Quand le projet est un site livré à un client, installer les briques plutôt que de se contenter de signaler les manques : une recommandation dans un rapport ne protège personne.

## Deux façons de lancer le travail

**En un seul passage** — `assets/mission-audit-complet.md` et `assets/mission-rgpd.md` sont des prompts de mission à coller tels quels. Ils déclenchent l'audit intégral en deux temps, avec le format de rapport et le score. À privilégier pour un projet qu'on découvre.

**Étape par étape** — `assets/prompts-rapides.md` contient 20 prompts indépendants, à jouer dans l'ordre. À privilégier pour une correction ciblée ou un projet déjà audité.

## Ordre recommandé

Pour un audit complet : **0** → 4 → 1 → 2 → 3 → 5 → 8 → 6, puis 7 — avec la **passe 9 lue avant la première correction et rejouée après chaque groupe**.

La passe 4 vient en premier parce qu'un secret exposé rend tout le reste inutile : si la clé de service de la base est dans le bundle JavaScript, aucune règle d'autorisation ne tient.

Pour un durcissement rapide avant lancement, faire les **10 points bloquants** de `assets/checklist-pre-lancement.md`.

## Règles de conduite pendant l'audit

**Ne rien casser.** Chaque correctif doit préserver le fonctionnement existant. Le dommage le plus probable de cette compétence n'est pas une faille : c'est un correctif trop large qui casse le site d'un client. Le parcours de non-régression de la passe 9 se rejoue après chaque groupe, pas à la fin.

**Travailler sous filet.** Dépôt propre et branche dédiée avant la première modification, un commit par groupe de correctifs avec les effets de bord annoncés dans le message, sauvegarde de la base avant toute migration ou purge, et un chemin de retour arrière connu avant d'en avoir besoin. Jamais directement sur la branche de production. Si le projet n'est pas versionné, l'initialiser est la première action de l'audit.

**Annoncer une friction avant de l'imposer.** Toute protection qui ajoute une étape pour l'utilisateur — double authentification, captcha, expiration de session, verrouillage — se justifie par ce qu'elle protège, au niveau retenu en passe 0. Une protection qu'on ne sait pas justifier ne se pose pas.

**Prévenir avant de renvoyer un refus.** Si un correctif peut produire un 404, 403 ou 429 chez un utilisateur légitime — filtre de propriété trop serré, rôle oublié, limite par IP partagée — le dire avant de l'appliquer et poser le garde-fou. Le catalogue est en passe 9.

**Un correctif à la fois.** Ne pas mélanger la migration des tokens vers un cookie httpOnly avec l'ajout du rate limiting — deux passes, deux commits.

**Toujours corriger côté serveur.** Une vérification côté navigateur est un confort d'affichage, jamais une sécurité. Le front peut cacher un bouton ; seul le serveur peut refuser l'action.

**Refuser par défaut.** Une route non listée, un rôle inconnu, une donnée sans propriétaire clair : on refuse. L'inverse (autoriser sauf exception) laisse toujours un trou.

**Ne pas inventer de faille.** Si le code est correct, le dire. Un rapport gonflé de faux positifs fait perdre confiance dans les vrais.

**Ne jamais afficher un secret**, même pour signaler qu'il est exposé — donner le fichier et la ligne. Une clé recopiée dans un rapport se retrouve dans un email, un ticket, un historique de conversation.

**Ne rien inventer de juridique ou de contractuel.** Quand le code ne permet pas de trancher, employer un marqueur explicite plutôt qu'une supposition : `[À FOURNIR PAR LE RESPONSABLE DU SITE]`, `[VÉRIFICATION JURIDIQUE NÉCESSAIRE]`, `[TRANSFERT INTERNATIONAL À VÉRIFIER]`, `[REVUE PRIVACY CRITIQUE]`. Un rapport qui affiche ses angles morts vaut mieux qu'un rapport qui les comble.

**Ne jamais écrire « 100 % sécurisé » ni « pleinement conforme ».** Un audit couvre un périmètre à un instant donné. Toujours conclure par ce qui n'a pas été couvert.

**Signaler ce qui dépasse le code.** Sauvegardes, accès au serveur, mots de passe partagés en clair par email, comptes d'admin d'anciens prestataires : ces trous ne sont pas dans le dépôt mais coulent un projet aussi sûrement.

## Format du rapport

À la fin de l'audit, produire un rapport structuré :

```
## Faille — <titre court>
Gravité : Critique | Élevé | Moyen | Faible
Où : chemin/du/fichier.ts:42
Ce qui se passe : <une phrase, en clair, sans jargon>
Ce qu'un attaquant peut faire : <l'impact concret>
Correctif : <ce qui a été changé, ou ce qu'il faut changer>
Vérifié par : <comment on sait que c'est bouché>
```

Pour un client non technique, traduire l'impact en conséquence métier : « n'importe quel visiteur peut lire les coordonnées de tous vos clients » plutôt que « IDOR sur /api/users/:id ».

## Score de sécurité

Un chiffre unique aide un client à situer l'état de son site et à mesurer le progrès entre deux audits — à condition qu'il soit reproductible. Grille fixe :

| Gravité | Points | Définition |
|---|---|---|
| Critique | −25 | exploitable à distance sans authentification, impact majeur : secret exposé, exécution de code, fuite de la base, contournement d'authentification |
| Élevée | −10 | exploitable par un utilisateur authentifié ou sous condition simple : IDOR, élévation de privilège, XSS stockée, connexion sans limitation |
| Moyenne | −4 | exploitation conditionnelle ou impact limité : en-tête manquant, CSRF secondaire, fuite d'information mineure |
| Faible | −1 | durcissement recommandé, pas d'exploitation directe |
| Informationnelle | 0 | signalée, hors score |

Départ à 100, plancher à 0. **100 signifie « aucune faille trouvée dans le périmètre audité », jamais « site sécurisé »** — le score ne vaut que accompagné de la liste de ce qui n'a pas été examiné.
