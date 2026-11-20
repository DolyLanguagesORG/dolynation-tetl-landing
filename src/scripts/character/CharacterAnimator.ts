/**
 * Contrato para el motor de animación de Doly y el Libro basado en los 3 GIFs:
 *   1. Caminata (30 frames)
 *   2. Recostándose en el libro (30 frames)
 *   3. Levantándose del libro (30 frames)
 */
export interface CharacterFrameState {
  /** centro del cuerpo de Doly en px (coordenadas del stage) */
  x: number;
  /** centro horizontal del escenario (lomo del libro) en px */
  stageCenterX: number;
  /** y del piso bajo las patas / libro en px */
  groundY: number;
  /** frame de caminata (0..29) en doly-walk.webp */
  frame: number;
  /** 1 = mira a la derecha, -1 = mira a la izquierda */
  facing: 1 | -1;
  /** opacidad del sprite de caminata (0 mientras se reproduce la secuencia sobre el libro) */
  alpha: number;
  /** intensidad de la sombra en el piso (0–1) */
  shadow: number;
  /** índice del frame en doly-book-seq.webp (0..29 = lie, 30..59 = stand, 60 = libro vacío) */
  bookFrame: number;
  /** opacidad del libro / secuencia del libro (0..1) */
  bookAlpha: number;
  /** escala de entrada del libro (0.88..1) */
  bookScale: number;
  /** 1 = normal, -1 = espejado horizontal de la secuencia del libro cuando sube el scroll */
  bookFlip: 1 | -1;
}

export interface CharacterRenderer {
  resize(width: number, height: number, dpr: number): void;
  setScale(pxPerUnit: number): void;
  render(state: CharacterFrameState): void;
  dispose(): void;
}

export interface BookSequenceManifest {
  image: string;
  frameW: number;
  frameH: number;
  cols: number;
  rows: number;
  groundY: number;
  lieSpineX: number;
  standSpineX: number;
  lieStart: number;
  lieCount: number;
  standStart: number;
  standCount: number;
  emptyBookFrame: number;
  entryDogOffsetX: number;
  exitDogOffsetX: number;
}

export interface SpriteManifest {
  image: string;
  frameW: number;
  frameH: number;
  cols: number;
  rows: number;
  designW: number;
  designH: number;
  groundY: number;
  standingHeight: number;
  strideUnits: number;
  centerX: number;
  walkScale?: number;
  bookSeq: BookSequenceManifest;
  ranges: {
    walk: { start: number; count: number };
    settle: { start: number; count: number };
  };
}

export async function loadSpriteSheet(manifestUrl: string) {
  const manifest = (await fetch(manifestUrl).then((r) => r.json())) as SpriteManifest;

  const loadImg = async (src: string) => {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    await img.decode();
    return img;
  };

  const [image, bookImage] = await Promise.all([loadImg(manifest.image), loadImg(manifest.bookSeq.image)]);
  return { manifest, image, bookImage };
}
