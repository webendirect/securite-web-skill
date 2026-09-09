# Passe 1 — Authentification et sessions

C'est la porte d'entrée. Si elle cède, le reste ne compte plus.

---

## 1.1 Le jeton de connexion est mal stocké

**La faille.** Le token d'authentification (JWT, token de session) est mis dans `localStorage`, `sessionStorage` ou une variable JavaScript accessible. N'importe quel script qui tourne sur la page — une XSS, une extension, une dépendance npm compromise — le lit et se connecte à la place de l'utilisateur. Un token volé dans le localStorage reste valable jusqu'à son expiration, même si l'utilisateur ferme son navigateur.

**Détecter.** Chercher dans tout le projet :

```
localStorage.setItem
sessionStorage.setItem
localStorage.getItem('token'
Authorization: `Bearer ${
document.cookie =
```

Regarder aussi la réponse de la route de login : renvoie-t-elle le token dans le JSON du body ? Si oui, le front le stocke forcément quelque part.

**Le correctif.** Le token part dans un cookie posé par le serveur avec :

- `httpOnly: true` — JavaScript ne peut plus le lire
- `secure: true` — transmis uniquement en HTTPS
- `sameSite: 'lax'` (ou `'strict'` si aucun flux de retour externe) — protège contre le CSRF
- `path: '/'`
- `maxAge` court et explicite

En Next.js (route handler) :

```ts
import { cookies } from 'next/headers'

const cookieStore = await cookies()
cookieStore.set('session', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 jours
})
```

En Express :

```js
res.cookie('session', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000,
})
```

Avec Supabase Auth : utiliser `@supabase/ssr` et le client serveur, qui gère les cookies httpOnly. Ne pas conserver la session côté client avec `persistSession` dans un stockage local pour une app avec backend.

**Attention.** Passer en cookie ouvre la porte au CSRF, que le token en header n'avait pas. `sameSite: 'lax'` couvre l'essentiel, mais si des requêtes POST cross-site existent (webhook, retour de paiement, iframe), il faut un token anti-CSRF. Voir passe 3.

**Prompt à coller**

> Vérifie où mon app stocke le jeton de connexion. S'il est dans le localStorage, le sessionStorage ou accessible en JavaScript, déplace-le vers un cookie httpOnly, secure, sameSite=lax, avec une expiration explicite. Adapte le front et le back, et vérifie que la connexion, la déconnexion et le rafraîchissement de page fonctionnent toujours. Dis-moi ensuite si ce changement m'expose au CSRF et ce qu'il faut ajouter.

---

## 1.2 Pas de vérification par email à l'inscription

**La faille.** On peut créer un compte avec l'adresse de quelqu'un d'autre. Conséquences : usurpation, spam sortant depuis ton domaine (ce qui abîme sa réputation d'envoi), comptes fantômes qui gonflent la base, et récupération de compte détournée si l'email non vérifié sert plus tard à réinitialiser le mot de passe.

**Détecter.** La table utilisateurs a-t-elle une colonne `email_verified` / `verified_at` ? Est-elle vérifiée avant d'autoriser une action ? Souvent la colonne existe et personne ne la lit.

**Le correctif.**

- Compte créé mais inactif tant que l'email n'est pas confirmé.
- Lien de confirmation avec un token aléatoire (32 octets minimum), à usage unique, expirant en 24 h, stocké **haché** en base.
- Le contrôle « est-ce que cet email est vérifié » se fait côté serveur, dans le middleware, pas dans l'affichage.
- Renvoi du lien limité en fréquence (sinon c'est un outil d'envoi de spam gratuit).
- Même comportement de réponse que l'email existe déjà ou non, pour ne pas révéler qui est inscrit.

**Prompt à coller**

> Ajoute une vérification par email à l'inscription : tant que l'utilisateur n'a pas confirmé son adresse, son compte reste inactif et les actions sensibles sont refusées côté serveur. Le lien de confirmation doit utiliser un token aléatoire à usage unique, stocké haché, expirant en 24h. Limite le renvoi du lien. Vérifie que la réponse est identique que l'email soit déjà inscrit ou non.

---

## 1.3 Aucune limite sur connexion et mot de passe oublié

**La faille.** On teste mot de passe sur mot de passe sans jamais être bloqué. Avec une liste de mots de passe fuités, un attaquant essaie des milliers de combinaisons par minute (credential stuffing). C'est de loin l'attaque la plus courante sur un petit site.

**Détecter.** Chercher un middleware de rate limiting sur les routes `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-otp`, et sur l'envoi d'emails.

**Le correctif.** Limiter sur **deux clés à la fois** :

- par IP : ~10 tentatives / 10 minutes
- par identifiant (email) : ~5 tentatives / 15 minutes — sinon un attaquant qui change d'IP passe à travers

Après dépassement : réponse `429` avec `Retry-After`, délai progressif plutôt que verrouillage définitif du compte (un verrouillage permanent est un déni de service : il suffit de bloquer volontairement le compte d'un concurrent).

Outils : `@upstash/ratelimit` (Vercel/serverless), `express-rate-limit` (Node), le rate limiting natif de Cloudflare, ou `fail2ban` sur VPS. En serverless, un compteur en mémoire ne sert à rien — chaque instance a le sien. Il faut un stockage partagé (Redis, Upstash, base).

Sur mot de passe oublié : réponse **toujours identique** (« si un compte existe, un email a été envoyé »), quel que soit le résultat, et limitation stricte des envois.

**Prompt à coller**

> Mets un rate limiting sur la connexion, l'inscription, le mot de passe oublié et l'envoi d'emails. Limite par IP ET par email, avec un blocage temporaire progressif plutôt qu'un verrouillage définitif du compte. Utilise un stockage partagé si l'app est en serverless. Renvoie un 429 avec Retry-After. Vérifie qu'aucune réponse ne révèle si un compte existe. Dis-moi les limites choisies.

---

## 1.4 Aucune règle sur les mots de passe

**La faille.** Mots de passe faibles ou déjà fuités acceptés sans broncher. « azerty123 » passe.

**Le correctif.**

- Minimum **12 caractères**, pas de règle absurde de complexité (les exigences majuscule+chiffre+symbole poussent aux mots de passe prévisibles). Longueur > complexité.
- Refuser les mots de passe présents dans les fuites, via l'API **Have I Been Pwned** en k-anonymity : on envoie les 5 premiers caractères du SHA-1 du mot de passe, jamais le mot de passe. L'API renvoie les suffixes correspondants, on compare localement.
- Pas de maximum bas (autoriser au moins 64 caractères, les gestionnaires de mots de passe en génèrent de longs).
- Pas de rotation forcée tous les 90 jours — recommandation abandonnée par l'ANSSI et le NIST, elle produit des mots de passe incrémentés.
- Hachage : **argon2id** (préféré) ou **bcrypt** avec un coût ≥ 12. Jamais MD5, SHA-1, SHA-256 nu.

**Détecter.** Chercher `md5(`, `sha1(`, `sha256(` près de `password`, ou `bcrypt.hash(pwd, 10)` avec un coût faible.

**Prompt à coller**

> Ajoute des règles sur les mots de passe : minimum 12 caractères, maximum au moins 64, et un contrôle contre la base Have I Been Pwned via l'API k-anonymity (ne jamais envoyer le mot de passe complet). Vérifie que le hachage utilise argon2id ou bcrypt avec un coût d'au moins 12. Applique ces règles à l'inscription ET à la réinitialisation. Ne mets pas de rotation forcée.

---

## 1.5 Cycle de vie de la session

**La faille.** Le token reste valable pour toujours, ou après la déconnexion, ou après un changement de mot de passe. Un token volé il y a six mois marche encore.

**Le correctif.**

- **Rotation à la connexion** : générer un nouvel identifiant de session à chaque login (empêche la fixation de session).
- **Révocation réelle à la déconnexion** : supprimer le cookie ET invalider la session côté serveur. Un JWT auto-porteur n'est pas révocable — d'où soit une session en base, soit un JWT court (15 min) avec un refresh token révocable.
- **Invalider toutes les sessions** au changement de mot de passe et après une réinitialisation.
- **Expiration** : session courte pour un back-office (quelques heures), plus longue pour un site grand public, mais jamais infinie.
- Écran « appareils connectés » avec possibilité de tout déconnecter, si l'app gère des données sensibles.

**Prompt à coller**

> Vérifie le cycle de vie des sessions : rotation de l'identifiant de session à la connexion, invalidation réelle côté serveur à la déconnexion, invalidation de toutes les sessions au changement ou à la réinitialisation du mot de passe, et une expiration explicite. Si on utilise des JWT auto-portés, explique-moi comment on les révoque et propose un refresh token révocable.

---

## 1.6 Réinitialisation de mot de passe

**La faille.** Le token de réinitialisation est prévisible, réutilisable, sans expiration, ou envoyé dans une URL qui fuite via le `Referer`.

**Le correctif.**

- Token de 32 octets minimum, généré par un CSPRNG (`crypto.randomBytes`, pas `Math.random`).
- Stocké **haché** en base — si la base fuite, les tokens ne sont pas utilisables.
- Usage unique, invalidé dès consommation.
- Expiration en 30 à 60 minutes.
- Comparaison en temps constant (`crypto.timingSafeEqual`).
- Invalide toutes les sessions existantes après réinitialisation.
- Email de notification « votre mot de passe a été changé », avec un moyen de signaler.

**Détecter.** Chercher `Math.random()` dans la génération de tokens : c'est prévisible, ça n'a rien à faire là.

---

## 1.7 Double authentification (2FA)

À proposer dès qu'il y a un back-office, des données clients, ou de l'argent.

- TOTP (Google Authenticator, Authy) plutôt que SMS — le SMS est vulnérable au SIM swapping.
- Codes de secours à usage unique, affichés une seule fois, stockés hachés.
- 2FA **obligatoire pour les comptes administrateurs**, optionnelle pour les autres.
- Redemander le mot de passe avant de désactiver la 2FA ou de changer l'email.

**Prompt à coller**

> Propose-moi une double authentification TOTP pour les comptes administrateurs : QR code à l'activation, codes de secours à usage unique stockés hachés, et redemande du mot de passe avant toute désactivation. Rends-la obligatoire pour les admins et optionnelle pour les autres utilisateurs.

---

## 1.8 Connexion via un fournisseur externe (Google, GitHub)

Points à vérifier si l'app utilise OAuth / OIDC :

- Le paramètre `state` est généré aléatoirement et **vérifié au retour** (sinon CSRF sur la connexion).
- PKCE activé pour tout client public.
- Les URL de redirection sont sur une liste blanche stricte, sans joker.
- L'email renvoyé par le fournisseur n'est accepté que s'il est marqué vérifié — sinon on peut créer un compte chez un fournisseur laxiste avec l'email d'une victime et prendre son compte existant.
- Le rattachement d'un compte OAuth à un compte existant demande une confirmation, jamais un rattachement automatique sur simple correspondance d'email.
