import type { CharacterFrameState, SpriteManifest } from './CharacterAnimator';
import { BEATS, easeInOut, inRange, lerp, norm } from '../timeline/beats';

export interface StageMetrics {
  /** ancho del stage en px */
  width: number;
  /** y del camino en px */
  groundY: number;
  /** y de la superficie de las páginas del libro en px */
  pageY: number;
  /** píxeles por unidad de diseño del sprite */
  k: number;
}

export interface ChoreographyOutput {
  dog: CharacterFrameState;
  /** 0 = sprite + libro SVG, 1 = ilustración original */
  restMix: number;
}

type Mapping = 'forward' | 'mirror';

/**
 * Traduce el progreso del scroll (0–1) en el estado de Doly.
 *
 * Regla clave del loop: Doly SIEMPRE camina de izquierda a derecha.
 *  - Bajando: entra por la izquierda → libro → sale por la derecha.
 *  - Subiendo: el recorrido se "espeja": vuelve a entrar por la izquierda → libro → sale por la derecha.
 *  - El espejo solo se activa en zonas seguras (fuera de pantalla o recostada en el libro),
 *    donde ambas versiones son visualmente idénticas → sin saltos.
 *  - Si el usuario cambia de dirección a mitad de la caminata, Doly simplemente se da la vuelta.
 */
export class DolyChoreography {
  private mapping: Mapping = 'forward';
  private facing: 1 | -1 = 1;
  private lastP = 0;
  private dir: 1 | -1 = 1;
  private lastX: number | null = null;
  private odometer = 0;

  constructor(
    private readonly manifest: SpriteManifest,
    private metrics: StageMetrics,
  ) {}

  setMetrics(m: StageMetrics) {
    this.metrics = m;
    this.lastX = null; // evita sumar distancia por el cambio de tamaño
  }

  /** x del centro del cuerpo cuando está totalmente fuera de pantalla */
  private get offL() {
    return -170 * this.metrics.k - 24;
  }
  private get offR() {
    return this.metrics.width + 170 * this.metrics.k + 24;
  }

  /** posición en el recorrido "forward" (izq → der) */
  private forwardX(p: number) {
    const cx = this.metrics.width / 2;
    if (p <= BEATS.walkIn[0]) return this.offL;
    if (p < BEATS.walkIn[1]) return lerp(this.offL, cx, norm(p, BEATS.walkIn));
    if (p <= BEATS.walkOut[0]) return cx;
    if (p < BEATS.walkOut[1]) return lerp(cx, this.offR, norm(p, BEATS.walkOut));
    return this.offR;
  }

  update(p: number): ChoreographyOutput {
    const { manifest: m, metrics } = this;
    if (p > this.lastP + 1e-6) this.dir = 1;
    else if (p < this.lastP - 1e-6) this.dir = -1;
    this.lastP = p;

    const offscreen = p <= BEATS.walkIn[0] || p >= BEATS.walkOut[1];
    const resting = inRange(p, BEATS.rest);
    if (offscreen || resting) {
      this.mapping = this.dir > 0 ? 'forward' : 'mirror';
      this.facing = 1;
    }

    const fx = this.forwardX(p);
    const x = this.mapping === 'forward' ? fx : metrics.width - fx;

    const walking = offscreen || inRange(p, BEATS.walkIn) || inRange(p, BEATS.walkOut);
    if (this.lastX !== null) {
      const dx = x - this.lastX;
      if (Math.abs(dx) < metrics.width * 0.5) {
        this.odometer += Math.abs(dx) / metrics.k;
        if (walking && !offscreen && Math.abs(dx) > 0.05) this.facing = dx > 0 ? 1 : -1;
      }
    }
    this.lastX = x;

    const walkStart = m.ranges.walk.start;
    const walkCount = m.ranges.walk.count;
    const settleStart = m.ranges.settle.start;
    const settleLast = settleStart + m.ranges.settle.count - 1;
    const hop = 26 * metrics.k;

    let frame = walkStart + (Math.floor((this.odometer / m.strideUnits) * walkCount) % walkCount);
    let groundY = metrics.groundY;
    let alpha = 1;
    let restMix = 0;
    let shadow = 1;

    if (inRange(p, BEATS.settle) && p > BEATS.walkIn[1]) {
      const u = norm(p, BEATS.settle);
      frame = settleStart + Math.round(u * (settleLast - settleStart));
      groundY = lerp(metrics.groundY, metrics.pageY, easeInOut(u)) - Math.sin(Math.PI * u) * hop;
      shadow = 1 - u;
    } else if (p > BEATS.settle[1] && p < BEATS.standUp[0]) {
      frame = settleLast;
      groundY = metrics.pageY;
      shadow = 0;
      if (inRange(p, BEATS.toRest)) restMix = norm(p, BEATS.toRest);
      else if (inRange(p, BEATS.fromRest)) restMix = 1 - norm(p, BEATS.fromRest);
      else restMix = 1;
      alpha = 1 - restMix;
    } else if (inRange(p, BEATS.standUp) && p < BEATS.walkOut[0]) {
      const u = norm(p, BEATS.standUp);
      frame = settleStart + Math.round((1 - u) * (settleLast - settleStart));
      groundY = lerp(metrics.pageY, metrics.groundY, easeInOut(u)) - Math.sin(Math.PI * u) * hop;
      shadow = u;
    }

    return {
      dog: { x, groundY, frame, facing: this.facing, alpha, shadow },
      restMix,
    };
  }
}
