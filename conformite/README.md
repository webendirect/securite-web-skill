# Module conformité — les 3 briques qui évitent la 4ᵉ

Trois obligations produisent l'essentiel des sanctions CNIL sur les sites de petite et moyenne taille. Ce module les transforme en code à déposer dans chaque projet, plutôt qu'en bonnes intentions.

| Brique | Obligation | Ce qu'on installe |
|---|---|---|
| **1. Consentement** | Aucun traceur non nécessaire avant accord explicite | Bandeau qui bloque réellement les scripts + journal de preuve |
| **2. Rétention** | Aucune donnée conservée sans durée définie | Politique déclarative + purge automatique |
| **3. Effacement** | Toute personne peut récupérer et supprimer ses données | Export, et suppression en deux phases : accès coupés tout de suite, données détruites à l'échéance |
| **4. Preuve** | Pouvoir démontrer les trois premières | Registre, journal des demandes, DPA |

La quatrième n'est pas une fonctionnalité de plus : c'est ce qui rend les trois autres opposables en cas de contrôle. Être conforme sans pouvoir le prouver revient, devant la CNIL, à ne pas l'être.

## Documents

- `01-consentement-cookies.md` — la règle CNIL, ce qui est exempté, comment bloquer pour de vrai
- `02-retention-purge.md` — durées par type de donnée, anonymiser ou supprimer, automatisation
- `03-effacement-et-portabilite.md` — export, suppression, cascade sur les sous-traitants, limites du droit
- `04-preuve-et-registre.md` — registre des traitements, journal des consentements, DPA, violation à 72 h, barème réel des sanctions

## Code fourni

```
code/consentement/
  consentement.js              bandeau vanilla, sans dépendance, blocage réel des scripts
  consentement.css             styles, thème clair et sombre
  ConsentementProvider.tsx     version React / Next.js App Router
  route-journal.ts             API qui enregistre la preuve du consentement
code/retention/
  politique-retention.ts       déclaration centrale des durées
  purge.ts                     purge automatique, mode simulation par défaut
  migration.sql                colonnes de suivi et index
code/effacement/
  route-export.ts              export complet des données d'une personne (portabilité)
  route-suppression.ts         phase 1 : désactivation immédiate, transactionnelle
  route-annulation.ts          rétractation pendant la fenêtre, par jeton haché
  migration-demandes.sql       registre des demandes + purger_comptes_supprimes() (phase 2)
```

Le code est écrit pour **Next.js App Router + Postgres/Supabase**. Les fichiers `consentement.js` et `consentement.css` sont autonomes : ils fonctionnent sur n'importe quel site, y compris un site statique ou WordPress (à charger via `wp_enqueue_script`).

## Ordre d'installation

1. **Consentement** en premier — c'est le seul point visible depuis l'extérieur, donc le seul constatable sans contrôle sur pièces. Un inspecteur ouvre le site en navigation privée et regarde les cookies déposés.
2. **Rétention** ensuite — définir les durées avant d'accumuler.
3. **Effacement** — les routes d'export et de suppression.
4. **Preuve** — registre et DPA, une fois les trois autres en place.

## Vérification

```bash
# Le code de ce dossier est couvert par la suite de tests du dépôt.
# À lancer après toute modification :
bash ../tests/run-tests.sh

# Reconnaissance passive du site en ligne :
../scripts/audit-express.sh https://mon-domaine.fr
```

Puis, à la main : ouvrir le site en navigation privée, onglet Application → Cookies, **avant tout clic**. Tout ce qui est déposé à cet instant doit être strictement nécessaire au fonctionnement. C'est le test que fait la CNIL.

---

> Guide de mise en conformité technique, pas un conseil juridique. Pour un traitement à risque — données de santé, profilage, gros volumes, mineurs — faire relire par un juriste ou un DPO.
