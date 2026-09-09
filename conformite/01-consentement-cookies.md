# Brique 1 — Consentement aux cookies et traceurs

Le manquement le plus facile à constater : il suffit d'ouvrir le site. Aucun contrôle sur pièces n'est nécessaire, aucune plainte non plus.

---

## La règle

Tout dépôt ou lecture d'information sur le terminal de l'internaute qui n'est pas **strictement nécessaire** au service demandé exige un consentement **préalable, libre, éclairé, spécifique et univoque**.

En pratique, quatre exigences que la CNIL vérifie et sanctionne :

1. **Aucun traceur avant le clic.** Pas de Google Analytics dans le `<head>`, pas de pixel Meta, pas de vidéo YouTube chargée, pas de Google Fonts appelées depuis les serveurs de Google.
2. **Refuser aussi simple qu'accepter.** Deux boutons, même niveau, même écran, même poids visuel. Un gros « Tout accepter » face à un lien « Paramètres » en gris est non conforme — c'est le motif de sanction le plus fréquent.
3. **Consentement révocable.** Aussi facilement qu'il a été donné : un lien permanent en pied de page qui rouvre le choix.
4. **Choix conservé et prouvable.** Le refus est mémorisé (6 mois recommandés) et l'on peut démontrer, pour chaque consentement, quand et à quoi la personne a consenti.

Ce qui ne vaut **pas** consentement : continuer à naviguer, faire défiler la page, un bandeau purement informatif (« en poursuivant vous acceptez »), des cases pré-cochées, un consentement global sans distinction de finalité.

## Ce qui est exempté

Pas de consentement requis pour :

- cookie de session d'authentification
- panier d'achat
- préférence de langue ou d'affichage
- équilibrage de charge, sécurité (limitation de tentatives)
- consentement lui-même (mémoriser le refus)
- mesure d'audience **si** elle est configurée en mode exempté : finalité limitée à la seule mesure, pas de recoupement entre sites, pas de suivi de navigation global, durée de vie limitée à 13 mois, données conservées 25 mois maximum. Matomo en configuration CNIL et Plausible (sans cookie) entrent dans ce cadre ; Google Analytics n'y entre pas.

Ces traceurs exemptés doivent quand même figurer dans la politique de confidentialité.

## Le piège classique

Le cas le plus courant chez un site livré : le bandeau est installé, il est joli, il a deux boutons — et Google Analytics est chargé dans le `<head>` de toute façon. Le bandeau est décoratif ; le trackeur part avant même que le visiteur ait vu la question.

**Un bandeau qui n'empêche rien est pire que pas de bandeau** : il affiche une conformité qu'il n'assure pas, ce qui devient une déclaration trompeuse.

## Comment bloquer pour de vrai

La seule méthode fiable : les scripts tiers ne sont pas des scripts tant qu'ils ne sont pas autorisés.

```html
<!-- AVANT — se charge immédiatement, quoi qu'il arrive -->
<script src="https://www.googletagmanager.com/gtag/js?id=G-XXX"></script>

<!-- APRÈS — inerte pour le navigateur, activé seulement après consentement -->
<script type="text/plain" data-consentement="mesure"
        data-src="https://www.googletagmanager.com/gtag/js?id=G-XXX"></script>
```

Le type `text/plain` fait que le navigateur ne l'exécute pas. Après acceptation de la catégorie, le script de consentement le réécrit en `text/javascript` avec son vrai `src` et le réinjecte dans le DOM.

Même logique pour les iframes :

```html
<iframe data-consentement="marketing"
        data-src="https://www.youtube.com/embed/XXX"
        src="about:blank"></iframe>
```

