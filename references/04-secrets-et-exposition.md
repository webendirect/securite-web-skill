# Passe 4 — Secrets, dépendances, exposition

À faire en premier. Un secret exposé rend toutes les autres protections inutiles.

---

## 4.1 Secrets dans le code client

**La faille.** Une clé API se retrouve dans le bundle JavaScript envoyé au navigateur. Tout ce qui part au navigateur est public — la minification n'est pas du chiffrement.

**Détecter.** Chercher dans le code front :

```
NEXT_PUBLIC_
VITE_
REACT_APP_
PUBLIC_
sk_live_        (clé secrète Stripe)
sk-             (clé OpenAI/Anthropic)
service_role    (Supabase)
AKIA            (AWS)
-----BEGIN
```

Puis, après un build, chercher directement dans les fichiers produits :

```bash
npm run build
grep -rEn "sk_live_|sk-[A-Za-z0-9]{20,}|service_role|AKIA[0-9A-Z]{16}" .next/ dist/ build/ 2>/dev/null
```

Toute variable préfixée `NEXT_PUBLIC_`, `VITE_`, `REACT_APP_` est **inlinée dans le bundle par construction**. Y mettre un secret est une erreur systématique des générateurs de code.

Sont légitimes côté client : clé publique Stripe (`pk_`), clé anon Supabase (à condition que la RLS soit active — voir passe 2.3), clé de site reCAPTCHA/Turnstile, identifiant d'analytics.

Ne le sont jamais : `service_role`, `sk_live_`, clés OpenAI/Anthropic, tokens SMTP, secrets de webhook, identifiants de base de données, clés privées.

**Le correctif.** Déplacer l'appel côté serveur (route handler, server action, fonction serverless) et faire transiter la requête par lui. Puis **révoquer et régénérer** la clé exposée — la déplacer ne suffit pas, elle a été publiée.

---

## 4.2 Secrets commités dans Git

**La faille.** Un `.env` commité. Même supprimé plus tard, il reste dans l'historique et dans tous les clones et forks.

**Détecter.**

```bash
git log --all --full-history --name-only -- '*.env*' '*credentials*' '*.pem' '*.key'
git grep -nE "sk_live_|service_role|BEGIN (RSA|OPENSSH|PRIVATE)" $(git rev-list --all) 2>/dev/null | head -50
```

**Le correctif.**

1. **Révoquer d'abord.** Toute clé passée par un dépôt est compromise, y compris un dépôt privé (les bots scannent les fuites de tokens GitHub, et un collaborateur ancien a pu cloner).
2. Ajouter `.env`, `.env.*`, `*.pem`, `*.key` au `.gitignore` ; garder un `.env.example` sans valeurs.
3. Nettoyer l'historique avec `git filter-repo` ou BFG si le dépôt est public.
4. Activer la protection contre les fuites de secrets côté GitHub (Push protection).

---

## 4.3 Fichiers sensibles accessibles en ligne

Tester directement, en HTTP, sur le site en production :

```
/.env
/.git/config
/.git/HEAD
/config.php.bak
/backup.sql
/wp-config.php.save
/phpinfo.php
/adminer.php
/.DS_Store
/package.json
/composer.lock
/storage/logs/laravel.log
```

Un `/.git/` exposé permet de reconstituer **tout le code source**, historique compris. C'est fréquent sur les déploiements par FTP ou `git pull` en production.

Vérification rapide :

```bash
for p in .env .git/config .git/HEAD backup.sql phpinfo.php .DS_Store; do
  printf '%-20s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://TON-DOMAINE/$p)"
done
```

Tout ce qui n'est pas 404 ou 403 est à traiter.

---

## 4.4 Sourcemaps en production

Les `.map` publiés livrent le code source original, commentaires et noms de variables compris. Utile en développement, à désactiver en production (`productionBrowserSourceMaps: false` en Next.js, `build.sourcemap: false` en Vite) — ou à téléverser en privé chez Sentry plutôt qu'à servir publiquement.

---

## 4.5 Dépendances

**La faille.** Une dépendance vulnérable, ou un paquet compromis qui exfiltre les variables d'environnement au moment de l'installation. Les attaques sur la chaîne d'approvisionnement npm sont devenues courantes.

**Le correctif.**

```bash
npm audit --omit=dev
npm outdated
```

- Corriger tout ce qui est **high** et **critical** avant une mise en production.
- Committer le **lockfile** et déployer avec `npm ci` (pas `npm install`), pour que la production installe exactement ce qui a été testé.
- Activer **Dependabot** ou Renovate sur le dépôt (alertes de sécurité + mises à jour automatiques).
- Se méfier des dépendances ajoutées « pour une seule fonction » : chacune apporte son propre arbre de dépendances.
- Vérifier qu'aucun paquet n'est installé depuis une URL Git arbitraire ou un registre non officiel.

