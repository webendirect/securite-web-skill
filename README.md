# securite-web

Compétence Claude pour auditer et durcir la sécurité d'un site ou d'une application web — en particulier ceux générés par IA.

Une IA code pour que ça marche, pas pour que ce soit sûr. Les trous sont toujours les mêmes et toujours aux mêmes endroits. Cette compétence les cherche méthodiquement, les corrige et vérifie que c'est bouché.

## Installation

**Dans un projet** (la compétence s'active automatiquement pour ce projet) :

```bash
git clone https://github.com/webendirect/securite-web-skill.git .claude/skills/securite-web
```

**Pour tous tes projets** :

```bash
git clone https://github.com/webendirect/securite-web-skill.git ~/.claude/skills/securite-web
```

Vérifier avec `/skills` dans Claude Code.

## Utilisation

Ouvrir Claude sur le projet et demander en langage courant :

```
Audite la sécurité de ce projet
Durcis l'authentification avant qu'on mette en ligne
Vérifie que personne ne peut lire les données d'un autre utilisateur
Passe la checklist avant livraison
```

Pour un audit intégral en un seul passage, coller le contenu de `assets/mission-audit-complet.md`, puis celui de `assets/mission-rgpd.md`.

Pour un site déjà en production, reconnaissance passive rapide :

```bash
./scripts/audit-express.sh https://mon-domaine.fr
```

Pour travailler sans Claude Code, `assets/prompts-rapides.md` contient 20 prompts prêts à coller un par un, dans l'ordre.

## Ce que ça couvre

| Passe | Contenu |
|---|---|
| **0 — Budget de friction** | calibrer la sécurité sur ce qu'on protège : niveau du site, où placer la friction, quelles protections écarter volontairement |
| **1 — Authentification** | stockage du jeton, vérification email, rate limiting, règles de mots de passe, cycle de vie des sessions, réinitialisation, 2FA, OAuth |
| **2 — Autorisation** | vérification serveur des rôles, IDOR, RLS Supabase / règles Firestore, mass assignment, fuites dans les réponses API, isolation multi-tenant |
| **3 — Entrées et API** | validation serveur, injections SQL/NoSQL, XSS, CSRF, uploads, SSRF, redirections ouvertes, CORS, rate limiting global, webhooks, logique de paiement, intégrations LLM |
| **4 — Secrets et exposition** | secrets dans le bundle, fuites Git, fichiers accessibles en ligne, sourcemaps, dépendances, messages d'erreur, surveillance, sauvegardes |
| **5 — Infrastructure** | en-têtes HTTP, TLS, anti-bot, SPF/DKIM/DMARC, domaine et DNS, accès serveur, préproduction |
| **6 — RGPD** | cookies et consentement CNIL, mentions légales, droits des personnes, durées de conservation, sous-traitants, violation de données |
| **7 — Vérification** | tests manuels avec curl, outils externes, tests automatisés anti-régression, modèle de rapport client |
| **9 — Ne rien casser** | protocole Git et retour arrière, catalogue des faux 404/403/429 avec leurs garde-fous, parcours de non-régression après chaque groupe |
| **10 — Méthode de correction** | corriger → tester → vérifier → committer → pousser : reproduction du défaut, transactions, idempotence, migrations déjà déployées, faux positifs, dix vérifications avant push |
| **8 — CI/CD et dépôt** | permissions des workflows GitHub Actions, actions épinglées au SHA, `pull_request_target`, secrets dans les journaux, protection des branches, OIDC |
| **Module conformité** | **code à installer** : bandeau de consentement qui bloque réellement, purge idempotente, suppression de compte en deux phases avec rétractation réelle, export, registre et preuve |

## Méthode

Trois passes encadrent toutes les autres. La **passe 0** décide quelles protections valent leur coût en expérience — sans elle, l'audit produit un site plus sûr et moins utilisé. La **passe 9** protège le code pendant qu'on le modifie : branche dédiée, un commit par groupe, retour arrière connu, et un parcours de non-régression rejoué après chaque groupe. La **passe 10** donne le protocole de correction : reproduire avant de corriger, tester avant d'annoncer, et les dix vérifications avant de pousser.

L'audit se fait par passes numérotées, une à la fois : **constater** dans le code réel, **rapporter** avec fichier et gravité, **corriger** côté serveur, **vérifier** par une preuve. Jamais deux passes enchaînées sans vérification de la première.

Ordre recommandé pour un audit complet : **0 → 4 → 1 → 2 → 3 → 5 → 8 → 6**, puis 7, la passe 9 étant lue avant la première correction et rejouée après chaque groupe. Les secrets d'abord — une clé de service exposée rend toute règle d'autorisation inutile.

Pour une livraison rapide : les 10 points bloquants de `assets/checklist-pre-lancement.md`.

## Structure

```
SKILL.md                              méthode, passes, format de rapport
references/00-budget-de-friction.md   calibrer la sécurité sans casser l'expérience
references/01-authentification.md     jetons, sessions, mots de passe, 2FA
references/02-autorisation.md         rôles, IDOR, RLS, multi-tenant
references/03-entrees-et-api.md       injections, XSS, CSRF, uploads, paiement
references/04-secrets-et-exposition.md secrets, Git, dépendances, sauvegardes
references/05-infrastructure.md       en-têtes, TLS, DNS, serveur
references/06-rgpd-conformite.md      CNIL, cookies, droits, sous-traitants
references/07-verification.md         tests, preuves, rapport client
references/08-cicd-et-chaine-outils.md GitHub Actions, dépôt, chaîne d'approvisionnement
references/09-non-regression.md       Git, cassures, parcours de vérification
references/10-methode-de-correction.md corriger, tester, vérifier, livrer
assets/mission-audit-complet.md       prompt de mission — audit sécurité intégral
assets/mission-rgpd.md                prompt de mission — audit RGPD technique
assets/checklist-pre-lancement.md     à cocher avant chaque livraison
assets/prompts-rapides.md             20 prompts à coller, dans l'ordre
scripts/audit-express.sh              reconnaissance passive d'un site en ligne
scripts/lib-domaine.sh                normalisation de domaine (évite les faux positifs SPF/DMARC)

tests/                                suite de tests — à lancer après toute modification du code
  run-tests.sh                        lanceur unique, dit ce qui n'a PAS pu être testé
  sql/                                migrations, purge, effacement, sur un vrai PostgreSQL
  js/                                 bandeau de consentement (jsdom), syntaxe TypeScript
  shell/                              normalisation de domaine

conformite/                           le volet légal, en code plutôt qu'en conseils
  01-consentement-cookies.md          règle CNIL, exemptions, blocage réel
  02-retention-purge.md               durées par donnée, anonymiser ou supprimer
  03-effacement-et-portabilite.md     export, suppression, cascade, limites du droit
  04-preuve-et-registre.md            registre, DPA, violation 72h, barème des sanctions
  05-donnees-sensibles-et-aipd.md     base légale, article 9, AIPD, IA, minimisation
  code/consentement/                  bandeau vanilla + React, journal de preuve
  code/retention/                     politique déclarative, purge, migration SQL
  code/effacement/                    export, suppression en deux phases, rétractation, registre
```

## Le volet légal

Trois obligations produisent l'essentiel des sanctions CNIL sur les sites de petite et moyenne taille : **cookies déposés sans consentement valide**, **données conservées sans durée définie**, **impossibilité de supprimer ses données**. Une quatrième les rend opposables : **pouvoir le prouver**.

Le dossier `conformite/` les transforme en code à déposer dans chaque projet. Un bandeau qui n'empêche rien est pire que pas de bandeau : il affiche une conformité qu'il n'assure pas.

Ordre d'installation : consentement d'abord — c'est le seul point constatable depuis l'extérieur, sans contrôle sur pièces.

## Cadre

Cette compétence sert à sécuriser **ses propres projets** et ceux de ses clients, avec leur accord. Le script de reconnaissance n'effectue que des requêtes ordinaires, mais scanner un site tiers sans autorisation écrite reste une infraction.

Le volet RGPD est un guide de mise en conformité technique, pas un conseil juridique. Pour un traitement à risque, faire relire par un juriste ou un DPO.

## Licence

MIT
