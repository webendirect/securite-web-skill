# Passe 10 — Méthode de correction : corriger, tester, vérifier, livrer

Cette passe ne cherche pas de faille. Elle décrit **comment on corrige**, une
fois les failles trouvées, sans casser le site d'un client et sans annoncer un
résultat qu'on n'a pas vérifié.

Elle se lit avant la première correction, et elle s'applique à toute
modification du code — celles de cet audit comme celles qui suivront.

**La règle qui commande toutes les autres :**

```
CORRIGER → TESTER → VÉRIFIER → AUDITER → COMMITTER → POUSSER
```

Jamais **modifier → pousser**. Un correctif de sécurité non testé est un
changement de comportement non testé sur du code de production : c'est
exactement ce qu'on reproche au code qu'on est en train d'auditer.

---

## Étape 0 — Inventaire avant de toucher quoi que ce soit

Parcourir l'intégralité du dépôt et relever :

| Quoi | Pourquoi |
|---|---|
| Fichiers de code | le périmètre réel, pas le périmètre supposé |
| Migrations SQL | elles ont pu être déjà exécutées en production |
| Scripts shell | souvent hors des tests, donc jamais vérifiés |
| Tests existants | savoir ce qui protège déjà, et ce qui ne protège rien |
| Fichiers de configuration | un correctif peut dépendre d'une variable absente |
| Dépendances | et leurs versions réelles, pas celles du `package.json` |
| Commandes et scripts de la compétence | ils font partie du livrable |
| Documentation et références | une doc qui ment est un défaut, pas un détail |
| **Pièces jointes et éléments ajoutés après coup** | voir ci-dessous |

**Les éléments ajoutés après l'inventaire initial entrent dans le périmètre.**
Un fichier, une pièce jointe, une consigne ou une règle fournie en cours de
route se reprend à l'étape 9 — il n'y a pas de « trop tard » pour un élément
du livrable.

Construire la **carte des dépendances** avant de modifier : quel fichier lit
quelle colonne, quelle migration crée quoi, quel script appelle quelle
fonction. Corriger sans cette carte, c'est réparer une pièce en cassant celle
d'à côté.

---

## Étape 1 — Ordonner les corrections par dégât potentiel

On ne corrige pas dans l'ordre où l'on trouve. On corrige dans l'ordre de ce
qui fait le plus de dégâts :

1. ce qui **provoque une panne** en production ;
2. ce qui **empêche une fonctionnalité RGPD de fonctionner** ;
3. ce qui **supprime des données de travers** ;
4. ce qui **crée une faille** ;
5. ce qui **produit un faux rapport envoyé au client** ;
6. ce qui rend les audits **non reproductibles**.

Une migration qui ne passe pas bloque tout le reste : elle est toujours
première. Un faux positif dans un rapport client vient avant un durcissement
marginal, parce qu'il coûte la confiance.

---

## Étape 2 — Une correction à la fois, et prouvée

Pour chaque défaut, dans cet ordre :

1. **Reproduire.** Écrire le cas qui échoue, et le voir échouer. Un défaut
   qu'on n'a pas reproduit est une hypothèse.
2. **Comprendre la cause.** Pas le symptôme : la cause. Faire disparaître un
   message d'erreur n'est pas corriger.
3. **Corriger au bon endroit**, au plus près de la cause, sans élargir.
4. **Revoir le comportement métier.** Le correctif doit conserver ce que le
   code était censé faire — pas seulement cesser d'échouer.
5. **Tester**, et voir le cas passer.
6. **Vérifier que le test attrape la régression** : remettre l'ancien code, le
   test doit échouer. Un test qui passe dans les deux cas ne teste rien.

### Ce qu'on ne fait jamais

- **Supprimer une fonctionnalité** parce qu'elle est difficile à corriger.
- **Contourner une erreur** au lieu de la corriger.
- **Réduire une protection** pour faire passer un test.
- **Neutraliser un test** qui gêne.
- **Inventer un résultat de test.**
- **Déclarer une correction réussie** sans l'avoir vérifiée.

---

## Étape 3 — Migrations déjà en production

Une migration qui a pu tourner chez un client ne se réécrit pas à l'aveugle :
les bases déjà migrées ne repasseront pas dessus, et celles à venir suivraient
un chemin différent.

