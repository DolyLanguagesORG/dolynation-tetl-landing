/**
 * Doly sprite pipeline
 * ---------------------------------------------------------------
 * Genera (sin video ni GIF):
 *   1. public/sprites/doly-walk.webp  -> sprite sheet (ciclo de caminata + transición a recostarse)
 *   2. public/sprites/doly-walk.json  -> manifest (tamaño de frame, grid, rangos, zancada)
 *   3. public/images/doly-book.webp   -> ilustración original recortada sin fondo (pose final sobre el libro)
 *
 * Uso:  npm run sprites
 *
 * El perro se dibuja en SVG con cinemática inversa (IK) de 2 segmentos por pata, en el mismo
 * estilo blanco/negro de la ilustración de referencia. Si en el futuro un ilustrador entrega un
 * sprite sheet dibujado a mano, basta con respetar el mismo manifest (frameW/frameH/cols/rows/rangos).
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REF = path.join(root, 'assets-src', 'doly-book-reference.png');
const OUT_SPRITES = path.join(root, 'public', 'sprites');
const OUT_IMAGES = path.join(root, 'public', 'images');

// ---------------------------------------------------------------- constantes del sprite
const FW = 360; // ancho de frame (unidades SVG)
const FH = 270; // alto de frame
const GROUND = 255; // línea de piso dentro del frame
const WALK_FRAMES = 12;
const SETTLE_FRAMES = 8;
const COLS = 5;
const TOTAL = WALK_FRAMES + SETTLE_FRAMES;
const ROWS = Math.ceil(TOTAL / COLS);
const SCALE = 1.6; // resolución de salida (retina)

const STANCE = 0.6; // fracción del ciclo con la pata apoyada
const STRIDE_A = 26; // media zancada (unidades)
const STRIDE_UNITS = (2 * STRIDE_A) / STANCE; // avance del cuerpo por ciclo completo

const INK = '#050505';
const PAPER = '#f4f4f2';
const FAR_PAPER = '#a3a3a3';

const L1 = 40; // segmento superior de la pata
const L2 = 40; // segmento inferior

const rad = (d) => (d * Math.PI) / 180;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** IK de dos segmentos. bend: +1 rodilla hacia adelante, -1 hacia atrás */
function ik(hx, hy, fx, fy, bend) {
  let dx = fx - hx;
  let dy = fy - hy;
  let d = Math.hypot(dx, dy);
  const max = L1 + L2 - 0.5;
  if (d > max) {
    fx = hx + (dx / d) * max;
    fy = hy + (dy / d) * max;
    dx = fx - hx;
    dy = fy - hy;
    d = max;
  }
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const mx = hx + (dx * a) / d;
  const my = hy + (dy * a) / d;
  // perpendicular
  const px = -dy / d;
  const py = dx / d;
  // elegimos el lado según bend (x positivo = adelante)
  let kx = mx + px * h;
  let ky = my + py * h;
  if (Math.sign(kx - mx) !== Math.sign(bend) && h > 0.01) {
    kx = mx - px * h;
    ky = my - py * h;
  }
  return { kx, ky, fx, fy };
}

function leg({ hx, hy, fx, fy, bend, near }) {
  const { kx, ky, fx: ex, fy: ey } = ik(hx, hy, fx, fy, bend);
  const upper = near ? 19 : 17;
  const lower = near ? 14 : 13;
  const outline = near ? `<path d="M${hx},${hy} L${kx},${ky} L${ex},${ey}" stroke="#3a3a3a" stroke-width="${upper + 2.5}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` : '';
  const paw = near ? PAPER : FAR_PAPER;
  return `
    <g>
      ${outline}
      <line x1="${hx}" y1="${hy}" x2="${kx}" y2="${ky}" stroke="${INK}" stroke-width="${upper}" stroke-linecap="round"/>
      <line x1="${kx}" y1="${ky}" x2="${ex}" y2="${ey}" stroke="${INK}" stroke-width="${lower}" stroke-linecap="round"/>
      <ellipse cx="${ex + 4}" cy="${ey - 3}" rx="12.5" ry="7" fill="${paw}" stroke="${INK}" stroke-width="2"/>
      <path d="M${ex + 4},${ey - 7} v6 M${ex + 9},${ey - 6.5} v5" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
    </g>`;
}

