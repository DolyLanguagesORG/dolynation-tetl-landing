import { gsap } from 'gsap';
import type { CharacterFrameState, SpriteManifest } from './CharacterAnimator';
import { BEATS, easeInOut, inRange, lerp, norm } from '../timeline/beats';

export interface StageMetrics {
  /** ancho del stage en px */
  width: number;
  /** y del camino en px */
  groundY: number;
  /** píxeles por unidad de diseño */
  k: number;
}

export interface ChoreographyOutput {
  dog: CharacterFrameState;
}

type Mapping = 'forward' | 'mirror';

/**
 * Orquestador con GSAP de los 3 GIFs de Doly:
 *   - walkIn (0.12 -> 0.36): Doly entra caminando (30 frames de doly-walk.webp) hasta el borde del libro.
 *   - settle (0.36 -> 0.50): Se reproducen los 30 frames del GIF donde Doly sube al libro y se recuesta.
 *   - rest   (0.50 -> 0.56): Doly descansa sobre el libro abierto (frame 29 de lie-down).
 *   - standUp(0.56 -> 0.70): Se reproducen los 30 frames del GIF donde Doly se levanta del libro y sale caminando.
 *   - walkOut(0.70 -> 0.94): Doly continúa caminando (30 frames de doly-walk.webp) hasta salir por la derecha.
 *   - Loop bidireccional: Si después de salir por la derecha haces scroll hacia arriba, el recorrido se espeja
 *     para que vuelva a entrar caminando desde la izquierda hacia la derecha.
 */
export class DolyChoreography {
  private mapping: Mapping = 'forward';
  private facing: 1 | -1 = 1;
  private lastP = 0;
  private dir: 1 | -1 = 1;
  private lastX: number | null = null;
  private targetOdometer = 0;
  private readonly anim = {
    odometer: 0,
    bookPlayhead: 0,
  };
  private currentP = 0;
  private onAsyncUpdate?: (out: ChoreographyOutput) => void;

  constructor(
    private readonly manifest: SpriteManifest,
    private metrics: StageMetrics,
    onAsyncUpdate?: (out: ChoreographyOutput) => void,
  ) {
    this.onAsyncUpdate = onAsyncUpdate;
  }

  setMetrics(m: StageMetrics) {
    this.metrics = m;
    this.lastX = null;
  }

  private get offL() {
    return -200 * this.metrics.k - 24;
  }
  private get offR() {
    return this.metrics.width + 200 * this.metrics.k + 24;
  }

  /** Posición X de Doly en la dirección normal (izquierda -> libro -> derecha) */
  private forwardX(p: number) {
    const cx = this.metrics.width / 2;
    const b = this.manifest.bookSeq;
    const entryX = cx + b.entryDogOffsetX * this.metrics.k;
    const exitX = cx + b.exitDogOffsetX * this.metrics.k;

    if (p <= BEATS.walkIn[0]) return this.offL;
    if (p < BEATS.walkIn[1]) return lerp(this.offL, entryX, norm(p, BEATS.walkIn));
    if (p < BEATS.settle[1]) return lerp(entryX, cx, norm(p, BEATS.settle));
    if (p <= BEATS.standUp[0]) return cx;
    if (p < BEATS.standUp[1]) return lerp(cx, exitX, norm(p, BEATS.standUp));
    if (p < BEATS.walkOut[1]) return lerp(exitX, this.offR, norm(p, BEATS.walkOut));
    return this.offR;
  }

