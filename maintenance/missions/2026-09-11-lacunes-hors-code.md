# Mission — combler les lacunes hors-code

**Reçue le :** 2026-09-11
**Statut :** reçue, plan présenté, exécution en attente de validation
**Origine :** revue confrontant la compétence à vingt questions fondamentales —
les dix que se pose un visiteur en parcourant un site, les dix auxquelles un
propriétaire doit pouvoir répondre.

**Constat :** huit points absents ou partiels, tous au même endroit — hors du
code. La compétence audite bien un dépôt Git et passe à côté de ce qui coule
réellement un projet.

**Fichiers visés**

| Lot | Cible | Objet |
|---|---|---|
| 1 | `references/01-authentification.md`, `references/03-entrees-et-api.md` | données bancaires, changements sensibles et alertes |
| 2 | `assets/questionnaire-client.md` *(neuf)* | inventaire des accès, réversibilité, coût d'un incident, cadence de revue, grille des vingt questions |
| 3 | `references/04-secrets-et-exposition.md`, `references/05-infrastructure.md`, `references/07-verification.md` | signes de compromission, domaine sosie, renvoi vers la cadence |
| 4 | `SKILL.md`, `README.md`, `assets/checklist-pre-lancement.md`, `assets/prompts-rapides.md`, `assets/mission-audit-complet.md` | répercussions |

**Produit :** voir `SECURITY-REPORT.md`, section « Lacunes hors-code ».

---

## Texte reçu