/**
 * Dibuja un frame del perro de perfil (mirando a la derecha).
 * pose: { bodyY, headY, headRot, tailRot, legs:[{hx,hy,fx,fy,bend,near}], earSwing }
 */
function dogSVG(pose) {
  const { bodyY, headY, headRot, tailRot, legs, earSwing, crouch } = pose;
  const far = legs.filter((l) => !l.near).map(leg).join('');
  const near = legs.filter((l) => l.near).map(leg).join('');
  return `
  <g transform="translate(0, ${bodyY})">
    <!-- patas lejanas -->
    <g transform="translate(0, ${-bodyY})">${far}</g>

    <!-- cola -->
    <g transform="rotate(${tailRot} 96 138)">
      <path d="M96,138 C82,128 70,112 63,95 C60,88 67,85 71,91 C79,106 89,121 103,131 Z" fill="${INK}"/>
      <path d="M66,93 C64,90 66,87 69,89 C70,91 70,93 68,95 Z" fill="${PAPER}"/>
    </g>

    <!-- cuerpo -->
    <path d="M92,140 C100,116 150,111 200,117 C226,120 242,128 250,142
             C258,166 248,${193 - crouch} 230,${197 - crouch} C200,${202 - crouch} 170,${196 - crouch} 140,${198 - crouch}
             C114,${200 - crouch} 94,${192 - crouch} 87,176 C83,162 85,150 92,140 Z" fill="${INK}"/>
    <!-- muslo trasero (volumen) -->
    <ellipse cx="112" cy="${164 - crouch * 0.4}" rx="29" ry="${30 - crouch * 0.25}" fill="${INK}"/>
    <!-- brillo de lomo -->
    <path d="M118,121 C150,114 186,114 212,121" stroke="#3a3a3a" stroke-width="2" fill="none" stroke-linecap="round"/>

    <!-- cuello -->
    <path d="M226,126 L258,92 L286,120 L262,162 Z" fill="${INK}"/>

    <!-- pechera blanca -->
    <path d="M266,136 C272,152 266,172 254,192 L249,184 L243,195 L237,186 L231,192
             C236,172 244,152 252,138 Z" fill="${PAPER}"/>

    <!-- cabeza -->
    <g transform="translate(0, ${headY - bodyY}) rotate(${headRot} 262 110) translate(262 118) scale(1.24) translate(-262 -118)">
      <!-- cráneo -->
      <ellipse cx="262" cy="100" rx="35" ry="31" fill="${INK}"/>
      <!-- hocico -->
      <path d="M272,93 C292,89 312,97 320,108 C325,118 318,129 305,132 C290,135 277,133 266,126 Z" fill="${PAPER}" stroke="${INK}" stroke-width="2.5"/>
      <!-- franja blanca de la frente -->
      <path d="M249,70 C262,72 276,80 286,93" stroke="${PAPER}" stroke-width="5" fill="none" stroke-linecap="round"/>
      <!-- nariz -->
      <ellipse cx="317" cy="108" rx="7.5" ry="6.2" fill="${INK}"/>
      <circle cx="319" cy="106" r="1.6" fill="#8a8a8a"/>
      <!-- boca -->
      <path d="M314,118 C306,124 296,125 287,121" stroke="${INK}" stroke-width="2.2" fill="none" stroke-linecap="round"/>
      <!-- ojo -->
      <ellipse cx="275" cy="96" rx="6.5" ry="5.4" fill="${PAPER}"/>
      <circle cx="277" cy="96" r="3.4" fill="${INK}"/>
      <circle cx="278.2" cy="94.8" r="1.1" fill="${PAPER}"/>
      <path d="M268,88 C272,85 278,85 282,88" stroke="${PAPER}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
      <!-- oreja caída -->
      <g transform="rotate(${earSwing} 252 80)">
        <path d="M252,76 C234,78 224,98 226,121 C228,140 237,148 246,143 C254,137 256,110 260,86 Z" fill="${INK}" stroke="#2a2a2a" stroke-width="1.5"/>
        <path d="M236,94 C231,107 232,126 239,138" stroke="${PAPER}" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      </g>
    </g>

    <!-- patas cercanas -->
    <g transform="translate(0, ${-bodyY})">${near}</g>
  </g>`;
}

