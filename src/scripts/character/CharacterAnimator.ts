/**
 * Contrato para el motor de animación de Doly y el Libro basado en las 3 hojas:
 *   1. Caminata (30 frames, doly-walk.webp)
 *   2. Sentada en el suelo sin libro (9 frames, doly-sit-ground.webp)
 *   3. Secuencia sobre el libro (30 lie + 30 stand + 1 libro vacío, doly-book-seq.webp)
 */

/** Capa de la hoja de caminata (perrita de perfil sobre el suelo). */
export interface WalkLayer {
  /** centro del cuerpo de Doly en px (coordenadas del stage) */
  x: number;
  /** frame de caminata (0..29) en doly-walk.webp */
  frame: number;
  /** 1 = mira a la derecha, -1 = mira a la izquierda */
  facing: 1 | -1;
  /** opacidad de la capa (0..1) */
  alpha: number;
  /** intensidad de la sombra en el piso (0–1) */
  shadow: number;
  /** desplazamiento vertical en px (Doly baja del libro al suelo al salir) */
  yOffset: number;
}

/** Capa de sentado en el suelo (doly-sit-ground.webp, sin libro). */
export interface SitLayer {
  /** centro del cuerpo de Doly en px (coordenadas del stage) */
  x: number;
  /** frame (0 = perfil caminando -> 8 = sentada de frente, 9..11 = giro con cabeza fija) */
  frame: number;
  /** 1 = orientada desde la izquierda, -1 = espejada desde la derecha */
  facing: 1 | -1;
  /** opacidad de la capa (0..1) */
  alpha: number;
  /** intensidad de la sombra en el piso (0–1) */
  shadow: number;
  /** desplazamiento vertical opcional en px (usado al girar sentada encima del libro) */
  yOffset?: number;
  /** factor de escala relativo a k (por defecto 1) */
  scale?: number;
}

/** Capa de la secuencia del libro (perrita + libro en el mismo plano). */
export interface BookLayer {
  /** índice del frame en doly-book-seq.webp (0..29 lie, 30..59 stand, 60 vacío) */
  frame: number;
  /** opacidad de la capa (0..1) */
  alpha: number;
  /** 1 = normal, -1 = espejado horizontal */
  flip: 1 | -1;
}

export interface CharacterFrameState {
  /** centro horizontal del escenario (lomo del libro) en px */
  stageCenterX: number;
  /** y del piso bajo las patas / libro en px */
  groundY: number;
  /** capa de caminata (null si la perrita no está en caminata pura) */
  walk: WalkLayer | null;
  /** capa principal de sentado en el suelo */
  sitA: SitLayer | null;
  /** capa secundaria de sentado en el suelo (para cross-fades de giro suave) */
  sitB: SitLayer | null;
  /** primera capa del plano del libro */
  bookA: BookLayer | null;
  /** segunda capa del plano del libro (mezcla entre poses) */
  bookB: BookLayer | null;
  /** opacidad del libro vacío de fondo (0..1) */
  bookEmptyAlpha: number;
  /** escala de entrada del libro (0.92..1) */
  bookScale: number;
}

export interface CharacterRenderer {
  resize(width: number, height: number, dpr: number): void;
  setScale(pxPerUnit: number): void;
  render(state: CharacterFrameState): void;
  dispose(): void;
}

export interface SitSequenceManifest {
  image: string;
  frameW: number;
  frameH: number;
  cols: number;
  rows: number;
  count: number;
  turnQuarterFrame: number;
  turnHalfFrame: number;
  turnCenterFrame: number;
  groundY: number;
  centerX: number;
  headOffsetX: number;
  bookSitScale: number;
  bookSitGroundOffsetY: number;
  bookSitHeadOffsetX: number;
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
  standExitFrame: number;
  emptyBookFrame: number;
  entryDogOffsetX: number;
  exitDogOffsetX: number;
  /** diferencia vertical (en unidades de diseño) entre las patas en STAND[standExitFrame] y el suelo */
  exitFeetOffsetY: number;
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
  sitSeq: SitSequenceManifest;
  bookSeq: BookSequenceManifest;
  ranges: {
    walk: { start: number; count: number };
    settle: { start: number; count: number };
  };
}

const loadImg = async (src: string) => {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  await img.decode();
  return img;
};

export interface SpriteSheet {
  manifest: SpriteManifest;
  /** hoja de caminata (siempre disponible) */
  walkImage: HTMLImageElement;
  /** hoja de sentado en suelo (siempre disponible) */
  sitImage: HTMLImageElement;
  /** hoja del libro: precargada en segundo plano desde el arranque */
  bookImage: HTMLImageElement | null;
  /** devuelve la promesa de carga de la hoja del libro */
  loadBook(): Promise<HTMLImageElement>;
}

/**
 * Carga el manifiesto, la hoja de caminata y la de sentado en paralelo,
 * e inicia de inmediato la precarga en segundo plano de la hoja del libro.
 */
export async function loadSpriteSheet(manifestUrl: string): Promise<SpriteSheet> {
  const manifest = (await fetch(manifestUrl).then((r) => r.json())) as SpriteManifest;
  const [walkImage, sitImage] = await Promise.all([loadImg(manifest.image), loadImg(manifest.sitSeq.image)]);

  let bookImage: HTMLImageElement | null = null;
  const bookPromise = loadImg(manifest.bookSeq.image).then((img) => {
    bookImage = img;
    return img;
  });

  const loadBook = (): Promise<HTMLImageElement> => (bookImage ? Promise.resolve(bookImage) : bookPromise);

  return { manifest, walkImage, sitImage, bookImage, loadBook };
}
