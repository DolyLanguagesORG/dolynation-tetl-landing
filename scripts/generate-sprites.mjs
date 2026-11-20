/**
 * Doly sprite pipeline (basado en los 30 frames del GIF animado doly-walk-source.gif)
 * -----------------------------------------------------------------------------------
 * Entrada:
 *   - assets-src/doly-walk-source.gif (30 frames, 640x360)
 *   - assets-src/doly-book-reference.png
 *
 * Salida:
 *   1. public/sprites/doly-walk.webp  -> sprite sheet transparente de 30 frames (6x5, 360x260 c/u)
 *   2. public/sprites/doly-walk.json  -> manifest para el motor GSAP
 *   3. public/images/doly-book.webp   -> ilustración original recortada sin fondo (pose en el libro)
 *   4. assets-src/doly-walk-preview.png -> vista previa de verificación de los 30 frames
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GIF_SRC = path.join(root, 'assets-src', 'doly-walk-source.gif');
const REF = path.join(root, 'assets-src', 'doly-book-reference.png');
const OUT_SPRITES = path.join(root, 'public', 'sprites');
const OUT_IMAGES = path.join(root, 'public', 'images');

// Recorte constante en el espacio 640x360 del GIF para conservar el registro 1:1 original entre los 30 frames
const CROP = { left: 118, top: 72, width: 360, height: 260 };
const COLS = 6;

/**
 * Extrae a Doly eliminando el fondo oscuro del GIF (incluyendo el hueco entre las patas)
 * y suavizando los bordes de dithering de 1px propios del formato GIF.
 */
function extractCleanDogFromGifFrame(data, W, H) {
  const N = W * H;
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    lum[i] = (data[i * 3] + data[i * 3 + 1] + data[i * 3 + 2]) / 3;
  }

  // 1. Píxeles del pelaje (pelaje oscuro >= 25.5, pelaje blanco >= 180)
  const isFur = new Uint8Array(N);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (lum[i] >= 25.5) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (lum[(y + dy) * W + (x + dx)] >= 25) count++;
          }
        }
        if (count >= 4) isFur[i] = 1;
      }
    }
  }

  // 2. Distancia al pelaje (captura el contorno negro, nariz y pupila)
  const distToFur = new Uint8Array(N);
  distToFur.fill(255);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (isFur[i]) {
        distToFur[i] = 0;
        continue;
      }
      let best = 255;
      const R = 6;
      for (let dy = -R; dy <= R; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= H) continue;
        for (let dx = -R; dx <= R; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= W) continue;
          if (isFur[yy * W + xx]) {
            const d = Math.round(Math.hypot(dx, dy) * 2);
            if (d < best) best = d;
          }
        }
      }
      distToFur[i] = best;
    }
  }

  // 3. Máscara binaria del perro (pelaje + contorno negro)
  const mask = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const L = lum[i];
    const d = distToFur[i];
    if (d === 0 || (d <= 7 && L <= 12.2) || (d <= 11 && L <= 9.5)) {
      mask[i] = 1;
    }
  }

  // 4. Filtro morfológico de mayoría 3x3 para eliminar puntos de dithering del GIF en el borde exterior
  const cleanMask = new Uint8Array(N);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (mask[(y + dy) * W + (x + dx)]) n++;
        }
      }
      if (n >= 5) cleanMask[i] = 1;
    }
  }

  const out = Buffer.alloc(N * 4);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!cleanMask[i]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (cleanMask[(y + dy) * W + (x + dx)]) n++;
        }
      }
      const a = n >= 8 ? 255 : Math.round(((n - 3) / 5) * 255);
      out[i * 4] = data[i * 3];
      out[i * 4 + 1] = data[i * 3 + 1];
      out[i * 4 + 2] = data[i * 3 + 2];
      out[i * 4 + 3] = a;
    }
  }
  return out;
}

async function buildSpriteSheetFromGif() {
  const meta = await sharp(GIF_SRC, { animated: true }).metadata();
  const totalFrames = meta.pages || 30;
  const rows = Math.ceil(totalFrames / COLS);
  const sheetW = COLS * CROP.width;
  const sheetH = rows * CROP.height;

  const composites = [];

  for (let i = 0; i < totalFrames; i++) {
    const { data, info } = await sharp(GIF_SRC, { page: i })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const cleanRgba = extractCleanDogFromGifFrame(data, info.width, info.height);

    const cellBuf = await sharp(cleanRgba, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .extract(CROP)
      .png()
      .toBuffer();

    const col = i % COLS;
    const row = Math.floor(i / COLS);
    composites.push({
      input: cellBuf,
      left: col * CROP.width,
      top: row * CROP.height,
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

  await sheetBase
    .clone()
    .flatten({ background: '#1c1c1c' })
    .png()
    .toFile(path.join(root, 'assets-src', 'doly-walk-preview.png'));

  const manifest = {
    image: '/sprites/doly-walk.webp',
    frameW: CROP.width,
    frameH: CROP.height,
    cols: COLS,
    rows,
    designW: CROP.width,
    designH: CROP.height,
    groundY: 250,
    standingHeight: 240,
    strideUnits: 165,
    centerX: 185,
    ranges: {
      walk: { start: 0, count: totalFrames },
      settle: { start: 3, count: 1 },
    },
  };

  await writeFile(path.join(OUT_SPRITES, 'doly-walk.json'), JSON.stringify(manifest, null, 2));
  console.log('✔ sprite sheet de 30 frames generado desde el GIF:', manifest);
}

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

await buildSpriteSheetFromGif();
await buildCutout();
