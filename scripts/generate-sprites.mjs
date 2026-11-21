/**
 * Doly complete GIF pipeline (Walk + Lie-Down on Book + Stand-Up from Book)
 * -------------------------------------------------------------------------
 * Fuentes:
 *   1. assets-src/doly-walk-source.gif       (30 frames, caminata)
 *   2. assets-src/doly-lie-down-source.gif   (30 frames, llega al libro y se recuesta)
 *   3. assets-src/doly-stand-up-source.gif   (30 frames, se levanta del libro y sale caminando)
 *
 * Salidas:
 *   - public/sprites/doly-walk.webp      (30 frames de caminata sin fondo, 6x5 de 360x260)
 *   - public/sprites/doly-book-seq.webp  (61 frames estabilizados: 30 lie + 30 stand + 1 libro vacío, 6x11 de 680x320)
 *   - public/sprites/doly-walk.json      (manifest unificado para GSAP + Canvas)
 *   - assets-src/doly-book-seq-preview.png (vista previa de verificación)
 */
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WALK_GIF = path.join(root, 'assets-src', 'doly-walk-source.gif');
const LIE_GIF = path.join(root, 'assets-src', 'doly-lie-down-source.gif');
const STAND_GIF = path.join(root, 'assets-src', 'doly-stand-up-source.gif');
const OUT_SPRITES = path.join(root, 'public', 'sprites');

const WALK_CROP = { left: 118, top: 72, width: 360, height: 260 };
const WALK_COLS = 6;

const BOOK_CELL_W = 680;
const BOOK_CELL_H = 320;
const BOOK_COLS = 6;
const LIE_SPINE_X = 375;
const STAND_SPINE_X = 190;
const BOOK_GROUND_Y = 304;
const TARGET_HALF_PAGE_W = 158;

/**
 * Elimina el fondo oscuro exterior (incluyendo el hueco entre las patas) mediante
 * flood-fill desde los bordes con barrera morfológica sobre el contorno negro,
 * conservando intactas todas las áreas oscuras internas (cuello bajo el mentón, nariz, ojos, lomo del libro).
 */
function cleanGifFrame(data, W, H) {
  const N = W * H;
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    lum[i] = (data[i * 3] + data[i * 3 + 1] + data[i * 3 + 2]) / 3;
  }

  // 1. Píxeles interiores de pelaje / páginas / portada del libro (lum >= 25.5)
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

  // 2. Distancia en medios píxeles al píxel de pelaje/libro más cercano (hasta 5px)
  const dist = new Uint8Array(N);
  dist.fill(255);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (isFur[i]) {
        dist[i] = 0;
        continue;
      }
      let best = 255;
      const R = 5;
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
      dist[i] = best;
    }
  }

  // 3. Barrera sólida del personaje + libro (pelaje + contorno negro adyacente)
  const barrier = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const L = lum[i];
    const d = dist[i];
    if (d === 0 || (d <= 6 && L <= 12.5) || (d <= 9 && L <= 9.5)) {
      barrier[i] = 1;
    }
  }

  // 4. Flood-fill desde los 4 bordes del lienzo (atraviesa la sombra del suelo entre las patas,
  // pero nunca entra en zonas cerradas como el cuello bajo el mentón o los ojos)
  const exterior = new Uint8Array(N);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  while (stack.length) {
    const i = stack.pop();
    if (exterior[i] || barrier[i]) continue;
    exterior[i] = 1;
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < W - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - W);
    if (y < H - 1) stack.push(i + W);
  }

  // 5. Filtro de mayoría 3x3 para limpiar puntos de dithering de 1px en el contorno exterior
  const fg = new Uint8Array(N);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (exterior[i]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!exterior[(y + dy) * W + (x + dx)]) n++;
        }
      }
      if (n >= 5) fg[i] = 1;
    }
  }

  const out = Buffer.alloc(N * 4);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!fg[i]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (fg[(y + dy) * W + (x + dx)]) n++;
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

