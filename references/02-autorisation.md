# Passe 2 — Autorisation et accès aux données

L'authentification répond à « qui es-tu ». L'autorisation répond à « as-tu le droit ». C'est la catégorie de faille la plus fréquente dans les apps générées par IA, et la plus coûteuse : c'est elle qui fait fuiter les données de tous les clients.

---

## 2.1 La vérification « es-tu admin » se fait côté navigateur

**La faille.** Le front lit `user.role === 'admin'` et cache le bouton. Mais la route API, elle, ne vérifie rien. N'importe qui appelle `POST /api/admin/users/delete` avec curl et ça passe. Cacher un bouton n'est pas une sécurité, c'est une décoration.

**Détecter.** Chercher dans le code front :

```
role === 'admin'
isAdmin
user.permissions
{isAdmin && ...}
hasRole(
```

Pour chaque occurrence trouvée dans un composant, aller voir la route serveur correspondante : refait-elle la vérification ? Dans neuf cas sur dix, non.

**Le correctif.** Chaque route sensible commence par une vérification serveur :

```ts
const session = await getSession()
if (!session) return new Response('Unauthorized', { status: 401 })
if (session.user.role !== 'admin') return new Response('Forbidden', { status: 403 })
```

Mieux : centraliser dans un middleware ou une fonction `requireRole('admin')` appelée en première ligne de chaque handler, plutôt que de dupliquer la condition — une duplication finit toujours par être oubliée quelque part.

Le rôle vient de la **base de données ou de la session serveur**, jamais d'un champ envoyé par le client, jamais d'un JWT non signé, jamais d'un en-tête `X-Role`.

**Prompt à coller**

> Trouve tous les endroits où mon app vérifie si l'utilisateur est administrateur ou a des droits spéciaux. Si la vérification se fait côté navigateur, refais-la côté serveur pour chaque route et chaque action sensible. Le rôle doit venir de la session serveur ou de la base, jamais d'une donnée envoyée par le client. Centralise la vérification dans une fonction réutilisable et liste-moi les routes qui n'étaient pas protégées.

---

## 2.2 Accès direct à une ressource par son identifiant (IDOR)

**La faille.** L'utilisateur est bien connecté, mais on ne vérifie pas que la ressource lui appartient. `GET /api/commandes/1042` renvoie la commande 1042 même si elle est à quelqu'un d'autre. Il suffit d'incrémenter l'ID.

C'est la faille numéro 1 du classement OWASP, et celle qui passe le plus inaperçue parce que l'app « marche » parfaitement en usage normal.

**Détecter.** Chercher toutes les requêtes qui utilisent un paramètre d'URL :

```
findUnique({ where: { id: params.id } })
SELECT * FROM ... WHERE id = $1
.doc(req.params.id)
findById(
```

Si la clause ne contient **pas** aussi l'identifiant du propriétaire, c'est une IDOR.

**Le correctif.** Le filtre de propriété est dans la requête elle-même, pas dans un `if` après :

```ts
// Faux — on récupère puis on vérifie (et on oublie parfois de vérifier)
const commande = await db.commande.findUnique({ where: { id } })

// Juste — la requête ne peut pas renvoyer la commande d'un autre
const commande = await db.commande.findFirst({
  where: { id, userId: session.user.id },
})
if (!commande) return new Response('Not found', { status: 404 })
```

Renvoyer **404 et non 403** : un 403 confirme que la ressource existe, ce qui permet d'énumérer.

Pour les identifiants exposés dans les URL, préférer des UUID ou des identifiants aléatoires aux entiers incrémentaux. Ça ne remplace pas le contrôle d'accès, mais ça élimine l'énumération triviale.

**Prompt à coller**

> Cherche toutes les routes qui récupèrent ou modifient une ressource à partir d'un identifiant passé dans l'URL ou le body. Pour chacune, vérifie que la requête filtre aussi sur le propriétaire (userId, organisationId) directement dans la clause WHERE, et pas dans une condition après coup. Renvoie 404 plutôt que 403 quand la ressource n'appartient pas à l'utilisateur. Liste-moi les routes vulnérables trouvées.

---

## 2.3 Règles de base de données absentes (Supabase, Firebase)

**La faille.** Avec Supabase ou Firebase, le navigateur parle directement à la base. Si la Row Level Security est désactivée ou si les règles Firestore sont en mode ouvert, la clé publique — visible dans le bundle, par construction — suffit à tout lire et tout écrire.

Supabase affiche un avertissement « RLS disabled » ; il est très souvent ignoré parce que « ça marche mieux sans ».

**Détecter.**

- Supabase : dans le dashboard, chaque table publique doit avoir RLS activée **et au moins une policy**. RLS activée sans policy = tout est refusé ; RLS désactivée = tout est autorisé. Vérifier aussi qu'aucune policy n'utilise `USING (true)` sur une table de données personnelles.
- Firestore : chercher `allow read, write: if true;` ou une date d'expiration en mode test dans `firestore.rules`.

