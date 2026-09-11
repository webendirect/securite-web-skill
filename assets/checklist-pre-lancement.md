# Checklist avant mise en ligne

À passer avant chaque livraison. Les 10 premiers points sont **bloquants** : on ne met pas en ligne tant qu'ils ne sont pas cochés.

---

## Avant de commencer

- [ ] Questionnaire client rempli (`assets/questionnaire-client.md`), « je ne sais pas » listés
- [ ] Niveau de sécurité retenu (1 à 4) et protections écartées volontairement, écrits noir sur blanc
- [ ] Accès inventoriés : comptes au nom du client, 2FA sur le registrar, anciens prestataires révoqués
- [ ] Documentation de reprise remise au client
- [ ] Dépôt propre, branche dédiée créée
- [ ] Sauvegarde de la base testée, chemin de retour arrière connu chez l'hébergeur

## Bloquants

- [ ] **1.** Aucun secret dans le code client ni dans le bundle construit (`grep` sur `.next/`, `dist/`, `build/`)
- [ ] **2.** Aucun `.env`, clé ou identifiant dans l'historique Git — et les clés déjà exposées ont été **révoquées**
- [ ] **3.** Chaque route sensible refait la vérification d'authentification et de rôle **côté serveur**
- [ ] **4.** Chaque accès à une ressource filtre sur le propriétaire dans la requête (test croisé A → ressource de B = 404)
- [ ] **5.** Row Level Security activée avec des policies (Supabase) ou règles Firestore fermées
- [ ] **6.** Token de session en cookie `httpOnly` + `secure` + `sameSite`, jamais dans `localStorage`
- [ ] **7.** Rate limiting sur connexion, inscription, mot de passe oublié et envoi d'emails
- [ ] **8.** Validation des entrées côté serveur sur toutes les routes qui écrivent
- [ ] **9.** HTTPS forcé, en-têtes de sécurité posés, `/.env` et `/.git/` inaccessibles en ligne
- [ ] **10.** Sauvegarde automatique configurée, stockée ailleurs, et **une restauration testée**

---

## Authentification

- [ ] Mots de passe : 12 caractères minimum, contrôle Have I Been Pwned, hachage argon2id ou bcrypt coût ≥ 12
- [ ] Vérification d'email à l'inscription, compte inactif tant que non confirmé
- [ ] Token de réinitialisation aléatoire, haché en base, à usage unique, expirant en 30–60 min
- [ ] Sessions invalidées à la déconnexion et au changement de mot de passe
- [ ] Réponses identiques que le compte existe ou non (connexion, inscription, mot de passe oublié)
- [ ] 2FA disponible, et obligatoire pour les comptes administrateurs
- [ ] Aucune donnée bancaire collectée ni stockée par le site — champs hébergés du prestataire
- [ ] Changement d'email protégé : mot de passe redemandé, confirmation à l'ancienne adresse, validation de la nouvelle
- [ ] Alertes sur les événements sensibles, avec une action « ce n'était pas vous »
- [ ] OAuth : `state` vérifié, PKCE, URL de redirection sur liste blanche, email vérifié exigé

## Données et API

- [ ] Requêtes paramétrées partout, aucun SQL construit par concaténation
- [ ] Champs modifiables en liste blanche (pas de `...req.body`)
- [ ] Réponses API en sélection explicite de champs, aucun hash ni token renvoyé
- [ ] Pagination bornée, taille de body limitée
- [ ] Prix, montants et statuts relus côté serveur, jamais pris du client
- [ ] Webhooks : signature vérifiée sur le corps brut, traitement idempotent
- [ ] Uploads : type réel vérifié, taille limitée, fichier renommé, stocké hors racine web
- [ ] Pas d'`innerHTML` / `dangerouslySetInnerHTML` sur du contenu utilisateur non assaini
- [ ] CORS en liste blanche exacte, pas de joker avec credentials
- [ ] Redirections `?next=` limitées aux chemins relatifs internes

## Infrastructure

- [ ] HSTS, CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- [ ] Note A minimum sur securityheaders.com et SSL Labs
- [ ] `X-Powered-By` et versions de serveur masqués
- [ ] Sourcemaps désactivées en production
- [ ] Mode debug désactivé, messages d'erreur génériques
- [ ] Préproduction protégée par mot de passe, `noindex`, données anonymisées
- [ ] SPF, DKIM et DMARC configurés sur le domaine
- [ ] Domaine verrouillé, renouvellement automatique, 2FA sur le compte registrar
- [ ] `npm audit` sans vulnérabilité high ou critical
- [ ] Dependabot ou Renovate activé sur le dépôt

## Dépôt et CI/CD

- [ ] Permissions des workflows en lecture seule par défaut
- [ ] Actions tierces épinglées au SHA du commit, pas à une étiquette
- [ ] Aucun `pull_request_target` faisant un checkout du code de la PR
- [ ] Aucun secret visible dans les journaux d'exécution
- [ ] Branche par défaut protégée, poussée forcée interdite
- [ ] Push protection des secrets activée
- [ ] Collaborateurs et jetons passés en revue, anciens accès révoqués

## Formulaires publics

- [ ] Protection anti-bot (Turnstile + honeypot), vérifiée côté serveur
- [ ] Rate limiting sur la soumission
- [ ] Validation et assainissement des champs avant envoi par email
- [ ] Confirmation d'envoi sans révéler d'information interne

## RGPD

> Code prêt à installer pour les quatre points ci-dessous : `conformite/`.

- [ ] Aucun traceur non nécessaire déposé avant consentement
- [ ] Bandeau conforme : Refuser aussi accessible qu'Accepter, choix conservé, retrait possible
- [ ] Mentions légales complètes (éditeur, SIRET, directeur de publication, hébergeur)
- [ ] Politique de confidentialité citant les outils réellement utilisés
- [ ] Cases de consentement non pré-cochées, distinctes par finalité
- [ ] Durées de conservation définies et purge automatique en place
- [ ] Procédure d'exercice des droits remise au client
- [ ] DPA signés avec les sous-traitants, y compris entre toi et ton client
- [ ] Polices et scripts tiers hébergés en local quand c'est possible
- [ ] Journal de preuve des consentements en place et alimenté
- [ ] Purge automatique planifiée et testée en simulation
- [ ] Routes d'export et de suppression de compte fonctionnelles, testées en croisé
- [ ] Registre des traitements rédigé et remis au client

## Ne rien avoir cassé

- [ ] Parcours de non-régression complet rejoué après le dernier groupe de correctifs
- [ ] Testé avec un compte neuf **et** un compte antérieur aux modifications
- [ ] Testé sur mobile et sur ordinateur
- [ ] Console du navigateur sans erreur CSP ni CORS sur toutes les pages
- [ ] Chaque rôle testé, pas seulement l'administrateur
- [ ] Redirections 301 en place pour toute URL qui a disparu
- [ ] Aucun `noindex` de préproduction parti en production
- [ ] Aucun 429 déclenché par un usage normal (bureau partagé, mobile)

## Suivi après la mise en ligne

- [ ] Suivi des erreurs actif, avec filtrage des données personnelles
- [ ] Alerte de disponibilité
- [ ] Alerte d'expiration du certificat et du domaine
- [ ] Alerte sur les pics de 401/403/429
- [ ] Date de prochaine revue fixée, et déclencheurs hors calendrier expliqués au client
- [ ] Variantes évidentes du domaine déposées, ou risque accepté par écrit
