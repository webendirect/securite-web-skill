# Questionnaire client — les angles morts hors du code

À faire remplir au démarrage d'une mission, avant la passe 0.

Un audit lit le code. Or **sept des dix questions auxquelles un propriétaire de site doit pouvoir répondre ne sont pas dans le code** : qui a les accès, ce qui se passe si le prestataire disparaît, combien coûte une panne, quand on regarde à nouveau. Ce questionnaire les couvre, et il produit en sortie le niveau de sécurité de la passe 0.

Comptez vingt minutes. Il est écrit pour être rempli par une personne non technique — si une question n'a pas de réponse, « je ne sais pas » est une réponse utile, et souvent la plus instructive.

---

## Volet 1 — Qui a les clés

Le point le plus souvent ignoré, et celui qui ouvre le plus de portes. Pour chaque système, trois colonnes : qui a accès, **à quel nom est le compte**, la double authentification est-elle active.

| Système | Qui y accède | Compte au nom de | 2FA |
|---|---|---|---|
| Hébergement (OVH, Vercel, o2switch…) | | | |
| Nom de domaine (registrar) | | | |
| Base de données | | | |
| Administration du site | | | |
| Boîte mail professionnelle | | | |
| Outil d'emailing | | | |
| Prestataire de paiement | | | |
| Analytics | | | |
| Comptes sociaux | | | |
| Dépôt de code | | | |

Puis trois questions transversales :

- **Des mots de passe sont-ils partagés** entre plusieurs personnes, ou chacun a-t-il le sien ?
- **D'anciens prestataires, salariés ou stagiaires ont-ils encore des accès ?** C'est la porte ouverte la plus fréquente, et la plus facile à fermer.
- **Une personne quitte l'entreprise demain : qui coupe quoi, et en combien de temps ?**

> **Le compte du registrar est le point de défaillance unique.** Qui contrôle le DNS contrôle le site, les emails et les certificats. Si un seul compte doit avoir une double authentification et un mot de passe unique, c'est celui-là.

---

## Volet 2 — Et si le prestataire disparaît

Question inconfortable, et c'est pour ça qu'elle se pose au début plutôt qu'en situation.

- Les accès sont-ils **au nom du client** ou au nom du prestataire ?
- Le client peut-il **reprendre son site demain** avec quelqu'un d'autre ?
- Existe-t-il une **documentation d'exploitation** : où est hébergé quoi, comment on déploie, où sont les sauvegardes, quels services tiers sont utilisés et pourquoi ?
- Que se passe-t-il si le prestataire n'est **plus joignable** — vacances, maladie, fin de relation ?
- Les factures des services tiers sont-elles payées par le client ou avancées par le prestataire ? Une carte qui expire chez le prestataire peut couper l'hébergement du client.

**La contrepartie, côté prestataire.** Ce qu'il faut pouvoir montrer pour être irréprochable :

- tous les comptes ouverts **au nom du client**, le prestataire y étant invité comme collaborateur ;
- une page de documentation de reprise, tenue à jour ;
- une procédure de fin de mission : restitution des accès, suppression des copies de données, révocation des jetons ;
- un contrat de sous-traitance (DPA) signé — voir `conformite/04-preuve-et-registre.md`.

Ce volet est autant commercial que technique. Un client qui pose la question et reçoit une réponse claire n'a plus de raison de chercher ailleurs. Un prestataire qui n'a pas la réponse vient de découvrir son propre risque.

---

## Volet 3 — Combien coûte un incident

Cette section produit le chiffre qui détermine tout le reste. Sans elle, l'arbitrage de la passe 0 se fait à l'intuition — et l'intuition penche toujours vers le maximalisme que la passe 0 est censée corriger.

- **Une journée sans site, c'est combien ?** Chiffre d'affaires perdu, commandes non prises, rendez-vous manqués.
- **Quelle part de l'activité passe par le site ?** Un site vitrine qui génère deux appels par semaine et une boutique qui fait tout son chiffre en ligne n'appellent pas les mêmes moyens.
- **Combien de personnes seraient concernées par une fuite de données ?** Cent contacts ou quinze mille clients.
- **Quel effet sur la relation ?** Un artisan dont les clients apprennent que leurs coordonnées ont fuité perd de la confiance ; un cabinet qui traite des dossiers sensibles perd des clients.
- **Que coûterait la gestion de crise ?** Prestataire d'urgence, notification des personnes, temps passé, éventuel accompagnement juridique.
- **Le client est-il assuré** contre le risque cyber ? Beaucoup de contrats professionnels incluent une garantie ignorée.

**Ce qu'on en fait.** Ces montants ne sont pas un argument de vente, ils sont un curseur. Un risque annuel estimé à quelques centaines d'euros ne justifie pas trois jours de durcissement ; un risque à plusieurs dizaines de milliers change complètement l'arbitrage — dans les deux sens.

---

## Volet 4 — Quand regarde-t-on à nouveau

Un audit est une photo. La passe 7 impose de conclure par une date de prochaine revue ; voici comment la choisir.

| Niveau (passe 0) | Revue complète | Contrôle rapide |
|---|---|---|
| 1 — vitrine | 12 mois | trimestriel : mises à jour, sauvegardes, certificat |
| 2 — compte simple | 12 mois | trimestriel |
| 3 — transactionnel | 6 mois | mensuel |
| 4 — sensible | 6 mois, ou selon obligation | mensuel |

