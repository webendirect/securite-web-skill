# Brique 5 — Base légale, données sensibles, AIPD

Les trois premières briques traitent ce qu'on fait des données. Celle-ci traite une question antérieure : **a-t-on le droit de les collecter ?**

C'est aussi la partie où il faut savoir s'arrêter. Une base légale ne se déduit pas d'un fichier de code, et un traitement de données sensibles ne se valide pas depuis un dépôt Git.

---

## 5.1 Ne jamais inventer

Règle de conduite pour tout ce document : **on ne fabrique pas une information juridique ou contractuelle**. Quand le code ne permet pas de trancher, on le dit, avec un marqueur explicite dans le rapport :

| Marqueur | Quand l'employer |
|---|---|
| `[À FOURNIR PAR LE RESPONSABLE DU SITE]` | information métier absente du code : identité de l'éditeur, finalité réelle, destinataires |
| `[VÉRIFICATION JURIDIQUE NÉCESSAIRE]` | la base légale ne se déduit pas du contexte technique |
| `[TRANSFERT INTERNATIONAL À VÉRIFIER]` | un service tiers est utilisé sans que sa localisation ni son encadrement soient établis |
| `[REVUE PRIVACY CRITIQUE]` | des données sensibles au sens de l'article 9 semblent collectées |

Un rapport qui affiche ces marqueurs est plus utile qu'un rapport qui comble les trous avec des suppositions. Et il protège : une conformité affirmée à tort engage celui qui l'affirme.

Ne jamais écrire qu'un site est « 100 % conforme ». La conformité dépend du contexte métier réel, pas du code seul.

---

## 5.2 Finalités

Chaque traitement doit avoir une finalité **déterminée, explicite et légitime**, établie au moment de la collecte.

Finalités courantes sur un site : contact, demande de devis, création de compte, commande, paiement, livraison, réservation, support, sécurité, statistiques, prospection, publicité, personnalisation.

**Le piège** : la réutilisation. Une donnée collectée pour exécuter une commande n'est pas automatiquement utilisable pour de la prospection. Un email donné pour un devis n'ouvre pas la newsletter. Toute réutilisation pour une finalité nouvelle doit être vérifiée — et le plus souvent, consentie.

À l'audit : lister les finalités réellement présentes dans le code, et repérer les cas où une même donnée sert à deux choses sans que ce soit prévu.

---

## 5.3 Base légale

Six bases possibles, et une seule s'applique par traitement :

| Base | Quand | Exemple typique |
|---|---|---|
| **Consentement** | la personne accepte librement, pour une finalité précise | newsletter, cookies publicitaires |
| **Exécution d'un contrat** | nécessaire à un service demandé | compte client, commande, livraison |
| **Obligation légale** | imposé par un texte | conservation des factures, données de connexion |
| **Intérêt légitime** | intérêt de l'entreprise, mis en balance avec les droits des personnes | sécurité, prévention de la fraude, prospection B2B |
| **Intérêts vitaux** | vie ou intégrité d'une personne | rare hors santé et urgence |
| **Mission d'intérêt public** | autorité publique ou mission déléguée | secteur public |

Deux erreurs fréquentes, et opposées :

- **Tout mettre sous consentement**, y compris ce qui relève du contrat. Résultat pervers : la personne peut retirer son consentement, et le service devient inexécutable.
- **Tout mettre sous intérêt légitime**, y compris la prospection vers des particuliers, ce qui ne tient pas. L'intérêt légitime suppose une mise en balance documentée, pas une case cochée.

La base légale se déduit du **contexte métier**, pas du code. Quand ce contexte manque : `[VÉRIFICATION JURIDIQUE NÉCESSAIRE]`, sans proposer de base par défaut.

---

## 5.4 Minimisation

Ne collecter que ce qui est nécessaire à la finalité. C'est le principe le plus simple à vérifier et le plus souvent violé, parce qu'un champ ne coûte rien à ajouter.

À chercher dans les formulaires et les schémas de base :

- **Champs inutiles** — la date de naissance sur un formulaire de contact, l'adresse postale pour une newsletter, le genre pour un devis.
- **Champs « au cas où »** — collectés sans usage identifié dans le code.
- **Données dupliquées** dans plusieurs tables sans raison.
- **Données conservées après usage** — un fichier d'import qui reste sur le serveur, un champ de vérification une fois validé.
- **Précision excessive** — une adresse complète quand un code postal suffit, une date de naissance quand une majorité suffit.

Le test : pour chaque champ, quelle fonctionnalité cesse de marcher si on le retire ? Sans réponse, le champ part.

**Ne jamais ajouter de collecte sans justification.** Un audit de sécurité ne doit pas se conclure par plus de données collectées qu'au départ — c'est pourtant ce que produit un ajout de journalisation mal cadré.

---

## 5.5 Données sensibles (article 9)

Certaines catégories sont **interdites de traitement par principe**, sauf exception limitativement énumérée :

- santé, y compris les données de santé déduites
- biométrie utilisée pour identifier une personne
- données génétiques
- opinions politiques
- convictions religieuses ou philosophiques
- appartenance syndicale
- orientation sexuelle ou vie sexuelle
- origine raciale ou ethnique

Sont soumises à un régime propre et tout aussi strict : les données relatives aux **infractions et condamnations**, ainsi que le **numéro de sécurité sociale (NIR)**.

**À l'audit**, chercher ce qui trahit une collecte de ce type — souvent involontaire :

