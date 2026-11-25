/**
 * Doly complete GIF pipeline (Walk + Sit-Ground + Lie-Down on Book + Stand-Up from Book)
 * --------------------------------------------------------------------------------------
 * Fuentes:
 *   1. assets-src/doly-walk-source.gif       (30 frames, caminata)
 *   2. assets-src/doly-lie-down-source.gif   (30 frames, llega al libro y se recuesta; frames 12..20 sin libro -> sentado en suelo)
 *   3. assets-src/doly-stand-up-source.gif   (30 frames, se levanta del libro y sale caminando)
 *
 * Salidas:
 *   - public/sprites/doly-walk.webp          (30 frames de caminata sin fondo, 6x5 de 360x260)
 *   - public/sprites/doly-sit-ground.webp    (9 frames sentado en suelo sin libro, 3x3)
 *   - public/sprites/doly-book-seq.webp      (61 frames estabilizados: 30 lie + 30 stand + 1 libro vacío, 6x11)
 *   - public/sprites/doly-walk.json          (manifest unificado para GSAP + Canvas)
 *   - assets-src/doly-sit-ground-preview.png (vista previa de verificación)
 *   - assets-src/doly-book-seq-preview.png   (vista previa de verificación)
 */
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WALK_GIF = path.join(root, 'assets-src', 'doly-walk-source.gif');
const LIE_GIF = path.join(root, 'assets-src', 'doly-lie-down-source.gif');
const STAND_GIF = path.join(root, 'assets-src', 'doly-stand-up-source.gif');
const OUT_SPRITES = path.join(root, 'public', 'sprites');

const WALK_CROP = { left: 118, top: 72, width: 360, height: 260 };
const WALK_COLS = 6;

const SIT_START_FRAME = 12;
const SIT_FRAME_COUNT = 9; // LIE 12..20
const SIT_TURN_HALF = 9;
const SIT_TURN_CENTER = 10;
const SIT_TURN_QUARTER = 11;
const SIT_TOTAL_FRAMES = 12; // 0..8: LIE 12..20, 9..11: giro con cabeza fija
const SIT_COLS = 4;
const SIT_ANCHOR_OFFSET = -37; // centro de silueta respecto a spineX en LIE 12..20

const BOOK_CELL_W = 680;
const BOOK_CELL_H = 320;
const BOOK_COLS = 6;
const LIE_SPINE_X = 375;
const STAND_SPINE_X = 225;
const BOOK_GROUND_Y = 304;
const TARGET_COVER_W = 358;
const STAND_RAW_COVER_W = 325;
const STAND_EXIT_FRAME = 26;

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

/**
 * Bounding box de la tinta (el perrito) dentro de un rango de columnas del frame fuente.
 * Sirve para medir al personaje en el arte original y no adivinar su escala ni su posición.
 */
function inkBox(data, info, x0, x1) {
  let minX = 1e9;
  let maxX = -1;
  let minY = 1e9;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = x0; x < Math.min(x1, info.width); x++) {
      const i = (y * info.width + x) * 3;
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 > 25) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

/**
 * Detecta la portada exterior del libro en LIE (x_min..x_max en y=315..336) y la
 * base plana de la portada (botFlat en spineX+60) para fijar ancho y posición
 * exactos en todos los frames (compensando el zoom de ~5% en LIE[20..29]).
 */
function detectLieBook(data, W, H, frameIdx = 10) {
  let coverMinX = 1e9;
  let coverMaxX = -1;
  for (let y = 315; y <= 336; y++) {
    for (let x = 115; x < W - 10; x++) {
      const i = (y * W + x) * 3;
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 > 35) {
        if (x < coverMinX) coverMinX = x;
        if (x > coverMaxX) coverMaxX = x;
      }
    }
  }
  // En LIE[0..4], las patas delanteras de Doly quedan cerca del borde izquierdo de la portada:
  // en esos frames el ancho real de la portada es constante (358px) medido desde coverMaxX.
  const coverW = frameIdx <= 4 ? TARGET_COVER_W : coverMaxX - coverMinX;
  const spineX = frameIdx <= 4 ? coverMaxX - TARGET_COVER_W / 2 : (coverMinX + coverMaxX) / 2;
  const halfPageW = coverW / 2;
  let bookBottomY = 326;
  const probeX = Math.max(0, Math.min(W - 10, Math.round(spineX + 60)));
  for (let y = 295; y < Math.min(H - 5, 345); y++) {
    const i = (y * W + probeX) * 3;
    const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
    if (lum > 28) bookBottomY = y;
  }
  return { spineX, coverW, halfPageW, bookBottomY };
}

/** Detecta el lomo (spineX) y base plana en STAND siguiendo la esquina inferior derecha de la portada */
function detectStandBook(data, W) {
  let coverRightX = 0;
  for (let y = 305; y <= 315; y++) {
    for (let x = 0; x < 515; x++) {
      const i = (y * W + x) * 3;
      const lum = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (lum > 35 && x > coverRightX) coverRightX = x;
    }
  }
  return {
    spineX: coverRightX - STAND_RAW_COVER_W / 2,
    coverW: STAND_RAW_COVER_W,
    halfPageW: STAND_RAW_COVER_W / 2,
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

/**
 * Núcleo compartido para extraer únicamente la silueta de Doly dada una máscara
 * previa de páginas/libro (`excluded`). Ejecuta pelaje + distancia + flood-fill
 * exterior + poda de hilos finos + selección de componente conectado.
 */
function extractDogCore(data, lum, W, H, excluded, { maxY, pruneSpineX, pruneYMin, pruneYMax, seedRange }) {
  const N = W * H;

  const isFur = new Uint8Array(N);
  for (let y = 1; y <= maxY; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (excluded[i]) continue;
      if (lum[i] >= 25.5) {
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ni = (y + dy) * W + (x + dx);
            if (!excluded[ni] && lum[ni] >= 25) count++;
          }
        }
        if (count >= 4) isFur[i] = 1;
      }
    }
  }

  const dist = new Uint8Array(N);
  dist.fill(255);
  for (let y = 0; y <= Math.min(H - 1, maxY + 2); y++) {
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
        if (yy < 0 || yy > maxY) continue;
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

  const barrier = new Uint8Array(N);
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (excluded[i]) continue;
      const L = lum[i];
      const d = dist[i];
      if (d === 0 || (d <= 6 && L <= 12.5) || (d <= 8 && L <= 9.5)) {
        barrier[i] = 1;
      }
    }
  }

  const exterior = new Uint8Array(N);
  const stack = [];
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1);
  for (let i = 0; i < N; i++) {
    if (excluded[i] || ((i / W) | 0) > maxY) stack.push(i);
  }
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

  let fg = new Uint8Array(N);
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

  for (let pass = 0; pass < 3; pass++) {
    const next = new Uint8Array(fg);
    for (let y = pruneYMin; y <= pruneYMax; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if (!fg[i]) continue;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (fg[(y + dy) * W + (x + dx)]) n++;
          }
        }
        if (n <= 4) next[i] = 0;
      }
    }
    fg = next;
  }

  for (let y = Math.max(1, pruneYMax - 26); y <= pruneYMax; y++) {
    for (let x = Math.max(1, pruneSpineX - 18); x <= Math.min(W - 2, pruneSpineX + 18); x++) {
      const i = y * W + x;
      if (!fg[i]) continue;
      let run = 1;
      for (let xx = x - 1; xx >= 0 && fg[y * W + xx] && run < 12; xx--) run++;
      for (let xx = x + 1; xx < W && fg[y * W + xx] && run < 12; xx++) run++;
      if (run <= 5) fg[i] = 0;
    }
  }

  // Selección de componente conectado: rango fijo (LIE 12..20) o componente más grande (resto de poses)
  let keep = new Uint8Array(N);
  if (seedRange) {
    const q = [];
    for (let y = seedRange.y0; y <= seedRange.y1; y++) {
      for (let x = seedRange.x0; x <= seedRange.x1; x++) {
        if (fg[y * W + x]) q.push(y * W + x);
      }
    }
    while (q.length) {
      const i = q.pop();
      if (keep[i] || !fg[i]) continue;
      keep[i] = 1;
      const x = i % W;
      const y = (i / W) | 0;
      if (x > 0) q.push(i - 1);
      if (x < W - 1) q.push(i + 1);
      if (y > 0) q.push(i - W);
      if (y < H - 1) q.push(i + W);
    }
  } else {
    const seen = new Uint8Array(N);
    let bestComp = [];
    for (let start = 0; start < N; start++) {
      if (!fg[start] || seen[start]) continue;
      const comp = [];
      const q = [start];
      seen[start] = 1;
      while (q.length) {
        const i = q.pop();
        comp.push(i);
        const x = i % W;
        const y = (i / W) | 0;
        const nbrs = [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, y > 0 ? i - W : -1, y < H - 1 ? i + W : -1];
        for (const ni of nbrs) {
          if (ni >= 0 && fg[ni] && !seen[ni]) {
            seen[ni] = 1;
            q.push(ni);
          }
        }
      }
      if (comp.length > bestComp.length) bestComp = comp;
    }
    for (const i of bestComp) keep[i] = 1;
  }

  const out = Buffer.alloc(N * 4);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!keep[i]) continue;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (keep[(y + dy) * W + (x + dx)]) n++;
        }
      }
      const a = n >= 8 ? 255 : Math.max(0, Math.round(((n - 3) / 5) * 255));
      out[i * 4] = data[i * 3];
      out[i * 4 + 1] = data[i * 3 + 1];
      out[i * 4 + 2] = data[i * 3 + 2];
      out[i * 4 + 3] = a;
    }
  }
  return out;
}

