# Passe 5 — Infrastructure, headers, transport

Rapide à appliquer, visible immédiatement, et valable même pour un simple site vitrine.

---

## 5.1 En-têtes de sécurité HTTP

À vérifier sur le site en production :

```bash
curl -sI https://TON-DOMAINE | grep -iE "strict-transport|content-security|x-frame|x-content-type|referrer|permissions"
```

| En-tête | Valeur recommandée | Ce que ça bloque |
|---|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | rétrogradation vers HTTP, interception |
| `Content-Security-Policy` | voir ci-dessous | XSS, injection de scripts tiers |
| `X-Content-Type-Options` | `nosniff` | interprétation d'un fichier comme script |
| `X-Frame-Options` | `DENY` (ou CSP `frame-ancestors`) | clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | fuite d'URL et de tokens vers les tiers |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | accès matériel non voulu |

Retirer `X-Powered-By` et masquer la version du serveur.

**Content-Security-Policy** est la plus efficace et la plus délicate. Départ raisonnable, à ajuster :

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https:;
font-src 'self' data:;
connect-src 'self' https://api.example.com;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
```

Méthode : déployer d'abord en `Content-Security-Policy-Report-Only`, regarder ce qui casse pendant quelques jours, ajuster, puis passer en mode bloquant. `'unsafe-inline'` sur `script-src` annule l'essentiel de la protection — préférer les nonces si le framework le permet.

**Où les poser** — en Next.js, dans `next.config.js` :

```js
const headers = [
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
]
module.exports = {
  async headers() {
    return [{ source: '/:path*', headers }]
  },
}
```

Sur Apache (`.htaccess`, hébergement mutualisé) :

```apache
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "DENY"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
Header always unset X-Powered-By
```

Vérifier le résultat sur [securityheaders.com](https://securityheaders.com) et [ssllabs.com/ssltest](https://www.ssllabs.com/ssltest/). Viser A ou A+ sur les deux.

**Prompt à coller**

> Ajoute les en-têtes de sécurité HTTP à mon site : HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy, et une Content-Security-Policy. Déploie d'abord la CSP en mode Report-Only et liste-moi les scripts et domaines tiers qu'utilise le site pour qu'on ajuste avant de passer en mode bloquant. Retire aussi X-Powered-By.

---

## 5.2 HTTPS et TLS

- HTTPS partout, redirection permanente 301 de HTTP vers HTTPS.
- Certificat renouvelé automatiquement (Let's Encrypt), avec une alerte d'expiration.
- TLS 1.2 minimum, TLS 1.3 de préférence ; désactiver TLS 1.0/1.1 et SSLv3.
- Pas de contenu mixte : une image ou un script en `http://` sur une page HTTPS casse la protection et déclenche un avertissement.
- Cookies avec le drapeau `Secure`, et préfixe `__Host-` pour les cookies de session quand c'est possible.

---

## 5.3 Protection anti-bot des formulaires publics

Un formulaire de contact sans protection devient un relais de spam en quelques semaines, ce qui met le domaine d'envoi sur liste noire — le client ne reçoit alors plus ses propres emails.

- **Cloudflare Turnstile** (gratuit, sans énigme visuelle, respectueux du RGPD car sans cookie de suivi) — préférable à reCAPTCHA sur un site français, celui-ci transférant des données vers Google.
- Champ **honeypot** caché : rempli = bot, rejeté silencieusement.
- Contrôle de délai : un formulaire soumis en moins de 2 secondes est automatisé.
- Rate limiting par IP sur la soumission.

La validation du captcha se fait **côté serveur**, par appel à l'API de vérification. Un captcha vérifié uniquement côté client ne sert à rien.

---

## 5.4 Emails : SPF, DKIM, DMARC

Sans ces enregistrements DNS, n'importe qui peut envoyer un email en se faisant passer pour `contact@ton-client.fr`. C'est la base du phishing ciblé, et c'est aussi ce qui fait tomber les emails du site en spam.

