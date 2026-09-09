# Passe 6 — RGPD et conformité (France / UE)

Pour un site livré à un client français, ce volet n'est pas optionnel : c'est le seul du lot qui expose à une sanction administrative, et c'est aussi celui qui se règle le plus vite.

> Ce document est un guide pratique de mise en conformité technique, pas un conseil juridique. Pour un traitement à risque (données de santé, profilage, grands volumes), le client doit consulter un juriste ou un DPO.

---

## 6.1 Cookies et traceurs

**La règle CNIL.** Tout dépôt de cookie non strictement nécessaire au service exige un **consentement préalable, libre, éclairé, spécifique et univoque**. Concrètement :

- Aucun traceur de mesure d'audience, de publicité ou de réseau social **avant** le clic sur « Accepter ».
- « Refuser » doit être **aussi simple** qu'« Accepter » : un bouton au même niveau, dans la même fenêtre. Un lien « Paramètres » discret face à un gros bouton « Tout accepter » est non conforme et fait l'objet de sanctions régulières.
- Continuer à naviguer ne vaut pas consentement. Le scroll non plus.
- Le refus doit être conservé (durée recommandée : 6 mois) et le consentement doit pouvoir être retiré aussi facilement qu'il a été donné — prévoir un lien permanent en pied de page.
- Un mur de cookies (accès conditionné à l'acceptation) n'est toléré que sous conditions strictes ; à éviter.

**Sont exemptés** de consentement : cookie de session d'authentification, panier d'achat, préférence de langue, équilibrage de charge, et la mesure d'audience si elle est configurée en mode exempté (Matomo sans cookie ou en configuration CNIL exemptée).

**Détecter.** Ouvrir le site en navigation privée, ouvrir l'onglet Application → Cookies **avant tout clic**. Tout ce qui est déposé à ce moment doit être strictement nécessaire. Regarder aussi l'onglet Réseau : Google Fonts chargées depuis les serveurs de Google transmettent l'IP du visiteur aux États-Unis — les héberger en local règle le problème.

**Le correctif.** Bandeau conforme (Axeptio, Tarteaucitron, ou une implémentation maison correcte) qui **bloque réellement** le chargement des scripts tant que le consentement n'est pas donné. Un bandeau purement décoratif, avec Google Analytics chargé dans le `<head>`, est le cas le plus fréquent — et le plus facilement constaté.

**Prompt à coller**

> Vérifie quels cookies et scripts tiers mon site dépose avant tout consentement. Mets en place un bandeau conforme CNIL : aucun traceur non nécessaire avant acceptation, bouton Refuser au même niveau qu'Accepter, choix conservé 6 mois, et lien permanent pour modifier son choix. Le blocage des scripts doit être réel, pas seulement visuel. Héberge les polices en local plutôt que de les charger depuis Google.

---

## 6.2 Mentions légales et politique de confidentialité

Obligatoires sur tout site professionnel français (LCEN + RGPD). Doivent figurer :

**Mentions légales** — identité de l'éditeur (dénomination, forme juridique, adresse, RCS/SIRET, capital pour une société, numéro de TVA), directeur de la publication, coordonnées de l'hébergeur (nom, adresse, téléphone), et pour les activités réglementées l'ordre professionnel et le numéro d'inscription.

**Politique de confidentialité** — pour chaque traitement : finalité, base légale (consentement, contrat, intérêt légitime, obligation légale), catégories de données, destinataires (y compris les sous-traitants : hébergeur, service d'emailing, outil d'analytics, fournisseur d'IA), durée de conservation par catégorie, transferts hors UE et leur encadrement, droits des personnes et comment les exercer, contact du responsable de traitement ou du DPO, et droit de réclamation auprès de la CNIL.

Une politique générique copiée-collée qui ne cite pas les outils réellement utilisés est une non-conformité en soi.

---

## 6.3 Formulaires et collecte

- **Minimisation** : ne collecter que le nécessaire. Un formulaire de contact n'a pas besoin de la date de naissance ni de l'adresse postale.
- Cases de consentement **non pré-cochées**, distinctes par finalité (contact ≠ newsletter).
- Mention d'information au point de collecte, avec un lien vers la politique de confidentialité.
- Champs obligatoires signalés, et réellement obligatoires.
- Newsletter : opt-in, idéalement double opt-in, avec un lien de désinscription fonctionnel dans chaque email (obligation légale).

---

## 6.4 Droits des personnes

Le client doit pouvoir répondre en un mois à une demande d'accès, de rectification, d'effacement, de portabilité, d'opposition ou de limitation.

Techniquement, prévoir :

- Une adresse de contact dédiée qui est réellement relevée.
- Un moyen d'**exporter** toutes les données d'une personne (accès et portabilité).
- Un moyen de **supprimer** un compte et ses données — y compris dans les sauvegardes après leur rotation, dans l'outil d'emailing et dans le CRM, pas seulement dans la base principale.
- Une procédure écrite, même courte, remise au client à la livraison.

---

## 6.5 Durées de conservation

Aucune donnée ne se conserve indéfiniment. Repères usuels :

| Donnée | Durée courante |
|---|---|
| Prospect sans relation commerciale | 3 ans après le dernier contact |
| Client (base active) | durée de la relation + 3 ans |
| Pièces comptables et factures | 10 ans (obligation légale) |
| Journaux de connexion | 6 mois à 1 an |
| Cookies de mesure d'audience | 13 mois maximum |
| Consentement (preuve) | durée du consentement + 3 ans |
| CV de candidature spontanée | 2 ans |

Mettre en place une **purge automatique** plutôt que de compter sur une action manuelle qui n'aura jamais lieu.

---

## 6.6 Sous-traitants et transferts hors UE

Chaque service tiers qui traite des données pour le compte du client est un sous-traitant au sens du RGPD, et exige un **contrat de sous-traitance (DPA)** : hébergeur, service d'emailing, outil d'analytics, plateforme de paiement, fournisseur d'IA, service de formulaire.

Les grands fournisseurs proposent un DPA standard à accepter en ligne. Le lister dans un registre, même sommaire.

Pour les transferts hors UE (États-Unis principalement) : vérifier l'existence de clauses contractuelles types ou l'adhésion au Data Privacy Framework. À préférer quand c'est possible : un hébergement et des outils européens (OVH, Scaleway, Brevo, Matomo, Plausible), ce qui simplifie la conformité et se plaide bien commercialement.

**Toi-même**, en tant que prestataire qui héberge ou administre le site de ton client, tu es son sous-traitant : un DPA doit exister entre vous, et tes propres accès doivent être sécurisés (2FA, mots de passe uniques, révocation à la fin de la mission).

---

## 6.7 Registre des traitements

Obligatoire au-delà de 250 salariés, et en pratique attendu dès qu'il y a un traitement régulier de données personnelles — ce qui est le cas de tout site avec un formulaire.

Un tableau suffit : traitement, finalité, base légale, catégories de personnes, catégories de données, destinataires, transferts, durée de conservation, mesures de sécurité. Le modèle de la CNIL est disponible et fait le travail.

---

## 6.8 Violation de données

En cas de fuite : notification à la CNIL sous **72 heures** si le risque pour les personnes n'est pas négligeable, et information des personnes concernées si le risque est élevé.

Prévoir avant l'incident : qui prévient qui, où sont les journaux, comment on coupe l'accès, comment on force la réinitialisation des mots de passe. Une demi-page suffit, mais elle doit exister avant d'en avoir besoin — pas pendant.

---

## 6.9 Accessibilité (RGAA) — connexe mais souvent demandé

Pas de la sécurité à proprement parler, mais dans le même lot d'obligations. Obligatoire pour le secteur public et, depuis le European Accessibility Act (juin 2025), pour une partie du privé : commerce en ligne, banque, transport, à partir de certains seuils.

Une déclaration d'accessibilité et un niveau AA visé sont un argument commercial autant qu'une obligation. Voir la compétence `design:accessibility-review` pour l'audit technique.
