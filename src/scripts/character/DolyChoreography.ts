import { gsap } from 'gsap';
import type { BookLayer, CharacterFrameState, SitLayer, SpriteManifest, WalkLayer } from './CharacterAnimator';
import { CHECKPOINTS, SECTION_STOPS, clamp01, easeInOut, lerp, sectionFor } from '../timeline/beats';

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
  /** posición horizontal de Doly en px (para rastro de huellas y cámara 3D) */
  dogX: number;
  /** progreso espacial normalizado (0..1) */
  visualProgress: number;
  /** progreso actual de Doly en la línea de tiempo (0..1) */
  u: number;
  /** sección editorial activa fijada por llegada a estación (0..5) */
  activeSection: number;
}

type TurnKind = 'sitGround' | 'midWalk' | 'bookSit' | 'bookLieTurn';

interface TurnState {
  kind: TurnKind;
  fromFacing: 1 | -1;
  toFacing: 1 | -1;
  turnT: number; // 0..1
  baseFrame: number; // usado en midWalk para pivotar limpio
  startHeadX: number;
  endHeadX: number;
  scale: number;
  yOffset: number;
  applyTarget: 'ground' | 'book' | 'both';
}

interface NavGlideState {
  startU: number;
  targetU: number;
  elapsed: number;
  duration: number;
}

const WALK_STRIDE = 450;

/** Velocidades directas de scroll manual en unidades de `u` por segundo (sin cola acumulada) */
const MAX_U_SPEED = 0.22;
const MIN_U_SPEED = 0.095;

/** Bloqueo forzado en cada checkpoint (s) para que la postura se aprecie antes de continuar */
const CHECKPOINT_LOCK_DUR = 0.55;

/** Duración del giro opaco con cabeza fija (s) */
const TURN_DUR = 0.3;
const BOOK_LIE_TURN_DUR = 0.4;

/**
 * Motor unificado de coreografía dirigido directamente por el usuario:
 * ---------------------------------------------------------------------------
 * - La línea de tiempo `u ∈ [0, 1]` avanza únicamente mientras el lector hace scroll
 *   (o durante un viaje suave disparado por un clic del menú) y se detiene al instante
 *   en el punto exacto donde el lector suelta la rueda/dedo: cero auto-snap, cero cola.
 * - La velocidad máxima está acotada (`MAX_U_SPEED`), manteniendo una caminata
 *   ágil en scroll suave pero fluida y legible en scroll rápido.
 * - Al cruzar manualmente un checkpoint (`0.20, 0.44, 0.53, 0.80`) fija un bloqueo
 *   breve (`0.55s`) descartando impulsos sobrantes e inercia residual de trackpad.
 * - La sección editorial permanece visible entre paradas (`latchedSection`) hasta
 *   que Doly arriba a la estación siguiente o anterior.
 * - Todas las capas sobre el libro blanco se dibujan a opacidad 100% para eliminar
 *   cualquier parpadeo sobre el papel, y todo giro usa una capa opaca continua.
 */
export class DolyChoreography {
  private u = 0;
  private latchedSection = 0;

  private facing: 1 | -1 = 1;
  private bookFacing: 1 | -1 = 1;
  private bookAlpha = 0;

  private walkFrameCursor = 0;
  private sitHeadAnchorX: number | null = null;
  private turn: TurnState | null = null;

  /** Estado de impulso directo de scroll manual (nunca acumula distancia) */
  private velocity = 0;
  private targetVel = 0;
  private driveHoldTimer = 0;

  /** Bloqueo forzado al llegar a un checkpoint */
  private checkpointLockTimer = 0;
  private lockedAtCp: number | null = null;
  private lockedDir: 1 | -1 = 1;
  private awaitingFreshGesture = false;
  private lastWheelTs = 0;
  private prevAbsDy = 0;

  /** Viaje continuo al pulsar enlaces del menú superior */
  private navGlide: NavGlideState | null = null;

  private lastTickTime = 0;
  private disposed = false;
  private frozen = false;

  private readonly stepOffRightFrames: number[];

  private readonly onTick = () => this.tick();

  constructor(
    private readonly manifest: SpriteManifest,
    private metrics: StageMetrics,
    private readonly onFrame?: (out: ChoreographyOutput) => void,
  ) {
    this.stepOffRightFrames = [
      this.bookFrame('lie', 29),
      this.bookFrame('lie', 28),
      this.bookFrame('lie', 27),
    ];
    for (let s = 2; s <= this.manifest.bookSeq.standExitFrame; s++) {
      this.stepOffRightFrames.push(this.bookFrame('stand', s));
    }

    this.lastTickTime = performance.now();
    gsap.ticker.add(this.onTick);
  }

