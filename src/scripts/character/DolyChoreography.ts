import { gsap } from 'gsap';
import type { CharacterFrameState, SpriteManifest } from './CharacterAnimator';
import { clamp01, lerp } from '../timeline/beats';

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
  /** progreso espacial normalizado (0..1) para encender las huellas del camino */
  visualProgress: number;
}

type Mapping = 'forward' | 'mirror';

/**
 * Motor continuo de velocidad 100% constante para Doly (controlado por `gsap.ticker`):
 * ------------------------------------------------------------------------------------
 * 1. Sin paradas artificiales por sección:
 *    Doly recorre un camino continuo `u` (0 -> 1) de izquierda a derecha pasando por el libro.
 *    Solo se detiene cuando `u` alcanza el punto exacto donde el usuario dejó el scroll (`targetU`).
 * 2. Velocidad invariante a la velocidad del scroll (tanto hacia abajo como hacia arriba):
 *    `u` avanza hacia `targetU` a una tasa lineal fija (`SPEED_U_PER_SEC`), y el ciclo de patas
 *    está acoplado físicamente a los píxeles recorridos (24 FPS fijos al avanzar, 0 FPS al parar).
 * 3. Interacción natural hacia arriba y hacia abajo:
 *    - Si ya salió por el extremo derecho y el usuario sube hacia el inicio, entra en loop desde la izquierda.
 *    - Si el usuario sube el scroll a mitad del recorrido, Doly gira (`facing = -1`, `bookFlip = -1`) y
 *      camina siempre hacia adelante a la misma velocidad constante (nunca retrocede en reversa).
 */
export class DolyChoreography {
  /** Velocidad lineal constante en unidades de recorrido por segundo */
  private static readonly SPEED_U_PER_SEC = 0.175;
  /** Frame de apoyo equilibrado cuando el usuario deja de hacer scroll a mitad de la caminata */
  private static readonly IDLE_STAND_FRAME = 3;

  /** Tramos simétricos y continuos del recorrido */
  private static readonly U_WALK_IN_START = 0.02;
  private static readonly U_BOOK_LIE_START = 0.36;
  private static readonly U_BOOK_MID = 0.5;
  private static readonly U_WALK_OUT_START = 0.64;
  private static readonly U_WALK_OUT_END = 0.98;

  /** Rango activo del GIF de levantarse (frame 6..26, simétrico a ±235 unidades del lomo del libro) */
  private static readonly STAND_ACTIVE_FIRST = 6;
  private static readonly STAND_ACTIVE_LAST = 26;

