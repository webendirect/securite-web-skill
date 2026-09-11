#!/usr/bin/env bash
# Test 5 — normalisation de domaine pour les contrôles SPF/DMARC.
#
# Couvre la régression audit-express.sh:103-104 : le préfixe « www. » était
# conservé, donc le script interrogeait TXT www.exemple.fr et
# _dmarc.www.exemple.fr — là où les enregistrements vivent sur le domaine
# racine. Sur tout site servi en www, le rapport annonçait « MANQUE SPF »
# à tort.
#
# Ces tests ne touchent pas au réseau : ils portent sur la logique de
# normalisation, qui est exactement l'endroit du défaut.

set -uo pipefail
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../../scripts/lib-domaine.sh
. "$ICI/../../scripts/lib-domaine.sh"

reussis=0
echecs=0

verifier() {
  local nom="$1" attendu="$2" obtenu="$3"
  if [ "$attendu" = "$obtenu" ]; then
    reussis=$((reussis + 1))
  else
    echecs=$((echecs + 1))
    printf '    ECHEC : %s\n      attendu : [%s]\n      obtenu  : [%s]\n' \
      "$nom" "$attendu" "$obtenu"
  fi
}

verifier_echec() {
  local nom="$1" entree="$2"
  if normaliser_hote "$entree" >/dev/null 2>&1; then
    echecs=$((echecs + 1))
    printf '    ECHEC : %s — [%s] aurait du etre rejete\n' "$nom" "$entree"
  else
    reussis=$((reussis + 1))
  fi
}

echo "  -- 5.1 normalisation de l'hôte --"
verifier "apex nu"              "exemple.fr"     "$(normaliser_hote 'exemple.fr')"
verifier "https + chemin"       "exemple.fr"     "$(normaliser_hote 'https://exemple.fr/page')"
verifier "http + www"           "www.exemple.fr" "$(normaliser_hote 'http://www.exemple.fr')"
verifier "slash final"          "exemple.fr"     "$(normaliser_hote 'https://exemple.fr/')"
verifier "majuscules"           "exemple.fr"     "$(normaliser_hote 'HTTPS://Exemple.FR')"
verifier "port"                 "exemple.fr"     "$(normaliser_hote 'https://exemple.fr:8443/x')"
verifier "identifiants"         "exemple.fr"     "$(normaliser_hote 'https://user:mdp@exemple.fr/')"
verifier "requete"              "exemple.fr"     "$(normaliser_hote 'https://exemple.fr/a?b=c')"
verifier "ancre"                "exemple.fr"     "$(normaliser_hote 'https://exemple.fr/a#b')"
verifier "point final DNS"      "exemple.fr"     "$(normaliser_hote 'exemple.fr.')"
verifier "sous-domaine profond" "a.b.exemple.fr" "$(normaliser_hote 'https://a.b.exemple.fr/x')"

echo "  -- 5.2 entrées malformées --"
verifier_echec "chaine vide"        ""
verifier_echec "espaces"            "   "
verifier_echec "sans point"         "localhost"
verifier_echec "point en tete"      ".exemple.fr"
verifier_echec "points doubles"     "exemple..fr"
verifier_echec "caracteres interdits" "exem ple.fr"
verifier_echec "schema seul"        "https://"

echo "  -- 5.3 domaine racine (eTLD+1) --"
verifier "www retire"        "exemple.fr"        "$(domaine_racine 'www.exemple.fr')"
verifier "apex inchange"     "exemple.fr"        "$(domaine_racine 'exemple.fr')"
verifier "profond"           "exemple.fr"        "$(domaine_racine 'a.b.c.exemple.fr')"
verifier "suffixe compose"   "exemple.co.uk"     "$(domaine_racine 'www.exemple.co.uk')"
verifier "compose deja apex" "exemple.co.uk"     "$(domaine_racine 'exemple.co.uk')"
verifier "com.au"            "exemple.com.au"    "$(domaine_racine 'shop.exemple.com.au')"
verifier "asso.fr"           "exemple.asso.fr"   "$(domaine_racine 'www.exemple.asso.fr')"
verifier "tld simple"        "exemple.com"       "$(domaine_racine 'mail.exemple.com')"

echo "  -- 5.4 domaines interrogés (c'est ce qui produisait le faux positif) --"
verifier "apex : une seule requete" \
  "exemple.fr" "$(domaines_a_tester 'https://exemple.fr')"
verifier "www : l'apex est AUSSI interroge" \
  "$(printf 'www.exemple.fr\nexemple.fr')" "$(domaines_a_tester 'https://www.exemple.fr')"
verifier "sous-domaine : lui puis l'apex" \
  "$(printf 'boutique.exemple.fr\nexemple.fr')" "$(domaines_a_tester 'https://boutique.exemple.fr/x')"
verifier "slash final" \
  "$(printf 'www.exemple.fr\nexemple.fr')" "$(domaines_a_tester 'https://www.exemple.fr/')"
verifier "deja normalise" \
  "exemple.fr" "$(domaines_a_tester 'exemple.fr')"

echo "  -- 5.5 l'apex ne doit jamais etre interroge deux fois --"
n="$(domaines_a_tester 'exemple.fr' | sort | uniq -d | wc -l)"
verifier "aucun doublon" "0" "$n"

echo
if [ "$echecs" -gt 0 ]; then
  printf '  TEST 5 — domaines : %d reussie(s), %d ECHEC(s)\n' "$reussis" "$echecs"
  exit 1
fi
printf '  TEST 5 — domaines : %d assertion(s) reussie(s), 0 echec\n  TEST 5 — domaines : OK\n' "$reussis"