- **SPF** : `v=spf1 include:<ton prestataire d'envoi> -all`
- **DKIM** : clé fournie par le prestataire (Brevo, Resend, Postmark, OVH), publiée en DNS.
- **DMARC** : commencer en `p=none` avec une adresse de rapport, observer, puis passer à `p=quarantine` puis `p=reject`.

```
_dmarc.ton-domaine.fr TXT "v=DMARC1; p=none; rua=mailto:dmarc@ton-domaine.fr; pct=100"
```

Vérifier avec [mail-tester.com](https://www.mail-tester.com) ou [dmarcian](https://dmarcian.com/domain-checker/).

---

## 5.5 Domaine et DNS

- Domaine **verrouillé** chez le registrar (transfer lock) et protection WHOIS activée.
- Renouvellement automatique et carte de paiement à jour — un domaine expiré est récupéré en quelques heures par des revendeurs.
- Compte du registrar protégé par 2FA. C'est le point de défaillance unique : qui contrôle le DNS contrôle le site, les emails et les certificats.
- Enregistrement CAA pour limiter les autorités de certification autorisées.
- Supprimer les enregistrements DNS pointant vers des services abandonnés (sous-domaine pointant vers un hébergeur où le projet n'existe plus = prise de contrôle de sous-domaine).

---

### Le domaine sosie

Tout ce qui précède protège **ton** domaine contre le détournement. Rien n'empêche un tiers de déposer un domaine ressemblant pour imiter le site : `monclient-paiement.fr`, `mon-client.fr` quand l'original est `monclient.fr`, ou la faute de frappe la plus probable. C'est le support classique du hameçonnage ciblant les clients du site — et c'est eux qui paient, pas le site.

Ce qu'on peut faire, par ordre de coût :

- **Déposer soi-même les variantes évidentes** au moment de la création : le tiret, le `.com` si l'original est en `.fr` et l'inverse, le pluriel, la faute de frappe la plus courante. Quelques dizaines d'euros par an, et elles redirigent vers le site officiel.
- **Surveiller les certificats** émis pour des domaines proches, via les journaux de transparence des certificats (`crt.sh` en recherche manuelle, ou un service d'alerte). Un certificat émis pour un domaine sosie précède presque toujours une campagne de hameçonnage.
- **Dire aux clients ce que le site ne fera jamais** : ne jamais demander de mot de passe par email, ne jamais demander un virement vers un nouveau RIB par email. Cette phrase, écrite une fois dans les emails transactionnels, arrête davantage d'attaques que la plupart des mesures techniques.

En cas de constat : signaler au registrar du domaine sosie et à l'hébergeur de la page, prévenir les clients sans attendre que la fraude aboutisse, et conserver les preuves (captures, dates, WHOIS) avant que la page ne disparaisse.

---

## 5.6 Accès au serveur

Sur un VPS :

- Authentification SSH **par clé uniquement**, `PasswordAuthentication no`, connexion root désactivée.
- Pare-feu : seuls 22 (ou un port modifié), 80 et 443 ouverts. La base de données ne doit **jamais** écouter sur l'interface publique.
- `fail2ban` sur SSH et sur les formulaires de connexion.
- Mises à jour de sécurité automatiques (`unattended-upgrades`).
- Un utilisateur système distinct par application, sans droits d'écriture sur son propre code.

Sur un hébergement mutualisé : désactiver l'accès FTP en clair au profit de SFTP, changer les mots de passe fournis par défaut, supprimer les comptes des anciens prestataires.

---

## 5.7 Environnements de préproduction

Un `staging.monsite.fr` indexé par Google, sans mot de passe, avec une copie de la base de production, est une fuite de données complète.

- Protection par mot de passe HTTP (Basic Auth) ou restriction par IP.
- `X-Robots-Tag: noindex` **en en-tête** (le `robots.txt` seul n'empêche pas l'indexation d'un lien partagé).
- Données **anonymisées** : jamais de copie brute de la production avec les vrais emails clients.
- Clés API de test, jamais celles de production.