  setMetrics(m: StageMetrics) {
    const oldCx = this.cx;
    const oldK = this.k || 1;
    const scaleRatio = m.k / oldK;

    if (this.turn) {
      this.turn.startHeadX = m.width / 2 + (this.turn.startHeadX - oldCx) * scaleRatio;
      this.turn.endHeadX = m.width / 2 + (this.turn.endHeadX - oldCx) * scaleRatio;
      if (this.turn.yOffset !== 0) {
        this.turn.yOffset *= scaleRatio;
      }
    }
    if (this.sitHeadAnchorX !== null) {
      this.sitHeadAnchorX = m.width / 2 + (this.sitHeadAnchorX - oldCx) * scaleRatio;
    }

    this.metrics = m;
    this.emit();
  }

  setFrozen(frozen: boolean) {
    if (this.frozen === frozen) return;
    this.frozen = frozen;
    this.emit();
  }

  getProgress(): number {
    return this.u;
  }

  get progress(): number {
    return this.u;
  }

  isLockedAtCheckpoint(): boolean {
    return this.checkpointLockTimer > 0;
  }

  /** Coloca de inmediato a Doly en un progreso restaurado (carga inicial / hash) */
  snapToProgress(p: number) {
    const clamped = clamp01(p);
    this.u = clamped;
    this.latchedSection = sectionFor(clamped);
    this.facing = 1;
    this.bookFacing = 1;
    this.bookAlpha = clamped > 0.002 ? 1 : 0;
    this.sitHeadAnchorX = null;
    this.turn = null;
    this.navGlide = null;
    this.velocity = 0;
    this.targetVel = 0;
    this.driveHoldTimer = 0;
    this.checkpointLockTimer = 0;
    this.awaitingFreshGesture = false;
    this.lockedAtCp = CHECKPOINTS.find((cp) => Math.abs(clamped - cp) <= 0.01) ?? null;
    this.emit();
  }

  update(p: number): ChoreographyOutput {
    this.snapToProgress(p);
    return this.buildOutput();
  }

  /**
   * Recibe eventos discretos o continuos de rueda/táctil/teclado sin acumular cola:
   * fija una velocidad objetivo acotada mientras dure la ventana de empuje.
   */
  pushScrollInput(deltaY: number, source: 'wheel' | 'touch' | 'key', meta?: { deltaMode?: number }) {
    if (this.frozen || deltaY === 0) return;

    // Cualquier scroll manual cancela al instante un viaje automático de navegación
    this.navGlide = null;

    const now = performance.now();
    const absDy = Math.abs(deltaY);
    const dir: 1 | -1 = deltaY > 0 ? 1 : -1;

    if (this.checkpointLockTimer > 0) {
      this.lastWheelTs = now;
      this.prevAbsDy = absDy;
      return;
    }

    if (this.awaitingFreshGesture) {
      if (source === 'wheel') {
        const isSameDir = dir === this.lockedDir;
        const dtMs = now - this.lastWheelTs;
        const isDecayingTail =
          isSameDir && dtMs < 110 && (meta?.deltaMode ?? 0) === 0 && absDy <= this.prevAbsDy + 2 && absDy < 45;
        this.lastWheelTs = now;
        this.prevAbsDy = absDy;
        if (isDecayingTail) return;
      }
      this.awaitingFreshGesture = false;
    }

    if (source === 'wheel') {
      this.lastWheelTs = now;
      this.prevAbsDy = absDy;
    }

    const scale = source === 'touch' ? 14 : source === 'key' ? 50 : 55;
    const norm = clamp01(Math.max(0.28, Math.min(1, absDy / scale)));
    this.targetVel = dir * (MIN_U_SPEED + (MAX_U_SPEED - MIN_U_SPEED) * norm);
    this.driveHoldTimer = source === 'touch' ? 0.065 : source === 'key' ? 0.16 : 0.13;
  }

  /** Al soltar el dedo en móvil, detiene de inmediato el empuje para evitar deslizamientos extra */
  stopTouchInput() {
    this.driveHoldTimer = 0;
    this.targetVel = 0;
  }

  /** Viaje continuo y calmado hacia una sección elegida en el menú superior */
  navigateToSection(secIdx: number) {
    const target = SECTION_STOPS[secIdx];
    if (target === undefined) return;

    this.checkpointLockTimer = 0;
    this.awaitingFreshGesture = false;
    this.lockedAtCp = null;
    this.driveHoldTimer = 0;
    this.velocity = 0;
    this.targetVel = 0;

    const dist = Math.abs(target - this.u);
    if (dist <= 0.002) {
      this.u = target;
      this.latchedSection = secIdx;
      this.emit();
      return;
    }

    const duration = Math.min(3.6, Math.max(0.75, 0.55 + dist * 3.4));
    this.navGlide = {
      startU: this.u,
      targetU: target,
      elapsed: 0,
      duration,
    };
  }

