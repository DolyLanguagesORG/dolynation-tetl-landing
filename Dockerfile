# syntax=docker/dockerfile:1.7
# Imagen de la landing de DolyNation (Astro).
#
# La landing es un SITIO ESTATICO: Astro genera el HTML en el build y no hay
# nada que ejecutar en runtime. Por eso la imagen final no lleva Node: lleva
# nginx sirviendo `dist/`.
#
# El servidor NUNCA compila: la imagen se construye aqui, una vez, y el
# servidor solo descarga el artefacto. Si dos maquinas compilaran el mismo
# commit, no serian el mismo sitio.
#
# La imagen se etiqueta con el SHA del commit (inmutable) y con la version.
# El deploy baja una imagen ya construida; el SHA es lo que se despliega y lo
# que permite hacer rollback.
#
# Ver operations/FLUJO-DE-RELEASE.md en dolynation-ehecatl-docs.

# ─── Stage 1: deps ──────────────────────────────────────────────────
FROM node:22-alpine AS deps

WORKDIR /app

# Solo el lockfile: la capa de dependencias se cachea y no se rehace
# mientras el lock no cambie.
COPY package.json package-lock.json ./
RUN npm ci

# ─── Stage 2: build ─────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# La version y el commit los inyecta el build para que la landing diga que
# build es.
ARG GIT_COMMIT=unknown
ARG APP_VERSION=
ARG COMPONENT=dolynation-tetl-landing
ARG BUILT_AT=

ENV GIT_COMMIT=$GIT_COMMIT \
    APP_VERSION=$APP_VERSION \
    COMPONENT=$COMPONENT \
    BUILT_AT=$BUILT_AT \
    ASTRO_TELEMETRY_DISABLED=1

RUN npm run build

# ─── Stage 3: runner ────────────────────────────────────────────────
# nginx:alpine como servidor de archivos estaticos. La imagen final no
# tiene Node ni dependencias: son unos pocos MB.
FROM nginx:alpine AS runner

LABEL org.opencontainers.image.title="dolynation-tetl-landing" \
      org.opencontainers.image.description="Landing publica de DolyNation" \
      org.opencontainers.image.source="https://github.com/DolyLanguagesORG/dolynation-tetl-landing"

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx/landing.conf /etc/nginx/conf.d/default.conf

# El healthcheck no necesita curl: nginx:alpine trae wget (busybox).
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