/** Inunda las páginas blancas conectadas a los bloques semilla y dilata 1px */
function buildWhitePageMask(lum, W, H, seedBoxes, minY, maxY, strictWall = false) {
  const N = W * H;
  const passable = new Uint8Array(N);
  const centerMin = strictWall ? 192 : 165;
  const nbr3Min = strictWall ? 168 : 130;
  for (let y = Math.max(2, minY); y <= Math.min(H - 3, maxY); y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (lum[i] < centerMin) continue;
      let ok = 1;
      for (let dy = -1; dy <= 1 && ok; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (lum[(y + dy) * W + (x + dx)] < nbr3Min) {
            ok = 0;
            break;
          }
        }
      }
      if (ok && strictWall) {
        for (let dy = -2; dy <= 2 && ok; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (lum[(y + dy) * W + (x + dx)] < 140) {
              ok = 0;
              break;
            }
          }
        }
      }
      if (ok) passable[i] = 1;
    }
  }

  const visitedPage = new Uint8Array(N);
  const pStack = [];
  for (const box of seedBoxes) {
    const x0 = Math.max(2, Math.round(box.x0));
    const x1 = Math.min(W - 3, Math.round(box.x1));
    const y0 = Math.max(2, Math.round(box.y0));
    const y1 = Math.min(H - 3, Math.round(box.y1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!passable[y * W + x]) continue;
        let pure = 1;
        for (let dy = -2; dy <= 2 && pure; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (lum[(y + dy) * W + (x + dx)] < 205) {
              pure = 0;
              break;
            }
          }
        }
        if (pure) pStack.push(y * W + x);
      }
    }
  }

  while (pStack.length) {
    const i = pStack.pop();
    if (visitedPage[i] || !passable[i]) continue;
    visitedPage[i] = 1;
    const x = i % W;
    const y = (i / W) | 0;
    if (y <= minY || y >= maxY) continue;
    if (x > 0) pStack.push(i - 1);
    if (x < W - 1) pStack.push(i + 1);
    if (y > minY) pStack.push(i - W);
    if (y < maxY) pStack.push(i + W);
  }

  const pageMask = new Uint8Array(visitedPage);
  const dilateMin = strictWall ? 145 : 110;
  for (let y = Math.max(1, minY + 1); y < Math.min(H - 1, maxY); y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (pageMask[i] || lum[i] < dilateMin) continue;
      if (visitedPage[i - 1] || visitedPage[i + 1] || visitedPage[i - W] || visitedPage[i + W]) {
        pageMask[i] = 1;
      }
    }
  }
  return pageMask;
}

/** Extrae a Doly sin libro de LIE[12..20] para `doly-sit-ground.webp` */
function extractDogWithoutBook(data, W, H, frameIdx, spineX) {
  const N = W * H;
  const lum = new Float32Array(N);
  for (let i = 0; i < N; i++) lum[i] = (data[i * 3] + data[i * 3 + 1] + data[i * 3 + 2]) / 3;

  const excluded = buildWhitePageMask(
    lum,
    W,
    H,
    [
      { x0: 130, x1: 195, y0: 240, y1: 295 },
      { x0: 400, x1: 490, y0: 240, y1: 295 },
    ],
    160,
    315,
  );

  const leftRimLimit = frameIdx === 12 ? spineX - 135 : frameIdx === 13 ? spineX - 132 : spineX - 115;
  const leftRimTop = frameIdx === 12 ? 261 : frameIdx === 13 ? 263 : 256;
  for (let y = leftRimTop; y <= 284; y++) {
    for (let x = 0; x <= leftRimLimit; x++) {
      excluded[y * W + x] = 1;
    }
  }

  return extractDogCore(data, lum, W, H, excluded, {
    maxY: 282,
    pruneSpineX: spineX,
    pruneYMin: 234,
    pruneYMax: 282,
    seedRange: { x0: 220, x1: 360, y0: 100, y1: 210 },
  });
}

/**
 * Extrae únicamente la silueta escalada de Doly restando el libro de referencia
 * (`emptyBookLie` o `emptyBookStand`) con tolerancia morfológica de ±2px y flood-fill
 * conectado al exterior, evitando recortar patas blancas ni pechos sobre la página.
 */
