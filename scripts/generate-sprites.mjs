/**
 * Doly sprite pipeline (100% basado en los 12 sprites SVG de caminata del usuario)
 * -------------------------------------------------------------------------------
 * Entrada:
 *   - assets-src/doly_caminando_sprites/d-c-01.svg .. d-c-12.svg
 *   - assets-src/doly-book-reference.png
 *
 * Salida (sin video ni GIF):
 *   1. public/sprites/doly-walk.webp  -> sprite sheet alineado y normalizado (12 frames)
 *   2. public/sprites/doly-walk.json  -> manifest (frameW, frameH, cols, rows, groundY, strideUnits)
 *   3. public/images/doly-book.webp   -> ilustración original recortada sin fondo (pose en el libro)
 *   4. assets-src/doly-walk-preview.png -> vista previa de verificación
 */
import sharp from 'sharp';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SPRITES_SRC_DIR = path.join(root, 'assets-src', 'doly_caminando_sprites');
const REF = path.join(root, 'assets-src', 'doly-book-reference.png');
const OUT_SPRITES = path.join(root, 'public', 'sprites');
const OUT_IMAGES = path.join(root, 'public', 'images');

// Dimensiones uniformes de cada celda en el sprite sheet
const CELL_W = 630;
const CELL_H = 440;
const TARGET_NOSE_X = 608; // ancla horizontal de la punta de la nariz (deja margen amplio para la cola)
const TARGET_GROUND_Y = 424; // línea de piso dentro del frame
const TARGET_HEAD_TO_BELLY = 262; // altura normalizada cabeza -> pecho/vientre
const COLS = 4;

/**
 * Limpia manchas grises aisladas fuera del contorno negro (ej. junto a la pata levantada en d-c-06)
 * y mide los puntos de anclaje anatómicos (headTopY, noseX, bellyY, groundY) del frame.
 */
async function processRawFrame(filePath) {
  const { data, info } = await sharp(filePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;

  // Limpieza de artefactos grises semitransparentes/residuales que no son ni blanco del pelaje ni negro del cuerpo
  // (En d-c-06 hay un pequeño resto de fondo gris claro bajo la pata delantera)
  const buf = Buffer.from(data);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = buf[i];
      const g = buf[i + 1];
      const b = buf[i + 2];
      const a = buf[i + 3];
      if (a === 0) continue;
      const lum = (r + g + b) / 3;
      // Si es un píxel gris medio aislado (lum entre 95 y 190) en la zona inferior de las patas,
      // verificamos si está desconectado de trazos blancos sólidos (lum > 220)
      if (y > H * 0.55 && lum > 95 && lum < 195) {
        let nearWhite = false;
        for (let dy = -3; dy <= 3 && !nearWhite; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = (yy * W + xx) * 4;
            if (buf[j + 3] > 200 && buf[j] > 215) {
              nearWhite = true;
              break;
            }
          }
        }
        if (!nearWhite) {
          buf[i + 3] = 0;
        }
      }
    }
  }

  // 1. Tope de la cabeza (corona) en la franja horizontal donde está el cráneo
  let headTopY = H;
  for (let y = 0; y < H; y++) {
    for (let x = Math.max(0, W - 230); x < W - 65; x++) {
      if (buf[(y * W + x) * 4 + 3] > 128 && y < headTopY) {
        headTopY = y;
      }
    }
  }

  // 2. Punta de la nariz (máximo X en la región de la cabeza)
  let noseX = 0;
  for (let y = headTopY; y < Math.min(H, headTopY + 150); y++) {
    for (let x = Math.max(0, W - 160); x < W; x++) {
      if (buf[(y * W + x) * 4 + 3] > 128 && x > noseX) {
        noseX = x;
      }
    }
  }

  // 3. Línea inferior del vientre/pecho a mitad del torso (noseX - 310)
  const torsoX = Math.max(0, Math.min(W - 1, noseX - 310));
  let bellyY = 0;
  for (let y = headTopY + 120; y < Math.min(H, headTopY + 305); y++) {
    if (buf[(y * W + torsoX) * 4 + 3] > 128) {
      bellyY = y;
    }
  }

  // 4. Contacto de la pata más baja con el suelo
  let groundY = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (buf[(y * W + x) * 4 + 3] > 128 && y > groundY) {
        groundY = y;
      }
    }
  }

  return { buf, W, H, headTopY, noseX, bellyY, groundY };
}

