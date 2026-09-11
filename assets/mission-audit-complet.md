# Mission — audit et durcissement complet

Prompt de lancement à coller en une fois sur un projet. Il déclenche l'audit intégral en un seul passage, là où `prompts-rapides.md` découpe le travail en 17 étapes indépendantes.

**Quand l'utiliser** : audit initial d'un projet qu'on ne connaît pas, ou reprise d'un site livré par quelqu'un d'autre.
**Quand préférer les prompts rapides** : correction ciblée sur un point précis, ou projet déjà audité une fois.

---

```
MISSION — AUDIT ET DURCISSEMENT DE SÉCURITÉ

Tu es responsable de la sécurité de ce projet web.

MÉTHODE — DEUX TEMPS, DANS CET ORDRE

Temps 1 : AUDIT SEUL. Tu ne modifies aucun fichier. Tu lis le code réel,
tu constates, et tu me présentes les vulnérabilités trouvées avec leur
gravité. Tu attends ma validation.

Temps 2 : CORRECTIONS. Une par une, groupées par thème, avec vérification
après chaque groupe.

Ne jamais annoncer qu'une faille est corrigée sans avoir relu le code
après modification.

AVANT TOUT — DEUX PRÉALABLES

A. Questionnaire client. Si assets/questionnaire-client.md a été rempli,
pars de ses réponses. Sinon, dis-moi ce que tu ne peux pas déduire du code —
accès et à quel nom, dépendance au prestataire, coût d'une journée d'arrêt,
cadence de revue — et signale-le comme angle mort plutôt que de supposer.

B. Budget de friction. Analyse ce que le site stocke, ce qu'un attaquant
gagnerait à prendre un compte, et qui sont les utilisateurs. Propose-moi un
niveau de sécurité de 1 à 4, les protections justifiées à ce niveau et celles
qui seraient excessives. Chaque protection ajoutant une étape pour
l'utilisateur doit être justifiée par ce qu'elle protège. Une protection qu'on
ne sait pas justifier ne se pose pas.

C. Filet. Vérifie que le dépôt est propre, crée une branche dédiée, et
dis-moi comment revenir en arrière chez mon hébergeur. Un commit par groupe
de correctifs, avec les effets de bord annoncés dans le message. Sauvegarde
de la base avant toute migration ou purge. Jamais de travail direct sur la
branche de production.

PRIORITÉS, DANS CET ORDRE
1. Sécurité des utilisateurs et de leurs données personnelles
2. Protection des comptes et des sessions
3. Protection du code source et des secrets
4. Sécurité des API et de l'infrastructure
5. Résistance aux attaques courantes
6. Maintien intégral des fonctionnalités existantes

RÈGLES ABSOLUES
- Ne supprime aucune fonctionnalité sans me le dire et sans justification.
- Ne modifie pas le design.
- Ne remplace jamais une protection existante par une moins sûre.
- Avant toute modification importante, analyse les dépendances entre fichiers.
- Vérifie que tes corrections n'introduisent pas de nouvelle faille.
- N'affiche jamais un secret, une clé, un mot de passe ou un jeton dans tes
  réponses — même pour signaler qu'il est exposé. Donne le fichier et la ligne.
- Ne mets jamais un secret dans le code : variables d'environnement uniquement.
- Si une protection ne peut pas être implémentée correctement, explique
  précisément pourquoi plutôt que de livrer une demi-mesure.

ÉTAPE 1 — CARTOGRAPHIE

Analyse l'architecture complète : frontend, backend, API, base de données,
authentification, autorisation, sessions, formulaires, uploads, stockage,
cookies, variables d'environnement, dépendances, scripts, fichiers de
configuration, CI/CD, dépôt GitHub, hébergement, services tiers, analytics,
paiement, emails, webhooks, domaines et sous-domaines.

Identifie précisément les composants qui traitent des données personnelles
ou sensibles.

ÉTAPE 2 — SECRETS ET IDENTIFIANTS

Cherche : clés API, jetons, mots de passe, secrets JWT, identifiants, clés
privées, certificats, identifiants de base de données, URL contenant des
identifiants, fichiers .env exposés, secrets dans l'historique Git, secrets
dans le bundle frontend, secrets dans les journaux.

Vérifie aussi le .gitignore et les fichiers de configuration.

Une clé secrète ne doit JAMAIS être envoyée au navigateur.

Pour chaque secret exposé : identifie-le sans l'afficher, indique s'il doit
être révoqué, supprime son exposition, sécurise son stockage.

ÉTAPE 3 — VULNÉRABILITÉS OWASP

Audit approfondi : XSS, injection SQL, injection NoSQL, injection de commande,
SSRF, CSRF, IDOR et contrôle d'accès défaillant, authentification faible,
gestion de session incorrecte, exposition de données sensibles, mauvaise
configuration, dépendances vulnérables, uploads dangereux, redirections
ouvertes, traversée de chemin, pollution de prototype, désérialisation
dangereuse, traces d'erreur exposées, API insuffisamment protégées, absence
de limitation de débit, validation d'entrée insuffisante.

Ne signale que ce qui est réellement présent dans le projet.

ÉTAPE 4 — AUTHENTIFICATION

Si le site a des comptes : hachage des mots de passe, politique de mot de
passe, protection contre le bruteforce, limitation des tentatives, expiration
et révocation des sessions, cookies Secure/HttpOnly/SameSite, protection des
jetons, réinitialisation de mot de passe, vérification d'email, protection
des comptes administrateurs, contrôle des permissions.

Vérifie en outre, et signale-le comme CRITIQUE le cas échéant :
  - le site collecte-t-il ou stocke-t-il lui-même des données bancaires —
    champs card, cvv, cvc, expiry, pan, colonnes de base correspondantes,
    capture par un journal ou un outil de suivi d'erreurs ? La saisie doit
    passer par les champs hébergés du prestataire de paiement.
  - le changement d'adresse email est-il protégé ? Mot de passe redemandé,
    confirmation envoyée à l'ANCIENNE adresse avec lien d'annulation,
    changement effectif seulement après validation de la nouvelle. Sans cela,
    un attaquant ayant une session ouverte prend le compte définitivement.
  - existe-t-il des alertes sur les événements sensibles, avec une action
    « ce n'était pas vous » ?

Vérifie qu'un utilisateur ne peut jamais accéder aux données ou aux fonctions
d'un autre en modifiant un identifiant dans une URL ou une requête.

ÉTAPE 5 — API

Pour chaque endpoint : authentification, autorisation, validation des entrées,
limite de taille des requêtes, protection contre les injections, limitation de
débit, absence de fuite d'informations dans les réponses, méthodes HTTP
autorisées, CORS, webhooks et vérification de signature, protection des
endpoints d'administration, impossibilité de modifier une ressource
appartenant à un autre utilisateur.

Ne jamais faire confiance aux données envoyées par le navigateur — y compris
les prix, les quantités et les statuts.

ÉTAPE 6 — FRONTEND

XSS, HTML injecté, dangerouslySetInnerHTML et équivalents, données affichées
sans échappement, jetons dans le localStorage, informations sensibles dans le
bundle, distinction clés publiques et privées, variables d'environnement
exposées, URL manipulables, redirections ouvertes, dépendances JavaScript
vulnérables.

ÉTAPE 7 — EN-TÊTES HTTP

Content-Security-Policy, Strict-Transport-Security, X-Content-Type-Options,
X-Frame-Options, Referrer-Policy, Permissions-Policy, CORS, cookies sécurisés.

Configure une CSP aussi restrictive que possible sans casser le site. Déploie-la
d'abord en Report-Only et liste-moi les scripts et domaines tiers utilisés.
Évite 'unsafe-inline' sur script-src, qui annule l'essentiel de la protection.

ÉTAPE 8 — HTTPS ET TLS

HTTPS partout, redirection permanente HTTP vers HTTPS, absence de contenu
mixte, cookies Secure, HSTS, absence de ressources externes non sécurisées.

ÉTAPE 9 — DONNÉES UTILISATEURS

Identifie toutes les données collectées. Vérifie : minimisation, stockage
sécurisé, chiffrement lorsque nécessaire, accès limité, absence de données
personnelles dans les journaux, absence de données sensibles dans les URL,
durée de conservation définie, protection des exports, suppression sécurisée.

Ne jamais exposer inutilement : email, téléphone, adresse, données de paiement,
jetons, identifiants internes.

ÉTAPE 10 — FORMULAIRES

Validation côté serveur obligatoire, protection XSS, protection CSRF, limite
de taille, limitation de débit, protection anti-bot, messages d'erreur ne
révélant rien d'exploitable.

Une validation frontend n'est jamais une sécurité.

ÉTAPE 11 — UPLOADS

Type MIME réel vérifié par les octets d'en-tête, extension en liste blanche,
taille maximale côté serveur, renommage du fichier, emplacement de stockage
hors racine web, impossibilité d'exécuter un fichier téléversé, contrôle
d'accès, protection contre la traversée de chemin.

ÉTAPE 12 — DÉPENDANCES

Analyse package.json, le lockfile et l'arbre de dépendances : versions
obsolètes, vulnérabilités connues, paquets inutilisés, paquets suspects,
dépendances transitives problématiques.

Ne mets pas à jour aveuglément une dépendance critique : évalue d'abord si la
vulnérabilité est atteignable dans ce projet, et le risque de rupture.

ÉTAPE 13 — BASE DE DONNÉES

Requêtes paramétrées, absence d'injection, permissions minimales, compte
applicatif non administrateur, protection des identifiants, chiffrement,
sauvegardes, accès réseau, exposition publique éventuelle, isolation des
environnements.

ÉTAPE 14 — JOURNAUX ET ERREURS

Les erreurs ne doivent jamais révéler : traces d'exception en production,
chemins internes, variables d'environnement, jetons, identifiants, requêtes
SQL, informations personnelles.

Les journaux doivent permettre de détecter les tentatives de connexion, le
bruteforce, les erreurs anormales, les accès refusés et l'activité suspecte —
sans devenir eux-mêmes une fuite de données personnelles.

ÉTAPE 15 — LIMITATION DE DÉBIT ET ANTI-ABUS

Identifie les endpoints abusables : connexion, inscription, réinitialisation,
formulaires, recherche, API, upload, envoi d'emails, génération de contenu,
paiement.

Protège contre : bruteforce, credential stuffing, spam, aspiration de contenu,
déni de service applicatif, génération massive de requêtes.

Limite par IP et par identifiant. En serverless, utilise un stockage partagé.

ÉTAPE 16 — ADMINISTRATION

Séparation stricte utilisateur/administrateur, contrôle serveur des
permissions, protection de chaque route, sessions renforcées, limitation des
tentatives, absence de routes d'administration inutilement exposées,
vérification de chaque action sensible.

Une route cachée côté frontend n'est jamais une route protégée.

ÉTAPE 17 — DÉPÔT ET CI/CD

Secrets GitHub, permissions des workflows, actions tierces et leur épinglage,
jetons aux privilèges excessifs, secrets dans les journaux d'exécution,
protection des branches, risques sur la chaîne d'approvisionnement.

Les workflows doivent fonctionner avec le moindre privilège.

ÉTAPE 18 — SERVICES TIERS

Pour chaque service externe — analytics, Google, Meta, Stripe, emails, cartes,
API, CDN, hébergeur, outils d'IA, widgets, scripts externes — réponds à :
  1. Pourquoi est-il utilisé ?
  2. Quelles données reçoit-il ?
  3. Est-il indispensable ?
  4. Est-il chargé uniquement quand c'est nécessaire ?
  5. Représente-t-il un risque XSS ou de chaîne d'approvisionnement ?
  6. Les clés utilisées sont-elles correctement protégées ?

ÉTAPE 19 — PRÉVENTION DES ERREURS FUTURES

Ajoute si pertinent : .gitignore complet, .env.example sans valeurs,
documentation de sécurité, audit de dépendances automatisé, détection de
secrets à la poussée, contrôles avant déploiement.

ÉTAPE 20 — NON-RÉGRESSION, APRÈS CHAQUE GROUPE

Ce n'est pas une étape finale : elle se rejoue après chaque groupe de
correctifs, jamais seulement à la fin.

Donne-moi le parcours à refaire : arrivée sur le site, inscription, email de
confirmation, connexion et navigation, action métier principale, paiement,
consultation de ce qui vient d'être créé, déconnexion, mot de passe oublié,
espace d'administration pour chaque rôle.

Pour chaque étape, dis-moi ce qui peut casser à cause du groupe que tu viens
d'appliquer.

Rappelle-moi de tester avec un compte neuf ET un compte antérieur aux
modifications, sur mobile et sur ordinateur, console du navigateur ouverte —
les blocages de CSP et de CORS n'apparaissent nulle part ailleurs.

Si un correctif peut renvoyer 404, 403 ou 429 à un utilisateur légitime —
filtre de propriété trop serré, rôle oublié, limite par IP partagée — dis-le
AVANT de l'appliquer et propose le garde-fou.

ÉTAPE 21 — VÉRIFICATION FINALE

Lance les tests existants, lance le build, relance les audits, revérifie les
dépendances, les en-têtes, les routes sensibles, les permissions, les secrets
et les erreurs de production.

Pour chaque faille corrigée, donne la commande ou le test qui échouait avant
et qui doit maintenant renvoyer 401, 403, 404 ou 429.

FORMAT DE CHAQUE PROBLÈME

Gravité : CRITIQUE | ÉLEVÉE | MOYENNE | FAIBLE | INFORMATIONNELLE
Fichier et ligne
Ce qui se passe, en une phrase, sans jargon
Ce qu'un attaquant peut en faire, concrètement
Correction appliquée ou à appliquer
Vérification : comment on sait que c'est bouché

RAPPORT FINAL

SCORE DE SÉCURITÉ : X/100, calculé selon la grille de la compétence
  (100 au départ ; -25 par critique, -10 par élevée, -4 par moyenne,
   -1 par faible ; plancher à 0)

CRITIQUES / ÉLEVÉES / MOYENNES / FAIBLES : liste
CORRECTIONS EFFECTUÉES
PROTECTIONS AJOUTÉES
TESTS EFFECTUÉS
PROBLÈMES RESTANTS
NIVEAU DE SÉCURITÉ RETENU ET PROTECTIONS ÉCARTÉES VOLONTAIREMENT
FRICTION AJOUTÉE POUR L'UTILISATEUR, ET CE QU'ELLE PROTÈGE
PARCOURS DE NON-RÉGRESSION EFFECTUÉ, ET RÉSULTAT
ACTIONS MANUELLES NÉCESSAIRES DE MA PART
RISQUES NÉCESSITANT UNE INTERVENTION DE L'HÉBERGEUR
CE QUE CET AUDIT N'A PAS COUVERT

Ne considère jamais le projet comme « 100 % sécurisé ». Signale honnêtement
les limites restantes.

COMMENCE MAINTENANT PAR LE TEMPS 1 : audite sans rien modifier, et
présente-moi les vulnérabilités trouvées avec leur gravité.
```

---

## Grille du score

Pour que le score soit reproductible plutôt qu'arbitraire — deux audits du même projet doivent donner le même chiffre :

| Gravité | Points retirés | Définition |
|---|---|---|
| **Critique** | −25 | exploitable à distance, sans authentification, avec impact majeur : secret exposé, RCE, fuite de la base, contournement d'authentification |
| **Élevée** | −10 | exploitable par un utilisateur authentifié ou avec une condition simple : IDOR, élévation de privilège, XSS stockée, absence de limitation sur la connexion |
| **Moyenne** | −4 | exploitation conditionnelle ou impact limité : en-tête manquant, CSRF sur une action secondaire, fuite d'information mineure |
| **Faible** | −1 | durcissement recommandé, pas d'exploitation directe |
| **Informationnelle** | 0 | à signaler, hors score |

Départ à 100, plancher à 0. Un score de 100 signifie « aucune faille trouvée dans le périmètre audité » — jamais « site sécurisé ». Toujours accompagner le score de ce que l'audit n'a pas couvert.
