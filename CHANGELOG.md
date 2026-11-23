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

## [0.2.0](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/compare/v0.1.2...v0.2.0) (2026-11-23)


### Features

* **landing:** configura subdominios dolynation.app y enlaces por entorno ([#22](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/issues/22)) ([525b1f1](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/commit/525b1f1bd45ed8e8daf97cb81555139a0ba84d9f))

## [0.1.2](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/compare/v0.1.1...v0.1.2) (2026-11-21)


### Bug Fixes

* **landing:** las cabeceras de seguridad se perdian en cada location ([#20](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/issues/20)) ([78d4dbe](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/commit/78d4dbe35055c97e730cc0de1e5bc58d8df5f84f))
* **landing:** moderate Doly GIF animation speed to 13 FPS and condense copy ([#16](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/issues/16)) ([fbe7ee1](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/commit/fbe7ee152d76fa8e4de2dda27a7e5270dc18aafb))

## [0.1.1](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/compare/v0.1.0...v0.1.1) (2026-11-21)


### Bug Fixes

* **landing:** permitir el host de la VPN en el servidor de desarrollo ([#10](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/issues/10)) ([d5ee301](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/commit/d5ee301ff4919173acb70e7fa14a8d56a32141c7)), closes [#9](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/issues/9)

## [0.1.0](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/compare/v0.0.1...v0.1.0) (2026-11-21)


### Features

* add problem, what-is, why-choose, and features sections with fixed-speed section step choreography ([4659098](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/commit/4659098dddb19ab4fdb274321d3fe8400dd12aaf))
* animate Doly using 30-frame GIF walk sequence driven by GSAP ([0316de5](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/commit/0316de55b61f75f8521821e3fb2e25aea11279ff))
* enforce constant walking speed and fixed 24 FPS GIF playback via GSAP ticker ([6188c2c](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/commit/6188c2ce4c7df27e95644c18f18f495489538e44))
* implement 3D scrollytelling landing with Doly sprite canvas, book morph, and multilingual trail ([03dec4b](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/commit/03dec4b174af8414646ac53768d1000996f07c68))
* integrate complete 3-GIF sequence (walk, lie down on book, stand up) driven by GSAP ([244ec47](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/commit/244ec47f795e3b8f80d6238c787f9e2430f7c8d7))
* replace procedural dog with user's 12 custom walk SVG sprites ([1c882c3](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/commit/1c882c3f9aa5d900a5ce280fd343d436af2443aa))


### Bug Fixes

* make Doly walk continuously at invariant speed without section stops or leg slip ([c335824](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/commit/c3358243912f647c0c0ba4d7c9421234323ee80f))

## [0.0.1](https://github.com/DolyLanguagesORG/dolynation-tetl-landing/compare/v0.0.0...v0.0.1)

### Estado inicial

- Proyecto Astro con la escena 3D de scroll y el personaje de Doly.