  /** Sincronización directa solo si el usuario arrastra manualmente la barra de scroll nativa */
  seekFromExternalScroll(p: number) {
    if (this.frozen) return;
    const clamped = clamp01(p);
    const prev = this.u;
    this.navGlide = null;
    this.turn = null;
    this.velocity = 0;
    this.targetVel = 0;
    this.driveHoldTimer = 0;
    this.checkpointLockTimer = 0;
    this.awaitingFreshGesture = false;
    this.lockedAtCp = null;
    this.sitHeadAnchorX = null;

    if (Math.abs(clamped - prev) > 0.0005) {
      const dir: 1 | -1 = clamped >= prev ? 1 : -1;
      if (clamped < 0.44 || clamped > 0.53) {
        this.facing = dir;
        this.bookFacing = dir;
      }
      const oldX = this.computeXForU(prev, this.facing, this.bookFacing);
      this.u = clamped;
      const newX = this.computeXForU(clamped, this.facing, this.bookFacing);
      const dw = Math.abs(newX - oldX) / Math.max(0.05, this.k);
      const count = this.manifest.ranges.walk.count;
      this.walkFrameCursor = (this.walkFrameCursor + (dw / WALK_STRIDE) * count) % count;
      if (Math.abs(clamped - prev) > 0.08) {
        this.latchedSection = sectionFor(clamped);
      } else {
        this.updateLatchedSection(clamped, prev);
      }
      this.emit();
    }
  }

  // ── Geometría responsiva ───────────────────────────────────────────────────

  private get k() {
    return this.metrics.k;
  }
  private get cx() {
    return this.metrics.width / 2;
  }
  private get offL() {
    return -190 * this.k - 24;
  }
  private get offR() {
    return this.metrics.width + 190 * this.k + 24;
  }
  private get entryX() {
    return this.cx + this.manifest.bookSeq.entryDogOffsetX * this.k;
  }
  private get exitX() {
    return this.cx + this.manifest.bookSeq.exitDogOffsetX * this.k;
  }
  private get mirroredEntryX() {
    return this.cx - this.manifest.bookSeq.entryDogOffsetX * this.k;
  }
  private get mirroredExitX() {
    return this.cx - this.manifest.bookSeq.exitDogOffsetX * this.k;
  }

  private get leftStopX() {
    const tailExtent = 136 * this.k;
    const minVisible = tailExtent + 4;
    const bookClear = this.cx - 180 * this.k - 84 * this.k;
    const ideal = Math.min(this.entryX - 10 * this.k, (minVisible + bookClear) / 2);
    return Math.max(minVisible, Math.min(this.entryX, ideal));
  }

  private get rightStopX() {
    return this.metrics.width - this.leftStopX;
  }

  private get walkBookRightStart() {
    return Math.min(this.exitX, this.rightStopX);
  }

  private get walkBookLeftStart() {
    return Math.max(this.mirroredExitX, this.leftStopX);
  }

  private bookFrame(seq: 'lie' | 'stand', i: number): number {
    const b = this.manifest.bookSeq;
    return seq === 'lie' ? b.lieStart + i : b.standStart + i;
  }

  private computeXForU(u: number, facing: 1 | -1, bookFacing: 1 | -1): number {
    if (u <= 0) return this.offL;
    if (u < 0.14) return lerp(this.offL, this.leftStopX, u / 0.14);
    if (u <= 0.25) return this.leftStopX;
    if (u < 0.33) {
      const edge = facing === 1 ? this.entryX : this.walkBookLeftStart;
      return lerp(this.leftStopX, edge, (u - 0.25) / 0.08);
    }
    if (u < 0.44) {
      const edge = bookFacing === 1 ? this.entryX : this.walkBookLeftStart;
      return lerp(edge, this.cx, (u - 0.33) / 0.11);
    }
    if (u <= 0.53) return this.cx;
    if (u <= 0.67) {
      const edge = bookFacing === 1 ? this.walkBookRightStart : this.mirroredEntryX;
      return lerp(this.cx, edge, (u - 0.53) / 0.14);
    }
    if (u < 0.74) {
      const edge = facing === 1 ? this.walkBookRightStart : this.mirroredEntryX;
      return lerp(edge, this.rightStopX, (u - 0.67) / 0.07);
    }
    if (u <= 0.85) return this.rightStopX;
    if (u < 1) return lerp(this.rightStopX, this.offR, (u - 0.85) / 0.15);
    return this.offR;
  }

  private updateLatchedSection(u: number, prevU?: number) {
    if (u <= 0.012) {
      this.latchedSection = 0;
      return;
    }
    if (u >= 0.988) {
      this.latchedSection = 5;
      return;
    }
    for (let i = 0; i < CHECKPOINTS.length; i++) {
      const cp = CHECKPOINTS[i];
      const crossed =
        prevU !== undefined && ((prevU < cp && u >= cp) || (prevU > cp && u <= cp));
      if (Math.abs(u - cp) <= 0.008 || crossed) {
        this.latchedSection = i + 1;
        return;
      }
    }
  }

  // ── Loop físico por frame ──────────────────────────────────────────────────

