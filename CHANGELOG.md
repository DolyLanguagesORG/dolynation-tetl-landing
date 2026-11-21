# Changelog

Todas las novedades relevantes de este repositorio se registran aquí.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el
versionado es [SemVer](https://semver.org/lang/es/).

La **versión vive en `package.json`**: el tag de la release y el `CHANGELOG.md`
deben coincidir con ella. El versionado es automático: `release-please` mantiene
un PR de release contra `develop` que sube la versión y escribe esta sección; al
mergearlo se crean el tag anotado y la GitHub Release. Ver
[`conventions/versioning.md`](https://github.com/DolyLanguagesORG/dolynation-ehecatl-docs/blob/develop/conventions/versioning.md).

> **La versión de la landing es independiente de la de la aplicación.** La
> aplicación tiene `app_version` (el tren de release: backend + frontend); la
> landing tiene la suya (`site_version`). Se pueden publicar por separado: un
> retoque visual en la landing no obliga a subir la aplicación.

## [0.0.1](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/compare/v0.0.0...v0.0.1)

### Estado inicial

- Proyecto Astro con la escena 3D de scroll y el personaje de Doly.