Prévoir un remplacement visuel (« Cette vidéo dépose des cookies YouTube — cliquer pour l'afficher »), qui active le consentement au clic. Meilleure expérience et meilleure conformité qu'un cadre vide.

## Catégories

Trois suffisent dans la grande majorité des cas. Plus de catégories, c'est plus de conformité en théorie et moins de clarté en pratique.

| Catégorie | Consentement | Exemples |
|---|---|---|
| `necessaire` | non requis, toujours actif | session, panier, langue, sécurité, choix de consentement |
| `mesure` | requis (sauf configuration exemptée) | Google Analytics, Matomo non exempté, Hotjar |
| `marketing` | requis | pixel Meta, Google Ads, YouTube, réseaux sociaux, reciblage |

## Google Consent Mode

Si le client tient à Google Analytics ou Google Ads, le mode consentement v2 est **obligatoire** pour l'Espace économique européen. Il doit être initialisé en `denied` **avant** le chargement de la balise :

```html
<script>
  window.dataLayer = window.dataLayer || []
  function gtag(){ dataLayer.push(arguments) }
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    wait_for_update: 500,
  })
</script>
```

Puis, après acceptation, un `gtag('consent', 'update', { ... 'granted' })`. Le code fourni le fait automatiquement s'il détecte `gtag`.

Attention : le Consent Mode ne dispense pas de bloquer le script. Il règle le comportement de Google, pas le dépôt initial.

## Polices et ressources externes

Charger Google Fonts depuis `fonts.googleapis.com` transmet l'adresse IP du visiteur à Google, sans consentement — un tribunal allemand a déjà condamné ce point, et la CNIL le relève.

Correctif simple : télécharger les fichiers de police et les servir depuis son propre domaine. Gain accessoire : le site est plus rapide et la CSP plus stricte.

Même raisonnement pour les CDN de bibliothèques, les cartes Google Maps, les widgets d'avis et les boutons de partage.

## Journal de preuve

Sans trace, un consentement ne se prouve pas. Enregistrer, à chaque choix :

- un identifiant technique aléatoire (pas d'identité, pas de compte)
- l'horodatage
- le choix par catégorie
- la version des textes affichés (pour montrer ce qui a été présenté)
- l'adresse IP **tronquée ou hachée**, jamais en clair — le journal ne doit pas devenir lui-même un traitement excessif

Conservation : durée du consentement (6 mois) + 3 ans à titre de preuve.

L'implémentation est dans `code/consentement/route-journal.ts`.

## Installation du code fourni

**Site statique, WordPress, ou tout site sans framework**

```html
<link rel="stylesheet" href="/consentement.css">
<script src="/consentement.js" defer></script>
```

Puis convertir chaque script tiers au format `type="text/plain" data-consentement="…" data-src="…"`, et ajouter en pied de page :

```html
<button type="button" onclick="Consentement.ouvrir()">Gérer mes cookies</button>
```

**Next.js App Router** — monter `<ConsentementProvider />` dans `app/layout.tsx`, et déclarer la route `app/api/consentement/route.ts` à partir de `route-journal.ts`.

## Vérification

1. Navigation privée, ouvrir le site, **ne rien cliquer**.
2. Onglet Application → Cookies, et Stockage local : seuls les éléments nécessaires doivent être présents.
3. Onglet Réseau : aucune requête vers `google-analytics.com`, `googletagmanager.com`, `facebook.net`, `fonts.googleapis.com`, `youtube.com`.
4. Cliquer sur **Refuser** : toujours rien, et le choix persiste après rechargement.
5. Cliquer sur **Accepter** : les scripts se chargent, sans recharger la page.
6. Rouvrir depuis le lien de pied de page, changer d'avis, vérifier que le retrait est effectif — les cookies déjà posés doivent être supprimés.

Le point 6 est celui qu'on oublie systématiquement : accepter puis retirer doit **effacer** les cookies déjà déposés, pas seulement cesser d'en poser.

---

## Prompt à coller

> Vérifie tous les scripts et ressources tierces chargés par mon site : analytics, pixels, polices, vidéos, cartes, widgets. Convertis-les au format bloqué (type="text/plain" avec data-consentement et data-src) et installe le bandeau de consentement du module conformité. Aucun traceur ne doit partir avant acceptation. Vérifie que le refus est aussi accessible que l'acceptation, qu'il est conservé, que le retrait supprime les cookies déjà posés, et que les polices sont servies depuis mon domaine. Termine par la liste des domaines tiers restants et leur catégorie.
