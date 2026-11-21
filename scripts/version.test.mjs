#!/usr/bin/env node
// Test del versionado de la landing.
//
// Sin framework de tests, el test es un script que sale con codigo distinto
// de cero si algo no cuadra. Lo ejecuta el job `lint` de la CI.
//
// Que comprueba:
//
//   1. La version de `package.json` es un semver limpio (sin sufijo `-rc.1`).
//   2. `.release-please-manifest.json` dice lo mismo que `package.json`.
//      Si se separan, release-please parte de una version y el tag sale
//      con otro numero: el error aparece meses despues, en el changelog.
//   3. `release-please-config.json` apunta al `package.json` de este repo
//      y usa el mismo `package-name`.
//   4. El `CHANGELOG.md` existe.
//
// La convencion de versionado del proyecto esta en
// `dolynation-ehecatl-docs/conventions/versioning.md`.

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');

const leer = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

let fallos = 0;

function check(nombre, fn) {
  try {
    fn();
    console.log(`  OK    ${nombre}`);
  } catch (e) {
    fallos++;
    console.error(`  FALLA ${nombre}`);
    console.error(`        ${e.message}`);
  }
}

console.log('== versionado de la landing ==');

check('la version de package.json es un semver limpio', () => {
  const { version } = leer('package.json');
  assert.match(
    version,
    /^[0-9]+\.[0-9]+\.[0-9]+$/,
    `la version '${version}' no es X.Y.Z (sin sufijos: el sufijo va en la marca de la release, no en el numero)`
  );
});

check('el manifest de release-please coincide con package.json', () => {
  const pkg = leer('package.json');
  const manifest = leer('.release-please-manifest.json');
  assert.equal(
    manifest['.'],
    pkg.version,
    `el manifest dice ${manifest['.']} y package.json dice ${pkg.version}`
  );
});

check('la configuracion de release-please apunta a este repo', () => {
  const cfg = leer('release-please-config.json');
  const paquete = cfg.packages['.'];
  assert.equal(paquete['package-name'], 'dolynation-tetl-landing');
  assert.equal(paquete['release-type'], 'node');
  assert.equal(paquete['changelog-path'], 'CHANGELOG.md');

  const extra = (paquete['extra-files'] || []).find(
    (f) => f.path === 'package.json' && f.jsonpath === '$.version'
  );
  assert.ok(extra, 'falta el extra-file que sube la version de package.json');
});

check('el CHANGELOG.md existe', () => {
  assert.ok(existsSync(join(root, 'CHANGELOG.md')), 'falta CHANGELOG.md');
});

if (fallos > 0) {
  console.error(`\n${fallos} comprobacion(es) fallida(s).`);
  process.exit(1);
}
console.log('\nVersionado correcto.');