// ---------------------------------------------------------------- poses
const HIND_X = 112;
const FRONT_X = 226;
const HIP_Y = 172;

function walkPose(t) {
  // secuencia lateral: trasera-izq 0, delantera-izq .25, trasera-der .5, delantera-der .75
  const legsDef = [
    { base: HIND_X - 6, phase: 0.0, bend: -1, near: false },
    { base: FRONT_X - 6, phase: 0.25, bend: 1, near: false },
    { base: HIND_X + 4, phase: 0.5, bend: -1, near: true },
    { base: FRONT_X + 4, phase: 0.75, bend: 1, near: true },
  ];
  const bob = 2.2 * Math.sin(4 * Math.PI * t);
  const legs = legsDef.map((l) => {
    const s = (t + l.phase) % 1;
    let off;
    let lift = 0;
    if (s < STANCE) {
      const u = s / STANCE;
      off = lerp(STRIDE_A, -STRIDE_A, u);
    } else {
      const u = (s - STANCE) / (1 - STANCE);
      off = lerp(-STRIDE_A, STRIDE_A, ease(u));
      lift = Math.sin(Math.PI * u) * 13;
    }
    return { hx: l.base, hy: HIP_Y + bob, fx: l.base + off, fy: GROUND - lift, bend: l.bend, near: l.near };
  });
  return {
    bodyY: bob,
    headY: bob * 0.6 + 1.5 * Math.sin(4 * Math.PI * t + 0.8),
    headRot: 1.5 * Math.sin(4 * Math.PI * t + 0.5),
    tailRot: 14 * Math.sin(2 * Math.PI * t),
    earSwing: 4 * Math.sin(4 * Math.PI * t + 1.2),
    crouch: 0,
    legs,
  };
}

function settlePose(u) {
  // u: 0 (de pie, neutro) -> 1 (recostada de perfil)
  const e = ease(u);
  const drop = 40 * e;
  const legs = [
    // trasera lejana / cercana: se pliegan hacia adelante debajo del cuerpo
    { hx: HIND_X - 6, hy: HIP_Y + drop, fx: lerp(HIND_X - 6, HIND_X + 30, e), fy: GROUND, bend: 1, near: false },
    { hx: HIND_X + 4, hy: HIP_Y + drop, fx: lerp(HIND_X + 4, HIND_X + 40, e), fy: GROUND, bend: 1, near: true },
    // delanteras: se estiran hacia adelante sobre el piso
    { hx: FRONT_X - 6, hy: HIP_Y + drop, fx: lerp(FRONT_X - 6, FRONT_X + 52, e), fy: GROUND - 1, bend: e > 0.5 ? -1 : 1, near: false },
    { hx: FRONT_X + 4, hy: HIP_Y + drop, fx: lerp(FRONT_X + 4, FRONT_X + 64, e), fy: GROUND, bend: e > 0.5 ? -1 : 1, near: true },
  ];
  return {
    bodyY: drop,
    headY: drop * 0.62,
    headRot: -4 * e,
    tailRot: lerp(0, 38, e),
    earSwing: 0,
    crouch: 6 * e,
    legs,
  };
}

