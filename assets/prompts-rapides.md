# Prompts rapides

À coller un par un dans Claude, sur le projet. Laisser finir un prompt avant de passer au suivant. Zéro terminal nécessaire.

L'ordre compte : les secrets d'abord, l'authentification ensuite, puis l'autorisation.

---

## 0 · Questionnaire client (avant de toucher au code)

> Aide-moi à remplir le questionnaire client de `assets/questionnaire-client.md` pour ce projet. Commence par ce que tu peux déduire du code et de la configuration — services tiers, hébergement, prestataire de paiement, données stockées. Puis liste-moi les questions auxquelles seul le client peut répondre, regroupées par volet, sous une forme que je peux lui envoyer telle quelle. Termine par le bloc de sortie pré-rempli, et les « je ne sais pas » qui restent.

## 0a · Budget de friction

> Avant tout durcissement, aide-moi à fixer le niveau de sécurité de ce projet. Analyse ce que le site stocke réellement, ce qu'un attaquant gagnerait à prendre un compte, et qui sont les utilisateurs. Propose-moi un niveau de 1 à 4, puis la liste des protections justifiées à ce niveau et celles qui seraient excessives. Pour chaque protection retenue, dis-moi son coût en expérience utilisateur et où la placer dans le parcours. Ne propose aucune protection qui ajoute de la friction sans expliquer ce qu'elle protège concrètement.

## 0b · Filet avant correction

> Avant de corriger quoi que ce soit : vérifie que le dépôt est propre, crée une branche dédiée, et dis-moi comment revenir en arrière chez mon hébergeur si un déploiement pose problème. Ensuite, un commit par groupe de correctifs, avec les effets de bord annoncés dans le message. Si un correctif peut renvoyer 404, 403 ou 429 à un utilisateur légitime, dis-le avant de l'appliquer et propose le garde-fou.

## 0c · Cartographie

> Fais l'inventaire de la sécurité de ce projet sans rien modifier. Liste : la stack (framework, backend, base, hébergement), toutes les routes API avec pour chacune si elle exige une authentification et si elle vérifie un rôle, tous les endroits où sont stockés des secrets, et tous les endroits où des données utilisateurs sont lues ou écrites. Termine par les cinq points qui te semblent les plus risqués, classés par gravité. Ne corrige rien pour l'instant.

---

## 1 · Secrets exposés

> Cherche tous les secrets exposés dans ce projet : clés API dans le code client, variables NEXT_PUBLIC_/VITE_/REACT_APP_ contenant des valeurs sensibles, secrets dans l'historique Git, sourcemaps en production. Vérifie aussi le bundle construit. Pour chaque secret trouvé, dis-moi s'il doit être révoqué et déplace l'appel côté serveur.

## 2 · Jeton de connexion

> Vérifie où mon app stocke le jeton de connexion. S'il est dans le localStorage, le sessionStorage ou accessible en JavaScript, déplace-le vers un cookie httpOnly, secure, sameSite=lax, avec une expiration explicite. Adapte le front et le back, et vérifie que la connexion, la déconnexion et le rafraîchissement de page fonctionnent toujours. Dis-moi ensuite si ce changement m'expose au CSRF et ce qu'il faut ajouter.

## 3 · Vérification des droits côté serveur

> Trouve tous les endroits où mon app vérifie si l'utilisateur est administrateur ou a des droits spéciaux. Si la vérification se fait côté navigateur, refais-la côté serveur pour chaque route et chaque action sensible. Le rôle doit venir de la session serveur ou de la base, jamais d'une donnée envoyée par le client. Centralise la vérification dans une fonction réutilisable et liste-moi les routes qui n'étaient pas protégées.

## 4 · Accès aux ressources d'autrui (IDOR)

> Cherche toutes les routes qui récupèrent ou modifient une ressource à partir d'un identifiant passé dans l'URL ou le body. Pour chacune, vérifie que la requête filtre aussi sur le propriétaire directement dans la clause WHERE, et pas dans une condition après coup. Renvoie 404 plutôt que 403 quand la ressource n'appartient pas à l'utilisateur. Liste-moi les routes vulnérables trouvées et corrige-les.

## 5 · Règles de base de données

> Vérifie l'état de la Row Level Security sur toutes mes tables Supabase (ou de mes règles Firestore). Pour chaque table contenant des données utilisateurs, active RLS et écris des policies par opération basées sur auth.uid(). Signale toute policy en USING(true). Vérifie qu'aucune clé service_role ou admin n'est présente dans le code client.

## 6 · Vérification par email

> Ajoute une vérification par email à l'inscription : tant que l'utilisateur n'a pas confirmé son adresse, son compte reste inactif et les actions sensibles sont refusées côté serveur. Le lien doit utiliser un token aléatoire à usage unique, stocké haché, expirant en 24h. Limite le renvoi du lien. Vérifie que la réponse est identique que l'email soit déjà inscrit ou non.

