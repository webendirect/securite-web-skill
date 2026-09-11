# Rapport RGPD — compétence `securite-web`

**Date :** 2026-09-11
**Périmètre :** le code du module `conformite/`, tel qu'il est livré aux projets clients
**Objet :** vérifier que les briques de conformité **font réellement** ce qu'elles annoncent

> Guide de mise en conformité technique, pas un conseil juridique. Les points
> marqués `[VÉRIFICATION JURIDIQUE NÉCESSAIRE]` doivent être tranchés par un
> juriste ou un DPO, pas par ce rapport.
>
> Aucune obligation légale ni durée de conservation n'a été inventée ici. Là où
> le code ne permettait pas de trancher, le marqueur a été posé.

---

## Résumé

Le module promettait quatre choses. Deux tenaient, deux ne tenaient pas.

| Brique | Avant | Après |
|---|---|---|
| **1. Consentement** — aucun traceur avant accord | Tenait pour les scripts. **Ne tenait pas** pour l'affichage : avec plusieurs contenus intégrés, les substituts restaient visibles par-dessus les contenus activés. | Corrigé et testé (33 assertions dans un vrai DOM). |
| **2. Rétention** — aucune donnée sans durée | **Ne tenait pas** : la purge tombait en erreur à la deuxième ligne anonymisée, et retraitait sans fin les mêmes comptes. Le journal de preuve était donc faux. | Corrigé, idempotent, testé. |
| **3. Effacement** — récupérer et supprimer ses données | **Ne tenait pas** : la fenêtre de rétractation annoncée était fictive, et une suppression interrompue laissait un compte à moitié détruit. | Refondu en deux phases, atomique, avec rétractation réelle. |
| **4. Preuve** — pouvoir démontrer les trois autres | Tenait sur le principe, **faussé en pratique** par les compteurs erronés de la purge. | Comptage réel, journal fiable. |

Un module de conformité qui échoue silencieusement est pire qu'un module
absent : il affiche une conformité qu'il n'assure pas, et personne ne va
vérifier.

---

## Brique 1 — Consentement

### Ce qui a été vérifié

| Exigence CNIL | État | Preuve |
|---|---|---|
| Aucun traceur non nécessaire avant accord | **Conforme** | Test 4.5 : après refus, 0 cadre activé, 0 script exécuté |
| « Refuser » aussi accessible qu'« Accepter » | **Conforme** | Les deux boutons portent la même classe `cnst-btn-principal`, au même niveau, dans la même fenêtre. « Tout refuser » est même placé en premier |
| Choix conservé | **Conforme** | Cookie de 182 jours (~6 mois, recommandation CNIL) |
| Retrait aussi simple que le don | **Conforme** | `Consentement.ouvrir()` rouvre le panneau ; le retrait efface les cookies de la catégorie et recharge |
| Consentement par finalité | **Conforme** | Test 4.6 : accepter la seule mesure n'active pas le marketing |
| Preuve du consentement | **Conforme** | `route-journal.ts`, avec empreinte d'IP tronquée et salée |

### Corrigé

**Substituts non appariés (ÉLEVÉ).** Avec plusieurs contenus intégrés d'une même
catégorie, un seul placeholder était masqué à l'activation : les autres
restaient affichés par-dessus les contenus chargés. Défaut d'affichage, mais sur
la seule brique qu'un contrôle constate depuis l'extérieur.

**Consent Mode v2 incomplet (FAIBLE).** Seul `consent 'update'` était émis.
L'état `default` en `denied`, qui doit être posé **avant** le chargement de
gtag, n'était documenté nulle part. L'extrait est désormais fourni.

**Journal non limité (MOYEN).** Route publique écrivant en base sans plafond.
Rate limiting ajouté — sur l'IP **complète** et non sur le /24, pour ne pas
grouper tout un bureau ou tout un opérateur mobile : perdre la preuve du
consentement d'un visiteur légitime est un problème de conformité, pas un
détail technique.

**IP en clair dans la clé de limitation (MOYEN).** Le fichier promet qu'aucune
IP ne circule en clair ; la clé envoyée au magasin du limiteur en contenait
une. Hachée avec le même sel serveur.

### Minimisation du journal

