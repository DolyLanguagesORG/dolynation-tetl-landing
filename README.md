# `dolynation-tetl-landing`

La **landing pública** de DolyNation: el sitio que se ve en
`yacaterkos.tech` y en `www.yacaterkos.tech`.

Un proyecto **Astro** (salida estática) con una escena 3D de scroll
(Three.js + GSAP + Lenis) y el personaje de Doly animado.

> Esto **no** es la aplicación. La aplicación (backend + frontend) vive en
> `dolynation-atl-back` y `dolynation-tonatiuh-front` y se sirve en
> `play.yacaterkos.tech`.

## Qué hay dentro

| Ruta | Qué es |
| --- | --- |
| `src/data/landing.ts` | **El contenido** (textos, secciones). Todo lo editable está aquí. |
| `src/pages/index.astro` | La página (una sola). |
| `src/components/` | Los bloques visuales (hero, capítulos, escena 3D, CTA). |
| `src/layouts/` | El esqueleto HTML (`head`, metadatos, fuentes). |
| `src/scripts/` | La escena 3D y la coreografía (TypeScript). |
| `src/styles/global.css` | Los estilos globales y los tokens de Tailwind. |
| `public/` | Recursos que se sirven tal cual (sprites, imágenes, favicon). |
| `assets-src/` | Los **originales** de los sprites; los de `public/` se generan. |
| `nginx/landing.conf` | La configuración de nginx dentro del contenedor. |
| `scripts/` | Utilidades (sprites, test de versionado). |

## Desarrollo

```sh
npm ci
npm run dev          # servidor de desarrollo
npm run dev -- --host 0.0.0.0   # para verlo desde otra maquina
```

El servidor de desarrollo se puede arrancar en segundo plano:

```sh
astro dev --background
astro dev status
astro dev logs
astro dev stop
```

Antes de commitear:

```sh
npm run verify      # lint + typecheck (lo que exige la CI)
npm run build       # comprueba que el sitio compila
```

## Cómo se despliega

La landing se sirve como un **sitio estático** dentro de un contenedor
`nginx:alpine`:

```
develop ──PR + checks + 1 aprobación──► merge (squash)
      └──► release-please corta vX.Y.Z ──► tag + CHANGELOG + GitHub Release
                    └──► el manifiesto (versions.yml) apunta al SHA exacto
                          └──► deploy-site ──► contenedor de la landing
```

- La **imagen** se construye en GitHub Actions y se etiqueta con el **SHA**
  del commit (inmutable): el rollback es cambiar el SHA.
- El **ambiente de desarrollo** va dentro de la VPN: `devsite.yacaterkos.tech`.
- La landing **no comparte versión con la aplicación**: la de la aplicación es
  `app_version` y la de la landing es `site_version`. Se pueden publicar por
  separado.

Ver la convención completa en
[`conventions/versioning.md`](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/versioning.md)
y el flujo de releases en
[`operations/FLUJO-DE-RELEASE.md`](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/operations/FLUJO-DE-RELEASE.md).

## Convenciones del proyecto

- Rama de trabajo: `develop`. Producción: `main`. PR siempre a `develop`.
- Commits en **Conventional Commits**, en español, un concern por commit.
- PR: squash, 1 aprobación, `Closes #N` en su propia línea.
- Nada de secretos ni de `.env` en el repo (es público).

## Licencia

MIT. Ver [`LICENSE`](LICENSE).
