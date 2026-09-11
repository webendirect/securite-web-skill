# Brique 3 — Droit à l'effacement et portabilité

Une personne doit pouvoir récupérer ses données et les faire disparaître. Le délai est d'**un mois** à compter de la demande, prolongeable à trois mois pour une demande complexe, à condition de le notifier dans le premier mois.

L'absence de réponse est, à elle seule, un manquement — indépendamment du reste.

---

## Les droits à outiller

| Droit | Article | Ce qu'il faut pouvoir faire |
|---|---|---|
| Accès | 15 | dire quelles données sont détenues et pourquoi |
| Rectification | 16 | corriger une donnée inexacte |
| Effacement | 17 | supprimer, sauf obligation de conservation |
| Portabilité | 20 | fournir un fichier structuré et réutilisable |
| Opposition | 21 | arrêter la prospection, sans condition |
| Limitation | 18 | geler un traitement contesté le temps de vérifier |

Trois se traitent en code : accès, effacement, portabilité. Les autres relèvent d'une procédure — mais elles doivent exister sur le papier.

## L'effacement n'est pas absolu

Erreur fréquente dans les implémentations générées : un bouton qui supprime tout, sans distinction. C'est une non-conformité dans l'autre sens.

Le droit à l'effacement **cède** devant :

- une **obligation légale de conservation** — factures et pièces comptables, dix ans
- la **constatation ou la défense d'un droit en justice** — un litige en cours
- l'**intérêt public**, l'archivage, la recherche
- la **liberté d'expression et d'information**

Ce qu'on fait alors : on supprime tout ce qui peut l'être, on **anonymise** le reste, et on **explique** à la personne ce qui est conservé, pourquoi, et pour combien de temps. Une réponse motivée est conforme ; un refus silencieux ne l'est pas.

## Ce que doit contenir un export

L'export au titre de la portabilité couvre les données **fournies par la personne** — celles qu'elle a saisies et celles générées par son activité. Pas les données inférées ou les analyses internes.

Format : structuré, couramment utilisé, lisible par machine. Le JSON convient ; le CSV aussi. Un PDF ne convient pas — il n'est pas réutilisable.

À inclure :

- profil et paramètres de compte
- contenus créés
- historique des commandes, réservations, messages
- consentements donnés et leur historique
- préférences de communication

À exclure : mots de passe (même hachés), tokens, notes internes, données concernant d'autres personnes — un message reçu contient les données de l'expéditeur, on ne les livre pas.

**Authentifier fortement la demande.** Une route d'export mal protégée est une fuite de données à elle seule : c'est le pire endroit du site pour une IDOR. Exiger une session valide, et redemander le mot de passe avant de générer l'export.

## La cascade

Supprimer la ligne en base ne suffit pas. Les mêmes données vivent ailleurs, et chaque endroit doit être traité :

| Endroit | Action | Automatisable |
|---|---|---|
| Base de données principale | supprimer ou anonymiser | oui |
| Fichiers téléversés (avatar, justificatifs) | supprimer du stockage objet | oui |
| Outil d'emailing (Brevo, Mailchimp) | supprimer le contact via l'API | oui |
| CRM | supprimer ou anonymiser | souvent |
| Stripe et prestataire de paiement | anonymiser le client, garder les transactions | partiellement |
| Suivi d'erreurs (Sentry) | demande de suppression par utilisateur | oui |
| Journaux applicatifs | expiration par rotation | par la rétention |
| Sauvegardes | pas de suppression ciblée — attendre la rotation | non |
| Exports CSV chez le client | prévenir le client | non |

Sur les **sauvegardes** : il n'est ni exigé ni raisonnable d'aller supprimer une ligne dans chaque archive. La position admise est de documenter que les sauvegardes ont une rotation bornée (30 jours par exemple) et que la donnée disparaîtra à ce terme — et de ne jamais restaurer une sauvegarde sans rejouer les suppressions intervenues depuis.

Écrire cette phrase dans la réponse à la personne : c'est ce qui transforme une limite technique en réponse conforme.

## Registre des demandes

Chaque demande reçue est journalisée : date de réception, nature, identité (vérifiée comment), date de réponse, décision, données concernées.

