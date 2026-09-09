# Brique 2 — Durées de conservation et purge

Le RGPD n'interdit pas de garder des données. Il interdit de les garder **sans durée définie**. Une base qui accumule depuis quatre ans sans qu'on sache pourquoi est un manquement — et, le jour d'une fuite, elle multiplie le nombre de personnes touchées.

---

## La règle

Chaque donnée personnelle a une **durée de conservation déterminée**, liée à la finalité pour laquelle elle a été collectée. Passé ce délai : suppression ou anonymisation.

Trois régimes coexistent, et la confusion entre eux est fréquente :

- **Base active** — la donnée sert au quotidien.
- **Archivage intermédiaire** — la donnée ne sert plus mais doit être conservée pour une obligation légale ou un contentieux possible. Accès restreint à quelques personnes, jamais dans l'application courante.
- **Suppression ou anonymisation définitive.**

Une facture n'est pas conservée « parce que c'est utile » : elle l'est parce que le code de commerce l'impose dix ans. Ce n'est pas la même chose qu'un prospect qu'on garde « au cas où ».

## Durées de référence

| Donnée | Durée | Fondement |
|---|---|---|
| Prospect sans relation commerciale | 3 ans après le dernier contact | recommandation CNIL |
| Client — base active | durée de la relation + 3 ans | prospection commerciale |
| Facture, pièce comptable | 10 ans | code de commerce |
| Contrat conclu par voie électronique (> 120 €) | 10 ans | code de la consommation |
| Journal de connexion | 6 mois à 1 an | sécurité, LCEN |
| Cookie de mesure d'audience | 13 mois maximum | ePrivacy |
| Données issues des cookies | 25 mois maximum | recommandation CNIL |
| Preuve de consentement | consentement + 3 ans | charge de la preuve |
| Candidature spontanée, CV | 2 ans après le dernier contact | recommandation CNIL |
| Compte utilisateur inactif | 2 à 3 ans après la dernière connexion | à justifier selon le service |
| Formulaire de contact | 1 an si sans suite | proportionnalité |
| Vidéosurveillance | 1 mois | recommandation CNIL |

Ces durées sont des repères usuels, à ajuster selon le service — et à **écrire** dans la politique de confidentialité, où elles doivent apparaître par catégorie de donnée, pas en bloc.

## Supprimer ou anonymiser

Trois issues possibles au terme du délai, et le choix change tout :

**Supprimer** — la ligne disparaît. À faire quand la donnée n'a aucune valeur résiduelle : brouillon, panier abandonné, session expirée, formulaire de contact sans suite.

**Anonymiser** — la ligne reste, l'identification disparaît **irréversiblement**. C'est le bon choix quand on veut garder la statistique sans la personne : un chiffre d'affaires mensuel, un nombre de commandes, une conversion. Une donnée réellement anonyme sort du champ du RGPD ; elle peut donc être conservée sans limite.

Attention : remplacer un nom par `utilisateur_4812` n'est pas de l'anonymisation, c'est de la **pseudonymisation** — si une table de correspondance existe quelque part, la donnée reste personnelle et reste soumise au RGPD. L'anonymisation suppose qu'on ne puisse plus remonter à la personne, même en croisant.

**Archiver** — la donnée sort de la base active vers un stockage à accès restreint, pour la durée de l'obligation légale. C'est le cas des factures : on ne peut ni les supprimer sur demande, ni les laisser dans l'application courante.

## Le cas de la facture

Un utilisateur demande la suppression de son compte. Ses factures sont soumises à une conservation de dix ans.

La bonne résolution : **anonymiser le compte, conserver la facture**. On garde le document comptable (montant, date, numéro, ligne de TVA) et on coupe le lien avec l'identité vivante — le compte est supprimé, la facture devient rattachée à un identifiant archivé, hors application.

C'est le point qui bloque le plus souvent une implémentation de « supprimer mon compte ». Le traiter dès la conception évite de devoir tout reprendre.

## Comptes inactifs

Souvent oublié : un utilisateur qui ne s'est pas connecté depuis trois ans n'a plus de finalité active. Le laisser en base, avec son email et son historique, c'est de la conservation sans base légale.

Procédure attendue :

1. Email d'avertissement à 30 jours de l'échéance, avec un lien pour réactiver.
2. Second email à 7 jours.
3. Sans réaction : anonymisation ou suppression.

Cette relance est aussi un rappel commercial utile — l'obligation et l'intérêt vont ici dans le même sens.

## Automatiser

Une purge manuelle n'a jamais lieu. Ce qui tient :

- Une **politique déclarative** dans le code, à un seul endroit : `code/retention/politique-retention.ts`. Chaque table y déclare sa durée, son champ de référence, et l'action au terme.
- Un **script de purge** exécuté chaque nuit : `code/retention/purge.ts`. Mode simulation par défaut — il affiche ce qu'il supprimerait sans le faire.
- Un **journal des purges** : combien de lignes, sur quelle table, quand. C'est la preuve que la politique est appliquée, et la première chose à montrer en cas de contrôle.

Déclencheur, selon l'hébergement : `pg_cron` sur Postgres, une fonction planifiée Supabase, un cron Vercel, ou un `crontab` sur VPS.

**Toujours passer en mode simulation avant la première exécution réelle.** Une purge mal bornée efface la base de production, et c'est la sauvegarde qui devient la conformité.

## Les endroits qu'on oublie

La purge de la table principale ne suffit pas. Les mêmes données vivent souvent :

- dans l'outil d'emailing (Brevo, Mailchimp) — les contacts y restent indéfiniment par défaut
- dans le CRM
- dans les journaux applicatifs et les journaux d'accès du serveur
- dans le suivi d'erreurs (Sentry capture souvent des emails dans les contextes)
- dans les sauvegardes — elles conservent légitimement l'ancien état, mais leur **rotation** doit être bornée, sinon une sauvegarde de cinq ans annule toute la politique
- dans les exports CSV traînant sur le poste du client ou dans une boîte mail
- dans les fichiers téléversés (justificatifs, pièces jointes)

Une politique de rétention qui ne couvre que la base de données est une demi-politique.

---

## Prompt à coller

> Établis la politique de conservation de ce projet : pour chaque table contenant des données personnelles, propose une durée, le champ de date qui sert de référence, et l'action au terme (suppression, anonymisation ou archivage). Traite spécifiquement le cas des factures, qui doivent être conservées 10 ans même après suppression du compte. Écris ensuite le script de purge en mode simulation, avec un journal des exécutions, et dis-moi comment le planifier sur mon hébergement. Liste enfin les endroits hors base où les mêmes données subsistent.