async function extractDogByDiff(cleanRgba, W, H, metrics, scale, isLie, frameIdx, refBook, pageEdgeBotRelGround, halfW, topOffset, bookH) {
  const sW = Math.round(W * scale);
  const sH = Math.round(H * scale);
  const { data: scaledData } = await sharp(cleanRgba, { raw: { width: W, height: H, channels: 4 } })
    .resize(sW, sH, { kernel: 'lanczos3' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const sp = Math.round(metrics.spineX * scale);
  const bot = Math.round(metrics.bookBottomY * scale);
  const bookTop = bot - topOffset;
  const N = sW * sH;

  const lumF = new Float32Array(N).fill(-1);
  const lumB = new Float32Array(N).fill(-1);
  const alphaB = new Uint8Array(N);
  const minDiff = new Float32Array(N).fill(999);

  const refLumAt = (rx, ry) => {
    if (ry < 0 || ry >= bookH || rx < 0 || rx >= halfW * 2) return -1;
    const bi = (ry * halfW * 2 + rx) * 4;
    return refBook[bi + 3] > 128 ? (refBook[bi] + refBook[bi + 1] + refBook[bi + 2]) / 3 : -1;
  };

  for (let y = 0; y < sH; y++) {
    for (let x = 0; x < sW; x++) {
      const i = y * sW + x;
      const fa = scaledData[i * 4 + 3];
      lumF[i] = fa > 10 ? (scaledData[i * 4] + scaledData[i * 4 + 1] + scaledData[i * 4 + 2]) / 3 : -1;
      const rx = halfW + (x - sp);
      const ry = y - bookTop;
      const bl = refLumAt(rx, ry);
      if (bl >= 0) {
        alphaB[i] = 255;
        lumB[i] = bl;
      }
      if (ry >= -3 && ry < bookH + 3 && rx >= -3 && rx < halfW * 2 + 3) {
        if (fa < 20) {
          minDiff[i] = 0;
          continue;
        }
        let best = 999;
        for (let oy = -2; oy <= 2; oy++) {
          for (let ox = -2; ox <= 2; ox++) {
            const rl = refLumAt(rx + ox, ry + oy);
            if (rl >= 0) {
              const d = Math.abs(lumF[i] - rl);
              if (d < best) best = d;
            }
          }
        }
        minDiff[i] = best;
      }
    }
  }

  // 1. Recorte geométrico duro de base, lomo inferior y bordes laterales libres
  const excluded = new Uint8Array(N);
  const leftCross = isLie && frameIdx <= 7;
  const rightCross = !isLie && frameIdx >= 20;
  for (let y = 0; y < sH; y++) {
    for (let x = 0; x < sW; x++) {
      const i = y * sW + x;
      const dx = x - sp;
      if (Math.abs(dx) < halfW) {
        if (Math.abs(dx) <= 162) {
          const er = pageEdgeBotRelGround[halfW + dx];
          const cutOff = er < 900 ? er - 2 : -12;
          if (y >= bot + cutOff) excluded[i] = 1;
        } else if (dx < -162 && !leftCross && y >= bot - 80) {
          excluded[i] = 1;
        } else if (dx > 162 && !rightCross && y >= bot - 80) {
          excluded[i] = 1;
        }
      }
    }
  }

  // 2A. Flood-fill Phase A (`visitedWhite`): únicamente papel blanco brillante (`lumB >= 195`, 3x3 `minDiff <= 15`)
  // Nunca atraviesa líneas oscuras del libro ni el pelaje oscuro de Doly.
  const whiteCandidate = new Uint8Array(N);
  for (let y = 1; y < sH - 1; y++) {
    for (let x = 1; x < sW - 1; x++) {
      const i = y * sW + x;
      if (excluded[i] || scaledData[i * 4 + 3] < 20) {
        whiteCandidate[i] = 1;
        continue;
      }
      if (alphaB[i] <= 128) continue;
      const dx = x - sp;
      if ((leftCross && dx < -156) || (rightCross && dx > 156)) continue;
      if (lumB[i] >= 195) {
        let ok = 1;
        for (let dy = -1; dy <= 1 && ok; dy++) {
          for (let dxn = -1; dxn <= 1; dxn++) {
            if (minDiff[(y + dy) * sW + (x + dxn)] > 15) {
              ok = 0;
              break;
            }
          }
        }
        if (ok) whiteCandidate[i] = 1;
      }
    }
  }

  const visitedWhite = new Uint8Array(N);
  const stack = [];
  for (let y = 0; y < sH; y++) {
    for (let x = 0; x < sW; x++) {
      const i = y * sW + x;
      if ((excluded[i] || scaledData[i * 4 + 3] < 20) && whiteCandidate[i]) {
        stack.push(i);
      }
    }
  }
  for (let y = Math.max(2, bookTop + 10); y < Math.min(sH - 2, bot - 24); y++) {
    for (let x = Math.max(2, sp - 154); x <= Math.min(sW - 3, sp + 154); x += 3) {
      const i = y * sW + x;
      if (!whiteCandidate[i] || minDiff[i] >= 12) continue;
      // Sube desde (x, y) por la hoja blanca; tras cruzar <= 5px del borde del libro debe haber >= 10px de cielo vacío.
      let oy = y;
      while (oy > Math.max(0, bookTop - 6) && (whiteCandidate[oy * sW + x] || lumF[oy * sW + x] >= 165)) oy--;
      let darkCross = 0;
      while (oy >= 0 && scaledData[(oy * sW + x) * 4 + 3] >= 20 && darkCross <= 5) {
        darkCross++;
        oy--;
      }
      if (darkCross > 5) continue;
      let skyRun = 0;
      while (oy >= 0 && scaledData[(oy * sW + x) * 4 + 3] < 20 && skyRun < 10) {
        skyRun++;
        oy--;
      }
      if (skyRun >= 10) stack.push(i);
    }
  }
  while (stack.length) {
    const i = stack.pop();
    if (visitedWhite[i] || !whiteCandidate[i]) continue;
    visitedWhite[i] = 1;
    const x = i % sW;
    const y = (i / sW) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < sW - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - sW);
    if (y < sH - 1) stack.push(i + sW);
  }
  for (let i = 0; i < N; i++) {
    if (visitedWhite[i]) excluded[i] = 1;
  }

  // Sembrado seguro de bolsas de página blanca bajo la cola/abdomen que quedaron sombreadas al rayo vertical
  const pocketSeen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (!whiteCandidate[s] || visitedWhite[s] || excluded[s] || pocketSeen[s] || alphaB[s] <= 128 || lumB[s] < 195) continue;
    const W = [];
    const pq = [s];
    pocketSeen[s] = 1;
    let wMinY = 1e9;
    let wMaxY = -1;
    while (pq.length) {
      const i = pq.pop();
      W.push(i);
      const x = i % sW;
      const y = (i / sW) | 0;
      if (y < wMinY) wMinY = y;
      if (y > wMaxY) wMaxY = y;
      const nbrs = [x > 0 ? i - 1 : -1, x < sW - 1 ? i + 1 : -1, y > 0 ? i - sW : -1, y < sH - 1 ? i + sW : -1];
      for (const ni of nbrs) {
        if (
          ni >= 0 &&
          !pocketSeen[ni] &&
          whiteCandidate[ni] &&
          !visitedWhite[ni] &&
          !excluded[ni] &&
          alphaB[ni] > 128 &&
          lumB[ni] >= 195
        ) {
          pocketSeen[ni] = 1;
          pq.push(ni);
        }
      }
    }
    if (W.length >= 420 || (W.length >= 120 && wMaxY >= bot - 32 && wMinY <= bot - 36)) {
      for (const idx of W) {
        visitedWhite[idx] = 1;
        excluded[idx] = 1;
      }
    }
  }

  // 2B. Phase B (`exposedDarkBook`): limpia bordes expuestos del libro (curva superior, pliegue inferior, márgenes laterales y lomo visible)
  // sin cruzar nunca por encima del cuerpo opaco de Doly.
  const exposedDark = new Uint8Array(N);
  for (let y = 1; y < sH - 1; y++) {
    for (let x = 1; x < sW - 1; x++) {
      const i = y * sW + x;
      if (excluded[i] || alphaB[i] <= 128) continue;
      const dx = x - sp;

      if ((leftCross && dx < -156) || (rightCross && dx > 156)) {
        if (lumB[i] > 82 && lumF[i] > 82 && minDiff[i] <= 26) exposedDark[i] = 1;
        continue;
      }

      if (minDiff[i] <= 36) {
        // Contorno curvo superior expuesto: cielo transparente arriba y página blanca/libro abajo
        let hasSkyAbove = false;
        for (let oy = 1; oy <= 6; oy++) {
          const ay = y - oy;
          if (ay >= 0 && scaledData[(ay * sW + x) * 4 + 3] < 20) {
            hasSkyAbove = true;
            break;
          }
        }
        if (hasSkyAbove) {
          let hasWhiteOrExBelow = false;
          for (let oy = 1; oy <= 7 && !hasWhiteOrExBelow; oy++) {
            const by = y + oy;
            if (by >= sH) continue;
            for (let ox = -2; ox <= 2; ox++) {
              const bx = x + ox;
              if (bx >= 0 && bx < sW) {
                const ni = by * sW + bx;
                if (visitedWhite[ni] || excluded[ni]) {
                  hasWhiteOrExBelow = true;
                  break;
                }
              }
            }
          }
          if (hasWhiteOrExBelow) exposedDark[i] = 1;
        }

        // Pliegue horizontal del grosor de hojas (`dy ~ -25`): página blanca arriba Y abajo (solo 1..4px de grosor)
        if (!exposedDark[i] && y >= Math.max(5, bot - 34) && y < bot - 6) {
          let whiteUp = false;
          let whiteDown = false;
          for (let oy = 1; oy <= 5; oy++) {
            if (y - oy >= 0 && visitedWhite[(y - oy) * sW + x]) whiteUp = true;
            if (y + oy < sH && (visitedWhite[(y + oy) * sW + x] || excluded[(y + oy) * sW + x])) whiteDown = true;
          }
          if (whiteUp && whiteDown) exposedDark[i] = 1;
        }

        // Borde lateral exterior y esquinas del libro (`|dx| >= 135`): cielo/excluido afuera y página blanca adentro
        if (!exposedDark[i] && Math.abs(dx) >= 135) {
          const sign = dx > 0 ? 1 : -1;
          let hasOut = false;
          let hasIn = false;
          for (let d = 1; d <= 18; d++) {
            const outX = x + sign * d;
            if (outX >= 0 && outX < sW) {
              const oi = y * sW + outX;
              if (scaledData[oi * 4 + 3] < 20 || excluded[oi]) hasOut = true;
            }
            const inX = x - sign * d;
            if (inX >= 0 && inX < sW) {
              if (visitedWhite[y * sW + inX]) hasIn = true;
            }
          }
          if (hasOut && hasIn) exposedDark[i] = 1;
        }
      }

      // Lomo vertical central visible entre ambas páginas blancas (o cielo)
      if (!exposedDark[i] && Math.abs(dx) <= 6 && y >= Math.max(1, bookTop) && y <= Math.min(sH - 1, bot) && minDiff[i] <= 42) {
        const lx = Math.max(0, x - 7);
        const rx = Math.min(sW - 1, x + 7);
        const li = y * sW + lx;
        const ri = y * sW + rx;
        const lOpen = visitedWhite[li] || scaledData[li * 4 + 3] < 20 || excluded[li];
        const rOpen = visitedWhite[ri] || scaledData[ri * 4 + 3] < 20 || excluded[ri];
        if (lOpen && rOpen && (visitedWhite[li] || visitedWhite[ri])) {
          exposedDark[i] = 1;
        }
      }

      // Halo brillante de 1px junto al papel blanco (sin tocar pelaje oscuro)
      if (
        !exposedDark[i] &&
        lumF[i] > 175 &&
        minDiff[i] <= 24 &&
        (visitedWhite[i - 1] || visitedWhite[i + 1] || visitedWhite[i - sW] || visitedWhite[i + sW])
      ) {
        exposedDark[i] = 1;
      }

      // Sombreado inferior justo encima de la portada base
      const cutOff = Math.abs(dx) <= 162 && pageEdgeBotRelGround[halfW + dx] < 900 ? pageEdgeBotRelGround[halfW + dx] - 2 : -12;
      if (
        !exposedDark[i] &&
        Math.abs(dx) <= 162 &&
        y >= bot + cutOff - 5 &&
        lumF[i] > 110 &&
        minDiff[i] <= 26 &&
        (excluded[i - 1] || excluded[i + 1] || excluded[i - sW] || excluded[i + sW])
      ) {
        exposedDark[i] = 1;
      }
    }
  }
  for (let i = 0; i < N; i++) {
    if (exposedDark[i]) excluded[i] = 1;
  }

  // 2C. Phase C: Relleno de agujeros cerrados dentro de la silueta de Doly (conserva huecos blancos grandes entre patas)
  let fg = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (scaledData[i * 4 + 3] > 20 && !excluded[i]) fg[i] = 1;
  }
  const outside = new Uint8Array(N);
  const outQueue = [];
  for (let x = 0; x < sW; x++) {
    if (!fg[x]) {
      outside[x] = 1;
      outQueue.push(x);
    }
    const bi = (sH - 1) * sW + x;
    if (!fg[bi] && !outside[bi]) {
      outside[bi] = 1;
      outQueue.push(bi);
    }
  }
  for (let y = 1; y < sH - 1; y++) {
    const li = y * sW;
    if (!fg[li] && !outside[li]) {
      outside[li] = 1;
      outQueue.push(li);
    }
    const ri = y * sW + sW - 1;
    if (!fg[ri] && !outside[ri]) {
      outside[ri] = 1;
      outQueue.push(ri);
    }
  }
  while (outQueue.length) {
    const i = outQueue.pop();
    const x = i % sW;
    const y = (i / sW) | 0;
    const nbrs = [x > 0 ? i - 1 : -1, x < sW - 1 ? i + 1 : -1, y > 0 ? i - sW : -1, y < sH - 1 ? i + sW : -1];
    for (const ni of nbrs) {
      if (ni >= 0 && !fg[ni] && !outside[ni]) {
        outside[ni] = 1;
        outQueue.push(ni);
      }
    }
  }
  const holeSeen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (fg[s] || outside[s] || holeSeen[s] || scaledData[s * 4 + 3] <= 64) continue;
    const hComp = [];
    const hq = [s];
    holeSeen[s] = 1;
    let sumLum = 0;
    while (hq.length) {
      const i = hq.pop();
      hComp.push(i);
      if (lumF[i] >= 0) sumLum += lumF[i];
      const x = i % sW;
      const y = (i / sW) | 0;
      const nbrs = [x > 0 ? i - 1 : -1, x < sW - 1 ? i + 1 : -1, y > 0 ? i - sW : -1, y < sH - 1 ? i + sW : -1];
      for (const ni of nbrs) {
        if (ni >= 0 && !fg[ni] && !outside[ni] && !holeSeen[ni] && scaledData[ni * 4 + 3] > 64) {
          holeSeen[ni] = 1;
          hq.push(ni);
        }
      }
    }
    const meanLum = sumLum / Math.max(1, hComp.length);
    if (hComp.length <= 160 || meanLum < 190) {
      for (const idx of hComp) fg[idx] = 1;
    }
  }

  // 3. Poda de hilos residuales solo junto a la base del libro + conserva componentes principales (>= 180 px)
  for (let pass = 0; pass < 2; pass++) {
    const nxt = new Uint8Array(fg);
    for (let y = Math.max(1, bot - 16); y < Math.min(sH - 1, bot + 6); y++) {
      for (let x = 1; x < sW - 1; x++) {
        const i = y * sW + x;
        if (!fg[i] || lumF[i] < 25) continue;
        let exN = 0;
        let fgN = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ni = (y + dy) * sW + (x + dx);
            if (excluded[ni]) exN++;
            if (fg[ni]) fgN++;
          }
        }
        if (exN >= 2 && fgN <= 4 && minDiff[i] < 95) nxt[i] = 0;
      }
    }
    fg = nxt;
  }

  const seen = new Uint8Array(N);
  const keptIndices = [];
  for (let s = 0; s < N; s++) {
    if (!fg[s] || seen[s]) continue;
    const comp = [];
    const cq = [s];
    seen[s] = 1;
    let cMinX = 1e9;
    let cMaxX = -1;
    let cMinY = 1e9;
    let cMaxY = -1;
    while (cq.length) {
      const i = cq.pop();
      comp.push(i);
      const x = i % sW;
      const y = (i / sW) | 0;
      if (x < cMinX) cMinX = x;
      if (x > cMaxX) cMaxX = x;
      if (y < cMinY) cMinY = y;
      if (y > cMaxY) cMaxY = y;
      const nbrs = [x > 0 ? i - 1 : -1, x < sW - 1 ? i + 1 : -1, y > 0 ? i - sW : -1, y < sH - 1 ? i + sW : -1];
      for (const ni of nbrs) {
        if (ni >= 0 && fg[ni] && !seen[ni]) {
          seen[ni] = 1;
          cq.push(ni);
        }
      }
    }
    const isLowerBookCorner =
      comp.length < 700 && cMinY >= bot - 28 && cMaxY <= bot && cMinX >= sp - 170 && cMaxX <= sp + 170;
    if (comp.length >= 180 && !isLowerBookCorner) {
      for (const idx of comp) keptIndices.push(idx);
    }
  }

  const out = Buffer.alloc(N * 4);
  for (const i of keptIndices) {
    out[i * 4] = scaledData[i * 4];
    out[i * 4 + 1] = scaledData[i * 4 + 1];
    out[i * 4 + 2] = scaledData[i * 4 + 2];
    out[i * 4 + 3] = scaledData[i * 4 + 3];
  }
  return { buf: out, w: sW, h: sH, sp, bot };
}