Trancher explicitement, et **écrire le choix dans le rapport** :

| Situation | Décision |
|---|---|
| La migration n'a jamais pu s'exécuter (elle échoue) | la corriger sur place : aucune base ne la porte |
| Elle a tourné quelque part | écrire une **migration corrective** ultérieure |
| Doute | migration corrective — c'est le choix qui ne casse rien |

Dans tous les cas, l'état final du schéma doit être le même, quel que soit le
chemin emprunté pour y arriver.

---

## Étape 4 — Transactions et ressources non transactionnelles

Toute suite d'écritures qui doit être « tout ou rien » est **une** transaction.
Une suppression de compte à moitié faite est pire qu'une suppression refusée :
la personne a perdu ses données sans que sa demande soit enregistrée.

```
BEGIN → les écritures → COMMIT
      → en cas d'erreur : ROLLBACK
```

**Ne jamais prétendre qu'un stockage externe est transactionnel.** Le stockage
objet, une API de sous-traitant, un envoi d'email ne se rejouent pas en
arrière. Pour eux :

1. déterminer ce qui doit être supprimé **avant** de détruire les lignes qui le
   référencent ;
2. n'agir **qu'après** la validation de la transaction — l'inverse laisse un
   compte amputé de ses fichiers si la base annule ;
3. prévoir une reprise : un échec se journalise et se rejoue, il ne se perd pas ;
4. ne jamais laisser volontairement un état incohérent.

Scénarios à tester, pas seulement le cas nominal : **succès complet, erreur au
début, erreur au milieu, erreur à la fin, reprise après échec.**

---

## Étape 5 — Idempotence

Tout ce qui tourne en boucle — purge nocturne, tâche planifiée, reprise sur
erreur — doit pouvoir s'exécuter deux fois sans dommage.

Le test est simple : **lancer deux fois, la seconde ne doit rien traiter.**

En pratique, cela suppose un **marqueur de traitement** (`anonymise_le`,
`purge_effectuee_le`, `traite_le`) posé **dans la même écriture** que le
traitement, et repris dans la clause de sélection. Sans lui :

- les mêmes lignes sont retraitées indéfiniment ;
- les compteurs des rapports sont faux ;
- les valeurs de remplacement entrent en collision sur les index uniques.

---

## Étape 6 — Valeurs générées : une par ligne

Piège classique, et silencieux jusqu'à la deuxième ligne : une valeur calculée
côté application est **figée dans la requête**, donc identique pour toutes les
lignes d'un même `UPDATE`.

```
-- Faux : la même adresse pour tous les comptes anonymisés
update utilisateurs set email = 'supprime+<uuid-calculé-en-JS>@invalide.local'
 where ...

-- Juste : PostgreSQL réévalue l'expression pour chaque ligne
update utilisateurs set email = 'supprime+' || gen_random_uuid() || '@invalide.local'
 where ...
```

Dès qu'une colonne porte un index unique, la première forme échoue au deuxième
enregistrement. Vérifier ce point partout où une valeur « aléatoire » ou
« horodatée » est écrite en masse.

---

## Étape 7 — Ne pas fabriquer de faux positifs

Un rapport gonflé fait perdre confiance dans les vrais constats. Avant de
signaler une absence, vérifier **qu'on a regardé au bon endroit**.

L'exemple type : SPF et DMARC se publient sur le domaine racine. Les chercher
sur `www.exemple.fr` et conclure « SPF manquant » est un faux positif garanti
sur un domaine correctement configuré.

Règles :

- normaliser avant d'interroger (schéma, `www`, port, chemin, casse, point final) ;
- interroger le niveau pertinent, et le niveau parent avant de conclure ;
- dire **quel** domaine porte l'enregistrement trouvé ;
- si le contrôle n'a pas pu être fait, écrire **« NON EXÉCUTÉ »**, jamais
  « manquant ».

---

## Étape 8 — Tests : ce qui est vérifié, et ce qui ne l'est pas

Après les corrections, lancer :

1. les tests existants ;
2. les tests des corrections ;
3. les migrations sur une base **vierge**, puis en **rejeu** ;
4. le build ;
5. les scripts shell (au minimum `bash -n`, mieux : leurs cas limites) ;
6. les commandes de la compétence ;
7. les scénarios d'erreur ;
8. les scénarios de reprise ;
9. la non-régression des fonctionnalités existantes.

