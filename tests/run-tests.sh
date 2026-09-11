#!/usr/bin/env bash
# Suite de tests de la compétence securite-web.
#
#   bash tests/run-tests.sh
#
# Ce que ces tests garantissent :
#   - les migrations s'appliquent réellement sur un PostgreSQL vierge ;
#   - la purge est idempotente et ne viole pas les contraintes d'unicité ;
#   - la suppression de compte est atomique et la rétractation fonctionne ;
#   - le bandeau de consentement n'active rien avant accord, et apparie
#     correctement chaque cadre à son substitut ;
#   - la normalisation de domaine ne produit pas de faux positif SPF/DMARC ;
#   - les fichiers TypeScript livrés sont syntaxiquement valides.
#
# Ce qu'ils NE garantissent PAS, et qu'il ne faut pas prétendre :
#   - le typage complet des modèles TypeScript (ils importent des modules
#     propres au projet cible : @/lib/db, next/server…) ;
#   - les résolutions DNS réelles (nécessitent dig et un accès réseau) ;
#   - le comportement des sous-traitants (emailing, stockage objet).
#
# PostgreSQL : les tests SQL sont sautés si aucune base n'est joignable.
# Définir PGURL pour la fournir, par exemple :
#   PGURL="postgres://postgres@localhost/test" bash tests/run-tests.sh

set -uo pipefail

ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RACINE="$(cd "$ICI/.." && pwd)"

reussis=0
echoues=0
sautes=0

titre() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
ok()    { printf '\033[32m%s\033[0m\n' "$1"; }
ko()    { printf '\033[31m%s\033[0m\n' "$1"; }
gris()  { printf '\033[90m%s\033[0m\n' "$1"; }

lancer() {
  local nom="$1"; shift
  if "$@"; then
    reussis=$((reussis + 1)); ok "  ✓ $nom"
  else
    echoues=$((echoues + 1)); ko "  ✗ $nom"
  fi
}

# ---------------------------------------------------------------- SQL

titre "Migrations et base de données (PostgreSQL)"

PSQL=""
if [ -n "${PGURL:-}" ] && command -v psql >/dev/null 2>&1; then
  if psql "$PGURL" -tAc 'select 1' >/dev/null 2>&1; then
    PSQL="psql $PGURL -v ON_ERROR_STOP=1 -q"
  fi
fi

if [ -z "$PSQL" ]; then
  sautes=$((sautes + 3))
  gris "  TEST NON EXÉCUTÉ — ENVIRONNEMENT MANQUANT : aucune base PostgreSQL joignable."
  gris "  Définir PGURL pour exécuter les tests 1 à 3."
else
  BASE_TEST="swstest_$(date +%s)"
  createdb "$BASE_TEST" 2>/dev/null || true
  URL_TEST="${PGURL%/*}/$BASE_TEST"

  appliquer() { psql "$URL_TEST" -v ON_ERROR_STOP=1 -q -f "$1" >/dev/null; }
  jouer()     { psql "$URL_TEST" -v ON_ERROR_STOP=1 -q -f "$1" >/dev/null; }

  if appliquer "$ICI/sql/00-schema-projet.sql" \
     && appliquer "$RACINE/conformite/code/effacement/migration-demandes.sql" \
     && appliquer "$RACINE/conformite/code/retention/migration.sql"; then
    ok "  ✓ migrations appliquées sur base vierge"
    reussis=$((reussis + 1))

    lancer "test 1 — migrations et calcul d'échéance" jouer "$ICI/sql/01-test-migrations.sql"
    lancer "test 2 — purge : unicité et idempotence"  jouer "$ICI/sql/02-test-purge.sql"
    lancer "test 3 — effacement en deux phases"       jouer "$ICI/sql/03-test-effacement.sql"

    # Rejeu : les migrations doivent être idempotentes.
    if appliquer "$RACINE/conformite/code/effacement/migration-demandes.sql" \
       && appliquer "$RACINE/conformite/code/retention/migration.sql"; then
      ok "  ✓ migrations idempotentes (rejeu sans erreur)"; reussis=$((reussis + 1))
    else
      ko "  ✗ migrations idempotentes"; echoues=$((echoues + 1))
    fi
  else
    ko "  ✗ migrations appliquées sur base vierge"; echoues=$((echoues + 1))
  fi

  dropdb "$BASE_TEST" 2>/dev/null || true
fi

# ---------------------------------------------------------------- JS

titre "Consentement et code livré (Node)"

if command -v node >/dev/null 2>&1; then
  if [ -d "$RACINE/node_modules/jsdom" ]; then
    lancer "test 4 — consentement, cadres et substituts" \
      node "$ICI/js/test-consentement.mjs"
  else
    sautes=$((sautes + 1))
    gris "  TEST NON EXÉCUTÉ — ENVIRONNEMENT MANQUANT : jsdom absent (npm install)."
  fi

  if [ -d "$RACINE/node_modules/typescript" ]; then
    lancer "test 6 — syntaxe TypeScript et invariants" \
      node "$ICI/js/test-syntaxe-ts.mjs"
  else
    sautes=$((sautes + 1))
    gris "  TEST NON EXÉCUTÉ — ENVIRONNEMENT MANQUANT : typescript absent (npm install)."
  fi
else
  sautes=$((sautes + 2))
  gris "  TEST NON EXÉCUTÉ — ENVIRONNEMENT MANQUANT : node absent."
fi

# ---------------------------------------------------------------- shell

titre "Scripts shell"

lancer "test 5 — normalisation de domaine (SPF/DMARC)" \
  bash "$ICI/shell/test-domaine.sh"

for f in "$RACINE/scripts/audit-express.sh" "$RACINE/scripts/lib-domaine.sh"; do
  lancer "syntaxe $(basename "$f")" bash -n "$f"
done

# ---------------------------------------------------------------- bilan

titre "Bilan"
printf '  TESTS PASSED  : %d\n' "$reussis"
printf '  TESTS FAILED  : %d\n' "$echoues"
printf '  TESTS NOT RUN : %d\n' "$sautes"
echo

[ "$echoues" -eq 0 ] || exit 1