  update(p: number): ChoreographyOutput {
    const { metrics } = this;
    this.currentP = p;

    if (p > this.lastP + 1e-6) this.dir = 1;
    else if (p < this.lastP - 1e-6) this.dir = -1;
    this.lastP = p;

    const offscreen = p <= BEATS.walkIn[0] || p >= BEATS.walkOut[1];
    const resting = inRange(p, BEATS.rest);
    if (offscreen || resting) {
      this.mapping = this.dir > 0 ? 'forward' : 'mirror';
      this.facing = 1;
    }

    // Si estamos en modo mirror (scroll hacia arriba después de haber salido por la derecha),
    // invertimos el progreso local alrededor de la mitad del recorrido para que siempre entre por la izquierda,
    // se recueste en el libro y salga por la derecha.
    const effP = this.mapping === 'forward' ? p : this.mirrorProgress(p);
    const x = this.forwardX(effP);

    const walking = offscreen || inRange(effP, BEATS.walkIn) || inRange(effP, BEATS.walkOut);
    if (this.lastX !== null) {
      const dx = x - this.lastX;
      if (Math.abs(dx) < metrics.width * 0.5) {
        this.targetOdometer += Math.abs(dx) / metrics.k;
        if (walking && !offscreen && Math.abs(dx) > 0.05) {
          this.facing = dx > 0 ? 1 : -1;
        }
      }
    }
    this.lastX = x;

    // Calculamos el frame objetivo de la secuencia sobre el libro (0..59)
    let targetBookPlayhead = this.anim.bookPlayhead;
    if (inRange(effP, BEATS.settle)) {
      targetBookPlayhead = norm(effP, BEATS.settle) * 29;
    } else if (inRange(effP, BEATS.rest)) {
      targetBookPlayhead = 29;
    } else if (inRange(effP, BEATS.standUp)) {
      targetBookPlayhead = 30 + norm(effP, BEATS.standUp) * 29;
    }

    // GSAP interpola suavemente tanto el ciclo de caminata como los 60 frames del libro
    gsap.to(this.anim, {
      odometer: this.targetOdometer,
      bookPlayhead: targetBookPlayhead,
      duration: 0.32,
      ease: 'power2.out',
      overwrite: true,
      onUpdate: () => {
        if (this.onAsyncUpdate) {
          const curEffP = this.mapping === 'forward' ? this.currentP : this.mirrorProgress(this.currentP);
          this.onAsyncUpdate(this.computeState(this.currentP, curEffP, this.forwardX(curEffP)));
        }
      },
    });

    return this.computeState(p, effP, x);
  }

  /**
   * Mapea el progreso al hacer scroll hacia arriba para que Doly repita el ciclo completo:
   * entrar desde la izquierda -> recostarse en el libro -> levantarse -> salir por la derecha.
   */
  private mirrorProgress(p: number): number {
    const start = BEATS.walkIn[0];
    const end = BEATS.walkOut[1];
    if (p <= start) return start;
    if (p >= end) return start;
    return start + (end - p);
  }

  private computeState(rawP: number, effP: number, x: number): ChoreographyOutput {
    const { manifest: m, metrics } = this;
    const b = m.bookSeq;
    const walkStart = m.ranges.walk.start;
    const walkCount = m.ranges.walk.count;

    const frame = walkStart + (Math.floor((this.anim.odometer / m.strideUnits) * walkCount) % walkCount);
    const bookAppear = easeInOut(norm(rawP, BEATS.bookIn));
    const bookScale = 0.88 + 0.12 * bookAppear;

    // Determinamos si Doly está en la secuencia del libro (settle / rest / standUp) o caminando (walkIn / walkOut)
    const onBookSeq = effP >= BEATS.settle[0] && effP <= BEATS.standUp[1];

    let bookFrame = b.emptyBookFrame; // 60 = libro abierto vacío
    let dogAlpha = 1;

    if (onBookSeq) {
      dogAlpha = 0;
      if (effP <= BEATS.settle[1]) {
        const idx = Math.max(0, Math.min(29, Math.round(norm(effP, BEATS.settle) * 29)));
        bookFrame = b.lieStart + idx;
      } else if (effP < BEATS.standUp[0]) {
        bookFrame = b.lieStart + 29;
      } else {
        const idx = Math.max(0, Math.min(29, Math.round(norm(effP, BEATS.standUp) * 29)));
        bookFrame = b.standStart + idx;
      }
    }

    return {
      dog: {
        x,
        stageCenterX: metrics.width / 2,
        groundY: metrics.groundY,
        frame,
        facing: this.facing,
        alpha: dogAlpha,
        shadow: dogAlpha,
        bookFrame,
        bookAlpha: bookAppear,
        bookScale,
        bookFlip: 1,
      },
    };
  }
}
