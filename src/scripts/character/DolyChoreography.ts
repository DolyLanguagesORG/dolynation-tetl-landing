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
 * Motor continuo de velocidad moderada y constante para Doly (controlado por `gsap.ticker`):
 * ------------------------------------------------------------------------------------------
 * - Cadencia moderada y natural (`GIF_FPS = 13` cuadros/segundo, ~2.3s por cada GIF de 30 frames):
 *     * Caminata de entrada (0.02 -> 0.34): velocidad constante moderada (~3.4s) a 13 FPS.
 *     * Recostarse en el libro (0.34 -> 0.50): 30 frames a 13 FPS (~2.3s).
 *     * Levantarse del libro (0.50 -> 0.64): 21 frames activos a 13 FPS (~1.6s).
 *     * Caminata de salida (0.64 -> 0.98): velocidad constante moderada (~3.5s) a 13 FPS.
 * - Sin saltos de frame al hacer scroll moderado:
 *     Cuando Doly alcanza momentáneamente el punto del scroll entre ticks de la rueda del mouse,
 *     conserva exactamente el frame actual del ciclo (`walkFrameCursor`) en lugar de saltar a otro frame,
 *     y al siguiente tick retoma desde el cuadro siguiente (0 -> 1 -> 2 ... -> 29).
 */
export class DolyChoreography {
  /**
   * Cadencia fija y moderada para los 3 GIFs (13 FPS = ~77ms por frame, muy cercano a los 100ms nativos del GIF).
   * Garantiza que ni las patas ni las acciones sobre el libro se vean aceleradas.
   */
  private static readonly GIF_FPS = 13;

  /** Tramos continuos del recorrido */
  private static readonly U_WALK_IN_START = 0.02;
  private static readonly U_BOOK_LIE_START = 0.34;
  private static readonly U_BOOK_MID = 0.5;
  private static readonly U_WALK_OUT_START = 0.64;
  private static readonly U_WALK_OUT_END = 0.98;

  /**
   * Velocidades lineales de `u` por segundo en cada tramo para que todas las acciones
   * (caminar, recostarse y levantarse) duren exactamente su tiempo natural a 13 FPS:
   *   - Caminar (tramo de 0.32): ~3.4s -> 0.094 u/s
   *   - Recostarse (30 frames a 13 FPS = 2.31s en tramo de 0.16): 0.16 / 2.31 = 0.069 u/s
   *   - Levantarse (21 frames a 13 FPS = 1.62s en tramo de 0.14): 0.14 / 1.62 = 0.086 u/s
   */
  private static readonly SPEED_U_WALK = 0.094;
  private static readonly SPEED_U_LIE = 0.069;
  private static readonly SPEED_U_STAND = 0.086;

  /** Rango activo del GIF de levantarse (frames 6..26) */
  private static readonly STAND_ACTIVE_FIRST = 6;
  private static readonly STAND_ACTIVE_LAST = 26;

  private mapping: Mapping = 'forward';
  private facing: 1 | -1 = 1;
  private effTravelDir: 1 | -1 = 1;
  private targetU = 0;
  private u = 0;
  private lastTargetU = 0;
  private scrollDir: 1 | -1 = 1;
  private walkFrameCursor = 0;
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

  /** Velocidad constante de `u` según la acción actual (caminar, recostarse o levantarse) */
  private getSegmentSpeed(effU: number): number {
    if (effU >= DolyChoreography.U_BOOK_LIE_START && effU < DolyChoreography.U_BOOK_MID) {
      return DolyChoreography.SPEED_U_LIE;
    }
    if (effU >= DolyChoreography.U_BOOK_MID && effU <= DolyChoreography.U_WALK_OUT_START) {
      return DolyChoreography.SPEED_U_STAND;
    }
    return DolyChoreography.SPEED_U_WALK;
  }

  private tick() {
    if (this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTickTime) / 1000));
    this.lastTickTime = now;

    const diff = this.targetU - this.u;
    const absDiff = Math.abs(diff);

    // Si Doly ya está en el punto exacto del scroll, mantiene su pose actual sin saltar de frame
    if (absDiff < 0.00025) {
      this.u = this.targetU;
      return;
    }

    const prevEffU = this.mapping === 'forward' ? this.u : this.mirrorU(this.u);
    const segSpeed = this.getSegmentSpeed(prevEffU);

    // Avance a velocidad estrictamente moderada y constante para la acción actual
    const maxStep = segSpeed * dt;
    const step = absDiff <= maxStep ? diff : Math.sign(diff) * maxStep;
    this.u = clamp01(this.u + step);

    // En los extremos fuera de pantalla, sincroniza el modo loop (forward/mirror)
    const offscreen =
      this.u <= DolyChoreography.U_WALK_IN_START || this.u >= DolyChoreography.U_WALK_OUT_END;
    if (offscreen) {
      this.mapping = this.scrollDir > 0 ? 'forward' : 'mirror';
      this.facing = 1;
      this.effTravelDir = 1;
    }

    const curEffU = this.mapping === 'forward' ? this.u : this.mirrorU(this.u);
    const dEff = curEffU - prevEffU;
    if (Math.abs(dEff) > 1e-5) {
      this.effTravelDir = dEff >= 0 ? 1 : -1;
      this.facing = this.effTravelDir;
    }

    const inWalkSegment =
      (curEffU > DolyChoreography.U_WALK_IN_START && curEffU < DolyChoreography.U_BOOK_LIE_START) ||
      (curEffU > DolyChoreography.U_WALK_OUT_START && curEffU < DolyChoreography.U_WALK_OUT_END);

    if (inWalkSegment) {
      // Avanza el ciclo de 30 frames exactamente a 13 FPS proporcional al paso efectivo dado en este tick:
      // Nunca supera 13 FPS aunque el usuario haga scroll muy rápido, ni salta de frame al detenerse.
      const stepRatio = Math.min(1, Math.abs(step) / Math.max(1e-6, maxStep));
      const walkCount = this.manifest.ranges.walk.count;
      this.walkFrameCursor = (this.walkFrameCursor + dt * DolyChoreography.GIF_FPS * stepRatio) % walkCount;
    }

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

    // Mantiene el frame continuo del ciclo sin saltar a otro frame al pausar entre ticks del scroll
    const frame = walkStart + (Math.floor(this.walkFrameCursor) % walkCount);

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