  private tick() {
    if (this.disposed) return;
    if (this.frozen) {
      this.lastTickTime = performance.now();
      return;
    }

    const now = performance.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTickTime) / 1000));
    this.lastTickTime = now;

    // El libro aparece en cuanto Doly inicia su camino y se mantiene fijo a escala 1
    const targetBookAlpha = this.u > 0.002 || this.navGlide !== null || this.turn !== null ? 1 : 0;
    let bookAlphaChanged = false;
    if (Math.abs(targetBookAlpha - this.bookAlpha) > 0.002) {
      const stepA = dt / 0.35;
      this.bookAlpha =
        Math.abs(targetBookAlpha - this.bookAlpha) <= stepA
          ? targetBookAlpha
          : this.bookAlpha + Math.sign(targetBookAlpha - this.bookAlpha) * stepA;
      bookAlphaChanged = true;
    } else if (this.bookAlpha !== targetBookAlpha) {
      this.bookAlpha = targetBookAlpha;
      bookAlphaChanged = true;
    }

    const changed = this.stepTimeline(dt);
    if (changed || bookAlphaChanged) this.emit();
  }

  private stepTimeline(dt: number): boolean {
    const prevU = this.u;
    let movedU = false;

    // 1. Giro activo con cabeza fija (100% opaco, u permanece fijo hasta completar)
    if (this.turn) {
      const wantDir = this.desiredDirection();
      const dur = this.turn.kind === 'bookLieTurn' ? BOOK_LIE_TURN_DUR : TURN_DUR;
      if (wantDir !== 0 && wantDir !== this.turn.toFacing && this.turn.turnT <= 0.45) {
        this.turn.turnT = Math.max(0, this.turn.turnT - dt / dur);
        if (this.turn.turnT <= 0) {
          this.turn = null;
        }
      } else {
        this.turn.turnT = Math.min(1, this.turn.turnT + dt / dur);
        if (this.turn.turnT >= 1) {
          const { toFacing, endHeadX, applyTarget, kind } = this.turn;
          if (applyTarget === 'ground' || applyTarget === 'both') this.facing = toFacing;
          if (applyTarget === 'book' || applyTarget === 'both') this.bookFacing = toFacing;
          if (kind === 'sitGround') {
            this.sitHeadAnchorX = endHeadX;
            this.walkFrameCursor = 24;
          } else if (kind === 'midWalk') {
            this.walkFrameCursor = 24;
          }
          this.turn = null;
        }
      }
      return true;
    }

    // 2. Viaje continuo al hacer clic en menú superior (A2: directo sin bloqueos intermedios)
    if (this.navGlide) {
      const remaining = this.navGlide.targetU - this.u;
      if (Math.abs(remaining) <= 0.0005) {
        this.u = this.navGlide.targetU;
        this.updateLatchedSection(this.u, prevU);
        this.navGlide = null;
        return true;
      }

      const dir: 1 | -1 = remaining > 0 ? 1 : -1;
      if (this.maybeStartTurn(dir)) return true;

      const prevElapsed = this.navGlide.elapsed;
      this.navGlide.elapsed = Math.min(this.navGlide.duration, prevElapsed + dt);
      const t = this.navGlide.elapsed / this.navGlide.duration;
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const nextU = clamp01(lerp(this.navGlide.startU, this.navGlide.targetU, eased));

      // Si un frame rápido cruzaría un extremo del libro sin girar, frena justo allí para girar limpio
      if (dir === -1 && this.bookFacing === 1 && prevU >= 0.44 && nextU < 0.44) {
        this.u = 0.44;
        this.updateLatchedSection(this.u, prevU);
        this.navGlide = {
          startU: 0.44,
          targetU: this.navGlide.targetU,
          elapsed: 0,
          duration: Math.max(0.4, this.navGlide.duration - prevElapsed),
        };
        this.maybeStartTurn(-1);
        return true;
      }
      if (dir === 1 && this.bookFacing === -1 && prevU <= 0.53 && nextU > 0.53) {
        this.u = 0.53;
        this.updateLatchedSection(this.u, prevU);
        this.navGlide = {
          startU: 0.53,
          targetU: this.navGlide.targetU,
          elapsed: 0,
          duration: Math.max(0.4, this.navGlide.duration - prevElapsed),
        };
        this.maybeStartTurn(1);
        return true;
      }

      this.advanceWalkCursor(prevU, nextU);
      this.u = nextU;
      this.updateLatchedSection(this.u, prevU);

      if (this.navGlide.elapsed >= this.navGlide.duration) {
        this.u = this.navGlide.targetU;
        this.updateLatchedSection(this.u, prevU);
        this.navGlide = null;
      }
      return true;
    }

    // 3. Bloqueo forzado al llegar a un checkpoint (0.55s, cero cola de scroll)
    if (this.checkpointLockTimer > 0) {
      this.checkpointLockTimer = Math.max(0, this.checkpointLockTimer - dt);
      return false;
    }

    // 4. Control manual directo acotado y freno instantáneo al soltar scroll
    if (this.driveHoldTimer > 0) {
      this.driveHoldTimer = Math.max(0, this.driveHoldTimer - dt);
      const alpha = 1 - Math.exp(-20 * dt);
      this.velocity += (this.targetVel - this.velocity) * alpha;
    } else {
      this.targetVel = 0;
      this.velocity *= Math.exp(-24 * dt);
      if (Math.abs(this.velocity) < 0.0015) this.velocity = 0;
    }

    if (Math.abs(this.velocity) > 0) {
      const dir: 1 | -1 = this.velocity > 0 ? 1 : -1;
      if (this.maybeStartTurn(dir)) return true;

      let nextU = clamp01(this.u + this.velocity * dt);

      // Comprobación de cruce por cualquiera de los 4 checkpoints
      for (const cp of CHECKPOINTS) {
        if (cp === this.lockedAtCp) continue;
        if ((prevU < cp && nextU >= cp) || (prevU > cp && nextU <= cp)) {
          nextU = cp;
          this.velocity = 0;
          this.targetVel = 0;
          this.driveHoldTimer = 0;
          this.checkpointLockTimer = CHECKPOINT_LOCK_DUR;
          this.lockedDir = dir;
          this.lockedAtCp = cp;
          this.awaitingFreshGesture = true;
          break;
        }
      }

      // Freno limpio si cruza 0.44 / 0.53 sin lock previo y necesita girar sobre el libro
      if (this.checkpointLockTimer <= 0) {
        if (dir === -1 && this.bookFacing === 1 && prevU >= 0.44 && nextU < 0.44) {
          this.u = 0.44;
          this.updateLatchedSection(this.u, prevU);
          this.maybeStartTurn(-1);
          return true;
        }
        if (dir === 1 && this.bookFacing === -1 && prevU <= 0.53 && nextU > 0.53) {
          this.u = 0.53;
          this.updateLatchedSection(this.u, prevU);
          this.maybeStartTurn(1);
          return true;
        }
      }

      if (this.lockedAtCp !== null && Math.abs(nextU - this.lockedAtCp) > 0.015) {
        this.lockedAtCp = null;
      }

      this.advanceWalkCursor(prevU, nextU);
      this.u = nextU;
      this.updateLatchedSection(this.u, prevU);
      movedU = nextU !== prevU;

      // Limpia el ancla de cabeza al terminar la transición de sentado/levantado en suelo
      if (this.u < 0.14 || (this.u > 0.25 && this.u < 0.74) || this.u > 0.85) {
        this.sitHeadAnchorX = null;
      }
      if (Math.abs(this.u - 0.33) <= 0.006 || Math.abs(this.u - 0.67) <= 0.006) {
        this.walkFrameCursor = 12;
      }
    }

    return movedU;
  }

  private desiredDirection(): 1 | -1 | 0 {
    if (this.navGlide) {
      const d = this.navGlide.targetU - this.u;
      return Math.abs(d) > 0.0005 ? (d > 0 ? 1 : -1) : 0;
    }
    if (this.driveHoldTimer > 0 && Math.abs(this.targetVel) > 0.001) {
      return this.targetVel > 0 ? 1 : -1;
    }
    if (Math.abs(this.velocity) > 0.0015) {
      return this.velocity > 0 ? 1 : -1;
    }
    return 0;
  }

  private advanceWalkCursor(prevU: number, nextU: number) {
    const oldX = this.computeXForU(prevU, this.facing, this.bookFacing);
    const newX = this.computeXForU(nextU, this.facing, this.bookFacing);
    const dw = Math.abs(newX - oldX) / Math.max(0.05, this.k);
    const count = this.manifest.ranges.walk.count;
    this.walkFrameCursor = (this.walkFrameCursor + (dw / WALK_STRIDE) * count) % count;

    // Empareja la zancada al levantarse del suelo o bajar del libro
    if ((prevU > 0.14 && nextU <= 0.14) || (prevU < 0.25 && nextU >= 0.25)) this.walkFrameCursor = 24;
    if ((prevU > 0.74 && nextU <= 0.74) || (prevU < 0.85 && nextU >= 0.85)) this.walkFrameCursor = 24;
    if ((prevU > 0.33 && nextU <= 0.33) || (prevU < 0.67 && nextU >= 0.67)) this.walkFrameCursor = 12;
  }

  /**
   * Decide si Doly necesita ejecutar su giro 100% opaco antes de avanzar en `dir`.
   */
  private maybeStartTurn(dir: 1 | -1): boolean {
    const u = this.u;
    const sq = this.manifest.sitSeq;
    const headOff = sq.headOffsetX * this.k;

    // 1. Sentada o girando en suelo alrededor de PARADA 1 (0.14..0.25) y PARADA 4 (0.74..0.85)
    if ((u >= 0.14 && u <= 0.25) || (u >= 0.74 && u <= 0.85)) {
      if (dir !== this.facing) {
        const isLeft = u <= 0.3;
        const baseStopX = isLeft ? this.leftStopX : this.rightStopX;
        const center = isLeft ? 0.2 : 0.8;
        const sitT = isLeft
          ? u <= center ? (u - 0.14) / 0.06 : (0.25 - u) / 0.05
          : u <= center ? (u - 0.74) / 0.06 : (0.85 - u) / 0.05;
        const baseFrame = Math.round(lerp(0, sq.count - 1, clamp01((sitT - 0.09) / 0.91)));
        const currentLayerX = this.computeSitLayerX(baseStopX, this.facing, sitT);
        const anchorX = currentLayerX + this.facing * headOff;
        this.turn = {
          kind: sitT >= 0.8 ? 'sitGround' : 'midWalk',
          fromFacing: this.facing,
          toFacing: dir,
          turnT: 0,
          baseFrame,
          startHeadX: anchorX,
          endHeadX: anchorX,
          scale: 1,
          yOffset: 0,
          applyTarget: 'both',
        };
        return true;
      }
      return false;
    }

    // 2. Carriles de caminata plana en suelo
    if ((u > 0 && u < 0.14) || (u > 0.25 && u <= 0.33) || (u >= 0.67 && u < 0.74) || (u > 0.85 && u < 1)) {
      if (dir !== this.facing) {
        const curX = this.computeXForU(u, this.facing, this.bookFacing);
        const nextX = this.computeXForU(u, dir, dir);
        this.turn = {
          kind: 'midWalk',
          fromFacing: this.facing,
          toFacing: dir,
          turnT: 0,
          baseFrame: 4,
          startHeadX: curX + this.facing * headOff,
          endHeadX: nextX + dir * headOff,
          scale: 1,
          yOffset: 0,
          applyTarget: 'both',
        };
        return true;
      }
      return false;
    }

    // 3. Rampa izquierda del libro (0.33..0.432): invierte suavemente sin cortes ni giros en rampa
    if (u > 0.33 && u < 0.432) {
      return false;
    }

    // 4. Sentada sobre el libro (`#que-es`, ~0.44): gira únicamente al salir hacia el lado izquierdo
    if (u >= 0.432 && u <= 0.448) {
      if (dir === -1 && this.bookFacing === 1) {
        this.turn = {
          kind: 'bookSit',
          fromFacing: 1,
          toFacing: -1,
          turnT: 0,
          baseFrame: sq.count - 1,
          startHeadX: this.cx + sq.bookSitHeadOffsetX * this.k,
          endHeadX: this.cx - sq.bookSitHeadOffsetX * this.k,
          scale: sq.bookSitScale,
          yOffset: sq.bookSitGroundOffsetY * this.k,
          applyTarget: 'both',
        };
        return true;
      }
      return false;
    }

    // 5. Dentro de `(0.448, 0.522)`: se recuesta o se vuelve a sentar en el mismo sentido sin girar
    if (u > 0.448 && u < 0.522) {
      return false;
    }

    // 6. Acostada sobre el libro (`#por-que`, ~0.53): gira únicamente al salir hacia el lado derecho
    if (u >= 0.522 && u <= 0.538) {
      if (dir === 1 && this.bookFacing === -1) {
        this.turn = {
          kind: 'bookLieTurn',
          fromFacing: -1,
          toFacing: 1,
          turnT: 0,
          baseFrame: sq.count - 1,
          startHeadX: this.cx - sq.bookSitHeadOffsetX * this.k,
          endHeadX: this.cx + sq.bookSitHeadOffsetX * this.k,
          scale: sq.bookSitScale,
          yOffset: sq.bookSitGroundOffsetY * this.k,
          applyTarget: 'both',
        };
        return true;
      }
      return false;
    }

    // 7. Rampa derecha del libro (0.538..0.67): invierte suavemente hacia la estación correspondiente
    if (u > 0.538 && u < 0.67) {
      return false;
    }

    return false;
  }

  private emit() {
    if (this.onFrame) this.onFrame(this.buildOutput());
  }

  // ── Composición de capas (100% opaco sobre el libro blanco) ────────────────

  private currentWalkFrame(): number {
    const start = this.manifest.ranges.walk.start;
    const count = this.manifest.ranges.walk.count;
    return start + (Math.floor(this.walkFrameCursor) % count);
  }

  private computeSitLayerX(baseStopX: number, facing: 1 | -1, sitT: number): number {
    if (this.sitHeadAnchorX === null) return baseStopX;
    const headAnchoredLayerX = this.sitHeadAnchorX - facing * this.manifest.sitSeq.headOffsetX * this.k;
    const tStand = clamp01(1 - (sitT - 0.09) / 0.91);
    return lerp(headAnchoredLayerX, baseStopX, easeInOut(tStand));
  }

  /** Selecciona una única capa opaca de giro con interpolación limpia de cabeza */
  private renderTurn(): { sitA: SitLayer | null; bookA: BookLayer | null } {
    const turn = this.turn!;
    const sq = this.manifest.sitSeq;
    const sc = turn.scale;
    const headOff = sq.headOffsetX * this.k * sc;

    if (turn.kind === 'bookLieTurn') {
      const t = turn.turnT;
      if (t < 0.22) {
        const f = Math.round(lerp(this.bookFrame('lie', 29), this.bookFrame('lie', 20), easeInOut(t / 0.22)));
        return { sitA: null, bookA: { frame: f, alpha: 1, flip: turn.fromFacing } };
      }
      if (t > 0.78) {
        const f = Math.round(lerp(this.bookFrame('lie', 20), this.bookFrame('lie', 29), easeInOut((t - 0.78) / 0.22)));
        return { sitA: null, bookA: { frame: f, alpha: 1, flip: turn.toFacing } };
      }
      const subT = (t - 0.22) / 0.56;
      return { sitA: this.selectTurnPose(turn, subT, sq.count - 1, headOff), bookA: null };
    }

    const baseF = turn.kind === 'bookSit' ? sq.count - 1 : turn.baseFrame;
    return { sitA: this.selectTurnPose(turn, turn.turnT, baseF, headOff), bookA: null };
  }

  private selectTurnPose(turn: TurnState, t: number, edgeFrame: number, headOff: number): SitLayer {
    const sq = this.manifest.sitSeq;
    let frame: number;
    let poseFacing: 1 | -1;

    if (t < 0.15) {
      frame = edgeFrame;
      poseFacing = turn.fromFacing;
    } else if (t < 0.3) {
      frame = sq.turnQuarterFrame;
      poseFacing = turn.fromFacing;
    } else if (t < 0.44) {
      frame = sq.turnHalfFrame;
      poseFacing = turn.fromFacing;
    } else if (t < 0.56) {
      frame = sq.turnCenterFrame;
      poseFacing = turn.fromFacing;
    } else if (t < 0.7) {
      frame = sq.turnHalfFrame;
      poseFacing = turn.toFacing;
    } else if (t < 0.85) {
      frame = sq.turnQuarterFrame;
      poseFacing = turn.toFacing;
    } else {
      frame = edgeFrame;
      poseFacing = turn.toFacing;
    }

    const headX = lerp(turn.startHeadX, turn.endHeadX, easeInOut(t));
    return {
      x: headX - poseFacing * headOff,
      yOffset: turn.yOffset,
      scale: turn.scale,
      frame,
      facing: poseFacing,
      alpha: 1,
      shadow: turn.yOffset === 0 ? 1 : 0,
    };
  }

  private renderGroundSit(baseStopX: number, sitT: number, facing: 1 | -1, walkFrame: number): {
    walk: WalkLayer | null;
    sitA: SitLayer | null;
    dogX: number;
  } {
    const maxF = this.manifest.sitSeq.count - 1;
    const layerX = this.computeSitLayerX(baseStopX, facing, sitT);

    if (sitT < 0.09) {
      const f = easeInOut(sitT / 0.09);
      return {
        sitA: { x: layerX, frame: 0, facing, alpha: f, shadow: 1 },
        walk: { x: baseStopX, frame: walkFrame, facing, alpha: 1 - f, shadow: 1, yOffset: 0 },
        dogX: lerp(baseStopX, layerX, f),
      };
    }

    const ft = clamp01((sitT - 0.09) / 0.91);
    return {
      walk: null,
      sitA: { x: layerX, frame: Math.round(lerp(0, maxF, ft)), facing, alpha: 1, shadow: 1 },
      dogX: layerX,
    };
  }

  private buildOutput(): ChoreographyOutput {
    if (this.frozen) {
      return {
        dogX: this.cx,
        visualProgress: 0.5,
        u: 0.5,
        activeSection: sectionFor(this.u),
        dog: {
          stageCenterX: this.cx,
          groundY: this.metrics.groundY,
          walk: null,
          sitA: null,
          sitB: null,
          bookA: { frame: this.bookFrame('lie', 20), alpha: 1, flip: 1 },
          bookB: null,
          bookEmptyAlpha: 1,
          bookScale: 1,
        },
      };
    }

    const b = this.manifest.bookSeq;
    const u = this.u;
    const walkFrame = this.currentWalkFrame();

    let walk: WalkLayer | null = null;
    let sitA: SitLayer | null = null;
    let bookA: BookLayer | null = null;
    const bookB: BookLayer | null = null;
    let dogX = this.computeXForU(u, this.facing, this.bookFacing);

    if (this.turn) {
      const turnOut = this.renderTurn();
      sitA = turnOut.sitA;
      bookA = turnOut.bookA;
      dogX = sitA ? sitA.x : this.cx;
    } else if (u <= 0.0005) {
      dogX = this.offL;
    } else if (u < 0.14) {
      walk = { x: dogX, frame: walkFrame, facing: this.facing, alpha: 1, shadow: 1, yOffset: 0 };
    } else if (u <= 0.25) {
      const sitT = u <= 0.2 ? (u - 0.14) / 0.06 : (0.25 - u) / 0.05;
      ({ walk, sitA, dogX } = this.renderGroundSit(this.leftStopX, sitT, this.facing, this.manifest.ranges.walk.start + 24));
    } else if (u <= 0.33) {
      const t = (u - 0.25) / 0.08;
      let yOff = 0;
      if (this.facing === -1 && t > 0.72) {
        yOff = b.exitFeetOffsetY * this.k * easeInOut((t - 0.72) / 0.28);
      }
      walk = { x: dogX, frame: walkFrame, facing: this.facing, alpha: 1, shadow: 1, yOffset: yOff };
    } else if (u < 0.44) {
      const clipT = (u - 0.33) / 0.11; // 0 en borde izquierdo, 1 sentada encima del libro
      if (this.bookFacing === 1) {
        const climbT = clamp01((clipT - 0.03) / 0.97);
        const f = Math.round(lerp(this.bookFrame('lie', 0), this.bookFrame('lie', 20), climbT));
        if (clipT < 0.03) {
          walk = { x: this.entryX, frame: walkFrame, facing: 1, alpha: 1, shadow: 1, yOffset: 0 };
        } else {
          bookA = { frame: f, alpha: 1, flip: 1 };
        }
      } else {
        // stepOffLeft: u 0.44 -> 0.33 reproduce STAND[11..26] con flip = -1 (100% opaco sobre el libro)
        const stepT = 1 - clipT; // 0 arriba, 1 al bajar al suelo izquierdo
        if (stepT > 0.96) {
          walk = {
            x: this.walkBookLeftStart,
            frame: this.manifest.ranges.walk.start + 12,
            facing: -1,
            alpha: 1,
            shadow: 1,
            yOffset: b.exitFeetOffsetY * this.k,
          };
        } else {
          const standT = clamp01(stepT / 0.96);
          const standF = Math.round(lerp(this.bookFrame('stand', 11), this.bookFrame('stand', b.standExitFrame), standT));
          bookA = { frame: standF, alpha: 1, flip: -1 };
        }
      }
      dogX = lerp(this.bookFacing === 1 ? this.entryX : this.walkBookLeftStart, this.cx, clipT);
    } else if (u <= 0.53) {
      const lieT = clamp01((u - 0.44) / 0.09);
      bookA = {
        frame: Math.round(lerp(this.bookFrame('lie', 20), this.bookFrame('lie', 29), lieT)),
        alpha: 1,
        flip: this.bookFacing,
      };
      dogX = this.cx;
    } else if (u < 0.67) {
      const stepT = (u - 0.53) / 0.14; // 0 acostada en el libro, 1 en borde derecho
      if (this.bookFacing === 1) {
        if (stepT > 0.96) {
          walk = {
            x: this.walkBookRightStart,
            frame: this.manifest.ranges.walk.start + 12,
            facing: 1,
            alpha: 1,
            shadow: 1,
            yOffset: b.exitFeetOffsetY * this.k,
          };
        } else {
          const idx = Math.min(
            this.stepOffRightFrames.length - 1,
            Math.round((stepT / 0.96) * (this.stepOffRightFrames.length - 1)),
          );
          bookA = { frame: this.stepOffRightFrames[idx], alpha: 1, flip: 1 };
        }
      } else {
        // climbRight al subir desde la derecha (u 0.67 -> 0.53 reproduce LIE[0..29] flip=-1)
        const revT = 1 - stepT;
        if (revT < 0.03) {
          walk = { x: this.mirroredEntryX, frame: walkFrame, facing: -1, alpha: 1, shadow: 1, yOffset: 0 };
        } else {
          const climbT = clamp01((revT - 0.03) / 0.97);
          const f = Math.round(lerp(this.bookFrame('lie', 0), this.bookFrame('lie', 29), climbT));
          bookA = { frame: f, alpha: 1, flip: -1 };
        }
      }
      dogX = lerp(this.cx, this.bookFacing === 1 ? this.walkBookRightStart : this.mirroredEntryX, stepT);
    } else if (u < 0.74) {
      const t = (u - 0.67) / 0.07;
      const yOff = this.facing === 1 && t < 0.28 ? b.exitFeetOffsetY * this.k * (1 - easeInOut(t / 0.28)) : 0;
      walk = { x: dogX, frame: walkFrame, facing: this.facing, alpha: 1, shadow: 1, yOffset: yOff };
    } else if (u <= 0.85) {
      const sitT = u <= 0.8 ? (u - 0.74) / 0.06 : (0.85 - u) / 0.05;
      ({ walk, sitA, dogX } = this.renderGroundSit(this.rightStopX, sitT, this.facing, this.manifest.ranges.walk.start + 24));
    } else if (u < 0.9995) {
      walk = { x: dogX, frame: walkFrame, facing: this.facing, alpha: 1, shadow: 1, yOffset: 0 };
    } else {
      dogX = this.offR;
    }

    return {
      dogX,
      visualProgress: clamp01(dogX / Math.max(1, this.metrics.width)),
      u,
      activeSection: this.latchedSection,
      dog: {
        stageCenterX: this.cx,
        groundY: this.metrics.groundY,
        walk,
        sitA,
        sitB: null,
        bookA,
        bookB,
        bookEmptyAlpha: this.bookAlpha,
        bookScale: 1,
      },
    };
  }

  destroy() {
    this.disposed = true;
    gsap.ticker.remove(this.onTick);
  }
}
