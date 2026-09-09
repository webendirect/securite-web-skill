# Passe 9 — Ne rien casser : Git, régressions, retour arrière

Cette compétence modifie l'authentification, les routes API et la base de données d'un site souvent en production. Le dommage le plus probable n'est pas une faille : c'est un correctif trop large qui casse le site d'un client.

Trois protections, à appliquer dans cet ordre : un filet Git avant de commencer, la connaissance de ce qui casse, et un parcours de vérification après chaque groupe.

---

## 9.1 Protocole Git — le filet

**Avant la première modification :**

```bash
git status                    # doit être propre — rien en cours
git branch                    # savoir où l'on est
git checkout -b securite/audit-2026-09
```

Jamais directement sur `main` ni sur la branche de production. Si le projet n'est pas versionné, la première action de l'audit est de l'initialiser — travailler sans historique sur du code client n'est pas acceptable.

**Un commit par groupe de correctifs**, jamais un commit fourre-tout. Le message dit ce qui change et pourquoi :

```
Sécurité : jeton de session en cookie httpOnly

Le jeton était dans le localStorage, lisible par tout script de la page.
Passage en cookie httpOnly + secure + sameSite=lax.
Sessions existantes invalidées : les utilisateurs devront se reconnecter.
```

La dernière ligne compte : elle prévient l'effet de bord au moment où on le lit, pas quand le client appelle.

**Le découpage recommandé**, un groupe par thème : secrets et exposition · authentification et sessions · autorisation et propriété des ressources · validation et injections · en-têtes et infrastructure · conformité. Ce sont exactement les passes, ce qui rend le retour arrière lisible.

**Avant toute migration ou purge de base : une sauvegarde.** Le script de purge tourne en simulation par défaut, mais la première exécution réelle se fait après un export de la base, jamais avant. Une purge mal bornée est irréversible, et c'est la sauvegarde qui devient alors la seule conformité.

**Le chemin de déploiement** : branche → préproduction → vérification complète → production. Un correctif d'authentification ne se déploie pas un vendredi soir, ni pendant les heures de pointe du client.

**Le retour arrière**, écrit avant d'en avoir besoin :

```bash
git revert <sha-du-groupe>     # annule un groupe, garde les autres
git revert -m 1 <sha-merge>    # annule une fusion complète
```

`revert` plutôt que `reset` : on ajoute un commit d'annulation au lieu de réécrire l'historique — la trace de ce qui a été tenté reste, et rien n'est perdu pour les autres.

**Ce qu'il faut noter avant de commencer**, dans le rapport : version déployée actuellement, comment revenir dessus chez l'hébergeur (Vercel garde les déploiements précédents, un VPS non), et où est la dernière sauvegarde de base testée.

---

## 9.2 Catalogue des cassures

Deux 404 différents coexistent dans cette compétence, et il ne faut jamais les confondre.

**Les 404 et 403 voulus** sont des correctifs qui fonctionnent : un visiteur tente d'ouvrir la ressource d'un autre, il ne l'obtient pas. Aucun utilisateur légitime ne les rencontre.

**Les 404, 403, 429 et 500 accidentels** n'apportent rien et cassent le site. Ils viennent tous d'un correctif trop large. Voici lesquels, et le garde-fou de chacun.

### Filtre de propriété (correctif IDOR) → 404 sur un accès légitime

Le plus dangereux, parce qu'il paraît juste. `where: { id, userId: session.user.id }` casse dès qu'une ressource est légitimement partagée : commande passée en invité sans compte, devis consulté par deux personnes d'une même entreprise, administrateur ouvrant le dossier d'un client, document partagé par lien.

**Garde-fou.** Avant d'écrire le filtre, lister **qui a légitimement le droit de voir la ressource** — propriétaire, membres de l'organisation, administrateurs, porteur d'un lien de partage — et écrire la condition en `OR` sur ces cas. Tester ensuite avec un compte de **chaque** type, pas seulement avec deux utilisateurs ordinaires.

