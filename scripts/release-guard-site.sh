#!/usr/bin/env bash
#
# Guard de la rc del SITIO.
#
# El sitio tiene su propia linea de releases (`site_version`) y su propia
# candidata (`site-rc-<version>`). Este guard verifica que **no haya otra
# candidata del sitio en curso**: solo puede haber una, como con la app.
#
# No mira las rc de la aplicacion (`rc-<app_version>`): son dos carriles
# distintos y una no bloquea a la otra. Para eso el prefijo es `site-`.
#
# Uso:
#   scripts/release-guard-site.sh <nombre-de-la-rc>
set -euo pipefail

BRANCH="${1:?falta el nombre de la rc}"
ORG="${ORG:-DolyLanguagesORG}"
REPO="${REPO:-dolynation-tetl-landing}"
PREFIJO="${PREFIJO:-site-rc-}"

log() { echo "[release-guard-site] $*"; }

case "$BRANCH" in
  "$PREFIJO"*) ;;
  *)
    log "ERROR: '$BRANCH' no es una rc del sitio (prefijo '$PREFIJO')."
    exit 1
    ;;
esac

current="$(git ls-remote --heads "https://github.com/$ORG/$REPO" "refs/heads/$PREFIJO*" 2>/dev/null \
  | awk '{print $2}' \
  | sed 's#^refs/heads/##')"

others="$(printf '%s\n' "$current" | grep -Fxv "$BRANCH" | grep -v '^$' || true)"

if [ -z "$others" ]; then
  log "OK: no hay otra rc del sitio. Se puede continuar con '$BRANCH'."
  exit 0
fi

log "ERROR: ya hay otra rc del sitio en curso:"
printf '%s\n' "$others" | sed 's/^/  - /'
log ""
log "Consolida esa rc (PR hacia 'main', merge y borrado de la rama) antes de"
log "iniciar '$BRANCH'. Solo puede haber una rc del sitio a la vez."
exit 1
