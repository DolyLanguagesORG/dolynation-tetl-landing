# AGENTS.md — `dolynation-tetl-landing`

Instrucciones para agentes de código (Claude Code, Codex, OpenCode, Cursor, etc.)
que trabajen en este repositorio.

## Qué es este repositorio

La **landing pública** de DolyNation: el sitio que se ve en
`yacaterkos.tech` y en `www.yacaterkos.tech`. Es un proyecto **Astro**
(salida estática) con una escena 3D de scroll (Three.js + GSAP + Lenis).

No es la aplicación. La aplicación (backend + frontend) vive en
`dolynation-atl-back` y `dolynation-tonatiuh-front`, y se sirve en
`play.yacaterkos.tech`.

## Skills de este repo

Están en `.agents/skills/` y se cargan bajo demanda:

- **`astro-tailwind-v4`** — Astro 7 con Tailwind 4.
- **`threejs-monochrome-scene`** — la escena 3D.
- **`gsap-lenis-scrollytelling`** — el scroll y las animaciones.
- **`doly-character-animation`** — el personaje de Doly.

Cuando la tarea encaje con una skill, léela antes de actuar.

## Reglas rápidas

- Rama nueva desde `develop` (es la rama por defecto). **Nunca** push directo a
  `develop` ni a `main`: la protección de ramas lo rechaza.
- Antes de commitear: `npm run verify` (lint + typecheck).
- Commits en **Conventional Commits**, subject en **español**, un concern por commit.
- PR hacia `develop`, título conventional, **squash**, 1 aprobación.
- `Closes #N` en el cuerpo del PR (en su propia línea).

## El sitio

- **Astro con salida estática**: `npm run build` genera `dist/`. No hay
  servidor de aplicaciones: la imagen final es `nginx:alpine` sirviendo `dist/`.
- **Cero variables de entorno.** Al ser estático, una variable quedaría
  congelada en la imagen y la misma imagen no serviría bien en todos los
  ambientes. Si necesitas una URL, pídesela a quien mantiene la infraestructura:
  el enlace a la aplicación se resuelve en el proxy del servidor (`/app`).
- **El contenido vive en `src/data/landing.ts`**, no dentro de los componentes.

## Comandos

```sh
npm ci          # dependencias
npm run dev     # servidor de desarrollo (background: astro dev --background)
npm run lint    # eslint (JS, TS y .astro)
npm run typecheck # astro check (tipos + plantillas)
npm run verify  # lint + typecheck: lo que pide la CI
npm run build   # genera dist/
npm run sprites # regenera los sprites del personaje desde assets-src/
```

## Skills generales de la organización

El flujo de trabajo global, el anteproyecto y la documentación oficial viven en
el repo de docs:

- https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs
