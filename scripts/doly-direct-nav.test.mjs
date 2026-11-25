#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { gsap } from 'gsap';

// DolyChoreography usa parameter properties e imports relativos sin extensión (.ts),
// por lo que Node requiere resolver `.ts` y transpilarlo antes de ejecutarlo en pruebas.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (err) {
      if (specifier.startsWith('.') && !specifier.endsWith('.ts') && !specifier.endsWith('.js')) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw err;
    }
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.ts')) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      });
      return { format: 'module', source: outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { DolyChoreography } = await import('../src/scripts/character/DolyChoreography.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'public', 'sprites', 'doly-walk.json'), 'utf8'));
const DESKTOP_METRICS = { width: 1280, groundY: 600, k: 1 };

const tickerCallbacks = new Set();
let fakeNow = 1000;
const originalAdd = gsap.ticker.add.bind(gsap.ticker);
const originalRemove = gsap.ticker.remove.bind(gsap.ticker);
const originalPerfNow = performance.now.bind(performance);

before(() => {
  gsap.ticker.add = (cb) => {
    tickerCallbacks.add(cb);
    return cb;
  };
  gsap.ticker.remove = (cb) => {
    tickerCallbacks.delete(cb);
    return cb;
  };
  performance.now = () => fakeNow;
});

after(() => {
  tickerCallbacks.clear();
  gsap.ticker.add = originalAdd;
  gsap.ticker.remove = originalRemove;
  performance.now = originalPerfNow;
});

function createChoreo(initialU = 0, metrics = DESKTOP_METRICS) {
  const frames = [];
  const choreo = new DolyChoreography(manifest, metrics, (out) => frames.push(out));
  if (initialU > 0) {
    choreo.snapToProgress(initialU);
    frames.length = 0;
  }
  return { choreo, frames };
}

function stepFrames(count, dtMs = 1000 / 60) {
  for (let i = 0; i < count; i++) {
    fakeNow += dtMs;
    for (const cb of [...tickerCallbacks]) {
      cb();
    }
  }
}

test('navegar de #problema (1) a #funcionalidades (4) cruza caminando sin subirse al libro', () => {
  const { choreo, frames } = createChoreo(0.2);
  try {
    choreo.navigateToSection(4);
    stepFrames(320);

    assert.ok(frames.length > 20);
    assert.ok(
      frames.every((f) => f.dog.bookA === null),
      'No debe renderizar bookA cuando cruza por acceso rapido de #problema a #funcionalidades',
    );
    assert.ok(
      frames.some((f) => f.dog.walk !== null && Math.abs(f.dogX - 640) < 120),
      'Debe caminar frente al libro en el centro del stage',
    );

    const last = frames[frames.length - 1];
    assert.ok(Math.abs(last.u - 0.8) < 1e-4);
    assert.equal(last.activeSection, 4);
    assert.ok(last.dog.sitA !== null);
  } finally {
    choreo.destroy();
  }
});

test('navegar de #funcionalidades (4) a #problema (1) gira limpio y cruza caminando hacia la izquierda', () => {
  const { choreo, frames } = createChoreo(0.8);
  try {
    choreo.navigateToSection(1);
    stepFrames(340);

    assert.ok(
      frames.every((f) => f.dog.bookA === null),
      'No debe subirse ni recostarse en el libro al volver de #funcionalidades a #problema',
    );
    assert.ok(
      frames.some((f) => f.dog.walk?.facing === -1 && Math.abs(f.dogX - 640) < 120),
      'Debe caminar mirando a la izquierda frente al libro',
    );

    const last = frames[frames.length - 1];
    assert.ok(Math.abs(last.u - 0.2) < 1e-4);
    assert.equal(last.activeSection, 1);
    assert.equal(last.dog.sitA?.facing, -1);
  } finally {
    choreo.destroy();
  }
});

test('Hero (0) <-> #funcionalidades (4) cruza sin pasar por el libro ni sentarse en paradas intermedias', () => {
  const { choreo, frames } = createChoreo(0);
  try {
    choreo.navigateToSection(4);
    stepFrames(360);

    assert.ok(frames.every((f) => f.dog.bookA === null));
    assert.ok(Math.abs(choreo.getProgress() - 0.8) < 1e-4);

    frames.length = 0;
    choreo.navigateToSection(0);
    stepFrames(380);

    assert.ok(frames.every((f) => f.dog.bookA === null));
    const end = frames[frames.length - 1];
    assert.ok(Math.abs(end.u - 0) < 1e-4);
    assert.equal(end.activeSection, 0);
  } finally {
    choreo.destroy();
  }
});

test('salir de #que-es (2) hacia #funcionalidades (4) baja directo sin recostarse en #por-que', () => {
  const { choreo, frames } = createChoreo(0.44);
  const lieFlatFrame = manifest.bookSeq.lieStart + 29;
  try {
    choreo.navigateToSection(4);
    stepFrames(280);

    assert.ok(
      !frames.some((f) => f.dog.bookA?.frame === lieFlatFrame),
      'No debe acostarse en lie[29] (#por-que) al salir directo de #que-es a #funcionalidades',
    );
    assert.ok(
      frames.some((f) => f.dog.walk !== null && f.dogX > 700),
      'Debe continuar caminando en el tramo derecho hasta #funcionalidades',
    );

    const last = frames[frames.length - 1];
    assert.ok(Math.abs(last.u - 0.8) < 1e-4);
    assert.equal(last.activeSection, 4);
    assert.ok(last.dog.sitA !== null);
  } finally {
    choreo.destroy();
  }
});

test('navegar a #que-es (2) y #por-que (3) conserva la subida y poses sobre el libro', () => {
  const { choreo, frames } = createChoreo(0.2);
  try {
    choreo.navigateToSection(2);
    stepFrames(260);
    let last = frames[frames.length - 1];
    assert.ok(Math.abs(last.u - 0.44) < 1e-4);
    assert.equal(last.activeSection, 2);
    assert.ok(last.dog.bookA !== null, 'Debe subir y sentarse sobre el libro en #que-es');

    frames.length = 0;
    choreo.navigateToSection(3);
    stepFrames(160);
    last = frames[frames.length - 1];
    assert.ok(Math.abs(last.u - 0.53) < 1e-4);
    assert.equal(last.activeSection, 3);
    assert.equal(last.dog.bookA?.frame, manifest.bookSeq.lieStart + 29);
  } finally {
    choreo.destroy();
  }
});

test('interrumpir el cruce directo con scroll manual mantiene a Doly en el suelo sin teletransportarse al libro', () => {
  const { choreo, frames } = createChoreo(0.2);
  try {
    choreo.navigateToSection(4);
    for (let i = 0; i < 120; i++) {
      stepFrames(1);
      if (choreo.getProgress() >= 0.48) break;
    }
    assert.ok(choreo.getProgress() >= 0.44 && choreo.getProgress() < 0.65);

    frames.length = 0;
    for (let i = 0; i < 240; i++) {
      if (choreo.getProgress() < 0.8 && !choreo.isLockedAtCheckpoint()) {
        choreo.pushScrollInput(120, 'wheel');
      }
      stepFrames(1);
      if (Math.abs(choreo.getProgress() - 0.8) < 0.002 && frames.at(-1)?.dog.sitA !== null) break;
    }

    assert.ok(
      frames.every((f) => f.dog.bookA === null),
      'Tras interrumpir frente al libro, Doly debe permanecer sobre el suelo hasta reintegrarse en 0.74',
    );
    const last = frames[frames.length - 1];
    assert.ok(Math.abs(last.u - 0.8) < 1e-3);
    assert.ok(last.dog.sitA !== null);
  } finally {
    choreo.destroy();
  }
});

test('pulsar #que-es (2) a mitad de un cruce directo dirige al borde del libro y sube suavemente', () => {
  const { choreo, frames } = createChoreo(0.2);
  try {
    choreo.navigateToSection(4);
    for (let i = 0; i < 120; i++) {
      stepFrames(1);
      if (choreo.getProgress() >= 0.46) break;
    }
    assert.ok(choreo.getProgress() > 0.34 && choreo.getProgress() < 0.65);

    frames.length = 0;
    choreo.navigateToSection(2);
    stepFrames(280);

    const last = frames[frames.length - 1];
    assert.ok(Math.abs(last.u - 0.44) < 1e-4);
    assert.equal(last.activeSection, 2);
    assert.ok(last.dog.bookA !== null);
  } finally {
    choreo.destroy();
  }
});

test('frozen / prefers-reduced-motion y doble clic en sitDown responden de forma determinista', () => {
  const { choreo, frames } = createChoreo(0.2);
  try {
    choreo.setFrozen(true);
    frames.length = 0;
    choreo.navigateToSection(4);
    assert.ok(Math.abs(choreo.getProgress() - 0.8) < 1e-4);
    stepFrames(30);
    assert.ok(Math.abs(choreo.getProgress() - 0.8) < 1e-4);

    choreo.setFrozen(false);
    choreo.snapToProgress(0.2);
    choreo.navigateToSection(4);
    // Avanza hasta entrar en sitDown cerca de u >= 0.75
    for (let i = 0; i < 200; i++) {
      stepFrames(1);
      if (choreo.getProgress() >= 0.755) break;
    }
    const uBeforeDoubleClick = choreo.getProgress();
    frames.length = 0;
    choreo.navigateToSection(4);
    stepFrames(40);
    assert.ok(
      frames.every((f) => f.u >= uBeforeDoubleClick - 1e-5),
      'Volver a pulsar la misma seccion mientras se sienta no debe reiniciar un levantamiento',
    );
    assert.ok(Math.abs(choreo.getProgress() - 0.8) < 1e-4);
  } finally {
    choreo.destroy();
  }
});

test('el scroll manual normal mantiene paradas en los checkpoints y subida al libro', () => {
  const { choreo, frames } = createChoreo(0);
  try {
    let seenCp1 = false;
    let seenCp2 = false;
    for (let step = 0; step < 500; step++) {
      if (!choreo.isLockedAtCheckpoint()) {
        choreo.pushScrollInput(120, 'wheel');
      }
      stepFrames(1);
      if (Math.abs(choreo.getProgress() - 0.2) < 1e-4 && choreo.isLockedAtCheckpoint()) seenCp1 = true;
      if (Math.abs(choreo.getProgress() - 0.44) < 1e-4 && choreo.isLockedAtCheckpoint()) {
        seenCp2 = true;
        break;
      }
    }

    assert.ok(seenCp1, 'El scroll manual debe detenerse en #problema (0.2)');
    assert.ok(seenCp2, 'El scroll manual debe detenerse en #que-es (0.44)');
    assert.ok(frames.at(-1)?.dog.bookA !== null, 'En 0.44 por scroll manual Doly debe estar en el libro');
  } finally {
    choreo.destroy();
  }
});
