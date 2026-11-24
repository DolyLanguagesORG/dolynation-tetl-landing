# Seguridad

## Como reportar una vulnerabilidad

**No abras un issue público.** Reporta la vulnerabilidad de forma privada:

https://github.com/DolyLanguagesORG/dolynation-tetl-landing/security/advisories/new

El aviso llega a los mantenedores del proyecto, que lo confirman y lo
corregyen antes de que se publique.

## Que se espera de quien reporta

- Que describa como se reproduce (pasos, version, navegador).
- Que no lo difunda hasta que haya una correccion publicada.
- Que no acceda a datos de otros usuarios ni a los servidores de produccion.

## Que se espera del equipo

- Confirmar la recepcion del aviso.
- Corregirlo y publicar una release.
- Anotarlo en el changelog y en el apartado de bugs conocidos.

## Este repositorio

La landing es un **sitio estático**: no hay base de datos, ni API, ni
sesiones, ni pagos. Todo lo que se sirve es HTML, CSS y JavaScript publico.

Aun asi:

- **El repo es público**: nada de claves, ni tokens, ni `.env`. La CI usa
  secrets del ambiente, nunca valores escritos en los workflows.
- **El despliegue va por SSH al servidor**, con la clave del host fijada por
  fingerprint: si el host cambia, el despliegue se detiene.
- **Las imagenes se despliegan por SHA**: son inmutables y el rollback es
  exacto.
