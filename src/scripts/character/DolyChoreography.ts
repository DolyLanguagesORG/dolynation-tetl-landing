import { gsap } from 'gsap';
import type { CharacterFrameState, SpriteManifest } from './CharacterAnimator';
import { BEATS } from '../timeline/beats';

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

/**
 * Motor GSAP de pasos por sección a velocidad fija (independiente de la velocidad del scroll):
 * -------------------------------------------------------------------------------------------
 * Cada sección de la landing tiene un punto de parada (waypoint) concreto en el camino:
 *   - Sección 0 (Hero):            Doly espera fuera del borde izquierdo (offL).
 *   - Sección 1 (El Problema):     Doly entra caminando a velocidad fija hasta el 20% del camino y se detiene.
 *   - Sección 2 (¿Qué es?):        Doly avanza sus siguientes pasos a velocidad fija hasta el borde del libro y se detiene.
 *   - Sección 3 (¿Por qué?):       Doly sube al libro y reproduce el GIF de recostarse a 24 FPS fijos (1.25s).
 *   - Sección 4 (Funcionalidades): Doly reproduce el GIF de levantarse a 24 FPS fijos (1.25s) y avanza hasta el 80% del camino.
 *   - Sección 5 (CTA Final):       Doly camina a velocidad fija desde el 80% hasta salir por el borde derecho (offR).
 *
 * La velocidad de caminata (`WALK_PX_PER_SEC`) y los FPS de los 3 GIFs (`24 FPS`) son 100% fijos.
 */
export class DolyChoreography {
  /** Velocidad horizontal fija de Doly en píxeles por segundo (no depende del scroll) */
  private static readonly WALK_PX_PER_SEC = 310;
  /** Cadencia fija de reproducción de los GIFs (24 cuadros por segundo) */
  private static readonly GIF_FPS = 24;
  /** Frame de parada cuando Doly se detiene de pie entre secciones (4 patas apoyadas) */
  private static readonly IDLE_STAND_FRAME = 3;

  private activeSection = 0;
  private tl?: gsap.core.Timeline;
  private walkTickerActive = false;
  private walkFrameCursor = DolyChoreography.IDLE_STAND_FRAME;
  private lastTickTime = 0;

  /** Estado interno animado únicamente por tweens de GSAP a velocidad fija */
  private readonly state = {
    x: -300,
    facing: 1 as 1 | -1,
    mode: 'walk' as 'walk' | 'book',
    bookFrameFloat: 60,
    bookAlpha: 0,
    bookScale: 0.88,
  };

  private readonly onTick = () => this.tickWalkFrames();

  constructor(
    private readonly manifest: SpriteManifest,
    private metrics: StageMetrics,
    private readonly onFrame?: (out: ChoreographyOutput) => void,
  ) {
    this.state.x = this.offL;
    this.state.bookFrameFloat = manifest.bookSeq.emptyBookFrame;
    this.lastTickTime = performance.now();
    gsap.ticker.add(this.onTick);
  }

