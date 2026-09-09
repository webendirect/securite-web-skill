# Passe 0 — Budget de friction

À faire **avant** tout le reste, et à ne jamais sauter.

Toutes les autres passes ajoutent des protections. Celle-ci décide lesquelles valent leur prix. Sans elle, l'audit produit un site plus sûr et moins utilisé — et un site que les visiteurs quittent a un problème plus certain qu'un site vulnérable.

---

## Le principe

**La sécurité se calibre sur ce qu'on protège.** Un compte bancaire mérite une double authentification ; un formulaire de rappel n'en mérite aucune.

La faille est un risque : elle peut être exploitée. La friction est une certitude : elle est subie par chaque visiteur, à chaque passage. Empiler les protections « au cas où » revient à payer comptant pour éviter un risque hypothétique.

Ce qui suit est défendable isolément et pénible cumulé :

- un bandeau cookies qui bloque la page dès l'arrivée, sur une vitrine qui n'a aucun traceur à faire accepter ;
- une double authentification obligatoire pour consulter un historique de commandes ;
- un blocage après trois erreurs de mot de passe, sur un client qui revient une fois par trimestre ;
- un captcha sur un formulaire de contact qui reçoit trois messages par mois ;
- une session de deux heures qui déconnecte pendant qu'on remplit une demande de devis ;
- une règle de douze caractères annoncée **après** validation du formulaire, au lieu d'être affichée avant.

Aucun de ces points n'est une erreur de sécurité. Ensemble, ils font un site que les gens abandonnent.

---

## Établir le niveau, avant de commencer

Trois questions au client, ou à soi-même, dont dépend tout le reste de l'audit :

1. **Qu'est-ce qui est stocké ?** Rien, des coordonnées, des commandes, de l'argent, des données sensibles ?
2. **Que se passe-t-il si un compte est pris ?** Rien de grave, une usurpation gênante, une perte financière, un préjudice pour un tiers ?
3. **Qui sont les visiteurs ?** Grand public pressé, clients professionnels réguliers, équipe interne ?

| Niveau | Type de site | Ce qui est justifié | Ce qui est excessif |
|---|---|---|---|
| **1 — Vitrine** | site de présentation, aucun compte | HTTPS, en-têtes, honeypot et limitation sur le formulaire, RGPD | bandeau cookies s'il n'y a aucun traceur, captcha visible, création de compte |
| **2 — Compte simple** | espace client, historique, favoris | tout le niveau 1 + mot de passe robuste, vérification d'email, limitation progressive, session longue | 2FA obligatoire, réauthentification fréquente, expiration courte |
| **3 — Transactionnel** | e-commerce, réservation, paiement | tout le niveau 2 + 2FA proposée, réauthentification aux actions sensibles, vérification renforcée du paiement | 2FA obligatoire pour tous, captcha à chaque commande |
| **4 — Sensible** | santé, RH, finance, données de tiers | tout le niveau 3 + 2FA obligatoire, sessions courtes, journalisation des accès, chiffrement applicatif | rien n'est excessif ici — c'est le seul niveau où la friction est justifiée par défaut |

**La 2FA obligatoire pour les comptes administrateurs vaut à tous les niveaux.** Ils sont peu nombreux, ils font ça une fois, et c'est la porte qui coûte le plus cher.

---

## Où placer la friction

**À l'action sensible, pas à l'entrée.** Laisser entrer, naviguer et regarder librement ; demander l'effort au moment qui compte — payer, changer une adresse email, supprimer un compte, accéder à l'administration. C'est aussi ce que l'utilisateur comprend intuitivement : on accepte de justifier son identité pour un virement, pas pour lire une page.

**Invisible d'abord, visible en dernier.** Dans cet ordre, on n'ajoute l'échelon suivant que si le précédent ne suffit pas :

1. champ honeypot — coût nul pour l'humain ;
2. contrôle du délai de soumission — un formulaire rempli en moins de deux secondes est automatisé ;
3. limitation de débit ;
4. Turnstile en mode invisible ;
5. captcha visible — dernier recours, jamais le premier réflexe.

**Progressif, pas binaire.** Un verrouillage définitif du compte est à la fois pénible pour le légitime et exploitable : il suffit d'échouer volontairement pour bloquer le compte d'un concurrent. Un délai qui croît — 1 s, 2 s, 5 s, 30 s — arrête un robot sans jamais enfermer personne.

**Expliquer plutôt que refuser.** « Trop de tentatives » n'aide personne. « Trop de tentatives, réessayez dans 2 minutes — ou réinitialisez votre mot de passe » transforme un mur en chemin. Idem pour un mot de passe refusé : dire la règle **avant** la saisie, et dire ce qui manque plutôt que « mot de passe invalide ».

**Ne pas punir la mémoire.** Session longue par défaut sur un site grand public, « rester connecté » proposé, et réauthentification uniquement pour les actions sensibles. Rien ne pousse plus sûrement un utilisateur à choisir un mot de passe faible que d'être déconnecté sans arrêt.

---

## Les cas où la sécurité améliore l'expérience

Ce ne sont pas des ennemis par nature :

- **Le bandeau cookies disparaît** si le site n'a pas de traceur à faire accepter. Retirer Google Analytics au profit d'une mesure exempée supprime le bandeau, accélère la page et règle le RGPD d'un coup.
- **Les polices servies en local** sont plus rapides que celles chargées chez Google, et conformes.
- **Un mot de passe long sans règle de complexité** est plus simple à créer qu'un mot de passe court à trois contraintes.
- **Le gestionnaire de mots de passe fonctionne** si l'on ne bloque pas le collage et si les champs sont correctement nommés (`autocomplete="current-password"`). Bloquer le collage, réflexe fréquent, dégrade la sécurité et l'expérience en même temps.
- **Une limitation de débit propre** protège aussi le site des pics et des factures d'API.

---

## À produire à la fin de cette passe

Une ligne, avant d'ouvrir la passe suivante :

```
Niveau retenu : <1 à 4>
Ce qu'on protège : <en une phrase>
Protections retenues : <liste>
Protections écartées volontairement : <liste, avec la raison>
```

La seconde liste est aussi importante que la première. Elle prouve que le choix est réfléchi, et évite qu'un audit ultérieur — ou un autre prestataire — rajoute mécaniquement ce qui avait été écarté à raison.

---

## Prompt à coller

> Avant tout durcissement, aide-moi à fixer le niveau de sécurité de ce projet. Analyse ce que le site stocke réellement, ce qu'un attaquant gagnerait à prendre un compte, et qui sont les utilisateurs. Propose-moi un niveau de 1 à 4, puis la liste des protections justifiées à ce niveau et celles qui seraient excessives. Pour chaque protection retenue, dis-moi son coût en expérience utilisateur et où la placer dans le parcours. Ne propose aucune protection qui ajoute de la friction sans expliquer ce qu'elle protège concrètement.
