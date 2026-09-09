#!/usr/bin/env bash
# audit-express.sh — reconnaissance passive d'un site en production.
#
# Usage : ./audit-express.sh https://mon-domaine.fr
#
# N'exécute que des requêtes GET/HEAD ordinaires : rien d'intrusif.
# À n'utiliser que sur un site dont on a l'autorisation.

set -uo pipefail

URL="${1:-}"
if [ -z "$URL" ]; then
  echo "Usage : $0 https://mon-domaine.fr" >&2
  exit 1
fi
URL="${URL%/}"
HOST="$(printf '%s' "$URL" | sed -E 's#^https?://##; s#/.*##')"

vert()  { printf '\033[32m%s\033[0m\n' "$1"; }
rouge() { printf '\033[31m%s\033[0m\n' "$1"; }
gris()  { printf '\033[90m%s\033[0m\n' "$1"; }
titre() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }

HEADERS="$(curl -sIL --max-time 15 "$URL" 2>/dev/null)"
if [ -z "$HEADERS" ]; then
  rouge "Impossible de joindre $URL"
  exit 1
fi

titre "En-têtes de sécurité"
check_header() {
  local nom="$1" attendu="$2"
  if printf '%s' "$HEADERS" | grep -qi "^$nom:"; then
    vert  "  OK       $nom"
    gris  "           $(printf '%s' "$HEADERS" | grep -i "^$nom:" | head -1 | cut -c1-100)"
  else
    rouge "  MANQUE   $nom  — $attendu"
  fi
}
check_header "Strict-Transport-Security" "max-age=31536000; includeSubDomains"
check_header "Content-Security-Policy"   "commencer en Report-Only"
check_header "X-Content-Type-Options"    "nosniff"
check_header "X-Frame-Options"           "DENY (ou CSP frame-ancestors)"
check_header "Referrer-Policy"           "strict-origin-when-cross-origin"
check_header "Permissions-Policy"        "camera=(), microphone=(), geolocation=()"

titre "Divulgation de technologie"
for h in X-Powered-By Server X-AspNet-Version X-Generator; do
  if printf '%s' "$HEADERS" | grep -qi "^$h:"; then
    rouge "  EXPOSÉ   $(printf '%s' "$HEADERS" | grep -i "^$h:" | head -1 | tr -d '\r')"
  fi
done
printf '%s' "$HEADERS" | grep -qiE "^(x-powered-by|x-aspnet-version|x-generator):" || vert "  Rien d'inutile exposé"

titre "Redirection HTTP vers HTTPS"
CODE_HTTP="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://$HOST" 2>/dev/null)"
LOC="$(curl -sI --max-time 10 "http://$HOST" 2>/dev/null | grep -i '^location:' | tr -d '\r')"
case "$CODE_HTTP" in
  301|308) vert "  OK       redirection $CODE_HTTP — $LOC" ;;
  302|307) rouge "  À CORRIGER  redirection temporaire $CODE_HTTP — préférer 301" ;;
  *)       rouge "  À CORRIGER  pas de redirection (code $CODE_HTTP)" ;;
esac

titre "Cookies"
COOKIES="$(printf '%s' "$HEADERS" | grep -i '^set-cookie:' || true)"
if [ -z "$COOKIES" ]; then
  gris "  Aucun cookie posé sur la page d'accueil"
else
  printf '%s\n' "$COOKIES" | while IFS= read -r c; do
    nom="$(printf '%s' "$c" | sed -E 's/^[Ss]et-[Cc]ookie: *([^=]+)=.*/\1/')"
    manque=""
    printf '%s' "$c" | grep -qi 'httponly' || manque="$manque HttpOnly"
    printf '%s' "$c" | grep -qi 'secure'   || manque="$manque Secure"
    printf '%s' "$c" | grep -qi 'samesite' || manque="$manque SameSite"
    if [ -n "$manque" ]; then rouge "  $nom — manque :$manque"; else vert "  $nom — OK"; fi
  done
fi

titre "Fichiers sensibles exposés"
for p in .env .env.local .env.production .git/config .git/HEAD backup.sql dump.sql \
         phpinfo.php adminer.php .DS_Store composer.lock wp-config.php.bak \
         storage/logs/laravel.log server-status; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$URL/$p" 2>/dev/null)"
  case "$code" in
    200) rouge "  EXPOSÉ   /$p (200)" ;;
    301|302) gris "  redirigé /$p ($code) — à vérifier manuellement" ;;
  esac
done
vert "  Analyse des fichiers terminée (seuls les problèmes sont listés)"

titre "Sourcemaps"
MAPS="$(curl -s --max-time 15 "$URL" 2>/dev/null | grep -oE '[^"'"'"']+\.js' | head -8)"
found=0
for js in $MAPS; do
  case "$js" in /*) u="$URL$js" ;; http*) u="$js" ;; *) u="$URL/$js" ;; esac
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$u.map" 2>/dev/null)"
  [ "$code" = "200" ] && { rouge "  EXPOSÉ   $u.map"; found=1; }
done
[ "$found" = "0" ] && vert "  Aucune sourcemap publique détectée"

titre "DNS courrier (SPF / DMARC)"
if command -v dig >/dev/null 2>&1; then
  SPF="$(dig +short TXT "$HOST" 2>/dev/null | grep -i 'v=spf1' | head -1)"
  DMARC="$(dig +short TXT "_dmarc.$HOST" 2>/dev/null | grep -i 'v=DMARC1' | head -1)"
  [ -n "$SPF" ]   && vert "  OK       SPF   $SPF"    || rouge "  MANQUE   SPF — usurpation d'expéditeur possible"
  [ -n "$DMARC" ] && vert "  OK       DMARC $DMARC"  || rouge "  MANQUE   DMARC — commencer en p=none"
else
  gris "  dig non installé — vérifier SPF/DMARC sur mail-tester.com"
fi

titre "À vérifier ensuite, à la main"
cat <<'FIN'
  - Accès croisé entre deux comptes (utilisateur A vers ressource de B) → attendu 404
  - Rate limiting sur la connexion → un 429 doit apparaître
  - Token de session absent du localStorage et invisible en JavaScript
  - Cookies déposés AVANT tout consentement (onglet Application, navigation privée)
  - securityheaders.com · ssllabs.com/ssltest · mail-tester.com
FIN
echo