  setMetrics(m: StageMetrics) {
    const prevW = Math.max(1, this.metrics.width);
    const ratio = this.state.x / prevW;
    this.metrics = m;
    if (!this.tl || !this.tl.isActive()) {
      this.state.x = this.waypointXForSection(this.activeSection);
    } else {
      this.state.x = ratio * m.width;
    }
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

  /** Coordenada X del waypoint correspondiente a cada sección (0..5) */
  private waypointXForSection(section: number): number {
    const w = this.metrics.width;
    switch (section) {
      case 0:
        return this.offL;
      case 1:
        return Math.min(w * 0.2, this.bookEntryX - 70 * this.metrics.k);
      case 2:
        return this.bookEntryX;
      case 3:
        return w / 2;
      case 4:
        return Math.max(w * 0.78, this.bookExitX + 55 * this.metrics.k);
      case 5:
      default:
        return this.offR;
    }
  }

  /**
   * Dispara la transición a velocidad fija hacia el waypoint de la sección `targetSection` (0..5).
   * Llamado únicamente cuando el usuario entra a una nueva sección.
   */
  goToSection(targetSection: number) {
    if (targetSection === this.activeSection && this.tl) return;
    const prevSection = this.activeSection;
    this.activeSection = targetSection;

    this.tl?.kill();
    const b = this.manifest.bookSeq;
    const tl = gsap.timeline({
      onUpdate: () => this.emit(),
      onComplete: () => {
        this.walkTickerActive = false;
        this.walkFrameCursor = DolyChoreography.IDLE_STAND_FRAME;
        this.emit();
      },
    });
    this.tl = tl;

    // Aparición / ocultamiento del libro en el centro a velocidad fija
    const shouldShowBook = targetSection >= 1;
    tl.to(
      this.state,
      {
        bookAlpha: shouldShowBook ? 1 : 0,
        bookScale: shouldShowBook ? 1 : 0.88,
        duration: 0.55,
        ease: 'power2.out',
      },
      0,
    );

    // Si Doly ya había salido por el extremo derecho (Sección 5) y el usuario regresa hacia el inicio (Sección 0 o 1),
    // entra nuevamente desde el lado izquierdo (loop limpio de izquierda a derecha)
    if (prevSection === 5 && this.state.x >= this.offR - 40 && targetSection <= 1) {
      this.state.x = this.offL;
      this.state.mode = 'walk';
      this.state.bookFrameFloat = b.emptyBookFrame;
    }

    // Helper para agregar un tramo de caminata a velocidad constante (px/s fijos)
    const addFixedSpeedWalk = (toX: number, fromXEstimate: number) => {
      const dist = Math.abs(toX - fromXEstimate);
      if (dist < 2) return;
      const duration = Math.max(0.35, dist / DolyChoreography.WALK_PX_PER_SEC);
      const dir: 1 | -1 = toX >= fromXEstimate ? 1 : -1;
      tl.call(() => {
        this.state.mode = 'walk';
        this.state.bookFrameFloat = b.emptyBookFrame;
        this.state.facing = dir;
        this.walkTickerActive = true;
      });
      tl.to(this.state, {
        x: toX,
        duration,
        ease: 'none', // Velocidad lineal 100% constante
      });
      tl.call(() => {
        this.walkTickerActive = false;
        this.walkFrameCursor = DolyChoreography.IDLE_STAND_FRAME;
      });
    };

    // Helper para reproducir los 30 frames del GIF de recostarse en el libro a 24 FPS fijos (1.25s)
    const addFixedSpeedLieDown = () => {
      const duration = b.lieCount / DolyChoreography.GIF_FPS; // 30 / 24 = 1.25s fijos
      tl.call(() => {
        this.walkTickerActive = false;
        this.state.mode = 'book';
        this.state.bookFrameFloat = b.lieStart;
      });
      tl.to(this.state, {
        bookFrameFloat: b.lieStart + b.lieCount - 1,
        x: this.metrics.width / 2,
        duration,
        ease: 'none',
      });
    };

    // Helper para reproducir los 30 frames del GIF de levantarse del libro a 24 FPS fijos (1.25s)
    const addFixedSpeedStandUp = () => {
      const duration = b.standCount / DolyChoreography.GIF_FPS; // 30 / 24 = 1.25s fijos
      tl.call(() => {
        this.walkTickerActive = false;
        this.state.mode = 'book';
        this.state.bookFrameFloat = b.standStart;
      });
      tl.to(this.state, {
        bookFrameFloat: b.standStart + b.standCount - 1,
        x: this.bookExitX,
        duration,
        ease: 'none',
      });
      tl.call(() => {
        this.state.mode = 'walk';
        this.state.bookFrameFloat = b.emptyBookFrame;
        this.state.x = this.bookExitX;
      });
    };

    let cursorX = this.state.x;

    // 1. Si Doly está actualmente recostada en el libro (mode === 'book') y vamos a otra sección:
    if (this.state.mode === 'book' && targetSection !== 3) {
      addFixedSpeedStandUp();
      cursorX = this.bookExitX;
    }

    // 2. Si el destino es la Sección 3 (recostarse en el libro):
    if (targetSection === 3) {
      if (this.state.mode !== 'book') {
        addFixedSpeedWalk(this.bookEntryX, cursorX);
        addFixedSpeedLieDown();
      }
      return;
    }

    // 3. Si Doly está a la izquierda del libro y el usuario salta directo a una sección a la derecha del libro (4 o 5),
    // pasa primero por el libro (camina -> se recuesta -> se levanta -> sigue caminando) a velocidad fija
    const targetX = this.waypointXForSection(targetSection);
    if (cursorX <= this.bookEntryX + 10 && targetSection >= 4) {
      addFixedSpeedWalk(this.bookEntryX, cursorX);
      addFixedSpeedLieDown();
      addFixedSpeedStandUp();
      cursorX = this.bookExitX;
    }

    // 4. Camina a velocidad fija hasta el waypoint de la sección objetivo y se detiene
    addFixedSpeedWalk(targetX, cursorX);
  }

  /** Compatibilidad para inicialización o modo movimiento reducido */
  update(p: number): ChoreographyOutput {
    return this.buildOutput();
  }

  /** Avanza los 30 frames del GIF de caminata a 24 FPS fijos mientras Doly camina entre waypoints */
  private tickWalkFrames() {
    const now = performance.now();
    const dt = Math.min(0.06, Math.max(0.001, (now - this.lastTickTime) / 1000));
    this.lastTickTime = now;

    if (!this.walkTickerActive) return;

    const walkCount = this.manifest.ranges.walk.count;
    this.walkFrameCursor = (this.walkFrameCursor + dt * DolyChoreography.GIF_FPS) % walkCount;
    this.emit();
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

    const frame = this.walkTickerActive
      ? walkStart + (Math.floor(this.walkFrameCursor) % walkCount)
      : DolyChoreography.IDLE_STAND_FRAME;

    const onBook = this.state.mode === 'book';
    const bookFrame = onBook ? Math.round(this.state.bookFrameFloat) : b.emptyBookFrame;
    const dogAlpha = onBook ? 0 : 1;

    const normX = Math.max(0, Math.min(1, this.state.x / Math.max(1, metrics.width)));

    return {
      visualProgress: normX,
      dog: {
        x: this.state.x,
        stageCenterX: metrics.width / 2,
        groundY: metrics.groundY,
        frame,
        facing: this.state.facing,
        alpha: dogAlpha,
        shadow: dogAlpha,
        bookFrame,
        bookAlpha: this.state.bookAlpha,
        bookScale: this.state.bookScale,
        bookFlip: 1,
      },
    };
  }

  destroy() {
    this.tl?.kill();
    gsap.ticker.remove(this.onTick);
  }
}