Le journal reste volontairement minimal — il ne doit pas devenir lui-même un
traitement excessif : pas d'identité, pas d'IP en clair, pas d'empreinte de
navigateur. L'IP est **tronquée** (/24 en IPv4, /64 en IPv6) **puis hachée**
avec un sel serveur. La troncature empêche de remonter à un abonné ; le sel
empêche de tester les 2³² adresses. Sans sel configuré, rien n'est stocké.

### Risque résiduel

Le blocage ne couvre que ce qui est marqué `type="text/plain"`. Un tag injecté
par GTM, un plugin, un script ajouté plus tard passe à travers **sans bruit**.
Le contrôle manuel — navigation privée, onglet Application → Cookies, avant
tout clic — reste indispensable. C'est le test que fait la CNIL.

---

## Brique 2 — Rétention

### Corrigé

**La purge ne fonctionnait pas (CRITIQUE).** Deux défauts combinés :

- la valeur d'anonymisation de l'email était calculée une fois pour tout
  l'`UPDATE`, donc identique pour toutes les lignes : violation d'unicité dès le
  deuxième compte échu ;
- la règle ne reconnaissait pas les comptes déjà anonymisés, donc les
  retraitait à chaque exécution.

Conséquence RGPD : **les durées de conservation n'étaient pas appliquées**, et
le `journal_purge` — censé être la preuve qu'elles le sont — affichait des
chiffres faux. En contrôle, c'est la première chose qu'on montre.

**Correction** : valeurs de remplacement générées par PostgreSQL **pour chaque
ligne**, et marqueur de traitement obligatoire, vérifié avant toute écriture par
`validerPolitique()`. Le marqueur est posé dans le même `UPDATE` que
l'anonymisation : une interruption ne peut pas laisser de ligne traitée mais non
marquée.

**Vérifié** : deux exécutions successives, la seconde ne traite rien
(`tests/sql/02-test-purge.sql`, assertion 2.3).

### Anonymisation, pas pseudonymisation

Le point est documenté et respecté : `email_original_hash` conserve une
empreinte de l'adresse, ce qui permet de reconnaître une réinscription
frauduleuse. **[VÉRIFICATION JURIDIQUE NÉCESSAIRE]** — une empreinte d'email
reste, au sens strict, une donnée pseudonymisée : l'adresse est devinable par
force brute si l'attaquant dispose d'une liste. Le sel n'est pas utilisé ici,
contrairement au journal de consentement. À arbitrer selon la finalité
réellement poursuivie : si la détection de réinscription n'est pas nécessaire,
la colonne devrait disparaître.

### Durées

Les durées de `politique-retention.ts` sont inchangées : ce sont des repères
usuels (CNIL, code de commerce, LCEN), chacun assorti de son `fondement`.
**Aucune durée n'a été inventée ni modifiée.** Elles restent à confronter aux
finalités réelles de chaque client.

---

## Brique 3 — Effacement

### Corrigé

**La fenêtre de rétractation n'existait pas (ÉLEVÉ).** Le code annonçait à la
personne, par email, qu'elle disposait de 30 jours pour revenir sur sa demande,
tout en détruisant immédiatement ses adresses, favoris, paniers, notifications,
fichiers et mot de passe. Il n'y avait rien à rétracter, et aucune route pour le
faire. **Une information fausse donnée à la personne concernée, dans le cadre de
l'exercice d'un droit.**

**La suppression n'était pas atomique (CRITIQUE).** Un échec en cours de route
laissait la personne amputée de ses données sans que sa demande soit
enregistrée : ni effacement effectif, ni trace de la demande.

### Le modèle retenu

Cinq états désormais distincts, comme l'exigeait la mission :

| État | Quand | Ce qui se passe | Réversible |
|---|---|---|---|
| **Désactivation** | immédiat, phase 1 | sessions révoquées, jetons détruits, compte inactif, désinscription des envois | oui |
| **Suppression différée** | pendant la fenêtre | rien n'est détruit, rien n'est traité | oui |
| **Anonymisation** | phase 2 | commentaires, commandes, factures détachés de l'identité | non |
| **Suppression définitive** | phase 2 | adresses, favoris, paniers, notifications, fichiers | non |
| **Conservation légale** | après phase 2 | factures, 10 ans, sans identité vivante | — |

Le traitement **cesse dès la phase 1** : c'est ce qui rend le délai de grâce
défendable. Ce n'est pas une période pendant laquelle les données continuent à
être utilisées, c'est une période pendant laquelle elles ne sont plus utilisées
mais pas encore détruites.