Deux raisons : le délai d'un mois se prouve, et le refus partiel doit être motivé et retrouvable. `code/effacement/migration-demandes.sql` fournit la table.

## Où placer le point d'entrée

- Un lien **« Mes données »** dans les paramètres du compte, avec export et suppression.
- Une **adresse email dédiée** (`privacy@` ou `rgpd@`) dans la politique de confidentialité, **relevée réellement** — une adresse qui rebondit est un manquement.
- Pour un site vitrine sans compte : un formulaire de demande suffit, mais quelqu'un doit le traiter.

Une suppression de compte demande **confirmation explicite** (retaper son email ou le mot de passe), affiche ce qui sera supprimé et ce qui sera conservé, et envoie un email de confirmation. Un délai de grâce de 30 jours avant suppression définitive est une bonne pratique — il protège des suppressions impulsives ou malveillantes, à condition que le compte soit immédiatement désactivé.

## Le délai de grâce, concrètement

C'est le point où les implémentations se trompent le plus souvent : elles
**annoncent** un délai de rétractation tout en détruisant les données dès la
demande. Il n'y a alors rien à rétracter, et la promesse faite à la personne
est fausse.

Le modèle implémenté dans `code/effacement/` sépare donc deux phases :

| | Phase 1 — immédiate | Phase 2 — à l'échéance |
|---|---|---|
| Où | `route-suppression.ts` | `purger_comptes_supprimes()`, dans `migration-demandes.sql` |
| Ce qui se passe | sessions révoquées, jetons détruits, compte désactivé, désinscription des envois | destruction et anonymisation réelles |
| Données personnelles | **intactes** | détruites ou anonymisées |
| Effet pour la personne | plus aucun accès, plus aucun traitement | irréversible |
| Rétractation | possible, via `route-annulation.ts` | impossible |

Deux exigences techniques qui ne se négocient pas :

- **La phase 1 est une seule transaction.** Une suppression à moitié faite est
  pire qu'une suppression refusée : la personne a perdu des données sans que sa
  demande soit enregistrée.
- **La phase 2 est atomique aussi**, et écrite en PL/pgSQL pour cette raison.
  Elle remonte à l'appelant les chemins des fichiers du stockage objet, qui
  n'est pas transactionnel : on les supprime **après** validation, jamais avant.

Le compte étant désactivé, la personne ne peut plus se connecter : le lien reçu
par email est son seul chemin de retour. Il porte un jeton de 32 octets issu
d'un CSPRNG, stocké haché, à usage unique, expirant avec la fenêtre.

**La durée de la fenêtre est un choix métier, pas une durée légale.** Le RGPD
impose un effacement « dans les meilleurs délais » sans fixer de chiffre. Plus
la fenêtre est longue, plus il faut pouvoir démontrer que le traitement a bien
cessé pendant celle-ci. [VÉRIFICATION JURIDIQUE NÉCESSAIRE] avant de retenir
une valeur nettement supérieure à 30 jours.

## Vérification

- Demander l'export sur un compte de test : le fichier contient bien tout, et rien qui appartienne à autrui.
- Tenter l'export d'un autre compte en modifiant l'identifiant dans l'URL → 404 attendu.
- Supprimer un compte de test, puis vérifier : ligne partie, fichiers partis, contact retiré de l'outil d'emailing, facture conservée mais anonymisée, connexion impossible.
- Vérifier que l'email de la personne supprimée peut à nouveau servir à créer un compte (sinon il reste stocké quelque part).
- Vérifier que la demande figure dans le registre.

---

## Prompt à coller

> Implémente les droits d'accès, de portabilité et d'effacement. Crée une route d'export qui renvoie en JSON toutes les données de l'utilisateur connecté — sans mot de passe, sans token, sans données appartenant à d'autres personnes — et une route de suppression de compte. La suppression doit traiter la cascade : base, fichiers téléversés, outil d'emailing, suivi d'erreurs, et anonymiser plutôt que supprimer ce qui est soumis à conservation légale, les factures notamment. Ajoute une confirmation explicite, un email de confirmation, et le journal des demandes. Vérifie qu'un utilisateur ne peut pas exporter les données d'un autre.
