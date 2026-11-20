/**
 * Ventanas de progreso (0–1) del recorrido principal.
 * Ajusta estos valores para cambiar el ritmo de la historia.
 *
 *  0.00 ─ hero / escena vacía
 *  0.02 ─ se dibuja el camino
 *  0.08 ─ el libro se abre en el centro
 *  0.12 ─ Doly entra caminando desde la izquierda
 *  0.40 ─ llega al libro y se recuesta
 *  0.49 ─ pose final (ilustración original)
 *  0.61 ─ se levanta
 *  0.67 ─ sigue caminando hacia la derecha
 *  0.92 ─ sale por el extremo derecho
 */
export type Range = readonly [number, number];

export const BEATS = {
  heroOut: [0.05, 0.11],
  pathDraw: [0.02, 0.1],
  bookIn: [0.08, 0.14],
  walkIn: [0.12, 0.4],
  settle: [0.4, 0.46],
  toRest: [0.46, 0.49],
  rest: [0.49, 0.58],
  fromRest: [0.58, 0.61],
  standUp: [0.61, 0.67],
  walkOut: [0.67, 0.92],
} as const satisfies Record<string, Range>;

/** Altura del recorrido sticky (en vh). Más alto = scroll más lento. */
export const STORY_HEIGHT_VH = 720;

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const norm = (p: number, [a, b]: Range) => clamp01((p - a) / (b - a));
export const inRange = (p: number, [a, b]: Range) => p >= a && p <= b;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