**Les déclencheurs, qui priment sur le calendrier.** Une revue s'impose hors échéance dès que :

- une fonctionnalité touchant les comptes, les paiements ou les données personnelles est ajoutée ;
- un plugin, un thème ou un service tiers est installé ;
- le prestataire change ;
- l'hébergement ou le domaine migre ;
- une personne ayant des accès quitte l'entreprise ;
- un fournisseur annonce une faille ou une fuite ;
- un comportement anormal est constaté — voir les signes en `references/04-secrets-et-exposition.md`.

Le contrôle rapide tient en dix minutes : `scripts/audit-express.sh`, les mises à jour en attente, la dernière sauvegarde restaurée, l'expiration du domaine et du certificat.

---

## Sortie du questionnaire

À remplir une fois les quatre volets parcourus. C'est ce bloc qui ouvre la passe 0 :

```
NIVEAU RETENU (1 à 4) :
CE QU'ON PROTÈGE, EN UNE PHRASE :

ACCÈS À RÉGULARISER :
  - <comptes au mauvais nom, 2FA manquantes, accès à révoquer>

DÉPENDANCE AU PRESTATAIRE :
  - <ce qui manque pour qu'un autre puisse reprendre>

COÛT ESTIMÉ D'UNE JOURNÉE D'ARRÊT :
COÛT ESTIMÉ D'UNE FUITE :

PROCHAINE REVUE COMPLÈTE :        <date>
PROCHAIN CONTRÔLE RAPIDE :        <date>

RÉPONSES « JE NE SAIS PAS » À LEVER :
  - <liste — ce sont les premiers angles morts>
```

Les « je ne sais pas » ne sont pas des trous à combler plus tard : ce sont les premières failles, et elles ne sont pas dans le code.

---

# Annexe — la grille des vingt questions

Le questionnaire ci-dessus vient de cet exercice : se mettre à la place du visiteur, puis du propriétaire, et lister ce que chacun se demande. Elle sert de grille de relecture en fin de mission — pour chaque ligne, sait-on répondre, et où ?

## Ce que se demande un visiteur

Il ne les pose jamais à voix haute. Il les ressent, et il part si la réponse lui déplaît.

| # | Question | Où la compétence y répond |
|---|---|---|
| 1 | Suis-je au bon endroit ? | `05-infrastructure.md` — domaine, DNS, domaines sosies |
| 2 | Qui est derrière ce site ? | `06-rgpd-conformite.md` — mentions légales |
| 3 | Pourquoi vous me demandez ça ? | `conformite/05-donnees-sensibles-et-aipd.md` — minimisation |
| 4 | Qui peut lire en chemin ? | `05-infrastructure.md` — HTTPS, TLS, contenu mixte |
| 5 | Ma carte va où ? | `01-authentification.md` § 1.9 — données bancaires |
| 6 | Un autre client voit-il mes données ? | `02-autorisation.md` — IDOR |
| 7 | Puis-je récupérer mes données et partir ? | `conformite/03-effacement-et-portabilite.md` + code d'export et de suppression |
| 8 | Peut-on me voler mon compte, et le saurai-je ? | `01-authentification.md` § 1.10 — changements sensibles |
| 9 | Me direz-vous si vous êtes piratés ? | `conformite/04-preuve-et-registre.md` — violation, 72 heures |
| 10 | Puis-je dire non sans être puni ? | `conformite/01-consentement-cookies.md` — refus aussi simple qu'accepter |

## Ce à quoi un propriétaire doit savoir répondre

| # | Question | Où la compétence y répond |
|---|---|---|
| 1 | Qu'est-ce que je détiens ? | `assets/mission-rgpd.md` — cartographie |
| 2 | Qui a les clés ? | **ce questionnaire, volet 1** |
| 3 | Si on me pirate, je le sais quand ? | `04-secrets-et-exposition.md` — surveillance et signes de compromission |
| 4 | Je remonte en combien de temps ? | `04-secrets-et-exposition.md` — sauvegardes testées |
| 5 | Si mon prestataire disparaît ? | **ce questionnaire, volet 2** |
| 6 | Qu'est-ce qui sort de chez moi ? | `conformite/04-preuve-et-registre.md` — sous-traitants, transferts hors UE |
| 7 | Combien ça me coûte ? | **ce questionnaire, volet 3** |
| 8 | Ce que je promets est-il vrai ? | `conformite/01-consentement-cookies.md` — promesse contre réalité |
| 9 | Qui décide et qui répond ? | `conformite/04-preuve-et-registre.md` — responsable de traitement, DPA |
| 10 | Quand regarde-t-on à nouveau ? | **ce questionnaire, volet 4** |

---

## Prompt à coller

> Aide-moi à remplir le questionnaire client de `assets/questionnaire-client.md` pour ce projet. Commence par ce que tu peux déduire du code et de la configuration — services tiers utilisés, hébergement, prestataire de paiement, données stockées. Puis liste-moi précisément les questions auxquelles seul le client peut répondre, regroupées par volet, sous une forme que je peux lui envoyer telle quelle. Termine par le bloc de sortie pré-rempli avec ce qui est déjà connu, et les « je ne sais pas » qui restent.