/** Detecta el lomo (spineX), ancho de media página (halfPageW) y base del libro (bookBottomY) en LIE */
function detectLieBook(data, W, H) {
  let pageMaxX = 0;
  for (let y = 252; y <= 305; y++) {
    for (let x = 200; x < W; x++) {
      const i = (y * W + x) * 3;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum > 200 && x > pageMaxX) pageMaxX = x;
    }
  }
  let bestSpineX = Math.round(pageMaxX - 160);
  let minColLum = 1e9;
  for (let x = pageMaxX - 175; x <= pageMaxX - 145; x++) {
    let sum = 0;
    for (let y = 255; y <= 302; y++) {
      const i = (y * W + x) * 3;
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    if (sum < minColLum) {
      minColLum = sum;
      bestSpineX = x;
    }
  }
  const halfPageW = pageMaxX - bestSpineX;
  let bookBottomY = 326;
  const probeX = Math.min(W - 10, bestSpineX + 60);
  for (let y = 295; y < H - 5; y++) {
    const i = (y * W + probeX) * 3;
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (lum > 26) bookBottomY = y;
  }
  return { spineX: bestSpineX, halfPageW, bookBottomY };
}

/** Detecta el lomo (spineX) en STAND siguiendo la esquina inferior derecha de la portada (y=310..313) */
function detectStandBook(data, W) {
  let coverRightX = 0;
  for (let y = 310; y <= 313; y++) {
    for (let x = 0; x < 505; x++) {
      const i = (y * W + x) * 3;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum > 35 && x > coverRightX) coverRightX = x;
    }
  }
  return {
    spineX: coverRightX - 165,
    halfPageW: 148,
    bookBottomY: 311,
  };
}

/** Construye el libro abierto limpio reflejando la mitad derecha descubierta de un frame */
function buildSymmetricBook(cleanRgba, W, H, spineX, topY, bookH, halfW) {
  const bookW = halfW * 2;
  const out = Buffer.alloc(bookW * bookH * 4);
  for (let y = 0; y < bookH; y++) {
    const srcY = topY + y;
    if (srcY < 0 || srcY >= H) continue;
    for (let dx = 0; dx < halfW; dx++) {
      const srcX = Math.min(W - 1, spineX + dx);
      const sIdx = (srcY * W + srcX) * 4;
      const rIdx = (y * bookW + (halfW + dx)) * 4;
      const lIdx = (y * bookW + (halfW - 1 - dx)) * 4;
      for (let c = 0; c < 4; c++) {
        out[rIdx + c] = cleanRgba[sIdx + c];
        out[lIdx + c] = cleanRgba[sIdx + c];
      }
    }
  }
  return { buf: out, width: bookW, height: bookH };
}