**Le correctif.**

Supabase — activer et écrire des policies par opération :

```sql
alter table commandes enable row level security;

create policy "lecture de ses propres commandes"
  on commandes for select
  using (auth.uid() = user_id);

create policy "création de ses propres commandes"
  on commandes for insert
  with check (auth.uid() = user_id);
```

Firestore :

```
match /commandes/{id} {
  allow read, update, delete: if request.auth != null
    && resource.data.userId == request.auth.uid;
  allow create: if request.auth != null
    && request.resource.data.userId == request.auth.uid;
}
```

**La clé `service_role` de Supabase (ou la clé Admin SDK Firebase) ne doit jamais quitter le serveur.** Elle contourne toutes les règles. Si elle apparaît dans une variable `NEXT_PUBLIC_*` ou dans du code client, c'est une compromission totale : il faut la révoquer, pas seulement la déplacer.

**Prompt à coller**

> Vérifie l'état de la Row Level Security sur toutes mes tables Supabase (ou de mes règles Firestore). Pour chaque table contenant des données utilisateurs, active RLS et écris des policies par opération (select, insert, update, delete) basées sur auth.uid(). Signale toute policy en USING(true). Vérifie ensuite qu'aucune clé service_role ou admin n'est présente dans le code client ou dans une variable préfixée NEXT_PUBLIC_.

---

## 2.4 Modification de champs interdits (mass assignment)

**La faille.** La route de mise à jour du profil fait `update(data)` avec tout le body reçu. L'utilisateur envoie `{"name":"Paul","role":"admin"}` et devient administrateur. Même chose avec `credits`, `isPremium`, `verified`, `price`.

**Détecter.** Chercher :

```
...req.body
data: body
Object.assign(user, req.body)
update({ data: await request.json() })
```

**Le correctif.** Liste blanche explicite des champs modifiables. Un schéma de validation (Zod, Yup) qui `strip` tout ce qui n'est pas déclaré :

```ts
const schema = z.object({
  name: z.string().min(1).max(80),
  bio: z.string().max(500).optional(),
}).strict()

const data = schema.parse(await request.json())
await db.user.update({ where: { id: session.user.id }, data })
```

Ne jamais construire l'objet de mise à jour à partir des clés reçues.

---

## 2.5 Fuite de données dans la réponse de l'API

**La faille.** La route renvoie l'objet complet de la base : hash du mot de passe, token de réinitialisation, email interne, notes commerciales, `stripe_customer_id`. Le front n'affiche que le nom, mais la donnée est bien partie dans le navigateur — visible dans l'onglet Réseau.

**Détecter.** Chercher les `SELECT *`, les `findMany()` sans `select`, les `res.json(user)` sur un objet brut.

**Le correctif.** Sélection explicite des champs renvoyés, en sortie :

```ts
const users = await db.user.findMany({
  select: { id: true, name: true, avatarUrl: true },
})
```

Vérifier aussi les données injectées dans le HTML rendu côté serveur (`__NEXT_DATA__`, props d'hydratation) : elles sont dans la source de la page.

**Prompt à coller**

> Passe en revue toutes mes routes API et vérifie ce qu'elles renvoient réellement. Remplace les SELECT * et les objets bruts de la base par une sélection explicite des champs. Vérifie qu'aucune réponse ne contient de hash de mot de passe, de token, d'email d'autres utilisateurs ou d'identifiant de facturation. Vérifie aussi les données injectées dans le HTML côté serveur.

---

## 2.6 Isolation entre clients (multi-tenant)

Si l'app sert plusieurs entreprises ou espaces, chaque requête doit être filtrée sur le `tenant_id` / `organisation_id` **issu de la session**, jamais d'un paramètre d'URL ou d'un en-tête.

Le test : se connecter avec un compte du client A, appeler une route avec un ID appartenant au client B. Réponse attendue : 404.

Faire ce test sur **chaque** ressource, pas sur une seule. Les fuites multi-tenant se logent presque toujours dans la route secondaire qu'on a oublié de protéger — l'export CSV, la recherche, le compteur du tableau de bord.

---

## 2.7 Routes non protégées oubliées

Faire l'inventaire complet des routes de l'app et cocher, pour chacune : authentification requise ? autorisation vérifiée ? filtrée sur le propriétaire ?

Les oubliées classiques :

- routes d'export (`/api/export`, `/api/*/csv`)
- routes de recherche et d'autocomplétion, qui renvoient souvent tous les utilisateurs
- routes de debug laissées en place (`/api/debug`, `/api/test`, `/api/seed`)
- endpoints de webhook sans vérification de signature
- pages de prévisualisation et de brouillon
- routes d'upload
- endpoints GraphQL avec l'introspection activée en production
