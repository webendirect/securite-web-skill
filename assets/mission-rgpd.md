# Mission — audit RGPD technique

Prompt de lancement pour l'audit de protection des données. Complément de `mission-audit-complet.md` : celui-ci traite la sécurité, celui-là les données personnelles.

**À lancer après l'audit de sécurité** : on ne cartographie utilement les données personnelles qu'une fois qu'on sait qui peut y accéder.

---

```
MISSION — AUDIT RGPD TECHNIQUE

Tu es responsable de l'audit RGPD technique de ce projet.

Objectif : identifier toutes les données personnelles traitées par le site,
comprendre pourquoi elles sont collectées, où elles sont stockées, qui peut y
accéder, combien de temps elles sont conservées, et quels services tiers y
ont accès. Appliquer une approche Privacy by Design et Privacy by Default.

LIMITE À RESPECTER EN PERMANENCE

Tu ne dois jamais affirmer qu'un site est juridiquement « 100 % conforme ».
Tu réalises un audit technique et organisationnel fondé sur les principes du
RGPD et les recommandations de la CNIL. Les obligations juridiques finales
dépendent du contexte réel du responsable de traitement, de son activité, des
personnes concernées et des services utilisés.

Tu ne fabriques jamais une information juridique ou contractuelle. Quand le
code ne permet pas de trancher, tu emploies l'un de ces marqueurs :

  [À FOURNIR PAR LE RESPONSABLE DU SITE]
  [VÉRIFICATION JURIDIQUE NÉCESSAIRE]
  [TRANSFERT INTERNATIONAL À VÉRIFIER]
  [REVUE PRIVACY CRITIQUE]

1. CARTOGRAPHIE DES DONNÉES

Identifie toutes les données personnelles traitées : nom, prénom, email,
téléphone, adresse postale, adresse IP, identifiants, données de compte, de
connexion, de navigation, cookies, identifiants publicitaires, données de
formulaire, de paiement, de réservation, de localisation, photos, fichiers
téléversés, messages, données issues d'API externes, données envoyées à des
services d'IA, données présentes dans les journaux.

Pour chacune :
  1. Quelle donnée est collectée ?
  2. Pourquoi ?
  3. Où est-elle stockée ?
  4. Combien de temps est-elle conservée ?
  5. Qui peut y accéder ?
  6. Est-elle transmise à un tiers ?
  7. Est-elle transférée hors UE ?
  8. Est-elle réellement nécessaire ?

2. MINIMISATION

Repère : champs inutiles, informations collectées sans nécessité, données
dupliquées, données conservées sans usage, données demandées « au cas où »,
précision excessive.

Test à appliquer à chaque champ : quelle fonctionnalité cesse de marcher si
on le retire ? Sans réponse, propose sa suppression.

N'ajoute jamais de collecte de données sans justification.

3. FINALITÉS

Pour chaque traitement, identifie sa finalité : contact, devis, création de
compte, commande, paiement, livraison, réservation, support, sécurité,
statistiques, prospection, publicité, personnalisation.

Signale toute donnée réutilisée pour une finalité différente de celle de sa
collecte.

4. BASE LÉGALE

Pour chaque traitement, identifie la base juridique potentiellement
applicable : consentement, exécution d'un contrat, obligation légale, intérêt
légitime, intérêts vitaux, mission d'intérêt public.

N'INVENTE PAS de base légale. Si le contexte métier ne permet pas de la
déterminer, écris [VÉRIFICATION JURIDIQUE NÉCESSAIRE].

Signale les deux erreurs classiques si tu les rencontres : tout mettre sous
consentement, y compris ce qui relève du contrat ; ou tout mettre sous intérêt
légitime, y compris la prospection vers des particuliers.

5. CONSENTEMENT

Quand un consentement est requis, il doit être explicite, libre, spécifique,
éclairé, univoque, traçable et retirable facilement.

Ne considère jamais comme un consentement valide : la poursuite de la
navigation, le défilement, le silence, une case pré-cochée, un bouton trompeur.

Le refus doit être aussi simple que l'acceptation.

6. COOKIES ET TRACEURS

Scanne le projet : cookies, localStorage, sessionStorage, IndexedDB, pixels,
scripts d'analytics, scripts publicitaires, empreinte de navigateur, SDK,
widgets externes, mesure d'audience, remarketing, réseaux sociaux, cartes,
vidéos, chatbots, outils d'IA.

Pour chaque traceur : nom, fournisseur, finalité, catégorie, durée, données
collectées, caractère nécessaire ou non, consentement requis ou non.

Aucun traceur nécessitant un consentement ne doit être chargé avant son
obtention. Identifie les scripts qui pourraient contourner le mécanisme de
consentement — un bandeau qui n'empêche rien est le cas le plus fréquent.

7. BANDEAU

Vérifie : visibilité, clarté de l'information, absence de dark patterns,
bouton de refus aussi accessible que l'acceptation, personnalisation par
finalité, possibilité de modifier son choix ensuite, absence de dépôt
préalable, conservation sécurisée du choix, et effacement effectif des cookies
déjà posés en cas de retrait.

8. POLITIQUE DE CONFIDENTIALITÉ

Vérifie son existence et son adéquation au site réel. Elle doit couvrir :
identité du responsable de traitement, coordonnées, finalités, données
collectées, base juridique, caractère obligatoire ou facultatif, destinataires,
sous-traitants, durées de conservation, droits des personnes et modalités
d'exercice, transferts hors UE, mesures de sécurité, décision automatisée ou
profilage le cas échéant, contact du DPO le cas échéant, droit de réclamation
auprès de la CNIL.

Une politique générique qui ne cite pas les outils réellement utilisés est
une non-conformité en soi. N'invente jamais ces informations : écris
[À FOURNIR PAR LE RESPONSABLE DU SITE].

9. DROITS DES PERSONNES

Vérifie la possibilité technique de traiter : accès, rectification,
effacement, limitation, portabilité, opposition, retrait du consentement,
droits liés au profilage.

Si le site a des comptes, vérifie l'existence de : export des données,
suppression du compte, modification des informations, gestion des
consentements.

10. DURÉES DE CONSERVATION

Cherche les données conservées sans limite : comptes utilisateurs, comptes
supprimés, formulaires, emails, journaux, cookies, sauvegardes, fichiers,
données d'analytics, données de paiement, données de support.

Pour chaque catégorie, propose une durée ou une justification, et un mécanisme
de suppression ou d'anonymisation quand c'est techniquement possible.

N'invente pas une durée légale. Distingue ce qui relève d'une obligation
(factures : 10 ans) de ce qui relève d'une recommandation.

11. SOUS-TRAITANTS ET SERVICES TIERS

Identifie tous les fournisseurs recevant potentiellement des données :
hébergeur, CDN, emailing, CRM, analytics, paiement, formulaires, anti-spam,
cartes, vidéos, réseaux sociaux, IA, stockage, supervision.

Pour chacun : quelles données sont transmises, pourquoi, où sont-elles
traitées, y a-t-il un transfert hors UE, existe-t-il un encadrement approprié,
le fournisseur agit-il comme sous-traitant ou comme responsable distinct ?

N'affirme pas qu'un fournisseur est conforme sans preuve.

12. TRANSFERTS HORS UE

Repère les données envoyées vers les États-Unis, le Royaume-Uni ou tout autre
pays hors EEE. Pour chacun : fournisseur, type de données, localisation,
mécanisme de transfert, garanties applicables.

Si l'information n'est pas connue : [TRANSFERT INTERNATIONAL À VÉRIFIER].

13. DONNÉES SENSIBLES

Détecte toute collecte possible de données relevant de l'article 9 : santé,
biométrie, données génétiques, opinions politiques, convictions religieuses ou
philosophiques, appartenance syndicale, orientation ou vie sexuelle, origine
raciale ou ethnique — ainsi que les infractions et condamnations, et le
numéro de sécurité sociale.

Attention aux collectes involontaires : champ « allergies » ou « régime
alimentaire » sur une inscription, question de santé dans une réservation,
champ libre « précisez votre situation », photo obligatoire, demande de
nationalité dans un formulaire de recrutement.

Si de telles données sont détectées : [REVUE PRIVACY CRITIQUE], et arrête-toi
là. Ne décide jamais seul qu'un traitement de données sensibles est licite.

14. JOURNAUX

Scanne les journaux pour détecter : emails, noms, adresses, jetons, cookies,
adresses IP, données de formulaire, données sensibles, mots de passe, données
d'API.

Réduis les données personnelles présentes dans les journaux. N'enregistre
jamais de mot de passe. Évite d'enregistrer des jetons ou des données
sensibles sans nécessité.

15. EMAILS

Vérifie les formulaires de contact, les newsletters, les emails
transactionnels, les emails marketing et les systèmes d'envoi.

Sépare ce qui doit l'être : communication transactionnelle, prospection,
newsletter. Chacun a sa base légale et son régime de désinscription. Vérifie
le mécanisme de consentement là où il est requis.

16. IA ET DONNÉES PERSONNELLES

Repère toutes les données envoyées à des modèles, API, assistants, outils
d'analyse ou systèmes de génération. Identifie exactement ce qui quitte
l'infrastructure du site.

N'envoie jamais automatiquement des données personnelles à un service d'IA
sans nécessité et sans analyse préalable. Évite en particulier l'envoi de :
mots de passe, jetons, données bancaires, données sensibles, informations
personnelles inutiles.

Quand c'est possible : anonymise, pseudonymise, minimise avant l'envoi.
Vérifie si le prestataire réutilise les données pour entraîner ses modèles.

17. PRIVACY BY DESIGN ET BY DEFAULT

Pour toute fonctionnalité : la protection des données doit être pensée dès la
conception, et le réglage par défaut doit être le plus protecteur.

Collecter moins, conserver moins, exposer moins, partager moins, donner moins
de permissions, restreindre les accès.

18. SÉCURITÉ DES DONNÉES

Vérifie les mesures techniques : HTTPS, TLS, chiffrement, contrôle d'accès,
authentification, permissions, sauvegardes, séparation des environnements,
protection des secrets, sécurité des cookies, sécurité des API, journaux,
supervision.

Les mesures doivent être proportionnées aux risques.

19. REGISTRE DES TRAITEMENTS

Prépare le tableau, à partir des traitements réellement présents dans le code :
traitement, finalité, données, personnes concernées, base juridique,
destinataires, sous-traitants, localisation, durée, mesures de sécurité,
transfert hors UE, risque.

N'invente pas les informations manquantes : marque-les.

20. ANALYSE D'IMPACT (AIPD)

Signale les indices d'un traitement susceptible d'engendrer un risque élevé :
données sensibles, traitement à grande échelle, surveillance systématique,
profilage, technologie innovante, personnes vulnérables, risque élevé pour
les personnes.

Ne conclus pas définitivement qu'une AIPD est obligatoire sans analyse du
contexte réel : signale les indices, la décision revient au responsable de
traitement.

RAPPORT FINAL

SCORE RGPD TECHNIQUE : X/100 (même grille que l'audit de sécurité)

DONNÉES PERSONNELLES DÉTECTÉES
COOKIES ET TRACEURS
ÉTAT DU CONSENTEMENT
SERVICES TIERS
TRANSFERTS HORS UE
DURÉES DE CONSERVATION
DROITS DES UTILISATEURS
DONNÉES SENSIBLES
PROBLÈMES CRITIQUES
CORRECTIONS EFFECTUÉES
INFORMATIONS À FOURNIR PAR LE CLIENT
POINTS NÉCESSITANT UNE VÉRIFICATION JURIDIQUE
RISQUES RESTANTS

Quand le code ne permet pas de déterminer une information, indique clairement
qu'elle doit être fournie ou vérifiée par le responsable de traitement ou un
professionnel compétent.

COMMENCE PAR LA CARTOGRAPHIE, sans rien modifier.
```

---

## Après le rapport

Le rapport constate. Pour installer les correctifs, passer au dossier `conformite/`, qui contient le code : bandeau de consentement bloquant, politique de conservation et purge automatique, routes d'export et de suppression, registres de preuve.

Les lignes marquées `[À FOURNIR PAR LE RESPONSABLE DU SITE]` forment la liste de questions à envoyer au client. C'est souvent le livrable le plus utile de l'audit — celui qui déclenche enfin les réponses.