**Si un test échoue** : trouver la cause et corriger. Ne pas masquer.

**Si un test ne peut pas être exécuté** faute d'environnement, l'écrire tel
quel :

```
TEST NON EXÉCUTÉ — ENVIRONNEMENT MANQUANT
```

Ne jamais le compter comme réussi. Un décompte honnête vaut mieux qu'un
décompte flatteur : c'est le seul qui permette de décider s'il faut livrer.

---

## Étape 9 — Second passage

Après les corrections prioritaires, **ne pas s'arrêter**. Reprendre le dépôt
entier, y compris les fichiers ajoutés pendant le travail, et :

- chercher les **erreurs de la même famille** ailleurs — le défaut qu'on vient
  de corriger a presque toujours un jumeau ;
- vérifier chaque anomalie relevée : est-elle réelle ?
- classer : `CRITIQUE`, `ÉLEVÉ`, `MOYEN`, `FAIBLE`, `INFORMATIONNEL` ;
- corriger ce qui peut l'être de façon fiable, et tester ;
- laisser le reste dans les risques restants, avec sa raison.

Un correctif prioritaire ne dispense jamais du reste du dépôt.

---

## Étape 10 — Contrôle de régression avant le commit

Vérifier explicitement que les corrections n'ont pas cassé :

les migrations · la purge · l'anonymisation · la suppression de compte · la
rétention · le consentement · les contenus intégrés · les contrôles SPF et
DMARC · les rapports · les commandes existantes · le reste de la compétence.

Puis le parcours de non-régression de la passe 9, avec deux comptes — un neuf
et un antérieur aux modifications.

---

## Étape 11 — Rapport

Produire ou mettre à jour `SECURITY-REPORT.md`, et `RGPD-REPORT.md` si le volet
conformité a bougé. Structure minimale :

```
## CORRECTIONS CRITIQUES
   problème · fichier · ligne · cause · correction · test effectué · résultat
## CORRECTIONS IMPORTANTES
## AUTRES CORRECTIONS
## TESTS
   réussis · échoués · non exécutés
## RISQUES RESTANTS
## ACTIONS MANUELLES
## INFORMATIONS À FOURNIR PAR LE CLIENT
## VÉRIFICATION JURIDIQUE NÉCESSAIRE
```

Chaque correction porte **le test qui la prouve** et **son résultat**. Une
ligne sans preuve est une intention, pas une correction.

---

## Étape 12 — Git : les dix vérifications avant de pousser

**Ne pas pousser immédiatement.** Avant tout push :

1. `git status` — rien d'inattendu ;
2. la liste des fichiers modifiés correspond à la mission ;
3. relire le **diff** en entier ;
4. aucun secret ajouté ;
5. aucun fichier parasite (dépendances, artefacts de build, fichiers temporaires) ;
6. les tests sont passés ;
7. le build passe ;
8. les migrations s'appliquent sur base vierge **et** en rejeu ;
9. les rapports sont à jour ;
10. les corrections correspondent réellement à ce qui était demandé.

Puis un message de commit qui dit ce qui change et pourquoi, avec les effets de
bord annoncés. Plusieurs commits s'il y a plusieurs groupes.

Pousser seulement ensuite, **sans `--force`** sauf instruction explicite, puis
vérifier que le commit est bien présent sur le dépôt distant.

---

## Étape 13 — Le résultat final, en clair

Terminer par un état des lieux vérifiable :

```
CORRECTIONS   critiques · élevées · moyennes · faibles
TESTS         passés · échoués · non exécutés
MIGRATIONS VÉRIFIÉES     oui / non
BUILD VÉRIFIÉ            oui / non
REVUE SÉCURITÉ           satisfaisante / insuffisante
REVUE RGPD               satisfaisante / insuffisante / revue humaine nécessaire
COMMIT                   <hash>
PUSH                     réussi / échoué
RISQUES RESTANTS
ACTIONS MANUELLES REQUISES
```

**Ne jamais écrire « 100 % sécurisé » ni « pleinement conforme ».** Le résultat
ne vaut que par les vérifications réellement effectuées — et la liste de
celles qui ne l'ont pas été.
