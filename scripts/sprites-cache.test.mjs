#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSpriteManifestUrl, resolveSpriteAssetUrl } from '../src/lib/spriteUrls.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function sha256Short(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex').slice(0, 10);
}

test('resolveSpriteAssetUrl conserva ?v= por asset y usa manifestVersion como respaldo', () => {
  assert.equal(
    resolveSpriteAssetUrl('/sprites/doly-walk.webp?v=30dded8f1b', 'e4e9392d6a'),
    '/sprites/doly-walk.webp?v=30dded8f1b',
  );
  assert.equal(
    resolveSpriteAssetUrl('/sprites/doly-walk.webp', 'e4e9392d6a'),
    '/sprites/doly-walk.webp?v=e4e9392d6a',
  );
  assert.equal(
    resolveSpriteAssetUrl('/sprites/doly-walk.webp?foo=1#frag', 'e4e9392d6a'),
    '/sprites/doly-walk.webp?foo=1&v=e4e9392d6a#frag',
  );
  assert.equal(resolveSpriteAssetUrl('/sprites/doly-walk.webp', ''), '/sprites/doly-walk.webp');
});

test('buildSpriteManifestUrl agrega ?v= sin duplicar parametro existente', () => {
  assert.equal(
    buildSpriteManifestUrl('/sprites/doly-walk.json', 'e4e9392d6a'),
    '/sprites/doly-walk.json?v=e4e9392d6a',
  );
  assert.equal(
    buildSpriteManifestUrl('/sprites/doly-walk.json?v=custom', 'e4e9392d6a'),
    '/sprites/doly-walk.json?v=custom',
  );
  assert.equal(buildSpriteManifestUrl('/sprites/doly-walk.json'), '/sprites/doly-walk.json');
});

test('doly-walk.json incluye hashes SHA-256 sincronizados con los binarios .webp actuales', () => {
  const manifestPath = path.join(root, 'public', 'sprites', 'doly-walk.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

  const walkHash = sha256Short(path.join(root, 'public', 'sprites', 'doly-walk.webp'));
  const sitHash = sha256Short(path.join(root, 'public', 'sprites', 'doly-sit-ground.webp'));
  const bookHash = sha256Short(path.join(root, 'public', 'sprites', 'doly-book-seq.webp'));
  const expectedVersion = createHash('sha256')
    .update(`${walkHash}:${sitHash}:${bookHash}`)
    .digest('hex')
    .slice(0, 10);

  assert.equal(manifest.image, `/sprites/doly-walk.webp?v=${walkHash}`);
  assert.equal(manifest.sitSeq.image, `/sprites/doly-sit-ground.webp?v=${sitHash}`);
  assert.equal(manifest.bookSeq.image, `/sprites/doly-book-seq.webp?v=${bookHash}`);
  assert.equal(manifest.version, expectedVersion);
});

test('Layout.astro y MasterTimeline.ts propagan la version del manifiesto en precarga y fetch', () => {
  const layoutSource = readFileSync(path.join(root, 'src', 'layouts', 'Layout.astro'), 'utf8');
  assert.match(layoutSource, /public\/sprites\/doly-walk\.json/);
  assert.match(layoutSource, /meta name="doly-sprites-version"/);
  assert.match(layoutSource, /resolveSpriteAssetUrl\(/);

  const timelineSource = readFileSync(path.join(root, 'src', 'scripts', 'timeline', 'MasterTimeline.ts'), 'utf8');
  assert.match(timelineSource, /doly-sprites-version/);
  assert.match(timelineSource, /buildSpriteManifestUrl\(/);
});

test('nginx/landing.conf inmutabiliza /sprites/*.webp con ?v= antes de la regla general de imagenes', () => {
  const nginxConf = readFileSync(path.join(root, 'nginx', 'landing.conf'), 'utf8');
  assert.match(nginxConf, /map "\$uri:\$arg_v" \$sprites_cache_control/);
  assert.match(nginxConf, /"~\^\/sprites\/\.\+\\\.webp:\.\+\$" "public, max-age=31536000, immutable"/);
  assert.match(nginxConf, /default\s+"no-cache, must-revalidate"/);

  const spritesLocIdx = nginxConf.indexOf('location ^~ /sprites/');
  const genericMediaIdx = nginxConf.indexOf('location ~* \\.(?:png|jpg|jpeg|gif|webp');
  assert.ok(spritesLocIdx !== -1, 'Debe existir location ^~ /sprites/');
  assert.ok(genericMediaIdx !== -1, 'Debe existir location general de imagenes');
  assert.ok(spritesLocIdx < genericMediaIdx, '^~ /sprites/ debe evaluarse antes de la regla general de 30d');
  assert.match(nginxConf, /add_header Cache-Control \$sprites_cache_control always;/);
});
