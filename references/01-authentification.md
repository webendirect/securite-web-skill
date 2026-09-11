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

---

## 1.9 Données bancaires

**La faille.** Le site collecte lui-même le numéro de carte — un champ dans un formulaire maison, parfois enregistré « pour faciliter le prochain achat ». C'est le signal le plus alarmant qu'un visiteur puisse rencontrer, et la seule faille de cette compétence dont les conséquences se comptent directement en euros volés sur le compte de quelqu'un.

**Détecter.** Chercher dans les formulaires, les schémas de base et les journaux :

```
card        carte       numero_carte    pan
cvv         cvc         cryptogramme    security_code
expiry      exp_month   exp_year        date_expiration
```

Vérifier aussi ce que capturent le suivi d'erreurs et les journaux applicatifs : un outil configuré pour enregistrer le contenu des formulaires aspire le numéro de carte sans que personne l'ait décidé. Même chose pour les outils de rejeu de session, qui filment l'écran du visiteur.

**Le correctif.** La saisie passe par des **champs hébergés par le prestataire** — Stripe Elements, PayPal, Mollie, les solutions des banques françaises. Le numéro est saisi dans un cadre appartenant au prestataire, incrusté dans la page : les données ne touchent jamais le serveur du site, qui ne reçoit qu'un jeton de paiement.

Ce qu'on conserve légitimement côté site : l'identifiant client chez le prestataire, les quatre derniers chiffres, le type de carte, la date d'expiration du moyen enregistré chez le prestataire. Jamais le numéro complet, jamais le cryptogramme — celui-ci ne doit d'ailleurs être conservé par personne, même chiffré, même une seconde.

**Pourquoi c'est non négociable.** Traiter soi-même un numéro de carte fait entrer le client dans le périmètre PCI-DSS : questionnaire annuel, ségrégation réseau, chiffrement documenté, scans trimestriels. C'est hors de portée d'une PME, et le prestataire de paiement l'absorbe entièrement quand on utilise ses champs hébergés.

Cette règle vaut à **tous les niveaux** de la passe 0, y compris sur un site vitrine qui n'encaisse qu'un acompte. Il n'existe pas de volume assez faible pour justifier de stocker une carte.

**Si des données bancaires sont déjà en base**, c'est un incident, pas un correctif de routine : purger les colonnes, purger les journaux et les sauvegardes qui les contiennent, et vérifier si une notification s'impose — voir `conformite/04-preuve-et-registre.md`.

**Prompt à coller**

> Cherche si mon site collecte ou stocke lui-même des données bancaires : champs de formulaire (card, cvv, cvc, expiry, pan), colonnes de base correspondantes, et tout endroit où un journal, un outil de suivi d'erreurs ou un enregistreur de session pourrait capturer le contenu d'un formulaire de paiement. Si c'est le cas, remplace la saisie par les champs hébergés de mon prestataire de paiement, et dis-moi quelles données doivent être purgées de la base, des journaux et des sauvegardes existantes.

---

## 1.10 Changements sensibles et alertes

**La faille.** Le chemin classique du vol de compte définitif ne passe pas par le mot de passe : l'attaquant qui a une session ouverte **change l'adresse email**, puis demande une réinitialisation. Le propriétaire légitime ne peut plus rien récupérer — l'adresse de récupération appartient maintenant à quelqu'un d'autre.

Un mot de passe volé se change. Un compte dont l'email a été changé est perdu.

**Le protocole du changement d'adresse email.** Cinq règles, et la deuxième est celle qui protège réellement :

1. Le mot de passe est redemandé avant même d'accepter la demande.
2. Un email part vers l'**ancienne** adresse, contenant un lien d'annulation valable plusieurs jours. C'est le seul point de la chaîne que l'attaquant ne contrôle pas.
3. Un lien de validation part vers la nouvelle adresse.
4. Le changement ne devient effectif qu'après validation de la nouvelle adresse.
5. L'ancienne adresse reste l'adresse de connexion et de récupération tant que ce n'est pas confirmé.

**Les notifications qui protègent vraiment.** Un email court, qui dit ce qui vient de se passer et quoi faire si ce n'était pas l'utilisateur :

| Événement | Destinataire |
|---|---|
| Demande de changement d'email | ancienne **et** nouvelle adresse |
| Mot de passe changé | adresse du compte |
| 2FA activée ou désactivée | adresse du compte |
| Moyen de paiement ajouté | adresse du compte |
| Suppression de compte demandée | adresse du compte |
| Connexion depuis un appareil ou une localisation inconnus | adresse du compte |

Chaque message doit contenir une action : « ce n'était pas vous ? sécurisez votre compte » avec un lien qui révoque les sessions et force une réinitialisation.

**Appareils connectés.** Un écran listant les sessions actives — date, appareil, localisation approximative — avec la possibilité de révoquer une session ou toutes les autres. C'est ce qui permet à quelqu'un qui se sait compromis de reprendre la main sans appeler le support.

**Calibrer selon la passe 0.** Aux niveaux 1 et 2, les alertes de changement d'email et de mot de passe suffisent, et elles coûtent deux emails à écrire. Les alertes de connexion et l'écran des appareils ne se justifient qu'à partir du **niveau 3** : sur un site à faible enjeu, elles produisent surtout des messages ignorés, et un signal qu'on ignore ne protège plus de rien.

**Ne pas fuiter en alertant.** L'email d'alerte ne contient jamais le mot de passe, le jeton, ni l'adresse IP complète. « Un nouvel appareil s'est connecté depuis la France » suffit ; l'adresse exacte appartient aux journaux, pas à un email qui peut être transféré.

**Prompt à coller**

> Vérifie comment mon app gère le changement d'adresse email. Mets en place le protocole complet : mot de passe redemandé, email de confirmation envoyé à l'ANCIENNE adresse avec un lien d'annulation valable plusieurs jours, lien de validation vers la nouvelle, changement effectif seulement après validation. Ajoute ensuite les notifications sur les événements sensibles — changement de mot de passe, 2FA, moyen de paiement, suppression de compte — chacune avec une action « ce n'était pas vous ». Dis-moi quelles alertes tu recommandes au niveau de sécurité retenu en passe 0, et lesquelles seraient excessives.