function alphaBox(rgba, W, H) {
  let minX = 1e9;
  let maxX = -1;
  let minY = 1e9;
  let maxY = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (rgba[(y * W + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

async function buildSitGroundSheet(targetStandingH) {
  const frames = [];
  let sitScale = 1;

  for (let idx = 0; idx < SIT_FRAME_COUNT; idx++) {
    const f = SIT_START_FRAME + idx;
    const { data, info } = await sharp(LIE_GIF, { page: f }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const m = detectLieBook(data, info.width, info.height, f);
    const clean = extractDogWithoutBook(data, info.width, info.height, f, Math.round(m.spineX));
    if (idx === 0) {
      const b0 = alphaBox(clean, info.width, info.height);
      sitScale = targetStandingH / b0.h;
    }

    const sW = Math.round(info.width * sitScale);
    const sH = Math.round(info.height * sitScale);
    const { data: scaledData, info: scaledInfo } = await sharp(clean, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .resize(sW, sH, { kernel: 'lanczos3' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const box = alphaBox(scaledData, scaledInfo.width, scaledInfo.height);
    const anchorX = (m.spineX + SIT_ANCHOR_OFFSET) * sitScale;
    const anchorY = box.maxY;

    frames.push({
      buf: scaledData,
      w: scaledInfo.width,
      h: scaledInfo.height,
      box,
      anchorX,
      anchorY,
    });
  }

  // Calcular lienzo mínimo uniforme que aloje los 9 frames alineados a (centerX, groundY)
  let maxLeft = 0;
  let maxRight = 0;
  let maxUp = 0;
  const maxDown = 4;
  for (const fr of frames) {
    maxLeft = Math.max(maxLeft, Math.ceil(fr.anchorX - fr.box.minX));
    maxRight = Math.max(maxRight, Math.ceil(fr.box.maxX - fr.anchorX));
    maxUp = Math.max(maxUp, Math.ceil(fr.anchorY - fr.box.minY));
  }

  const PAD_X = 6;
  const PAD_TOP = 6;
  const centerX = maxLeft + PAD_X;
  const groundY = maxUp + PAD_TOP;
  const cellW = centerX + maxRight + PAD_X;
  const cellH = groundY + maxDown;

  const rows = Math.ceil(SIT_TOTAL_FRAMES / SIT_COLS);
  const sheetW = SIT_COLS * cellW;
  const sheetH = rows * cellH;
  const composites = [];
  const rawCells = [];

  for (let idx = 0; idx < frames.length; idx++) {
    const fr = frames[idx];
    const left = Math.round(centerX - fr.anchorX);
    const top = Math.round(groundY - fr.anchorY);
    const cL = Math.max(0, -left);
    const cT = Math.max(0, -top);
    const pL = Math.max(0, left);
    const pT = Math.max(0, top);
    const eW = Math.min(fr.w - cL, cellW - pL);
    const eH = Math.min(fr.h - cT, cellH - pT);

    const clipped = await sharp(fr.buf, { raw: { width: fr.w, height: fr.h, channels: 4 } })
      .extract({ left: cL, top: cT, width: eW, height: eH })
      .png()
      .toBuffer();

    const cellRaw = await sharp({
      create: { width: cellW, height: cellH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: clipped, left: pL, top: pT }])
      .raw()
      .toBuffer();
    rawCells.push(cellRaw);
  }

  // Medimos eje exacto de la cara (`symX`) y punto medio entre patas delanteras (`legsMidX` = 217)
  const sit8 = rawCells[SIT_FRAME_COUNT - 1];
  const box8 = alphaBox(sit8, cellW, cellH);
  const headMaxY = box8.minY + Math.round(box8.h * 0.48);
  let headMinX = 1e9;
  let headMaxX = -1;
  for (let y = box8.minY; y <= headMaxY; y++) {
    for (let x = box8.minX; x <= box8.maxX; x++) {
      if (sit8[(y * cellW + x) * 4 + 3] > 64) {
        if (x < headMinX) headMinX = x;
        if (x > headMaxX) headMaxX = x;
      }
    }
  }
  const approxHeadCx = Math.round((headMinX + headMaxX) / 2);
  let whiteXSum = 0;
  let whiteCnt = 0;
  for (let y = box8.minY + Math.round(box8.h * 0.16); y <= box8.minY + Math.round(box8.h * 0.42); y++) {
    for (let x = approxHeadCx - 28; x <= approxHeadCx + 28; x++) {
      if (x < 0 || x >= cellW) continue;
      const i = (y * cellW + x) * 4;
      const lum = (sit8[i] + sit8[i + 1] + sit8[i + 2]) / 3;
      if (sit8[i + 3] > 128 && lum > 185) {
        whiteXSum += x;
        whiteCnt++;
      }
    }
  }
  const symX = whiteCnt > 10 ? Math.round(whiteXSum / whiteCnt) : approxHeadCx;
  const headOffsetX = symX - centerX;
  const legsMidX = symX + 5; // centro limpio del hueco entre ambas patas delanteras (x=217)

  // Franja frontal simétrica (cabeza intacta arriba de neckStart + pecho/patas espejo respecto a eje suave)
  const neckStart = box8.minY + Math.round(box8.h * 0.32);
  const neckEnd = neckStart + 10;
  const frontMask = Buffer.alloc(cellW * cellH * 4);
  for (let y = 0; y < cellH; y++) {
    const axisX =
      y <= neckStart ? symX : y >= 210 ? legsMidX : symX + ((legsMidX - symX) * (y - neckStart)) / (210 - neckStart);
    for (let x = 0; x < cellW; x++) {
      const dstI = (y * cellW + x) * 4;
      if (y >= box8.maxY - 22 && Math.abs(x - legsMidX) <= 5) continue;
      if (y < neckStart) {
        for (let c = 0; c < 4; c++) frontMask[dstI + c] = sit8[dstI + c];
      } else {
        const sampleX = x >= axisX ? x : Math.min(cellW - 1, Math.max(0, Math.round(2 * axisX - x)));
        const mi = (y * cellW + sampleX) * 4;
        if (y > neckEnd) {
          for (let c = 0; c < 4; c++) frontMask[dstI + c] = sit8[mi + c];
        } else {
          const w = (y - neckStart) / (neckEnd - neckStart);
          const a = Math.round(sit8[dstI + 3] * (1 - w) + sit8[mi + 3] * w);
          if (a > 12) {
            for (let c = 0; c < 3; c++) {
              frontMask[dstI + c] = Math.round(sit8[dstI + c] * (1 - w) + sit8[mi + c] * w);
            }
            frontMask[dstI + 3] = a;
          }
        }
      }
    }
  }

  function overBuffer(bottom, top) {
    const out = Buffer.from(bottom);
    for (let i = 0; i < out.length; i += 4) {
      const sa = top[i + 3] / 255;
      if (sa <= 0) continue;
      const da = out[i + 3] / 255;
      const outA = sa + da * (1 - sa);
      if (outA <= 0) continue;
      for (let c = 0; c < 3; c++) {
        out[i + c] = Math.round((top[i + c] * sa + out[i + c] * da * (1 - sa)) / outA);
      }
      out[i + 3] = Math.round(outA * 255);
    }
    return out;
  }

  // Ancas traseras simétricas discretas (0.28) para frame 10 so Doly sentada de frente conserva cuerpo redondeado
  const turnCenterBase = Buffer.alloc(cellW * cellH * 4);
  const rearTopCenter = box8.minY + Math.round(box8.h * 0.44);
  const rearBotCenter = box8.minY + Math.round(box8.h * 0.96);
  for (let y = rearTopCenter; y <= rearBotCenter; y++) {
    for (let x = 0; x < symX; x++) {
      if (y >= box8.maxY - 22 && Math.abs(x - legsMidX) <= 5) continue;
      const srcX = Math.round(symX - (symX - x) / 0.28);
      if (srcX < symX - 135 || srcX >= symX - 18) continue;
      const si = (y * cellW + srcX) * 4;
      if (sit8[si + 3] < 8) continue;
      const di = (y * cellW + x) * 4;
      const mx = Math.min(cellW - 1, Math.max(0, 2 * legsMidX - x));
      const mi = (y * cellW + mx) * 4;
      for (let c = 0; c < 4; c++) {
        turnCenterBase[di + c] = sit8[si + c];
        if (!(y >= box8.maxY - 22 && Math.abs(mx - legsMidX) <= 5)) {
          turnCenterBase[mi + c] = sit8[si + c];
        }
      }
    }
  }
  const turnCenter = overBuffer(turnCenterBase, frontMask);

  // Frames 9 y 11: cuerpo trasero encogido detrás de frontMask (cabeza/pecho/patas delanteras sin movimiento)
  function buildHalfTurnCell(rearScale) {
    const out = Buffer.alloc(cellW * cellH * 4);
    const rearTop = box8.minY + Math.round(box8.h * 0.38);
    for (let y = rearTop; y < cellH; y++) {
      for (let x = 0; x < symX; x++) {
        const srcX = Math.round(symX - (symX - x) / rearScale);
        if (srcX < 0 || srcX >= symX - 8) continue;
        const si = (y * cellW + srcX) * 4;
        if (sit8[si + 3] < 8) continue;
        const di = (y * cellW + x) * 4;
        for (let c = 0; c < 4; c++) out[di + c] = sit8[si + c];
      }
    }
    return overBuffer(out, frontMask);
  }

  rawCells[SIT_TURN_HALF] = buildHalfTurnCell(0.45);
  rawCells[SIT_TURN_CENTER] = turnCenter;
  rawCells[SIT_TURN_QUARTER] = buildHalfTurnCell(0.75);

  for (let idx = 0; idx < SIT_TOTAL_FRAMES; idx++) {
    const cellPng = await sharp(rawCells[idx], { raw: { width: cellW, height: cellH, channels: 4 } })
      .png()
      .toBuffer();
    composites.push({
      input: cellPng,
      left: (idx % SIT_COLS) * cellW,
      top: Math.floor(idx / SIT_COLS) * cellH,
    });
  }

  const sheetPng = await sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png()
    .toBuffer();

  await sharp(sheetPng)
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toFile(path.join(OUT_SPRITES, 'doly-sit-ground.webp'));

  await sharp(sheetPng)
    .flatten({ background: '#1c1c1c' })
    .png()
    .toFile(path.join(root, 'assets-src', 'doly-sit-ground-preview.png'));

  console.log(
    `✔ doly-sit-ground.webp generado (${SIT_TOTAL_FRAMES} frames: ${SIT_FRAME_COUNT} sit + 3 giro · celda ${cellW}x${cellH}, scale ${sitScale.toFixed(3)}, symX=${symX})`,
  );

  return {
    sitSeq: {
      image: '/sprites/doly-sit-ground.webp',
      frameW: cellW,
      frameH: cellH,
      cols: SIT_COLS,
      rows,
      count: SIT_FRAME_COUNT,
      turnQuarterFrame: SIT_TURN_QUARTER,
      turnHalfFrame: SIT_TURN_HALF,
      turnCenterFrame: SIT_TURN_CENTER,
      groundY,
      centerX,
      headOffsetX,
    },
    sit8Box: box8,
  };
}

async function buildBookSequenceSheet() {
  // 1. Extraemos el libro vacío de LIE[00] y la escala exacta (358px de portada)
  const { data: dLie0, info: iLie0 } = await sharp(LIE_GIF, { page: 0 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const cleanLie0 = cleanGifFrame(dLie0, iLie0.width, iLie0.height);
  const lie0Metrics = detectLieBook(dLie0, iLie0.width, iLie0.height, 0);

  const HALF_W = 195;
  const TOP_Y_LIE = 230;
  const BOOK_H = 112;
  const emptyBookLie = buildSymmetricBook(
    cleanLie0,
    iLie0.width,
    iLie0.height,
    Math.round(lie0Metrics.spineX),
    TOP_Y_LIE,
    BOOK_H,
    HALF_W,
  );
  const emptyBookLiePng = await sharp(emptyBookLie.buf, {
    raw: { width: emptyBookLie.width, height: emptyBookLie.height, channels: 4 },
  })
    .png()
    .toBuffer();

  const TOP_OFFSET = lie0Metrics.bookBottomY - TOP_Y_LIE;

  // Calculamos el borde inferior de página blanca en emptyBookLie respecto a BOOK_GROUND_Y
  const pageEdgeBotRelGround = new Int16Array(HALF_W * 2).fill(999);
  for (let bx = 0; bx < emptyBookLie.width; bx++) {
    let lowestWhiteY = -1;
    for (let y = 0; y <= Math.min(BOOK_H - 1, TOP_OFFSET + 6); y++) {
      const i = (y * emptyBookLie.width + bx) * 4;
      const lum = (emptyBookLie.buf[i] + emptyBookLie.buf[i + 1] + emptyBookLie.buf[i + 2]) / 3;
      if (emptyBookLie.buf[i + 3] > 128 && lum > 185) lowestWhiteY = y;
    }
    if (lowestWhiteY >= 0) {
      pageEdgeBotRelGround[bx] = lowestWhiteY - TOP_OFFSET;
    }
  }

  // Referencia de STAND para resta de fondo exacta sobre STAND[0..29] (nunca se dibuja; solo canonical emptyBookLie)
  async function loadScaledStand(frameIdx) {
    const { data, info } = await sharp(STAND_GIF, { page: frameIdx })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const clean = cleanGifFrame(data, info.width, info.height);
    const m = detectStandBook(data, info.width);
    const scale = TARGET_COVER_W / m.coverW;
    const sW = Math.round(info.width * scale);
    const sH = Math.round(info.height * scale);
    const resized = await sharp(clean, { raw: { width: info.width, height: info.height, channels: 4 } })
      .resize(sW, sH, { kernel: 'lanczos3' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      buf: resized.data,
      w: resized.info.width,
      h: resized.info.height,
      spineInResized: STAND_SPINE_X - Math.round(STAND_SPINE_X - m.spineX * scale),
      topInResized: (BOOK_GROUND_Y - TOP_OFFSET) - Math.round(BOOK_GROUND_Y - m.bookBottomY * scale),
    };
  }

  const [standInner, standOuter] = await Promise.all([loadScaledStand(28), loadScaledStand(11)]);
  const emptyStandBuf = Buffer.alloc(HALF_W * 2 * BOOK_H * 4);
  for (let y = 0; y < BOOK_H; y++) {
    for (let dx = 0; dx < HALF_W; dx++) {
      const src = dx <= 105 ? standInner : standOuter;
      const srcY = src.topInResized + y;
      if (srcY < 0 || srcY >= src.h) continue;
      const srcX = Math.min(src.w - 1, Math.max(0, src.spineInResized + dx));
      const sIdx = (srcY * src.w + srcX) * 4;
      const rIdx = (y * HALF_W * 2 + HALF_W + dx) * 4;
      const lIdx = (y * HALF_W * 2 + HALF_W - 1 - dx) * 4;
      for (let c = 0; c < 4; c++) {
        emptyStandBuf[rIdx + c] = src.buf[sIdx + c];
        emptyStandBuf[lIdx + c] = src.buf[sIdx + c];
      }
    }
  }

  const TOTAL_CELLS = 61; // 0..29: LIE (solo Doly), 30..59: STAND (solo Doly), 60: libro canónico único
  const rows = Math.ceil(TOTAL_CELLS / BOOK_COLS);
  const sheetW = BOOK_COLS * BOOK_CELL_W;
  const sheetH = rows * BOOK_CELL_H;
  const composites = [];
  const previewComposites = [];

  /** Coloca únicamente la silueta de Doly ya escalada dentro de su celda de 680x320 */
  async function composeScaledDogCell(dogScaled, targetSpineX, targetGroundY = BOOK_GROUND_Y) {
    const left = targetSpineX - dogScaled.sp;
    const top = targetGroundY - dogScaled.bot;

    const cL = Math.max(0, -left);
    const cT = Math.max(0, -top);
    const pL = Math.max(0, left);
    const pT = Math.max(0, top);
    const eW = Math.min(dogScaled.w - cL, BOOK_CELL_W - pL);
    const eH = Math.min(dogScaled.h - cT, BOOK_CELL_H - pT);

    const clipped = await sharp(dogScaled.buf, {
      raw: { width: dogScaled.w, height: dogScaled.h, channels: 4 },
    })
      .extract({ left: cL, top: cT, width: eW, height: eH })
      .png()
      .toBuffer();

    return sharp({
      create: { width: BOOK_CELL_W, height: BOOK_CELL_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([{ input: clipped, left: pL, top: pT }])
      .png()
      .toBuffer();
  }

  const bookTopCell = BOOK_GROUND_Y - TOP_OFFSET;

  // 1) Frames 0..29: LIE (solo Doly, escalada a TARGET_COVER_W = 358px)
  for (let i = 0; i < 30; i++) {
    const { data, info } = await sharp(LIE_GIF, { page: i }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const clean = cleanGifFrame(data, info.width, info.height);
    const m = detectLieBook(data, info.width, info.height, i);
    const scale = TARGET_COVER_W / m.coverW;
    const dogScaled = await extractDogByDiff(
      clean,
      info.width,
      info.height,
      m,
      scale,
      true,
      i,
      emptyBookLie.buf,
      pageEdgeBotRelGround,
      HALF_W,
      TOP_OFFSET,
      BOOK_H,
    );
    const cellPng = await composeScaledDogCell(dogScaled, LIE_SPINE_X, BOOK_GROUND_Y);
    const left = (i % BOOK_COLS) * BOOK_CELL_W;
    const top = Math.floor(i / BOOK_COLS) * BOOK_CELL_H;
    composites.push({ input: cellPng, left, top });
    previewComposites.push({ input: emptyBookLiePng, left: left + LIE_SPINE_X - HALF_W, top: top + bookTopCell });
    previewComposites.push({ input: cellPng, left, top });
  }

  // 2) Frames 30..59: STAND (solo Doly, alineada verticalmente +2px sobre el libro canónico)
  const STAND_Y_ADJUST = 2;
  for (let i = 0; i < 30; i++) {
    const { data, info } = await sharp(STAND_GIF, { page: i }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const clean = cleanGifFrame(data, info.width, info.height);
    const m = detectStandBook(data, info.width);
    const scale = TARGET_COVER_W / m.coverW;
    const dogScaled = await extractDogByDiff(
      clean,
      info.width,
      info.height,
      m,
      scale,
      false,
      i,
      emptyStandBuf,
      pageEdgeBotRelGround,
      HALF_W,
      TOP_OFFSET,
      BOOK_H,
    );
    const cellPng = await composeScaledDogCell(dogScaled, STAND_SPINE_X, BOOK_GROUND_Y + STAND_Y_ADJUST);
    const idx = 30 + i;
    const left = (idx % BOOK_COLS) * BOOK_CELL_W;
    const top = Math.floor(idx / BOOK_COLS) * BOOK_CELL_H;
    composites.push({ input: cellPng, left, top });
    previewComposites.push({ input: emptyBookLiePng, left: left + STAND_SPINE_X - HALF_W, top: top + bookTopCell });
    previewComposites.push({ input: cellPng, left, top });
  }

  // 3) Frame 60: Libro abierto canónico único (centrado en LIE_SPINE_X)
  const emptyBookCell = await sharp({
    create: { width: BOOK_CELL_W, height: BOOK_CELL_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: emptyBookLiePng, left: LIE_SPINE_X - HALF_W, top: bookTopCell }])
    .png()
    .toBuffer();

  const emptyLeft = (60 % BOOK_COLS) * BOOK_CELL_W;
  const emptyTop = Math.floor(60 / BOOK_COLS) * BOOK_CELL_H;
  composites.push({ input: emptyBookCell, left: emptyLeft, top: emptyTop });
  previewComposites.push({ input: emptyBookCell, left: emptyLeft, top: emptyTop });

  const sheetBase = sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(composites);

  const previewBase = sharp({
    create: { width: sheetW, height: sheetH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite(previewComposites);

  // ── Recorte de la hoja ────────────────────────────────────────────────────
  const composed = await sheetBase.clone().png().toBuffer();
  const { data: compData, info: compInfo } = await sharp(composed)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bx0 = 1e9;
  let bx1 = -1;
  let by0 = 1e9;
  let by1 = -1;
  for (let cell = 0; cell < TOTAL_CELLS; cell++) {
    const cx = (cell % BOOK_COLS) * BOOK_CELL_W;
    const cy = Math.floor(cell / BOOK_COLS) * BOOK_CELL_H;
    let c0 = 1e9;
    let c1 = -1;
    let r0 = 1e9;
    let r1 = -1;
    for (let y = 0; y < BOOK_CELL_H; y++) {
      for (let x = 0; x < BOOK_CELL_W; x++) {
        if (compData[((cy + y) * compInfo.width + (cx + x)) * 4 + 3] > 2) {
          if (x < c0) c0 = x;
          if (x > c1) c1 = x;
          if (y < r0) r0 = y;
          if (y > r1) r1 = y;
        }
      }
    }
    if (c1 < 0) continue;
    if (c0 < bx0) bx0 = c0;
    if (c1 > bx1) bx1 = c1;
    if (r0 < by0) by0 = r0;
    if (r1 > by1) by1 = r1;
  }
  const croppedW = bx1 - bx0 + 1;
  const croppedH = by1 - by0 + 1;
  const bookCell = {
    frameW: croppedW,
    frameH: croppedH,
    lieSpineX: LIE_SPINE_X - bx0,
    standSpineX: STAND_SPINE_X - bx0,
    groundY: BOOK_GROUND_Y - by0,
    standYAdjust: STAND_Y_ADJUST,
  };

  // Reensambla la hoja (y preview compuesto con libro canónico) con las celdas recortadas
  const cropRows = Math.ceil(TOTAL_CELLS / BOOK_COLS);
  const previewComposed = await previewBase.png().toBuffer();
  const cropComposites = [];
  const cropPreviewComposites = [];
  for (let cell = 0; cell < TOTAL_CELLS; cell++) {
    const cx = (cell % BOOK_COLS) * BOOK_CELL_W;
    const cy = Math.floor(cell / BOOK_COLS) * BOOK_CELL_H;
    const buf = await sharp(composed)
      .extract({ left: cx + bx0, top: cy + by0, width: croppedW, height: croppedH })
      .png()
      .toBuffer();
    const pBuf = await sharp(previewComposed)
      .extract({ left: cx + bx0, top: cy + by0, width: croppedW, height: croppedH })
      .png()
      .toBuffer();
    cropComposites.push({ input: buf, left: (cell % BOOK_COLS) * croppedW, top: Math.floor(cell / BOOK_COLS) * croppedH });
    cropPreviewComposites.push({ input: pBuf, left: (cell % BOOK_COLS) * croppedW, top: Math.floor(cell / BOOK_COLS) * croppedH });
  }
  const croppedSheet = await sharp({
    create: {
      width: BOOK_COLS * croppedW,
      height: cropRows * croppedH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(cropComposites)
    .png()
    .toBuffer();

  const fullPreviewPng = await sharp({
    create: {
      width: BOOK_COLS * croppedW,
      height: cropRows * croppedH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(cropPreviewComposites)
    .flatten({ background: '#1c1c1c' })
    .png()
    .toBuffer();

  const croppedPreview = await sharp(fullPreviewPng)
    .resize(Math.round(BOOK_COLS * croppedW * 0.5))
    .png()
    .toBuffer();

  await sharp(croppedSheet)
    .webp({ quality: 82, alphaQuality: 100, effort: 6 })
    .toFile(path.join(OUT_SPRITES, 'doly-book-seq.webp'));

  await sharp(croppedPreview).toFile(path.join(root, 'assets-src', 'doly-book-seq-preview.png'));

  console.log(
    `✔ doly-book-seq.webp generado (61 frames: 60 Doly sin libro + 1 libro canónico · celda ${BOOK_CELL_W}x${BOOK_CELL_H} -> ${croppedW}x${croppedH})`,
  );

  // Medición de LIE[20] sin libro para emparejar escala, altura y cabeza del giro sobre el libro
  const { data: cropData, info: cropInfo } = await sharp(croppedSheet)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Verificación: frame 60 debe medir exactamente TARGET_COVER_W y frames 0..59 no deben invadir base del libro
  {
    const ox = (60 % BOOK_COLS) * croppedW;
    const oy = Math.floor(60 / BOOK_COLS) * croppedH;
    let minDx = 999;
    let maxDx = -999;
    let botY = -1;
    for (let y = Math.max(0, bookCell.groundY - 12); y < croppedH; y++) {
      for (let x = 0; x < croppedW; x++) {
        const dx = x - bookCell.lieSpineX;
        if (Math.abs(dx) > 195) continue;
        if (cropData[((oy + y) * cropInfo.width + (ox + x)) * 4 + 3] > 128) {
          if (dx < minDx) minDx = dx;
          if (dx > maxDx) maxDx = dx;
          if (Math.abs(dx) <= 60 && y > botY) botY = y;
        }
      }
    }
    const bookW = maxDx - minDx;
    console.log(`  · EMPTY(60) bookW=${bookW} [${minDx}..${maxDx}] bot=${botY - bookCell.groundY}`);
    if (Math.abs(bookW - TARGET_COVER_W) > 6) {
      throw new Error(`Ancho del libro canónico desfasado: ${bookW} (esperado ~${TARGET_COVER_W})`);
    }
  }

  // Bounding box real (trazo del cuerpo/patas, excluyendo sombra gris suave sobre la hoja) + centro de cabeza de LIE[20]
  const ox20 = (20 % BOOK_COLS) * croppedW;
  const oy20 = Math.floor(20 / BOOK_COLS) * croppedH;
  let l20MinX = 1e9;
  let l20MaxX = -1;
  let l20MinY = 1e9;
  let l20MaxY = -1;
  for (let y = 0; y < croppedH; y++) {
    for (let x = 0; x < croppedW; x++) {
      const pi = ((oy20 + y) * cropInfo.width + (ox20 + x)) * 4;
      const lum = (cropData[pi] + cropData[pi + 1] + cropData[pi + 2]) / 3;
      if (cropData[pi + 3] > 128 && lum < 165) {
        if (x < l20MinX) l20MinX = x;
        if (x > l20MaxX) l20MaxX = x;
        if (y < l20MinY) l20MinY = y;
        if (y > l20MaxY) l20MaxY = y;
      }
    }
  }
  const lie20H = l20MaxY - l20MinY + 1;
  const lie20HeadMaxY = l20MinY + Math.round(lie20H * 0.48);
  let l20HeadMinX = 1e9;
  let l20HeadMaxX = -1;
  for (let y = l20MinY; y <= lie20HeadMaxY; y++) {
    for (let x = l20MinX; x <= l20MaxX; x++) {
      if (cropData[((oy20 + y) * cropInfo.width + (ox20 + x)) * 4 + 3] > 64) {
        if (x < l20HeadMinX) l20HeadMinX = x;
        if (x > l20HeadMaxX) l20HeadMaxX = x;
      }
    }
  }
  bookCell.lie20Box = {
    h: lie20H,
    botY: l20MaxY,
    headOffsetX: Math.round((l20HeadMinX + l20HeadMaxX) / 2) - bookCell.lieSpineX,
  };

  return bookCell;
}

const walkCount = await buildWalkSheet();

// ─────────────────────────────────────────────────────────────────────────────
// Medición del arte original.
// Las tres hojas (caminata, sentado en suelo y libro) comparten escala y puntos
// de relevo medidos directamente sobre el dibujo.
// ─────────────────────────────────────────────────────────────────────────────

/** Doly dentro del recorte de la hoja de caminata (en coordenadas de celda) */
const walkRaw = await sharp(WALK_GIF, { page: 0 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const walkInkSrc = inkBox(walkRaw.data, walkRaw.info, WALK_CROP.left, WALK_CROP.left + WALK_CROP.width);
const walkInk = {
  minX: walkInkSrc.minX - WALK_CROP.left,
  maxX: walkInkSrc.maxX - WALK_CROP.left,
  w: walkInkSrc.w,
  h: walkInkSrc.h,
};

/** Doly en el primer frame del libro (está a la izquierda, junto al lomo) */
const lieRaw = await sharp(LIE_GIF, { page: 0 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const lieMetrics = detectLieBook(lieRaw.data, lieRaw.info.width, lieRaw.info.height, 0);
const lieScale = TARGET_COVER_W / lieMetrics.coverW;
const lieLeft = LIE_SPINE_X - lieMetrics.spineX * lieScale;
const lieDog = inkBox(lieRaw.data, lieRaw.info, 0, Math.round(lieMetrics.spineX - 153));

/** Doly mide lo mismo en las tres hojas: la escala sale de su alto real */
const walkScale = lieDog.h / walkInk.h;
const targetStandingH = walkInk.h * walkScale;

const { sitSeq: baseSitSeq, sit8Box } = await buildSitGroundSheet(targetStandingH);
const bookCell = await buildBookSequenceSheet();

const sitSeq = {
  ...baseSitSeq,
  bookSitScale: Number((bookCell.lie20Box.h / sit8Box.h).toFixed(4)),
  bookSitGroundOffsetY: bookCell.lie20Box.botY - bookCell.groundY,
  bookSitHeadOffsetX: bookCell.lie20Box.headOffsetX,
};

/**
 * Punto donde la hoja de caminata entrega el control a la secuencia del libro (LIE[0]):
 * se iguala el centro de la silueta de Doly en las dos hojas.
 */
const walkInkCenter = (walkInk.minX + walkInk.maxX) / 2;
const lieDogCenter = (lieDog.minX + lieDog.maxX) / 2 + lieLeft;
const entryDogOffsetX = Math.round(lieDogCenter - LIE_SPINE_X - (walkInkCenter - 185) * walkScale);

/**
 * Punto donde la secuencia del libro devuelve el control a la hoja de caminata (STAND[26]):
 * todas las patas ya están fuera del libro sobre el lado derecho. Se mide el centro
 * horizontal del cuerpo y la altura real de las patas respecto a BOOK_GROUND_Y.
 */
const standExitRaw = await sharp(STAND_GIF, { page: STAND_EXIT_FRAME })
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
const standExitMetrics = detectStandBook(standExitRaw.data, standExitRaw.info.width);
const standExitCoverRightX = Math.round(standExitMetrics.spineX + STAND_RAW_COVER_W / 2);
const standExitScale = TARGET_COVER_W / standExitMetrics.coverW;
let exitMinX = 1e9;
let exitMaxX = -1;
let exitFeetMaxY = -1;
for (let y = 70; y <= 235; y++) {
  for (let x = Math.round(standExitMetrics.spineX + 90); x < standExitRaw.info.width; x++) {
    const i = (y * standExitRaw.info.width + x) * 3;
    if ((standExitRaw.data[i] + standExitRaw.data[i + 1] + standExitRaw.data[i + 2]) / 3 > 35) {
      if (x < exitMinX) exitMinX = x;
      if (x > exitMaxX) exitMaxX = x;
    }
  }
}
for (let y = 236; y <= 320; y++) {
  for (let x = standExitCoverRightX + 2; x < standExitRaw.info.width; x++) {
    const i = (y * standExitRaw.info.width + x) * 3;
    if ((standExitRaw.data[i] + standExitRaw.data[i + 1] + standExitRaw.data[i + 2]) / 3 > 35) {
      if (x < exitMinX) exitMinX = x;
      if (x > exitMaxX) exitMaxX = x;
      if (y > exitFeetMaxY) exitFeetMaxY = y;
    }
  }
}
const exitDogCenterCell = STAND_SPINE_X + (((exitMinX + exitMaxX) / 2) - standExitMetrics.spineX) * standExitScale;
const exitDogOffsetX = Math.round(exitDogCenterCell - STAND_SPINE_X - (walkInkCenter - 185) * walkScale);
const exitFeetOffsetY = Math.round((exitFeetMaxY - standExitMetrics.bookBottomY) * standExitScale) + bookCell.standYAdjust;

async function hashSpriteFile(fileName) {
  const buf = await readFile(path.join(OUT_SPRITES, fileName));
  return createHash('sha256').update(buf).digest('hex').slice(0, 10);
}

const [walkHash, sitHash, bookHash] = await Promise.all([
  hashSpriteFile('doly-walk.webp'),
  hashSpriteFile('doly-sit-ground.webp'),
  hashSpriteFile('doly-book-seq.webp'),
]);
const manifestVersion = createHash('sha256')
  .update(`${walkHash}:${sitHash}:${bookHash}`)
  .digest('hex')
  .slice(0, 10);

const manifest = {
  version: manifestVersion,
  image: `/sprites/doly-walk.webp?v=${walkHash}`,
  frameW: WALK_CROP.width,
  frameH: WALK_CROP.height,
  cols: WALK_COLS,
  rows: Math.ceil(walkCount / WALK_COLS),
  designW: WALK_CROP.width,
  designH: WALK_CROP.height,
  groundY: 244,
  standingHeight: 233,
  strideUnits: 320,
  centerX: 185,
  walkScale,
  sitSeq: {
    ...sitSeq,
    image: `/sprites/doly-sit-ground.webp?v=${sitHash}`,
  },
  bookSeq: {
    image: `/sprites/doly-book-seq.webp?v=${bookHash}`,
    frameW: bookCell.frameW,
    frameH: bookCell.frameH,
    cols: BOOK_COLS,
    rows: 11,
    groundY: bookCell.groundY,
    lieSpineX: bookCell.lieSpineX,
    standSpineX: bookCell.standSpineX,
    lieStart: 0,
    lieCount: 30,
    standStart: 30,
    standCount: 30,
    standExitFrame: STAND_EXIT_FRAME,
    emptyBookFrame: 60,
    entryDogOffsetX,
    exitDogOffsetX,
    exitFeetOffsetY,
  },
  ranges: {
    walk: { start: 0, count: walkCount },
    settle: { start: 0, count: 30 },
  },
};

await writeFile(path.join(OUT_SPRITES, 'doly-walk.json'), JSON.stringify(manifest, null, 2));
console.log('✔ manifest actualizado:', manifest);
