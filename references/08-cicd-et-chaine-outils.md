# Passe 8 — CI/CD, dépôt et chaîne d'outils

Le trou le moins surveillé. Un attaquant qui obtient l'exécution dans un workflow GitHub Actions récupère tous les secrets du dépôt — clés de déploiement, tokens cloud, identifiants de base — sans jamais toucher au site.

---

## 8.1 Permissions des workflows

**La faille.** Par défaut, sur beaucoup de dépôts, le `GITHUB_TOKEN` a des permissions en écriture sur tout. N'importe quelle action tierce compromise dans le workflow peut alors pousser du code, modifier les releases, ou ouvrir une porte durable.

**Le correctif.** Moindre privilège, déclaré explicitement en tête de workflow :

```yaml
permissions:
  contents: read      # par défaut, rien d'autre

jobs:
  build:
    permissions:
      contents: read
      id-token: write # uniquement si OIDC est réellement utilisé
```

Et dans les réglages du dépôt : Settings → Actions → General → Workflow permissions → **Read repository contents**.

---

## 8.2 Actions tierces

**La faille.** `uses: quelquun/action@v1` suit une étiquette mutable. Le propriétaire de l'action — ou quiconque prend son compte — peut réécrire `v1` et exécuter n'importe quoi dans le contexte de tes secrets. Plusieurs compromissions réelles ont suivi ce chemin.

**Le correctif.** Épingler au **SHA du commit**, pas à l'étiquette :

```yaml
# Fragile — l'étiquette peut être déplacée
- uses: actions/checkout@v4

# Sûr — le contenu est figé
- uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
```

Limiter les actions autorisées : Settings → Actions → Allow select actions. Et se demander, pour chaque action tierce, si trois lignes de shell ne feraient pas le même travail sans dépendance.

---

## 8.3 `pull_request_target`

**La faille.** La plus vicieuse des configurations GitHub Actions. Ce déclencheur s'exécute avec les **secrets du dépôt** et les permissions d'écriture, mais dans le contexte d'une pull request qui peut venir de n'importe qui. Si le workflow fait un `checkout` du code de la PR puis l'exécute — un simple `npm install` suffit, via les scripts de post-installation — l'auteur de la PR exécute son code avec tes secrets.

**Le correctif.** Ne jamais faire de checkout du code de la PR dans un workflow `pull_request_target`. Utiliser `pull_request` pour tout ce qui exécute du code non fiable ; réserver `pull_request_target` aux tâches qui ne touchent pas au contenu de la PR (étiquetage, commentaire).

---

## 8.4 Secrets dans les journaux d'exécution

**La faille.** Un `echo $TOKEN`, un `set -x`, un mode verbeux, ou une erreur qui affiche l'environnement, et le secret se retrouve dans un journal — public si le dépôt l'est, et conservé.

GitHub masque les valeurs qu'il connaît, mais pas leurs dérivées : un secret encodé en base64, découpé, ou interpolé dans une URL passe à travers le masquage.

**Le correctif.** Ne jamais afficher un secret ni le passer en argument de ligne de commande (visible dans la liste des processus) — le passer par variable d'environnement. Interdire `set -x` dans les étapes qui manipulent des secrets. Relire les journaux d'un workflow réel avant de rendre un dépôt public.

---

## 8.5 Secrets d'environnement et déploiement

- Secrets **distincts** par environnement, déclarés dans les *Environments* GitHub plutôt qu'au niveau du dépôt.
- Environnement de production avec **révision obligatoire** avant déploiement.
- Préférer **OIDC** à des clés cloud statiques : le workflow obtient un jeton court, il n'y a plus de clé longue durée à voler. Disponible sur AWS, GCP, Azure et Vercel.
- Aucun secret de production accessible depuis une branche de fonctionnalité.

---

## 8.6 Protection des branches

- Branche par défaut protégée : pas de poussée directe, PR obligatoire.
- Historique linéaire et poussée forcée interdite — une réécriture d'historique peut effacer la trace d'une compromission.
- Vérifications de statut obligatoires avant fusion (tests, lint, audit).
- **Push protection** activée pour les secrets (Settings → Code security) : GitHub refuse alors la poussée d'une clé détectée, ce qui vaut mieux que de la révoquer après coup.
- Alertes Dependabot et mises à jour de sécurité activées.

---

## 8.7 Accès au dépôt

- Inventaire des collaborateurs et de leurs droits — les anciens prestataires y restent souvent des années.
- 2FA obligatoire au niveau de l'organisation.
- Clés de déploiement en lecture seule quand l'écriture n'est pas nécessaire.
- Jetons personnels : portée minimale, expiration fixée. Un PAT « all repos, no expiry » sur le poste d'un développeur est une clé maîtresse.
- Applications et intégrations tierces autorisées sur l'organisation : les passer en revue, révoquer ce qui n'est plus utilisé.

---

## 8.8 Dépendances : la nuance à respecter

`npm audit` d'accord, mais **pas de mise à jour aveugle**. Sur une dépendance critique, une montée de version majeure pour corriger une vulnérabilité mineure peut casser la production — le remède devient le problème.

Méthode :

1. Évaluer si la vulnérabilité est **atteignable** dans le projet. Une faille dans un chemin de code jamais appelé n'a pas la même urgence.
2. Préférer une version corrective mineure quand elle existe.
3. Pour un changement majeur : lire les notes de version, tester, déployer séparément.
4. Traiter d'abord **high** et **critical** en dépendances de production ; les dépendances de développement viennent après (`--omit=dev` pour faire le tri).

Vérifier aussi qu'aucun paquet n'est installé depuis une URL Git arbitraire, et que le lockfile est bien commité — la production installe avec `npm ci`, jamais `npm install`.

---

## 8.9 Scripts de post-installation

Un paquet npm peut exécuter du code à l'installation. C'est le vecteur privilégié des compromissions de la chaîne d'approvisionnement, et il s'exécute aussi bien sur le poste du développeur que dans la CI.

Sur un projet sensible : `npm ci --ignore-scripts`, puis lancer explicitement les rares scripts de construction nécessaires. Au minimum, l'activer dans la CI, où les secrets sont présents.

---

## Prompt à coller

> Audite ma configuration GitHub et CI/CD : permissions des workflows (doivent être en lecture seule par défaut), actions tierces épinglées au SHA plutôt qu'à une étiquette, absence de checkout de code de PR dans un pull_request_target, secrets qui pourraient fuiter dans les journaux, protection de la branche par défaut, push protection des secrets, et collaborateurs ou jetons aux droits excessifs. Propose ensuite le passage à OIDC si des clés cloud statiques sont stockées en secrets.
