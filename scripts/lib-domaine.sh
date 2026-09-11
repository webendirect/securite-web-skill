#!/usr/bin/env bash
# lib-domaine.sh — normalisation de nom de domaine pour les vérifications DNS.
#
# Extrait dans son propre fichier pour être testable sans réseau :
# tests/shell/test-domaine.sh appelle ces fonctions directement.
#
# Le problème qu'il règle : SPF et DMARC se publient presque toujours sur le
# domaine racine, pas sur « www ». Interroger TXT www.exemple.fr et
# _dmarc.www.exemple.fr pour un site servi en www revient à annoncer
# « SPF MANQUANT » sur un domaine correctement configuré. Un faux positif
# envoyé à un client coûte plus cher que l'absence du contrôle.

# Suffixes publics à deux niveaux les plus courants. La liste complète (Public
# Suffix List) compte des milliers d'entrées ; celle-ci couvre ce qu'on
# rencontre en pratique sur des sites francophones et empêche de réduire
# « exemple.co.uk » à « co.uk ».
readonly SUFFIXES_COMPOSES="co.uk org.uk gov.uk ac.uk me.uk net.uk sch.uk \
com.au net.au org.au edu.au gov.au \
co.nz net.nz org.nz govt.nz \
co.jp or.jp ne.jp ac.jp go.jp \
com.br net.br org.br gov.br \
co.za org.za web.za \
com.mx com.ar com.tr com.cn com.hk com.sg com.my \
co.in net.in org.in \
com.pl com.ua com.ru \
asso.fr tm.fr nom.fr prd.fr com.es org.es"

# normaliser_hote <url-ou-hote>
#
# Extrait le nom d'hôte d'une URL et le met en forme :
#   schéma, identifiants, port, chemin, requête, ancre et point final retirés,
#   passage en minuscules.
#
#   https://Exemple.FR/page?a=1   -> exemple.fr
#   http://user:mdp@exemple.fr:8443/ -> exemple.fr
#   exemple.fr.                   -> exemple.fr
normaliser_hote() {
  local brut="${1:-}"
  [ -z "$brut" ] && return 1

  local h="$brut"
  h="${h#*://}"          # schéma
  h="${h%%/*}"           # chemin
  h="${h%%\?*}"          # requête sans chemin
  h="${h%%#*}"           # ancre
  h="${h##*@}"           # identifiants
  # port : uniquement si ce qui suit ":" est numérique (ne casse pas l'IPv6)
  case "$h" in
    \[*\]*) h="${h%%\]*}]" ;;                       # IPv6 littéral
    *:[0-9]*) h="${h%:*}" ;;
  esac
  h="${h%.}"             # point final (racine DNS explicite)
  h="$(printf '%s' "$h" | tr '[:upper:]' '[:lower:]')"

  # Un hôte valide ne contient que lettres, chiffres, tirets et points, et ne
  # commence ni ne finit par un point.
  case "$h" in
    ''|.*|*..*) return 1 ;;
    *[!a-z0-9.-]*) return 1 ;;
  esac
  [ "${h%.*}" = "$h" ] && return 1   # pas de point : « localhost », TLD seul

  printf '%s' "$h"
}

# est_suffixe_compose <domaine>
# Vrai si le domaine EST exactement un suffixe à deux niveaux (co.uk, com.au…).
est_suffixe_compose() {
  local d="${1:-}" s
  for s in $SUFFIXES_COMPOSES; do
    [ "$d" = "$s" ] && return 0
  done
  return 1
}

# domaine_racine <hote>
#
# Domaine enregistrable (eTLD+1) : celui qui porte normalement SPF et DMARC.
#
#   www.exemple.fr        -> exemple.fr
#   a.b.exemple.fr        -> exemple.fr
#   exemple.fr            -> exemple.fr
#   www.exemple.co.uk     -> exemple.co.uk
domaine_racine() {
  local h="${1:-}"
  [ -z "$h" ] && return 1

  local reste="$h" parent
  while :; do
    parent="${reste#*.}"
    # On s'arrête quand le parent est un suffixe public : `reste` est alors
    # le domaine enregistrable.
    if [ "$parent" = "$reste" ]; then
      printf '%s' "$reste"; return 0
    fi
    case "$parent" in
      *.*) if est_suffixe_compose "$parent"; then printf '%s' "$reste"; return 0; fi ;;
      *)   printf '%s' "$reste"; return 0 ;;   # parent = TLD simple (.fr, .com)
    esac
    reste="$parent"
  done
}

# domaines_a_tester <hote>
#
# Domaines à interroger pour SPF/DMARC, du plus précis au plus général, sans
# doublon. Un sous-domaine peut porter ses propres enregistrements ; s'il n'en
# a pas, c'est le domaine racine qui fait foi (DMARC couvre d'ailleurs ses
# sous-domaines par héritage, éventuellement affiné par `sp=`).
domaines_a_tester() {
  local h racine
  h="$(normaliser_hote "${1:-}")" || return 1
  racine="$(domaine_racine "$h")"
  if [ "$h" = "$racine" ]; then
    printf '%s\n' "$h"
  else
    printf '%s\n%s\n' "$h" "$racine"
  fi
}