async function buildSpriteSheet() {
  const files = (await readdir(SPRITES_SRC_DIR)).filter((f) => f.toLowerCase().endsWith('.svg')).sort();
  if (files.length === 0) {
    throw new Error(`No se encontraron archivos SVG en ${SPRITES_SRC_DIR}`);
  }

  const totalFrames = files.length;
  const rows = Math.ceil(totalFrames / COLS);
  const sheetW = COLS * CELL_W;
  const sheetH = rows * CELL_H;

  const composites = [];

  for (let i = 0; i < totalFrames; i++) {
    const filePath = path.join(SPRITES_SRC_DIR, files[i]);
    const raw = await processRawFrame(filePath);

    // Factor de escala para normalizar el tamaño del cuerpo (cabeza -> vientre) entre los 12 frames
    const headToBelly = Math.max(1, raw.bellyY - raw.headTopY);
    const scale = TARGET_HEAD_TO_BELLY / headToBelly;

    const scaledW = Math.round(raw.W * scale);
    const scaledH = Math.round(raw.H * scale);

    const scaledNoseX = raw.noseX * scale;
    const scaledGroundY = raw.groundY * scale;
    const scaledBellyY = raw.bellyY * scale;

    // Alineamos horizontalmente por la nariz; verticalmente combinamos 75% línea de vientre
    // (con un ligero bobbing natural de caminata) + 25% contacto de pata con el piso para que
    // el tronco no salte y las patas apoyadas siempre toquen la línea del camino.
    const naturalBob = Math.sin((i / totalFrames) * Math.PI * 4) * 2.5;
    const targetBellyInCell = 278 + naturalBob;
    const dyByBelly = targetBellyInCell - scaledBellyY;
    const dyByGround = TARGET_GROUND_Y - scaledGroundY;
    const offsetY = Math.round(dyByBelly * 0.72 + dyByGround * 0.28);
    const offsetX = Math.round(TARGET_NOSE_X - scaledNoseX);

    const resizedPng = await sharp(raw.buf, { raw: { width: raw.W, height: raw.H, channels: 4 } })
      .resize(scaledW, scaledH, { kernel: 'lanczos3' })
      .png()
      .toBuffer();

    // Encapsulamos en una celda de CELL_W x CELL_H para evitar desbordes fuera de su casilla
    const cropLeft = Math.max(0, -offsetX);
    const cropTop = Math.max(0, -offsetY);
    const pasteLeft = Math.max(0, offsetX);
    const pasteTop = Math.max(0, offsetY);
    const extractW = Math.min(scaledW - cropLeft, CELL_W - pasteLeft);
    const extractH = Math.min(scaledH - cropTop, CELL_H - pasteTop);

    const clippedBuf = await sharp(resizedPng)
      .extract({ left: cropLeft, top: cropTop, width: extractW, height: extractH })
      .png()
      .toBuffer();

    const col = i % COLS;
    const row = Math.floor(i / COLS);
    composites.push({
      input: clippedBuf,
      left: col * CELL_W + pasteLeft,
      top: row * CELL_H + pasteTop,
    });
  }

  await mkdir(OUT_SPRITES, { recursive: true });

  const sheetBase = sharp({
    create: {
      width: sheetW,
      height: sheetH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite(composites);

  await sheetBase
    .clone()
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toFile(path.join(OUT_SPRITES, 'doly-walk.webp'));

  // Vista previa sobre fondo oscuro para inspección
  await sheetBase
    .clone()
    .flatten({ background: '#1c1c1c' })
    .png()
    .toFile(path.join(root, 'assets-src', 'doly-walk-preview.png'));

  const manifest = {
    image: '/sprites/doly-walk.webp',
    frameW: CELL_W,
    frameH: CELL_H,
    cols: COLS,
    rows,
    designW: CELL_W,
    designH: CELL_H,
    groundY: TARGET_GROUND_Y,
    standingHeight: 408,
    strideUnits: 340,
    centerX: 355,
    ranges: {
      walk: { start: 0, count: totalFrames },
      settle: { start: totalFrames - 1, count: 1 },
    },
  };

  await writeFile(path.join(OUT_SPRITES, 'doly-walk.json'), JSON.stringify(manifest, null, 2));
  console.log('✔ sprite sheet generado con los 12 sprites del usuario:', manifest);
}

// ---------------------------------------------------------------- recorte de la ilustración en el libro
async function buildCutout() {
  const crop = { left: 328, top: 167, width: 375, height: 321 };
  const UP = 2;
  const { data, info } = await sharp(REF)
    .extract(crop)
    .resize(crop.width * UP, crop.height * UP, { kernel: 'lanczos3' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const BG = 39;
  const lum = (i) => data[i * 3];

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
        a = Math.min(255, Math.round(((L - BG) / (255 - BG)) * 255));
        r = 255;
      } else {
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

await buildSpriteSheet();
await buildCutout();
