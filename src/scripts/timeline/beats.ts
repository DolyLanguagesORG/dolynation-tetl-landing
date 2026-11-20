/**
 * Ventanas de progreso (0–1) del recorrido principal con los 3 GIFs:
 *
 *  0.00 ─ hero / escena vacía
 *  0.02 ─ se dibuja el camino
 *  0.06 ─ el libro del GIF aparece abierto en el centro
 *  0.12 ─ Doly entra caminando desde la izquierda (GIF 1: 30 frames)
 *  0.36 ─ Doly sube al libro y se recuesta (GIF 2: 30 frames)
 *  0.50 ─ Doly descansa sobre el libro
 *  0.56 ─ Doly se levanta del libro y da sus primeros pasos (GIF 3: 30 frames)
 *  0.70 ─ Doly continúa caminando hacia la derecha (GIF 1: 30 frames)
 *  0.94 ─ sale por el extremo derecho
 */
export type Range = readonly [number, number];

export const BEATS = {
  heroOut: [0.05, 0.11],
  pathDraw: [0.02, 0.1],
  bookIn: [0.06, 0.12],
  walkIn: [0.12, 0.36],
  settle: [0.36, 0.5],
  rest: [0.5, 0.56],
  standUp: [0.56, 0.7],
  walkOut: [0.7, 0.94],
} as const satisfies Record<string, Range>;

/** Altura del recorrido sticky (en vh). Más alto = scroll más lento. */
export const STORY_HEIGHT_VH = 760;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const norm = (p: number, [a, b]: Range) => clamp01((p - a) / (b - a));
export const inRange = (p: number, [a, b]: Range) => p >= a && p <= b;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