- un champ « allergies », « régime alimentaire », « accessibilité », « handicap » sur un formulaire d'inscription à un événement
- une question de santé dans un formulaire de réservation (sport, bien-être, cosmétique)
- une photo de profil obligatoire, un système de reconnaissance faciale
- un champ libre « précisez votre situation », qui recueille en pratique n'importe quoi
- une adhésion ou un statut de membre révélant une opinion ou une conviction
- un formulaire de recrutement demandant la nationalité ou une pièce d'identité

Si l'un de ces cas apparaît : **`[REVUE PRIVACY CRITIQUE]`**, et on s'arrête là. On ne décide jamais seul qu'un traitement de données sensibles est licite : cela suppose une exception applicable (consentement explicite, médecine du travail, intérêt public en santé…), une analyse d'impact le plus souvent, et des mesures de sécurité renforcées.

Ce qu'on peut proposer techniquement en attendant : supprimer le champ s'il n'est pas indispensable, le rendre facultatif, remplacer un champ libre par une liste fermée sans catégorie sensible, ou déplacer l'information hors du site.

---

## 5.6 Analyse d'impact (AIPD)

Une AIPD est requise quand le traitement est susceptible d'engendrer un **risque élevé** pour les personnes. Indices à signaler :

- données sensibles ou hautement personnelles **à grande échelle**
- **profilage** ou notation avec effet significatif (scoring, décision automatisée)
- **surveillance systématique** d'une zone accessible au public ou du comportement des personnes
- croisement de jeux de données provenant de sources différentes
- données de personnes **vulnérables** — mineurs, patients, salariés
- **technologie innovante** appliquée à des données personnelles, ce qui inclut certains usages d'IA
- traitement empêchant l'exercice d'un droit ou l'accès à un service

La CNIL publie une liste des traitements qui l'exigent et une liste de ceux qui en sont dispensés ; le premier réflexe est de s'y reporter.

**Ne pas conclure définitivement qu'une AIPD est obligatoire ou non depuis le code.** Le rôle technique est de signaler les indices et de les documenter ; la décision revient au responsable de traitement, avec son conseil.

---

## 5.7 Données personnelles envoyées à un service d'IA

Sujet neuf, et déjà présent partout : chatbot de support, résumé automatique, génération de contenu, analyse de CV, recommandation.

Établir précisément **ce qui quitte l'infrastructure** :

- quel prestataire, où sont ses serveurs, quel encadrement pour un transfert hors UE
- quelles données partent réellement — souvent bien plus que prévu, quand on envoie un enregistrement complet plutôt que les champs utiles
- le prestataire **réutilise-t-il** les données pour entraîner ses modèles ? C'est le point contractuel décisif ; les offres professionnelles l'excluent généralement, les offres grand public non
- combien de temps les conserve-t-il

Ne jamais transmettre à un service d'IA : mots de passe et empreintes, jetons, données bancaires, données sensibles au sens de l'article 9, et plus généralement toute information personnelle non nécessaire à la tâche.

Quand c'est possible : **minimiser** avant l'envoi (n'envoyer que les champs utiles), **pseudonymiser** (remplacer les noms par des identifiants), ou **anonymiser**. Un résumé de ticket n'a pas besoin du nom de famille du client.

Deux obligations complémentaires : mentionner le prestataire d'IA dans la politique de confidentialité et le registre, comme tout sous-traitant ; et, s'il y a décision automatisée produisant des effets significatifs, informer la personne et lui permettre d'obtenir une intervention humaine.

---

## 5.8 Emails : séparer les canaux

Confondre les envois est une erreur classique et sanctionnable.

| Canal | Base légale | Désinscription |
|---|---|---|
| **Transactionnel** — confirmation de commande, réinitialisation, facture | exécution du contrat | pas de lien de désinscription (l'email est dû) |
| **Prospection** vers un particulier | consentement | obligatoire dans chaque message |
| **Prospection B2B** en lien avec la fonction | intérêt légitime, avec information et opposition | obligatoire |
| **Newsletter** | consentement | obligatoire |

Les mélanger — glisser une offre commerciale dans un email de confirmation, ou envoyer la newsletter à toute la base client sans consentement — fait basculer l'envoi transactionnel dans le régime de la prospection, et rend l'ensemble irrégulier.

Techniquement : listes séparées dans l'outil d'emailing, consentements distincts en base, et un modèle d'email distinct par canal.

---

## 5.9 Privacy by Design et by Default

Deux exigences de l'article 25, à appliquer à **toute nouvelle fonctionnalité**, pas au moment de l'audit final.

**By Design** — la protection des données est pensée dès la conception : quelles données sont réellement nécessaires, où elles vont, combien de temps elles restent, qui y accède.

**By Default** — le réglage le plus protecteur est celui d'origine : profil non public par défaut, partage désactivé par défaut, géolocalisation désactivée par défaut, cases non pré-cochées, visibilité minimale.

Six réflexes qui résument le principe : **collecter moins, conserver moins, exposer moins, partager moins, donner moins de permissions, restreindre les accès.**

---

## Prompt à coller

> Fais l'audit RGPD de fond de ce projet. Cartographie toutes les données personnelles traitées, avec pour chacune : quelle donnée, pourquoi, où stockée, combien de temps, qui y accède, transmise à quel tiers, transférée hors UE, et si elle est réellement nécessaire. Identifie pour chaque traitement sa finalité et sa base légale probable — sans jamais l'inventer : marque [VÉRIFICATION JURIDIQUE NÉCESSAIRE] quand le code ne permet pas de trancher. Signale toute collecte possible de données sensibles au sens de l'article 9 avec le marqueur [REVUE PRIVACY CRITIQUE]. Repère les champs collectés sans usage identifié dans le code. Liste enfin les données envoyées à des services d'IA et ce qui pourrait être minimisé ou pseudonymisé avant l'envoi.