  private mapping: Mapping = 'forward';
  private facing: 1 | -1 = 1;
  private effTravelDir: 1 | -1 = 1;
  private targetU = 0;
  private u = 0;
  private lastTargetU = 0;
  private scrollDir: 1 | -1 = 1;
  private isMoving = false;
  private odometerUnits = 0;
  private lastWorldX: number | null = null;
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
    this.lastWorldX = null;
    this.emit();
  }

  private get offL() {
    return -190 * this.metrics.k - 24;
  }
  private get offR() {
    return this.metrics.width + 190 * this.metrics.k + 24;
  }
  private get bookEntryX() {
    return this.metrics.width / 2 + this.manifest.bookSeq.entryDogOffsetX * this.metrics.k;
  }
  private get bookExitX() {
    return this.metrics.width / 2 + this.manifest.bookSeq.exitDogOffsetX * this.metrics.k;
  }

  /** Actualiza la meta de progreso según el scroll del usuario (0..1) */
  setTargetProgress(scrollProgress: number) {
    const p = clamp01(scrollProgress);
    if (p > this.lastTargetU + 1e-5) this.scrollDir = 1;
    else if (p < this.lastTargetU - 1e-5) this.scrollDir = -1;
    this.lastTargetU = p;
    this.targetU = p;
  }

  update(p: number): ChoreographyOutput {
    this.setTargetProgress(p);
    return this.buildOutput();
  }

  private tick() {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTickTime) / 1000));
    this.lastTickTime = now;

    const diff = this.targetU - this.u;
    const absDiff = Math.abs(diff);

    if (absDiff < 0.0004) {
      if (this.isMoving) {
        this.u = this.targetU;
        this.isMoving = false;
        this.emit();
      }
      return;
    }

    this.isMoving = true;

    const prevEffU = this.mapping === 'forward' ? this.u : this.mirrorU(this.u);

    // Avance a velocidad ESTRICTAMENTE CONSTANTE
    const fixedStep = DolyChoreography.SPEED_U_PER_SEC * dt;
    const step = absDiff <= fixedStep ? diff : Math.sign(diff) * fixedStep;
    this.u = clamp01(this.u + step);

    // En los extremos fuera de pantalla, sincroniza el modo loop (forward/mirror)
    const offscreen =
      this.u <= DolyChoreography.U_WALK_IN_START || this.u >= DolyChoreography.U_WALK_OUT_END;
    if (offscreen) {
      this.mapping = this.scrollDir > 0 ? 'forward' : 'mirror';
      this.facing = 1;
      this.effTravelDir = 1;
      this.lastWorldX = null;
    }

    const curEffU = this.mapping === 'forward' ? this.u : this.mirrorU(this.u);
    const dEff = curEffU - prevEffU;
    if (Math.abs(dEff) > 1e-5) {
      this.effTravelDir = dEff >= 0 ? 1 : -1;
      this.facing = this.effTravelDir;
    }

    const curX = this.computeWorldX(curEffU);
    const inWalkSegment =
      (curEffU > DolyChoreography.U_WALK_IN_START && curEffU < DolyChoreography.U_BOOK_LIE_START) ||
      (curEffU > DolyChoreography.U_WALK_OUT_START && curEffU < DolyChoreography.U_WALK_OUT_END);

    if (this.lastWorldX !== null && inWalkSegment) {
      const dx = curX - this.lastWorldX;
      if (Math.abs(dx) < this.metrics.width * 0.4) {
        this.odometerUnits += Math.abs(dx) / Math.max(0.1, this.metrics.k);
      }
    }
    this.lastWorldX = curX;

    this.emit();
  }

  private mirrorU(u: number): number {
    const s = DolyChoreography.U_WALK_IN_START;
    const e = DolyChoreography.U_WALK_OUT_END;
    if (u <= s) return s;
    if (u >= e) return s;
    return s + (e - u);
  }

  private computeWorldX(effU: number): number {
    const cx = this.metrics.width / 2;
    if (effU <= DolyChoreography.U_WALK_IN_START) return this.offL;
    if (effU < DolyChoreography.U_BOOK_LIE_START) {
      const t =
        (effU - DolyChoreography.U_WALK_IN_START) /
        (DolyChoreography.U_BOOK_LIE_START - DolyChoreography.U_WALK_IN_START);
      return lerp(this.offL, this.bookEntryX, clamp01(t));
    }
    if (effU < DolyChoreography.U_BOOK_MID) {
      const t =
        (effU - DolyChoreography.U_BOOK_LIE_START) /
        (DolyChoreography.U_BOOK_MID - DolyChoreography.U_BOOK_LIE_START);
      return lerp(this.bookEntryX, cx, clamp01(t));
    }
    if (effU < DolyChoreography.U_WALK_OUT_START) {
      const t =
        (effU - DolyChoreography.U_BOOK_MID) /
        (DolyChoreography.U_WALK_OUT_START - DolyChoreography.U_BOOK_MID);
      return lerp(cx, this.bookExitX, clamp01(t));
    }
    if (effU < DolyChoreography.U_WALK_OUT_END) {
      const t =
        (effU - DolyChoreography.U_WALK_OUT_START) /
        (DolyChoreography.U_WALK_OUT_END - DolyChoreography.U_WALK_OUT_START);
      return lerp(this.bookExitX, this.offR, clamp01(t));
    }
    return this.offR;
  }

  private emit() {
    if (this.onFrame) {
      this.onFrame(this.buildOutput());
    }
  }

  private buildOutput(): ChoreographyOutput {
    const { manifest: m, metrics } = this;
    const b = m.bookSeq;
    const walkStart = m.ranges.walk.start;
    const walkCount = m.ranges.walk.count;

    const effU = this.mapping === 'forward' ? this.u : this.mirrorU(this.u);
    const x = this.computeWorldX(effU);

    const walkCycleFrame = walkStart + (Math.floor((this.odometerUnits / 135) * walkCount) % walkCount);
    const frame = this.isMoving ? walkCycleFrame : DolyChoreography.IDLE_STAND_FRAME;

    const bookAppear = clamp01(Math.max(this.u, this.targetU) / 0.04);
    const bookScale = 0.92 + 0.08 * bookAppear;

    const onBookSeq =
      effU >= DolyChoreography.U_BOOK_LIE_START && effU <= DolyChoreography.U_WALK_OUT_START;

    let bookFrame = b.emptyBookFrame;
    let dogAlpha = 1;
    let bookFlip: 1 | -1 = 1;

    if (onBookSeq) {
      dogAlpha = 0;
      bookFlip = this.effTravelDir;
      // Normalizamos el progreso dentro del libro (0 -> 1) en la dirección real en que Doly lo cruza:
      // Así siempre sube al libro de frente (LIE 0..29) y luego se levanta de frente (STAND 6..26).
      const rawBookT = clamp01(
        (effU - DolyChoreography.U_BOOK_LIE_START) /
          (DolyChoreography.U_WALK_OUT_START - DolyChoreography.U_BOOK_LIE_START),
      );
      const bookT = this.effTravelDir > 0 ? rawBookT : 1 - rawBookT;

      if (bookT < 0.5) {
        const t = clamp01(bookT / 0.5);
        const idx = Math.min(29, Math.round(t * 29));
        bookFrame = b.lieStart + idx;
      } else {
        const t = clamp01((bookT - 0.5) / 0.5);
        const span = DolyChoreography.STAND_ACTIVE_LAST - DolyChoreography.STAND_ACTIVE_FIRST;
        const idx = DolyChoreography.STAND_ACTIVE_FIRST + Math.min(span, Math.round(t * span));
        bookFrame = b.standStart + idx;
      }
    }

    const normX = clamp01(x / Math.max(1, metrics.width));

    return {
      visualProgress: normX,
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
        bookFlip,
      },
    };
  }

  destroy() {
    this.disposed = true;
    gsap.ticker.remove(this.onTick);
  }
}