### Centralisation des rôles → 403 pour un rôle oublié

`requireRole('admin')` posé partout écarte l'éditeur, le modérateur, le comptable, le support. Et si le rôle est stocké en tableau (`roles: ['admin']`) alors que le test compare une chaîne, **tout le monde** reçoit un 403.

**Garde-fou.** Inventorier les rôles réellement présents en base avant de centraliser (`select distinct role from utilisateurs`). Vérifier le type exact du champ.

### Passage du jeton en cookie → 401 partout

Le correctif le plus utile et le plus risqué. Quatre pièges :

- `secure: true` en développement sur `http://localhost` : le cookie n'est jamais posé, plus personne ne peut se connecter en local ;
- domaine différent entre `www.` et le domaine nu : l'utilisateur est déconnecté en changeant de page ;
- `sameSite: 'lax'` qui casse les retours POST externes — retour de paiement, callback OAuth, SSO ;
- les sessions existantes deviennent invalides : **tous les utilisateurs déconnectés d'un coup** au déploiement.

**Garde-fou.** `secure` conditionné à l'environnement, domaine du cookie explicite, redirection systématique entre `www` et le domaine nu, période de transition acceptant les deux formats si le trafic le justifie, et déploiement à une heure creuse avec un message d'information.

### Content-Security-Policy → aucune erreur, du silence

Pire qu'une erreur visible : la carte ne s'affiche plus, la vidéo est vide, la police retombe sur Times New Roman, le formulaire tiers ne se soumet plus. Rien côté serveur, rien dans les logs — uniquement la console du navigateur.

**Garde-fou.** `Content-Security-Policy-Report-Only` pendant plusieurs jours avec un point de collecte, puis le tour complet du site — toutes les pages, tous les formulaires, tous les contenus intégrés — avant de passer en mode bloquant.

### HSTS → le seul correctif quasi irréversible

Une fois l'en-tête envoyé, le navigateur refuse le HTTP sur le domaine pendant toute la durée annoncée. Avec `includeSubDomains`, un sous-domaine encore en HTTP devient inaccessible, et l'on ne peut rien faire côté visiteur. La liste `preload` est pire : en sortir prend des mois.

**Garde-fou.** Commencer par `max-age=300`, vérifier que **tous** les sous-domaines sont en HTTPS, puis monter à un an. Ne jamais activer `preload` sur un site client.

### Limitation de débit → 429 pour des gens honnêtes

Une limite par IP bloque tout un bureau derrière la même sortie réseau, et les opérateurs mobiles partagent leurs adresses entre des milliers d'abonnés. Sur un site B2B, dix tentatives par IP peuvent bloquer une entreprise entière.

**Garde-fou.** Limiter par email en priorité, l'IP en complément avec un seuil large. Exclure les sondes de supervision. Renvoyer un message clair avec le délai, jamais un 429 nu.

### Validation des uploads → refus de fichiers légitimes

Un iPhone envoie du HEIC, un scanner produit des PDF au type MIME inhabituel, une liste blanche trop courte refuse le `.webp` ou le `.docx`.

**Garde-fou.** Construire la liste blanche à partir de ce que les utilisateurs envoient réellement, pas d'une liste théorique. Message d'erreur indiquant les formats acceptés.

### Minimisation RGPD → 500 sur un champ supprimé

Retirer une colonne « inutile » que du code lit encore ailleurs. Et l'anonymisation qui casse des clés étrangères ou orpheline des commentaires, dont la page renvoie alors 404.

**Garde-fou.** Chercher chaque champ dans tout le code avant suppression. Anonymiser plutôt que supprimer dès qu'une autre table pointe dessus.

### Durcissement des routes → 404 et perte de référencement

Renommer ou supprimer une route casse les liens existants et les pages indexées. Ça ne se voit pas tout de suite : ça se voit trois semaines plus tard dans le trafic.