```
MISSION — COMBLER LES LACUNES HORS-CODE DE LA COMPÉTENCE securite-web

Dépôt : webendirect/securite-web-skill — compétence Claude d'audit de sécurité
et de conformité RGPD pour sites web.

Une revue a confronté la compétence à vingt questions fondamentales : les dix
que se pose un visiteur en parcourant un site, et les dix auxquelles un
propriétaire doit pouvoir répondre. Huit points sont ressortis absents ou
partiels. Tous au même endroit : hors du code. La compétence audite très bien
un dépôt Git et passe à côté de ce qui coule réellement un projet.

Les quatre lots ci-dessous sont ordonnés par dégât potentiel et groupés par
fichier. Les traiter dans l'ordre, un commit par lot.

MÉTHODE

Lis references/10-methode-de-correction.md et applique-la :
CORRIGER → TESTER → VÉRIFIER → AUDITER → COMMITTER → POUSSER.
Jamais modifier puis pousser.

Avant d'écrire quoi que ce soit, lis SKILL.md, README.md,
references/00-budget-de-friction.md, references/01-authentification.md,
references/04-secrets-et-exposition.md, references/05-infrastructure.md,
references/07-verification.md et assets/checklist-pre-lancement.md.

Écris dans le style de l'existant : prose française dense, pas de listes à
puces décoratives, chaque affirmation justifiée, aucun anglicisme évitable,
un prompt à coller en fin de chaque section.

═══════════════════════════════════════════════════════
LOT 1 — references/01-authentification.md
Dégât : fraude bancaire et vol de compte irréversible
═══════════════════════════════════════════════════════

Deux sections à ajouter dans ce seul fichier.

1.A — PAIEMENT ET DONNÉES BANCAIRES

La passe 3.11 traite la logique de paiement (prix relu en base, statut « payé »
issu du webhook) mais la règle la plus élémentaire n'est écrite nulle part.

  - On ne stocke JAMAIS un numéro de carte, un cryptogramme ou une date
    d'expiration. Ni en base, ni dans un journal, ni dans un champ qui
    transite par son propre serveur.
  - La saisie passe par des champs hébergés par le prestataire (Stripe
    Elements, PayPal, Mollie) : les données ne touchent jamais le serveur.
  - Un champ carte fait maison fait basculer le client dans le périmètre
    PCI-DSS, hors de portée d'une PME — et c'est le signal le plus alarmant
    qu'un visiteur puisse rencontrer.
  - Détection : champs nommés card, cvv, cvc, numero_carte, expiry, pan ;
    colonnes de base correspondantes ; vérifier qu'aucun journal ni outil de
    suivi d'erreurs ne capture le contenu d'un formulaire de paiement.
  - Ce qu'on conserve légitimement : identifiant client du prestataire,
    quatre derniers chiffres, type de carte.

1.B — CHANGEMENTS SENSIBLES ET ALERTES

Une seule ligne de la compétence évoque aujourd'hui une notification, et
seulement après changement de mot de passe. Il manque le chemin classique du
vol de compte définitif : l'attaquant change l'adresse email, demande une
réinitialisation, et le propriétaire légitime ne récupère plus jamais son
compte.

Protocole complet du changement d'email :
  - mot de passe redemandé avant toute demande de changement ;
  - confirmation envoyée à l'ANCIENNE adresse, avec un lien d'annulation
    valable plusieurs jours — c'est ce point qui protège réellement ;
  - lien de validation envoyé à la nouvelle adresse ;
  - changement effectif seulement après validation de la nouvelle ;
  - l'ancienne adresse reste active tant que ce n'est pas confirmé.

Autres notifications utiles : connexion depuis un appareil ou une
localisation inconnus, changement de mot de passe, activation ou
désactivation de la 2FA, ajout d'un moyen de paiement, suppression de compte.
Chaque email doit dire quoi faire si ce n'était pas l'utilisateur.

Développer l'écran « appareils connectés », évoqué en 1.5 sans jamais être
détaillé : sessions actives avec date et appareil, révocation d'une session
ou de toutes les autres.

Calibrer selon la passe 0 : aux niveaux 1 et 2, les alertes de changement
d'email et de mot de passe suffisent ; les alertes de connexion ne se
justifient qu'à partir du niveau 3.

═══════════════════════════════════════════════════════
LOT 2 — assets/questionnaire-client.md (fichier neuf)
Dégât : perte de contrôle du site, calibrage à l'aveugle
═══════════════════════════════════════════════════════

Livrable principal. Un questionnaire rempli par le client au démarrage, qui
produit deux choses : le niveau de sécurité de la passe 0, et la liste des
angles morts absents du code. Remplissable en vingt minutes par une personne
non technique — pas un interrogatoire.

2.A — INVENTAIRE DES ACCÈS (n'existe consolidé nulle part)

Pour chaque système : hébergement, nom de domaine et registrar, base de
données, administration du site, boîte mail professionnelle, outil
d'emailing, prestataire de paiement, analytics, comptes sociaux, dépôt de
code. Qui y a accès, à quel nom sont les comptes, 2FA active ou non, mots de
passe partagés ou individuels, anciens prestataires encore autorisés.

Signaler que le compte du registrar est le point de défaillance unique : qui
contrôle le DNS contrôle le site, les emails et les certificats.

2.B — DÉPENDANCE AU PRESTATAIRE (totalement absent du dépôt)

Les accès sont-ils au nom du client ou du prestataire ? Le client peut-il
reprendre son site demain sans lui ? Existe-t-il une documentation
d'exploitation ? Que se passe-t-il si le prestataire n'est plus joignable ?

Écrire la contrepartie : ce que le prestataire doit fournir pour être
irréprochable — accès au nom du client, documentation de reprise, restitution
ou suppression des données en fin de mission. Présenter ce point comme un
argument commercial autant qu'une obligation : un client à qui l'on répond
proprement là-dessus est un client qui fait confiance.

2.C — COÛT D'UN INCIDENT, CHIFFRÉ

Combien coûte une journée d'indisponibilité ? Quelle part du chiffre
d'affaires passe par le site ? Combien de clients apprendraient une fuite, et
quel effet sur la relation ? Quel coût pour notifier et gérer la crise ?

Expliquer pourquoi la question est posée : c'est elle qui détermine le niveau
de la passe 0 et le budget à engager. Sans chiffre, l'arbitrage se fait à
l'intuition — et l'intuition penche vers le maximalisme que la passe 0 est
justement censée corriger.

2.D — CADENCE DE REVUE

La passe 7 demande de fixer une date de prochaine revue sans dire laquelle.
Proposer une cadence par niveau, et surtout les déclencheurs imposant une
revue hors calendrier : nouvelle fonctionnalité touchant les comptes ou le
paiement, nouveau plugin ou service tiers, changement de prestataire,
migration d'hébergement, départ d'une personne ayant des accès, incident
constaté chez un fournisseur.

2.E — GRILLE DES VINGT QUESTIONS

Terminer par les deux séries de dix questions ayant motivé cette mission —
celles du visiteur, celles du propriétaire — avec pour chacune l'endroit de
la compétence qui y répond.

═══════════════════════════════════════════════════════
LOT 3 — Trois compléments courts
Dégât : modéré · trois petites insertions
═══════════════════════════════════════════════════════

3.A — references/04-secrets-et-exposition.md, section surveillance.
Elle dit comment être alerté d'une attaque en cours, pas comment reconnaître
qu'on est DÉJÀ compromis. Ajouter les signes : compte administrateur inconnu,
fichier modifié sans déploiement, tâche planifiée ou processus inattendu,
trafic sortant inhabituel, fichier apparu dans un dossier d'upload, envoi
massif d'emails depuis le domaine, blocage par un navigateur ou un moteur de
recherche.

3.B — references/05-infrastructure.md, section domaine et DNS.
La compétence protège le domaine du client contre le détournement, mais ne
dit rien du DOMAINE SOSIE déposé par un tiers. Ajouter : surveiller les dépôts
de domaines proches, déposer soi-même les variantes évidentes (tiret,
.fr/.com, faute de frappe courante), surveiller les certificats émis pour des
domaines ressemblants via la transparence des certificats, et que faire en
cas de constat.

3.C — references/07-verification.md, passage sur la prochaine revue.
Renvoyer au questionnaire client pour la cadence et les déclencheurs, plutôt
que de dupliquer.

═══════════════════════════════════════════════════════
LOT 4 — Répercussions (dépend des lots 1 à 3)
═══════════════════════════════════════════════════════

- SKILL.md : renvoi au questionnaire dans la passe 0 ; table des passes si
  nécessaire.
- README.md : structure des fichiers et tableau des passes.
- assets/checklist-pre-lancement.md : paiement délégué, changement d'email
  protégé, inventaire des accès fait, accès au nom du client, date de
  prochaine revue fixée.
- assets/prompts-rapides.md : un prompt pour le questionnaire client, un pour
  le volet paiement et changements sensibles.
- assets/mission-audit-complet.md : volet paiement dans l'étape
  authentification, questionnaire dans les préalables.

Vérifier ensuite qu'aucun renvoi entre fichiers ne pointe vers un fichier
inexistant.

═══════════════════════════════════════════════════════
CONTRAINTES DE FOND
═══════════════════════════════════════════════════════

- Ne rien inventer de juridique ou de contractuel. Employer les marqueurs déjà
  en usage : [À FOURNIR PAR LE RESPONSABLE DU SITE],
  [VÉRIFICATION JURIDIQUE NÉCESSAIRE].
- Ne jamais écrire « 100 % sécurisé » ni « pleinement conforme ».
- Calibrer selon la passe 0 : toute protection ajoutée est justifiée par ce
  qu'elle protège, et les niveaux où elle est excessive sont dits.
- Ne pas dupliquer l'existant : vérifier avant d'écrire, renvoyer plutôt que
  recopier.

═══════════════════════════════════════════════════════
RÉSULTAT ATTENDU
═══════════════════════════════════════════════════════

1. Les fichiers créés et modifiés, dans le style de l'existant.
2. Un commit par lot, message expliquant ce qui change et pourquoi.
3. SECURITY-REPORT.md mis à jour : ce qui a été ajouté et pourquoi.
4. Un tableau des vingt questions : couverte / partielle / absente, et le
   fichier qui y répond désormais.
5. Ce qui reste non couvert, dit franchement.

COMMENCE PAR LIRE LE DÉPÔT et présente-moi, lot par lot, ce que tu comptes
écrire — avant de modifier quoi que ce soit.
```

---

## Écarts proposés par rapport à la lettre de la mission

Consignés ici parce qu'un écart non écrit est un écart oublié.

**1. Le lot 1.A ne va pas dans `01-authentification.md`.** La mission place les
données bancaires dans la passe consacrée à l'authentification, tout en notant
elle-même que « la passe 3.11 traite la logique de paiement ». Le stockage d'un
numéro de carte relève de la même question que 3.11 — ce que le serveur a le
droit de recevoir et de garder — et non de la porte d'entrée. Placer les deux
moitiés du sujet dans deux fichiers différents obligerait à lire les deux pour
avoir la règle complète. Proposition : `03-entrees-et-api.md`, immédiatement
après 3.11, avec un renvoi depuis 01. Le lot reste un seul commit.

**2. Les vingt questions ne sont pas énumérées dans la mission.** Elles sont
donc reconstituées, et la liste figure dans `assets/questionnaire-client.md`
pour être corrigée si elle ne correspond pas à la revue d'origine.