Sur un site WordPress : les extensions et thèmes sont la première cause de compromission. Supprimer (pas seulement désactiver) tout ce qui n'est pas utilisé, mettre à jour le cœur, refuser les thèmes nulled.

---

## 4.6 Gestion des secrets en production

- Les secrets vivent dans les variables d'environnement de l'hébergeur (Vercel, Netlify, o2switch, panneau du VPS), jamais dans un fichier commité.
- Secrets **différents** entre développement, préproduction et production.
- Rotation lors d'un départ de prestataire ou de collaborateur.
- Sur un VPS : `chmod 600` sur le `.env`, propriétaire correct, jamais servi par le serveur web.
- Ne jamais envoyer un secret par email, Slack ou WhatsApp — utiliser un partage à usage unique et expirant.

---

## 4.7 Messages d'erreur et journaux

**La faille.** Une trace d'exception affichée en production révèle chemins, versions, requêtes SQL, parfois des identifiants. Un message « cet email n'existe pas » révèle qui est inscrit.

**Le correctif.**

- `NODE_ENV=production`, `APP_DEBUG=false`, `display_errors=Off`. Message générique côté utilisateur, détail dans les journaux serveur.
- Réponses identiques pour la connexion, l'inscription et le mot de passe oublié, quel que soit l'existence du compte.
- Ne **jamais journaliser** : mots de passe, tokens, cookies de session, numéros de carte, corps complet des requêtes d'authentification. Un journal est souvent moins protégé que la base.
- Conserver les journaux d'accès et d'authentification assez longtemps pour pouvoir enquêter (30 à 90 jours), et savoir où ils sont.

---

## 4.8 Surveillance

Un audit est une photo à un instant donné. Ce qui tient dans le temps :

- Suivi des erreurs (Sentry ou équivalent), avec filtrage des données personnelles.
- Alerte sur les pics de 401/403/429 — signe d'une attaque en cours.
- Alerte de disponibilité (UptimeRobot ou équivalent).
- Alerte d'expiration du certificat TLS et du nom de domaine (un domaine expiré est un détournement à venir).
- Sur WordPress : WPScan ou Wordfence pour les alertes de vulnérabilité d'extensions.

---

### Reconnaître qu'on est déjà compromis

Les alertes ci-dessus signalent une attaque **en cours**. Elles ne disent rien d'une intrusion déjà réussie et installée — cas le plus fréquent, puisque la majorité des victimes l'apprennent par un tiers, des mois après.

Les signes à chercher, sur le serveur comme dans l'application :

- un **compte administrateur** qu'on ne reconnaît pas, ou un compte existant dont le rôle a changé ;
- un **fichier modifié sans déploiement** — comparer les dates de modification avec la date du dernier déploiement ;
- un fichier **apparu dans un dossier d'upload**, surtout s'il est exécutable ;
- une **tâche planifiée** ou un processus inconnu (`crontab -l`, `systemctl list-timers`, les tâches planifiées WordPress) ;
- du **trafic sortant inhabituel** — le serveur qui contacte des adresses qu'il n'a aucune raison de contacter ;
- un **envoi massif d'emails** depuis le domaine, ou une chute brutale de la délivrabilité ;
- le site **signalé comme dangereux** par un navigateur, ou déclassé sans raison par un moteur de recherche ;
- des **pages inconnues indexées** — le référencement parasite est la monétisation la plus courante d'un site compromis, et il reste invisible pour le propriétaire, qui ne voit jamais ces pages.

Si l'un de ces signes est constaté, **on ne nettoie pas d'abord** : on préserve les journaux et une copie de l'état actuel avant toute intervention, sinon on détruit la seule trace de ce qui s'est passé et on ne saura jamais par où l'attaquant est entré — ni s'il est toujours là. La suite relève de la procédure de violation : `conformite/04-preuve-et-registre.md`.

---

## 4.9 Sauvegardes

Ce n'est pas un sujet annexe : la sauvegarde est la dernière défense contre le rançongiciel et contre la fausse manipulation.

- Sauvegarde **automatique** de la base et des fichiers téléversés, quotidienne.
- Stockée **ailleurs** que sur le serveur de production (une sauvegarde sur la même machine disparaît avec elle).
- **Chiffrée**, et testée : une restauration doit avoir été faite au moins une fois, sinon on ne sait pas si la sauvegarde fonctionne.
- Rétention suffisante pour détecter une corruption ancienne (30 jours).
- Documenter le temps de restauration : le client doit savoir combien de temps son site est indisponible dans le pire cas.
