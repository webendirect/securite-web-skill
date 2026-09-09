# Brique 4 — Preuve, registre et sanctions

Les trois premières briques rendent le site conforme. Celle-ci rend la conformité **démontrable**. En contrôle, c'est la seule qui compte : ce qui n'est pas documenté est réputé ne pas exister.

C'est le principe d'*accountability* de l'article 5.2 du RGPD — la charge de la preuve pèse sur le responsable de traitement, pas sur l'autorité.

---

## Le barème réel

Deux paliers, le montant retenu étant **le plus élevé** des deux termes :

| Palier | Plafond | Manquements visés |
|---|---|---|
| 1 | **10 M€ ou 2 % du CA mondial** | sécurité insuffisante, registre absent, sous-traitance non encadrée, violation non notifiée |
| 2 | **20 M€ ou 4 % du CA mondial** | absence de base légale, consentement non valide, droits des personnes non respectés, transferts hors UE illicites |

Les **cookies** ne relèvent pas du RGPD mais de la directive ePrivacy, transposée à l'article 82 de la loi Informatique et Libertés : la CNIL sanctionne alors seule, sans passer par la coopération européenne — ce qui rend ces procédures plus rapides. Sanctions connues : Google 150 M€, Facebook 60 M€, Microsoft 60 M€, Amazon 35 M€.

**Ce qui concerne réellement une TPE ou une PME**, en revanche :

- **Procédure de sanction simplifiée** — plafond **20 000 €**, instruite par un membre unique, sans séance publique. C'est la voie la plus utilisée, et de loin, pour les dossiers de faible complexité.
- **Mise en demeure** — sans sanction financière, mais avec un délai de mise en conformité et, en cas de publicité, un coût de réputation.
- **Injonction sous astreinte** — jusqu'à 100 € par jour de retard.

Le vrai coût quotidien n'est presque jamais l'amende : c'est le temps passé à répondre, la mise en conformité dans l'urgence, et le client qui découvre que le site qu'on lui a livré l'expose.

**Pour un prestataire, il y a un risque propre** : livrer un site non conforme, c'est un manquement contractuel envers son client. Un client sanctionné peut se retourner contre celui qui a construit le site. D'où l'intérêt d'un DPA signé qui répartit clairement les rôles.

## Registre des traitements

Obligatoire dès qu'il y a un traitement régulier — ce qui couvre tout site avec un formulaire. L'exemption des moins de 250 salariés ne s'applique quasiment jamais en pratique, ses conditions étant cumulatives et restrictives.

Un tableau suffit. Pour chaque traitement :

| Champ | Exemple |
|---|---|
| Nom du traitement | Gestion des comptes clients |
| Finalité | Permettre l'accès à l'espace personnel et le suivi des commandes |
| Base légale | Exécution du contrat |
| Personnes concernées | Clients inscrits |
| Catégories de données | Identité, coordonnées, historique de commandes |
| Destinataires | Hébergeur (OVH), emailing (Brevo), paiement (Stripe) |
| Transferts hors UE | Aucun / Stripe — clauses contractuelles types |
| Durée de conservation | Relation + 3 ans, factures 10 ans |
| Mesures de sécurité | HTTPS, mots de passe hachés argon2id, 2FA admin, sauvegardes chiffrées |

Traitements typiques d'un site : comptes clients, prospection et newsletter, formulaire de contact, mesure d'audience, gestion des commandes, candidatures, journaux de sécurité.

Le modèle de la CNIL fait le travail — inutile de réinventer un format.

## Journal des consentements

Ce qui prouve la brique 1. Pour chaque consentement : identifiant technique, horodatage, choix par catégorie, version des textes affichés, IP tronquée. L'implémentation est fournie dans `code/consentement/route-journal.ts`.

Sans ce journal, un consentement ne se démontre pas — et un consentement non démontrable est réputé absent.

## Registre des demandes de droits

Ce qui prouve la brique 3 : chaque demande, sa date, sa réponse, sa décision. Table fournie dans `code/effacement/migration-demandes.sql`.

## Contrats de sous-traitance (DPA)

Tout service qui traite des données pour le compte du client est un sous-traitant, et l'article 28 impose un contrat écrit : hébergeur, emailing, analytics, paiement, formulaires, fournisseur d'IA, stockage de fichiers.

Les grands fournisseurs proposent un DPA standard à accepter en ligne — OVH, Vercel, Stripe, Brevo, Supabase, Google. C'est une case à cocher une fois, et un lien à archiver.

**Et entre toi et ton client** : dès lors que tu héberges, administres ou maintiens le site, tu es son sous-traitant. Un DPA doit exister entre vous. Il doit préciser :

- l'objet, la durée, la nature du traitement
- que tu n'agis que sur instruction documentée du client
- les mesures de sécurité que tu appliques
- le recours à des sous-traitants ultérieurs (ton hébergeur) et l'accord du client
- ton assistance en cas de demande d'exercice de droits ou de violation
- le sort des données en fin de mission — restitution ou suppression

Ce document te protège autant qu'il protège le client : il délimite ce dont tu réponds.

## Transferts hors UE

Pour chaque outil : où sont les données ? Si elles sortent de l'UE, sur quel fondement — clauses contractuelles types, Data Privacy Framework pour les entreprises américaines certifiées ?

À arbitrage égal, préférer un hébergement et des outils européens : OVH, Scaleway, Brevo, Matomo, Plausible. La conformité s'en trouve simplifiée, et l'argument se plaide bien commercialement auprès d'un client français.

## Violation de données

Une procédure d'une page, rédigée **avant** l'incident :

1. **Contenir** — couper l'accès, révoquer les clés, isoler.
2. **Évaluer** — quelles données, combien de personnes, quel risque.
3. **Notifier la CNIL sous 72 heures** si le risque n'est pas négligeable, via le téléservice. Une notification tardive est un manquement distinct de la violation elle-même.
4. **Informer les personnes** si le risque est élevé — en clair, sans jargon, avec les mesures à prendre.
5. **Journaliser** dans un registre des violations : toutes les violations s'y inscrivent, y compris celles qui ne sont pas notifiées, avec la motivation de la non-notification.

Trois éléments à préparer maintenant, parce qu'on ne les improvise pas à 23 h : qui appelle qui, où sont les journaux, comment on force la réinitialisation de tous les mots de passe.

## Mentions obligatoires sur le site

**Mentions légales** — éditeur (dénomination, forme juridique, adresse, RCS ou SIRET, capital social, numéro de TVA intracommunautaire), directeur de la publication, hébergeur avec nom, adresse et téléphone, et pour les activités réglementées l'ordre professionnel et le numéro d'inscription.

**Politique de confidentialité** — par traitement : finalité, base légale, données, destinataires, durée, transferts, droits et modalités d'exercice, contact, droit de réclamation auprès de la CNIL. Elle doit citer les **outils réellement utilisés** ; une politique générique copiée d'un autre site est une non-conformité en elle-même, et se repère immédiatement.

**Politique de cookies** — la liste des traceurs par catégorie, avec leur finalité et leur durée. Le code de consentement fourni permet de la générer à partir de la déclaration des catégories, ce qui évite qu'elle se désynchronise du site.

---

## Prompt à coller

> Construis le dossier de conformité de ce projet : le registre des traitements au format CNIL en partant des traitements réellement présents dans le code, la liste des sous-traitants avec l'état de leur DPA et la localisation des données, la procédure de violation en une page, et la politique de confidentialité citant les outils réellement utilisés. Vérifie que le journal des consentements et le registre des demandes de droits sont bien en place et alimentés. Dis-moi ce qui manque et ce que je dois demander à mon client.
