/**
 * Contrato común para cualquier "motor" de personaje.
 * Hoy: sprite sheet sobre canvas (DolyWalkRenderer).
 * Mañana: podría ser Rive (.riv) o un modelo GLB en Three.js sin tocar la coreografía.
 */
export interface CharacterFrameState {
  /** centro del cuerpo en px (coordenadas del stage) */
  x: number;
  /** y del piso bajo las patas en px */
  groundY: number;
  /** índice absoluto del frame dentro del sprite sheet */
  frame: number;
  /** 1 = mira a la derecha, -1 = mira a la izquierda */
  facing: 1 | -1;
  /** opacidad del sprite (0 durante la pose final con la ilustración original) */
  alpha: number;
  /** intensidad de la sombra en el piso (0–1) */
  shadow: number;
}

export interface CharacterRenderer {
  resize(width: number, height: number, dpr: number): void;
  /** píxeles en pantalla por unidad de diseño del sprite */
  setScale(pxPerUnit: number): void;
  render(state: CharacterFrameState): void;
  dispose(): void;
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
  ranges: {
    walk: { start: number; count: number };
    settle: { start: number; count: number };
  };
}

export async function loadSpriteSheet(manifestUrl: string) {
  const manifest = (await fetch(manifestUrl).then((r) => r.json())) as SpriteManifest;
  const image = new Image();
  image.decoding = 'async';
  image.src = manifest.image;
  await image.decode();
  return { manifest, image };
}
