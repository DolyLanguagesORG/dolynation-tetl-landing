import { gsap } from 'gsap';
import type { CharacterFrameState, SpriteManifest } from './CharacterAnimator';
import { BEATS, DOLY_SPEED, clamp01, easeInOut, inRange, lerp, norm } from '../timeline/beats';

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
  /** progreso visual suavizado (0..1) que sigue a velocidad constante al scroll */
  visualProgress: number;
}

type Mapping = 'forward' | 'mirror';

/**
 * Motor GSAP de velocidad y fluidez constante para los 3 GIFs de Doly:
 *  - Se ejecuta en `gsap.ticker` a 60/120 Hz midiendo `dt` real en segundos.
 *  - Avanza el progreso visual del personaje (`visualP`) hacia el progreso del scroll (`targetP`)
 *    a una velocidad máxima constante (`DOLY_SPEED.progressPerSec`), eliminando acelerones o
 *    saltos bruscos de la rueda del mouse.
 *  - Mientras Doly está en movimiento, reproduce los 30 frames del GIF de caminata a una
 *    cadencia fija de `DOLY_SPEED.walkFps` (24 FPS) para que el ciclo de pasos sea 100% fluido.
 */
export class DolyChoreography {
  private mapping: Mapping = 'forward';
  private facing: 1 | -1 = 1;
  private targetP = 0;
  private visualP = 0;
  private lastTargetP = 0;
  private scrollDir: 1 | -1 = 1;
  private walkFrameCursor = 0; // acumulador continuo de frames a 24 FPS
  private lastTickTime = 0;
  private disposed = false;

  private readonly onTick = () => this.tick();

  constructor(
    private readonly manifest: SpriteManifest,
    private metrics: StageMetrics,
    private readonly onFrame?: (out: ChoreographyOutput) => void,
  ) {
    this.lastTickTime = performance.now();
    gsap.ticker.add(this.onTick);
  }

  setMetrics(m: StageMetrics) {
    this.metrics = m;
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

  /** Recibe el progreso objetivo del scroll (0..1) desde ScrollTrigger */
  update(p: number): ChoreographyOutput {
    if (p > this.lastTargetP + 1e-6) this.scrollDir = 1;
    else if (p < this.lastTargetP - 1e-6) this.scrollDir = -1;
    this.lastTargetP = p;
    this.targetP = clamp01(p);

    return this.buildOutput();
  }

  /** Loop principal en gsap.ticker con velocidad constante */
  private tick() {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.06, Math.max(0.001, (now - this.lastTickTime) / 1000));
    this.lastTickTime = now;

    const diff = this.targetP - this.visualP;
    const absDiff = Math.abs(diff);

    // Si Doly ya está en el destino del scroll, no gastamos CPU redibujando
    if (absDiff < 0.0003) {
      this.visualP = this.targetP;
      return;
    }

    // 1. Avance a velocidad constante hacia targetP, con desaceleración suave al estar muy cerca
    const maxStep = DOLY_SPEED.progressPerSec * dt;
    const smoothStep = diff * DOLY_SPEED.arrivalSmoothing;
    const step = Math.abs(smoothStep) < maxStep ? smoothStep : Math.sign(diff) * maxStep;
    const prevVisualP = this.visualP;
    this.visualP = clamp01(this.visualP + step);

    // 2. Verifica cambio de modo (forward / mirror) en zonas seguras (fuera de pantalla o descansando en el libro)
    const offscreen = this.visualP <= BEATS.walkIn[0] || this.visualP >= BEATS.walkOut[1];
    const resting = inRange(this.visualP, BEATS.rest);
    if (offscreen || resting) {
      this.mapping = this.scrollDir > 0 ? 'forward' : 'mirror';
      this.facing = 1;
    }

    const prevEffP = this.mapping === 'forward' ? prevVisualP : this.mirrorProgress(prevVisualP);
    const curEffP = this.mapping === 'forward' ? this.visualP : this.mirrorProgress(this.visualP);
    const prevX = this.forwardX(prevEffP);
    const curX = this.forwardX(curEffP);
    const dx = curX - prevX;

    const walking = inRange(curEffP, BEATS.walkIn) || inRange(curEffP, BEATS.walkOut);
    if (walking && !offscreen && Math.abs(dx) > 0.02) {
      this.facing = dx > 0 ? 1 : -1;
    }

    // 3. Avanza el GIF de caminata a FPS constantes (24 FPS) mientras Doly se desplaza
    if (walking && Math.abs(this.visualP - prevVisualP) > 0.0001) {
      // Mantiene al menos 75% de la cadencia nominal de 24 FPS incluso al frenar suavemente
      const speedRatio = Math.min(1.15, Math.max(0.75, Math.abs(step) / Math.max(1e-5, maxStep)));
      this.walkFrameCursor =
        (this.walkFrameCursor + dt * DOLY_SPEED.walkFps * speedRatio) % this.manifest.ranges.walk.count;
    }

    if (this.onFrame) {
      this.onFrame(this.buildOutput());
    }
  }

  private mirrorProgress(p: number): number {
    const start = BEATS.walkIn[0];
    const end = BEATS.walkOut[1];
    if (p <= start) return start;
    if (p >= end) return start;
    return start + (end - p);
  }

  private buildOutput(): ChoreographyOutput {
    const { manifest: m, metrics } = this;
    const b = m.bookSeq;
    const walkStart = m.ranges.walk.start;
    const walkCount = m.ranges.walk.count;

    const effP = this.mapping === 'forward' ? this.visualP : this.mirrorProgress(this.visualP);
    const x = this.forwardX(effP);

    const frame = walkStart + (Math.floor(this.walkFrameCursor) % walkCount);
    const bookAppear = easeInOut(norm(this.visualP, BEATS.bookIn));
    const bookScale = 0.88 + 0.12 * bookAppear;

    const onBookSeq = effP >= BEATS.settle[0] && effP <= BEATS.standUp[1];

    let bookFrame = b.emptyBookFrame;
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
      visualProgress: this.visualP,
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

  destroy() {
    this.disposed = true;
    gsap.ticker.remove(this.onTick);
  }
}
