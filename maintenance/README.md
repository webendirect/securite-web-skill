# Maintenance — l'évolution de la compétence elle-même

Ce dossier ne sert jamais sur un projet client. Il garde la trace de ce qui a
fait évoluer la compétence : les missions qui l'ont modifiée, et les rapports
qu'elles ont produits.

La distinction compte. `assets/` contient ce qu'on **colle sur un projet
client** — prompts de mission d'audit, checklist de livraison, questionnaire.
`maintenance/` contient ce qui **modifie la compétence**. Mélanger les deux
conduirait tôt ou tard à coller une mission de maintenance sur le site d'un
client, ce qui n'aurait aucun sens.

## Pourquoi archiver les missions

Un rapport dit ce qui a été corrigé. Il ne dit pas ce qui avait été demandé, ni
dans quel ordre, ni pourquoi tel défaut passait avant tel autre. Sans la
mission d'origine, le « pourquoi » d'un choix disparaît en quelques mois, et la
révision suivante refait les mêmes arbitrages à l'aveugle.

Chaque mission est donc conservée telle qu'elle a été reçue, sans réécriture,
avec son état d'avancement et le lien vers ce qu'elle a produit.

## Contenu

```
missions/          les missions reçues, datées, dans leur formulation d'origine
```

Les rapports produits restent à la racine du dépôt — `SECURITY-REPORT.md` et
`RGPD-REPORT.md` — là où on les cherche naturellement.

## Règle

Une mission qui modifie la compétence s'archive ici **avant** d'être exécutée,
pas après. C'est ce qui permet de vérifier, à la fin, que ce qui a été fait
correspond à ce qui avait été demandé — la dixième des vérifications avant push
de `references/10-methode-de-correction.md`.
