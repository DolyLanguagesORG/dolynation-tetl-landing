/**
 * Mapa de paradas y ventanas del recorrido de Doly (progreso 0..1 de #story-track).
 *
 * Cuatro paradas proporcionales sincronizadas con las cuatro secciones editoriales:
 *  0.00 ─ 0.02  Hero (Doly fuera a la izquierda)
 *  0.14 ─ 0.25  PARADA 1 ("El Problema")         · sentada en el suelo (izquierda del libro)
 *  0.38 ─ 0.48  PARADA 2 ("¿Qué es?")            · sentada encima del libro
 *  0.49 ─ 0.60  PARADA 3 ("¿Por qué elegirnos?") · acostada encima del libro
 *  0.74 ─ 0.85  PARADA 4 ("Funcionalidades")     · sentada en el suelo (derecha del libro)
 *  0.97 ─ 1.00  Salida al CTA (Doly sale por la derecha)
 */
export type Range = readonly [number, number];

export const STOPS = {
  hero: [0.0, 0.02],
  problem: [0.14, 0.25],
  what: [0.38, 0.48],
  why: [0.49, 0.6],
  features: [0.74, 0.85],
  cta: [0.97, 1.0],
} as const satisfies Record<string, Range>;

/**
 * Puntos exactos de anclaje por sección (menú superior y checkpoints).
 */
export const SECTION_STOPS = [0, 0.2, 0.44, 0.53, 0.8, 1] as const satisfies readonly number[];

/** Checkpoints donde Doly se sienta o recuesta y bloquea brevemente al cruzarlos. */
export const CHECKPOINTS = [0.2, 0.44, 0.53, 0.8] as const;

/** Sección editorial (0..5) correspondiente a un progreso del track */
export function sectionFor(p: number): number {
  if (p < 0.1) return 0;
  if (p < 0.32) return 1;
  if (p < 0.485) return 2;
  if (p < 0.67) return 3;
  if (p < 0.9) return 4;
  return 5;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const norm = (p: number, [a, b]: Range) => clamp01((p - a) / (b - a));
export const inRange = (p: number, [a, b]: Range) => p >= a && p <= b;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