La rétractation est réelle : `route-annulation.ts`, jeton de 32 octets issu d'un
CSPRNG, stocké haché, à usage unique, expirant avec la fenêtre, transaction avec
verrou, message identique dans tous les cas d'échec pour ne pas révéler
l'existence d'un compte.

**[VÉRIFICATION JURIDIQUE NÉCESSAIRE]** La durée de la fenêtre. Le RGPD impose
un effacement « dans les meilleurs délais » sans fixer de chiffre. 30 jours est
un **choix métier** par défaut, pas une durée légale : plus la fenêtre est
longue, plus il faut pouvoir démontrer que le traitement a cessé pendant
celle-ci.

### Droit d'accès et portabilité

**Corrigé (MOYEN) :** l'export renvoyait silencieusement un historique de
consentements vide pour tout le monde — `where visiteur_id = null` n'est jamais
vrai en SQL. Un export d'accès qui affiche « aucun consentement » à tort est une
réponse fausse à une demande fondée sur l'article 15. La requête n'est plus
lancée à vide, et un champ `_non_inclus` **dit** pourquoi l'historique est
absent quand il l'est.

**Corrigé (MOYEN) :** les neuf lectures se faisaient hors transaction. Un export
est un livrable daté : il doit refléter un état qui a réellement existé.
Désormais en `repeatable read`, journalisation de la demande comprise.

**Vérifié, inchangé :** aucun identifiant n'est accepté depuis l'URL ou le
corps ; la session seule fait foi. C'est le point où une IDOR exposerait un
dossier complet.

### Sous-traitants

Le code distingue désormais ce qui est transactionnel de ce qui ne l'est pas, et
ne prétend plus le contraire :

- désinscription des envois en phase 1 — le traitement doit cesser tout de
  suite, et l'opération est sans risque pour la rétractation ;
- traitements **destructifs** chez les sous-traitants reportés en phase 2 : la
  fenêtre de rétractation vaut aussi chez eux ;
- fichiers du stockage objet supprimés **après** validation de la transaction,
  jamais avant ;
- chaque échec est journalisé dans la demande, et n'annule pas la suppression.

**[INFORMATION À FOURNIR PAR LE CLIENT]** La liste réelle des sous-traitants
reste à compléter projet par projet.

---

## Brique 4 — Preuve

| Élément | État |
|---|---|
| Journal des consentements | **Fiable.** Empreinte d'IP salée, borné, limité en débit |
| Journal des purges | **Fiable depuis la correction.** Les compteurs reflètent les lignes réellement affectées, et non un pré-comptage qui pouvait dériver |
| Registre des demandes | **Fiable.** Échéance légale calculée par déclencheur, prolongation à 3 mois désormais possible (elle était interdite par la colonne générée) |
| Vue de supervision | **Présente.** `demandes_rgpd_a_traiter` signale retards et urgences ; `comptes_a_purger` montre les purges en attente |

Le dépassement du délai d'un mois est un manquement en soi : la vue existe pour
qu'il soit visible avant de survenir.

---

## Ce qui n'a pas pu être vérifié

| Point | Raison |
|---|---|
| Comportement réel des sous-traitants | Services externes, non testables ici |
| Blocage effectif des tags injectés par GTM | Nécessite un navigateur réel et un conteneur GTM |
| Suppression effective dans le stockage objet | `TEST NON EXÉCUTÉ — ENVIRONNEMENT MANQUANT` : le point d'accroche existe, l'implémentation dépend du projet |
| Conformité juridique au sens strict | Hors du champ de ce rapport, par construction |

---

## Conclusion

Les quatre briques annoncent désormais ce qu'elles font, et font ce qu'elles
annoncent — c'est le seul progrès qui compte ici. Deux d'entre elles ne le
faisaient pas, et échouaient **silencieusement** : une purge en erreur et une
fenêtre de rétractation fictive ne déclenchent aucune alerte, et personne ne va
voir.

**Ce rapport n'affirme pas que les projets qui utiliseront ce code seront
conformes.** La conformité dépend des finalités réelles, des durées retenues,
des sous-traitants effectifs et de la documentation du responsable de
traitement — aucun de ces éléments n'est dans le code. Le module fournit des
briques techniques correctes et testées ; il ne remplace ni le registre, ni les
DPA, ni la politique de confidentialité, ni l'avis d'un juriste.
