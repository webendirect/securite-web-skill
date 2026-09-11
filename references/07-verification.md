# Passe 7 — Vérification

Un correctif non vérifié n'est pas un correctif. Cette passe se fait après chaque passe, pas seulement à la fin.

---

## 7.1 Principe

Pour chaque faille corrigée, produire une **preuve** : une requête qui échoue maintenant alors qu'elle réussissait avant, une capture de la réponse, un test automatisé.

Ne jamais écrire « corrigé » sur la base d'une lecture du code seul. Le code lu et le code déployé diffèrent plus souvent qu'on ne croit (branche non fusionnée, cache de build, variable d'environnement absente en production).

---

## 7.2 Tests manuels essentiels

À exécuter avec deux comptes : un utilisateur normal (A) et un autre utilisateur (B), plus un administrateur.

**Autorisation**

```bash
# Accès à la ressource d'un autre utilisateur — attendu : 404
curl -i -H "Cookie: session=<COOKIE_DE_A>" https://TON-DOMAINE/api/commandes/<ID_DE_B>

# Route d'administration avec un compte normal — attendu : 403
curl -i -H "Cookie: session=<COOKIE_DE_A>" -X POST https://TON-DOMAINE/api/admin/users

# Sans authentification du tout — attendu : 401
curl -i https://TON-DOMAINE/api/commandes/1
```

**Élévation de privilège par mass assignment**

```bash
# Attendu : le champ role est ignoré, l'utilisateur reste normal
curl -i -H "Cookie: session=<COOKIE_DE_A>" -H "Content-Type: application/json" \
  -X PATCH https://TON-DOMAINE/api/profil \
  -d '{"name":"Test","role":"admin","credits":99999}'
```

**Rate limiting** — attendu : un 429 apparaît avant la 20ᵉ tentative

```bash
for i in $(seq 1 20); do
  printf '%s ' "$(curl -s -o /dev/null -w '%{http_code}' -X POST https://TON-DOMAINE/api/login \
    -H 'Content-Type: application/json' -d '{"email":"test@test.fr","password":"faux"}')"
done; echo
```

**Session révoquée** — se déconnecter, puis rejouer une requête avec l'ancien cookie. Attendu : 401.

**Stockage du token** — dans la console du navigateur, après connexion :

```js
localStorage.length          // attendu : pas de token
document.cookie              // attendu : le cookie de session n'apparaît PAS (httpOnly)
```

**Fichiers exposés**

```bash
for p in .env .git/config .git/HEAD backup.sql phpinfo.php package.json; do
  printf '%-16s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' https://TON-DOMAINE/$p)"
done
```

**En-têtes**

```bash
curl -sI https://TON-DOMAINE | grep -iE "strict-transport|content-security|x-frame|x-content-type|referrer|permissions|x-powered-by"
```

**Fuite dans les réponses** — appeler chaque route qui renvoie un utilisateur et chercher `password`, `token`, `secret`, `email` dans la sortie brute.

---

## 7.3 Outils externes

Gratuits, à passer avant chaque mise en ligne :

- [securityheaders.com](https://securityheaders.com) — en-têtes HTTP, viser A
- [ssllabs.com/ssltest](https://www.ssllabs.com/ssltest/) — configuration TLS, viser A
- [mail-tester.com](https://www.mail-tester.com) — SPF/DKIM/DMARC et délivrabilité
- [observatory.mozilla.org](https://observatory.mozilla.org) — vue d'ensemble
- `npm audit --omit=dev` — dépendances
- [WPScan](https://wpscan.com) — sites WordPress
- OWASP ZAP en mode scan passif — pour aller plus loin

**Ne scanner que des sites dont on a l'autorisation écrite.** Un scan actif sur le site d'un tiers est une infraction.

---

## 7.4 Tests automatisés à conserver

Les tests de sécurité utiles sont ceux qui restent dans la suite de tests et empêchent la régression :

```ts
it("refuse l'accès à la commande d'un autre utilisateur", async () => {
  const res = await request(app)
    .get(`/api/commandes/${commandeDeB.id}`)
    .set('Cookie', cookieDeA)
  expect(res.status).toBe(404)
})

it("ignore le champ role dans la mise à jour du profil", async () => {
  await request(app).patch('/api/profil')
    .set('Cookie', cookieDeA)
    .send({ name: 'X', role: 'admin' })
  const user = await db.user.findUnique({ where: { id: userA.id } })
  expect(user.role).toBe('user')
})
```

Au minimum, un test par faille critique corrigée. Sans cela, la prochaine génération de code par IA rouvrira le trou sans que personne ne s'en aperçoive.

---

## 7.5 Ce qu'un audit de code ne couvre pas

À signaler explicitement au client, car ces points sortent du dépôt :

- Sécurité physique et comptes de l'hébergeur, du registrar, de la boîte mail
- Mots de passe réutilisés par le client sur d'autres services
- Accès résiduels d'anciens prestataires (FTP, base, WordPress, Google Analytics)
- Postes de travail compromis
- Hameçonnage et ingénierie sociale — souvent le vrai vecteur d'entrée
- Sauvegardes jamais testées
- Absence de procédure en cas d'incident

Un rapport honnête dit ce qu'il n'a pas vérifié.

---

## 7.6 Modèle de conclusion pour le client

```
AUDIT DE SÉCURITÉ — <site> — <date>

Périmètre : <ce qui a été examiné>
Non couvert : <ce qui ne l'a pas été>

Résultat
  Critique : <n>   |   Élevé : <n>   |   Moyen : <n>   |   Faible : <n>

Corrigé pendant l'audit
  - <faille> — vérifié par <preuve>

Reste à faire (avec délai recommandé)
  - <faille> — <effort estimé> — <échéance>

Recommandations de suivi
  - <surveillance, sauvegardes, mises à jour, prochaine revue>
```

Toujours conclure par une date de prochaine revue. La sécurité n'est pas un livrable ponctuel : chaque nouvelle fonctionnalité rouvre la surface d'attaque.

La cadence à retenir selon le niveau, et surtout les **déclencheurs** qui imposent une revue hors calendrier — nouvelle fonctionnalité sensible, plugin ajouté, changement de prestataire, départ d'une personne ayant des accès — sont dans `assets/questionnaire-client.md`, volet 4.