// ---------------------------------------------------------------- sprite sheet
async function buildSprite() {
  const frames = [];
  for (let i = 0; i < WALK_FRAMES; i++) frames.push(walkPose(i / WALK_FRAMES));
  for (let i = 0; i < SETTLE_FRAMES; i++) frames.push(settlePose(i / (SETTLE_FRAMES - 1)));

  const W = COLS * FW;
  const H = ROWS * FH;
  const body = frames
    .map((pose, i) => {
      const cx = (i % COLS) * FW;
      const cy = Math.floor(i / COLS) * FH;
      return `<g transform="translate(${cx},${cy})"><svg x="0" y="0" width="${FW}" height="${FH}" viewBox="0 0 ${FW} ${FH}" overflow="hidden">${dogSVG(pose)}</svg></g>`;
    })
    .join('\n');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${body}</svg>`;

  await mkdir(OUT_SPRITES, { recursive: true });
  const outW = Math.round(W * SCALE);
  await sharp(Buffer.from(svg), { density: 72 * SCALE })
    .resize(outW)
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toFile(path.join(OUT_SPRITES, 'doly-walk.webp'));

  const manifest = {
    image: '/sprites/doly-walk.webp',
    frameW: Math.round(FW * SCALE),
    frameH: Math.round(FH * SCALE),
    cols: COLS,
    rows: ROWS,
    /** unidades de diseño del frame (para calcular escala en pantalla) */
    designW: FW,
    designH: FH,
    groundY: GROUND,
    /** altura del perro de pie (oreja a pata) en unidades de diseño */
    standingHeight: GROUND - 65,
    /** desplazamiento del cuerpo por ciclo completo de caminata, en unidades de diseño */
    strideUnits: STRIDE_UNITS,
    /** x del centro del cuerpo dentro del frame */
    centerX: 190,
    ranges: {
      walk: { start: 0, count: WALK_FRAMES },
      settle: { start: WALK_FRAMES, count: SETTLE_FRAMES },
    },
  };
  await writeFile(path.join(OUT_SPRITES, 'doly-walk.json'), JSON.stringify(manifest, null, 2));
  // también guardamos una vista previa para revisión
  await sharp(Buffer.from(svg), { density: 72 })
    .flatten({ background: '#1f1f1f' })
    .png()
    .toFile(path.join(root, 'assets-src', 'doly-walk-preview.png'));
  console.log('✔ sprite sheet', `${outW}px`, manifest);
}

// ---------------------------------------------------------------- recorte de la ilustración
async function buildCutout() {
  // bbox detectado en la referencia (1024x645) + margen
  const crop = { left: 328, top: 167, width: 375, height: 321 };
  const UP = 2; // re-escalado para pantallas retina
  const { data, info } = await sharp(REF)
    .extract(crop)
    .resize(crop.width * UP, crop.height * UP, { kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const BG = 39;
  const lum = (i) => data[i * 3];

  // 1) flood fill del exterior (pixeles ~ fondo conectados al borde)
  const exterior = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const i = stack.pop();
    if (exterior[i]) continue;
    if (Math.abs(lum(i) - BG) > 5) continue;
    exterior[i] = 1;
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - W);
    if (y < H - 1) stack.push(i + W);
  }

  // 2) distancia al exterior (para des-mezclar solo los bordes)
  const nearExt = new Uint8Array(W * H);
  const R = 3;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (exterior[i]) continue;
      let near = 0;
      for (let dy = -R; dy <= R && !near; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          if (exterior[yy * W + xx]) {
            near = 1;
            break;
          }
        }
      nearExt[i] = near;
    }

  const out = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const L = lum(i);
    let r = L;
    let a = 255;
    if (exterior[i]) {
      a = 0;
    } else if (nearExt[i]) {
      if (L >= BG) {
        // mezcla blanco + fondo
        a = Math.min(255, Math.round(((L - BG) / (255 - BG)) * 255));
        r = 255;
      } else {
        // mezcla negro + fondo
        a = Math.min(255, Math.round(((BG - L) / BG) * 255 * 1.25));
        r = 0;
      }
    }
    out[i * 4] = r;
    out[i * 4 + 1] = r;
    out[i * 4 + 2] = r;
    out[i * 4 + 3] = a;
  }
  await mkdir(OUT_IMAGES, { recursive: true });
  await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(path.join(OUT_IMAGES, 'doly-book.webp'));
  console.log('✔ cutout', W, H);
}

await buildSprite();
await buildCutout();