**Garde-fou.** Redirection 301 pour toute URL qui disparaît, jamais de suppression sèche. Et vérifier qu'aucun `noindex` de préproduction n'a suivi en production — l'accident silencieux le plus coûteux de la liste.

### Liste blanche de redirections → parcours cassé

Bloquer `?next=` casse le retour vers une page légitime après connexion. **Garde-fou :** autoriser tous les chemins relatifs internes, ne rejeter que les URL absolues et les `//`.

### CORS trop strict → front bloqué

Une liste blanche d'origines exactes casse les URL de prévisualisation, qui changent à chaque déploiement. **Garde-fou :** prévoir un motif pour les environnements de préproduction, jamais en production.

---

## 9.3 Parcours de non-régression

Ces cassures ne se voient pas en relisant du code : elles se voient dans l'enchaînement. À exécuter **après chaque groupe de correctifs**, pas à la fin — six correctifs puis un test, et l'on sait que quelque chose est cassé sans savoir quoi.

Dans cet ordre, chaque étape dépendant de la précédente :

| # | Étape | Ce qui casse ici |
|---|---|---|
| 1 | Arrivée : accueil, page intérieure, formulaire de contact | CSP (images, polices, cartes, vidéos), bandeau cookies, anti-bot |
| 2 | Inscription d'un compte neuf | règle de mot de passe, validation serveur, limitation de débit |
| 3 | Email de confirmation reçu, lien fonctionnel, compte activé | limitation des envois, lien à usage unique |
| 4 | Connexion, rechargement de page, navigation | cookie httpOnly, `secure` en local, `www` contre domaine nu, `sameSite` |
| 5 | Action métier principale — commande, devis, réservation | filtre de propriété, validation stricte, liste blanche de champs |
| 6 | Paiement jusqu'au retour sur la page de succès | `sameSite` au retour du prestataire, webhook, CSP sur le formulaire de carte |
| 7 | Consultation de ce qu'on vient de créer | correctif IDOR trop serré |
| 8 | Déconnexion, puis accès à une page protégée avec l'ancien lien | attendu : redirection vers la connexion |
| 9 | Mot de passe oublié : email, lien, nouveau mot de passe, reconnexion | token, limitation, invalidation des sessions |
| 10 | Espace d'administration, **pour chaque rôle** | centralisation des rôles qui en oublie un |

### Les trois règles qui font la valeur du test

**Deux comptes, pas un.** Un compte créé à l'instant **et** un compte antérieur aux modifications. Ils cassent différemment : l'ancien a une session en cours, un cookie à l'ancien format, parfois un mot de passe haché autrement. C'est le compte existant qui révèle les vraies régressions — et ce sont les clients réels.

**Mobile et ordinateur.** Safari sur iOS traite les cookies différemment, et les correctifs de session sont exactement là où les navigateurs divergent.

**Console du navigateur ouverte en permanence.** Les blocages de CSP et de CORS ne produisent aucune erreur sur la page ni côté serveur. Ils n'existent que là.

Compter une dizaine de minutes une fois le parcours connu. Sur un site client, c'est ce qui sépare une livraison propre d'un appel un vendredi soir.

### Quand ça casse

Revenir en arrière sur **le groupe en cours**, pas sur tout l'audit — c'est précisément l'intérêt d'un commit par groupe. Comprendre la cause, corriger, refaire le parcours, puis reprendre. Ne jamais empiler un correctif sur un correctif cassé.

---

## Prompt à coller

> Avant de corriger quoi que ce soit : vérifie que le dépôt est propre, crée une branche dédiée, et dis-moi comment revenir en arrière chez mon hébergeur si un déploiement pose problème. Ensuite, un commit par groupe de correctifs, avec les effets de bord annoncés dans le message. Après chaque groupe, donne-moi le parcours de non-régression à refaire et ce qui pourrait casser à cause de ce groupe précis. Si un correctif peut renvoyer 404, 403 ou 429 à un utilisateur légitime, dis-le avant de l'appliquer et propose le garde-fou.