async function buildWalkSheet() {
  const meta = await sharp(WALK_GIF, { animated: true }).metadata();
  const totalFrames = meta.pages || 30;
  const rows = Math.ceil(totalFrames / WALK_COLS);
  const sheetW = WALK_COLS * WALK_CROP.width;
  const sheetH = rows * WALK_CROP.height;
  const composites = [];

  for (let i = 0; i < totalFrames; i++) {
    const { data, info } = await sharp(WALK_GIF, { page: i }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const clean = cleanGifFrame(data, info.width, info.height);
    const cellBuf = await sharp(clean, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract(WALK_CROP)
      .png()
      .toBuffer();

    composites.push({
      input: cellBuf,
      left: (i % WALK_COLS) * WALK_CROP.width,
      top: Math.floor(i / WALK_COLS) * WALK_CROP.height,
    });
  }

  await mkdir(OUT_SPRITES, { recursive: true });
  await sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toFile(path.join(OUT_SPRITES, 'doly-walk.webp'));

  console.log('✔ doly-walk.webp generado (30 frames)');
  return totalFrames;
}

async function buildBookSequenceSheet() {
  // 1. Extraemos el libro vacío de LIE[00] y el parche izquierdo del libro de STAND[00]
  const { data: dLie0, info: iLie0 } = await sharp(LIE_GIF, { page: 0 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cleanLie0 = cleanGifFrame(dLie0, iLie0.width, iLie0.height);
  const lie0Metrics = detectLieBook(dLie0, iLie0.width, iLie0.height);

  const HALF_W = 195;
  const TOP_Y_LIE = 230;
  const BOOK_H = 110;
  const emptyBookLie = buildSymmetricBook(cleanLie0, iLie0.width, iLie0.height, lie0Metrics.spineX, TOP_Y_LIE, BOOK_H, HALF_W);
  const emptyBookLiePng = await sharp(emptyBookLie.buf, {
    raw: { width: emptyBookLie.width, height: emptyBookLie.height, channels: 4 },
  })
    .png()
    .toBuffer();

  // Parche del libro escalado de STAND[00] para completar el borde izquierdo en STAND[18..29]
  const { data: dStand0, info: iStand0 } = await sharp(STAND_GIF, { page: 0 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cleanStand0 = cleanGifFrame(dStand0, iStand0.width, iStand0.height);
  const stand0Metrics = detectStandBook(dStand0, iStand0.width);
  const standScale = TARGET_HALF_PAGE_W / stand0Metrics.halfPageW;
  const stand0ScaledW = Math.round(iStand0.width * standScale);
  const stand0ScaledH = Math.round(iStand0.height * standScale);
  const { data: cleanStand0Scaled } = await sharp(cleanStand0, {
    raw: { width: iStand0.width, height: iStand0.height, channels: 4 },
  })
    .resize(stand0ScaledW, stand0ScaledH, { kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const stand0SpineScaled = Math.round(stand0Metrics.spineX * standScale);
  const stand0BottomScaled = Math.round(stand0Metrics.bookBottomY * standScale);
  const standTopY = stand0BottomScaled - (lie0Metrics.bookBottomY - TOP_Y_LIE);
  const emptyBookStand = buildSymmetricBook(
    cleanStand0Scaled,
    stand0ScaledW,
    stand0ScaledH,
    stand0SpineScaled,
    standTopY,
    BOOK_H,
    HALF_W,
  );

  const TOTAL_CELLS = 61; // 0..29: LIE, 30..59: STAND, 60: EMPTY BOOK
  const rows = Math.ceil(TOTAL_CELLS / BOOK_COLS);
  const sheetW = BOOK_COLS * BOOK_CELL_W;
  const sheetH = rows * BOOK_CELL_H;
  const composites = [];

  // Helper para colocar un frame limpio y escalado dentro de una celda de 680x320
  async function composeCell(cleanBuf, W, H, spineX, bookBottomY, scale, targetSpineX, patchBook) {
    const sW = Math.round(W * scale);
    const sH = Math.round(H * scale);
    const resizedPng = await sharp(cleanBuf, { raw: { width: W, height: H, channels: 4 } })
      .resize(sW, sH, { kernel: 'lanczos3' })
      .png()
      .toBuffer();

    const left = Math.round(targetSpineX - spineX * scale);
    const top = Math.round(BOOK_GROUND_Y - bookBottomY * scale);

    const cL = Math.max(0, -left);
    const cT = Math.max(0, -top);
    const pL = Math.max(0, left);
    const pT = Math.max(0, top);
    const eW = Math.min(sW - cL, BOOK_CELL_W - pL);
    const eH = Math.min(sH - cT, BOOK_CELL_H - pT);

    const clipped = await sharp(resizedPng)
      .extract({ left: cL, top: cT, width: eW, height: eH })
      .png()
      .toBuffer();

    const layers = [];
    if (patchBook) {
      const bookLeftEdge = targetSpineX - HALF_W;
      // Si el borde izquierdo del frame escalado empieza a cortar el libro (pL > bookLeftEdge),
      // rellenamos únicamente la franja izquierda faltante desde el libro simétrico de STAND[00]
      const missingW = Math.max(0, Math.min(HALF_W, pL - bookLeftEdge + 8));
      if (missingW > 0) {
        const slicePng = await sharp(patchBook.buf, {
          raw: { width: patchBook.width, height: patchBook.height, channels: 4 },
        })
          .extract({ left: 0, top: 0, width: missingW, height: patchBook.height })
          .png()
          .toBuffer();
        layers.push({
          input: slicePng,
          left: Math.max(0, bookLeftEdge),
          top: BOOK_GROUND_Y - (lie0Metrics.bookBottomY - TOP_Y_LIE),
        });
      }
    }
    layers.push({ input: clipped, left: pL, top: pT });

    return sharp({
      create: { width: BOOK_CELL_W, height: BOOK_CELL_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite(layers)
      .png()
      .toBuffer();
  }

  // 1) Frames 0..29: LIE
  for (let i = 0; i < 30; i++) {
    const { data, info } = await sharp(LIE_GIF, { page: i }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const clean = cleanGifFrame(data, info.width, info.height);
    const m = detectLieBook(data, info.width, info.height);
    const scale = TARGET_HALF_PAGE_W / m.halfPageW;
    const cellPng = await composeCell(clean, info.width, info.height, m.spineX, m.bookBottomY, scale, LIE_SPINE_X, null);
    composites.push({
      input: cellPng,
      left: (i % BOOK_COLS) * BOOK_CELL_W,
      top: Math.floor(i / BOOK_COLS) * BOOK_CELL_H,
    });
  }

  // 2) Frames 30..59: STAND
  for (let i = 0; i < 30; i++) {
    const { data, info } = await sharp(STAND_GIF, { page: i }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const clean = cleanGifFrame(data, info.width, info.height);
    const m = detectStandBook(data, info.width);
    const scale = TARGET_HALF_PAGE_W / m.halfPageW;
    const cellPng = await composeCell(
      clean,
      info.width,
      info.height,
      m.spineX,
      m.bookBottomY,
      scale,
      STAND_SPINE_X,
      emptyBookStand,
    );
    const idx = 30 + i;
    composites.push({
      input: cellPng,
      left: (idx % BOOK_COLS) * BOOK_CELL_W,
      top: Math.floor(idx / BOOK_COLS) * BOOK_CELL_H,
    });
  }

  // 3) Frame 60: Libro abierto vacío (centrado en LIE_SPINE_X)
  const emptyBookCell = await sharp({
    create: { width: BOOK_CELL_W, height: BOOK_CELL_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: emptyBookLiePng,
        left: LIE_SPINE_X - HALF_W,
        top: BOOK_GROUND_Y - (lie0Metrics.bookBottomY - TOP_Y_LIE),
      },
    ])
    .png()
    .toBuffer();

  composites.push({
    input: emptyBookCell,
    left: (60 % BOOK_COLS) * BOOK_CELL_W,
    top: Math.floor(60 / BOOK_COLS) * BOOK_CELL_H,
  });

  const sheetBase = sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(composites);

  await sheetBase
    .clone()
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(path.join(OUT_SPRITES, 'doly-book-seq.webp'));

  await sheetBase
    .clone()
    .flatten({ background: '#1c1c1c' })
    .resize(Math.round(sheetW * 0.5))
    .png()
    .toFile(path.join(root, 'assets-src', 'doly-book-seq-preview.png'));

  console.log('✔ doly-book-seq.webp generado (61 frames: 30 lie + 30 stand + 1 emptyBook)');
}

const walkCount = await buildWalkSheet();
await buildBookSequenceSheet();

const manifest = {
  image: '/sprites/doly-walk.webp',
  frameW: WALK_CROP.width,
  frameH: WALK_CROP.height,
  cols: WALK_COLS,
  rows: Math.ceil(walkCount / WALK_COLS),
  designW: WALK_CROP.width,
  designH: WALK_CROP.height,
  groundY: 244,
  standingHeight: 233,
  strideUnits: 160,
  centerX: 185,
  walkScale: 218 / 233,
  bookSeq: {
    image: '/sprites/doly-book-seq.webp',
    frameW: BOOK_CELL_W,
    frameH: BOOK_CELL_H,
    cols: BOOK_COLS,
    rows: 11,
    groundY: BOOK_GROUND_Y,
    lieSpineX: LIE_SPINE_X,
    standSpineX: STAND_SPINE_X,
    lieStart: 0,
    lieCount: 30,
    standStart: 30,
    standCount: 30,
    emptyBookFrame: 60,
    entryDogOffsetX: -235,
    exitDogOffsetX: 235,
  },
  ranges: {
    walk: { start: 0, count: walkCount },
    settle: { start: 0, count: 30 },
  },
};

await writeFile(path.join(OUT_SPRITES, 'doly-walk.json'), JSON.stringify(manifest, null, 2));
console.log('✔ manifest actualizado:', manifest);