## 7 · Rate limiting

> Mets un rate limiting sur la connexion, l'inscription, le mot de passe oublié et l'envoi d'emails. Limite par IP ET par email, avec un blocage temporaire progressif plutôt qu'un verrouillage définitif du compte. Utilise un stockage partagé si l'app est en serverless. Renvoie un 429 avec Retry-After. Dis-moi les limites choisies.

## 8 · Règles de mots de passe

> Ajoute des règles sur les mots de passe : minimum 12 caractères, maximum au moins 64, et un contrôle contre la base Have I Been Pwned via l'API k-anonymity. Vérifie que le hachage utilise argon2id ou bcrypt avec un coût d'au moins 12. Applique ces règles à l'inscription ET à la réinitialisation. Ne mets pas de rotation forcée.

## 8b · Données bancaires et changements sensibles

> Cherche si mon site collecte ou stocke lui-même des données bancaires : champs card, cvv, cvc, expiry, pan, colonnes de base correspondantes, et tout endroit où un journal ou un outil de suivi d'erreurs pourrait capturer un formulaire de paiement. Remplace la saisie par les champs hébergés de mon prestataire. Vérifie ensuite le changement d'adresse email : mot de passe redemandé, confirmation envoyée à l'ANCIENNE adresse avec lien d'annulation, validation de la nouvelle avant effet. Ajoute les alertes sur les événements sensibles, calibrées au niveau retenu en passe 0.

## 9 · Validation des entrées

> Ajoute une validation côté serveur avec un schéma strict sur toutes les routes qui écrivent : longueurs maximales, bornes numériques, rejet des champs inconnus, taille de body limitée, pagination plafonnée. Vérifie qu'aucune route ne fait de mise à jour à partir du body brut, pour éviter qu'un utilisateur puisse modifier son rôle ou ses crédits.

## 10 · Fuites dans les réponses API

> Passe en revue toutes mes routes API et vérifie ce qu'elles renvoient réellement. Remplace les SELECT * et les objets bruts de la base par une sélection explicite des champs. Vérifie qu'aucune réponse ne contient de hash de mot de passe, de token, d'email d'autres utilisateurs ou d'identifiant de facturation. Vérifie aussi les données injectées dans le HTML rendu côté serveur.

## 11 · Injections et XSS

> Cherche les injections SQL possibles : toute requête construite par concaténation ou template, y compris les raw() d'ORM. Remplace-les par des requêtes paramétrées. Cherche ensuite les XSS : dangerouslySetInnerHTML, v-html, innerHTML, eval, sur du contenu utilisateur. Assainis avec DOMPurify là où du HTML riche est nécessaire.

## 12 · Uploads de fichiers

> Sécurise les uploads : validation du type réel par les magic bytes et non par l'extension, taille maximale côté serveur, renommage avec un identifiant aléatoire, stockage hors de la racine web, ré-encodage des images pour supprimer les métadonnées EXIF, et quota par utilisateur.

## 13 · En-têtes de sécurité

> Ajoute les en-têtes de sécurité HTTP : HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, et une Content-Security-Policy. Déploie d'abord la CSP en Report-Only et liste-moi les scripts et domaines tiers utilisés pour qu'on ajuste avant de passer en mode bloquant. Retire X-Powered-By.

## 14 · Formulaires publics

> Protège mes formulaires publics contre les bots : Cloudflare Turnstile avec vérification côté serveur, champ honeypot, contrôle du délai de soumission et rate limiting par IP. Vérifie aussi que le contenu des champs est assaini avant d'être envoyé par email.

## 15 · RGPD

> Vérifie quels cookies et scripts tiers mon site dépose avant tout consentement. Mets en place un bandeau conforme CNIL : aucun traceur non nécessaire avant acceptation, bouton Refuser au même niveau qu'Accepter, choix conservé 6 mois, lien permanent pour modifier son choix. Le blocage des scripts doit être réel. Héberge les polices en local. Dis-moi ce qui manque dans mes mentions légales et ma politique de confidentialité.

## 16 · Non-régression

> Donne-moi le parcours de non-régression à refaire après ce groupe de correctifs : arrivée sur le site, inscription, email de confirmation, connexion, action métier principale, paiement, consultation de ce qui vient d'être créé, déconnexion, mot de passe oublié, espace admin pour chaque rôle. Pour chaque étape, dis-moi ce qui pourrait casser à cause des correctifs que tu viens d'appliquer. Rappelle-moi de tester avec un compte neuf et un compte existant, sur mobile et sur ordinateur, console ouverte.

## 17 · Vérification finale

> Reprends chaque correctif de sécurité appliqué et prouve-moi qu'il fonctionne : pour chacun, donne la commande curl ou le test qui échouait avant et qui doit maintenant renvoyer 401, 403, 404 ou 429. Écris ensuite un test automatisé par faille critique pour empêcher la régression. Termine par un rapport classé par gravité, avec ce qui reste à faire.
