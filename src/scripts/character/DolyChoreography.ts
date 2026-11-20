import { gsap } from 'gsap';
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
 * Controlador GSAP de la caminata de Doly (30 frames extraídos del GIF):
 *  - Usa `gsap.to` para interpolar suavemente el cabezal de reproducción (`playhead`)
 *    a través de los 30 frames del GIF cada vez que el usuario hace scroll, evitando
 *    saltos bruscos entre ticks de la rueda del mouse.
 *  - Usa `gsap.to` para animar el giro horizontal (`facing`) y la transición hacia
 *    y desde el libro abierto en el centro.
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
    return -195 * this.metrics.k - 24;
  }
  private get offR() {
    return this.metrics.width + 195 * this.metrics.k + 24;
  }

  private forwardX(p: number) {
    const cx = this.metrics.width / 2;
    if (p <= BEATS.walkIn[0]) return this.offL;
    if (p < BEATS.walkIn[1]) return lerp(this.offL, cx, norm(p, BEATS.walkIn));
    if (p <= BEATS.walkOut[0]) return cx;
    if (p < BEATS.walkOut[1]) return lerp(cx, this.offR, norm(p, BEATS.walkOut));
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

    const fx = this.forwardX(p);
    const x = this.mapping === 'forward' ? fx : metrics.width - fx;

    const walking = offscreen || inRange(p, BEATS.walkIn) || inRange(p, BEATS.walkOut);
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

    // GSAP interpola el avance por los 30 frames del GIF con inercia suave
    gsap.to(this.anim, {
      odometer: this.targetOdometer,
      duration: 0.42,
      ease: 'power2.out',
      overwrite: true,
      onUpdate: () => {
        if (this.onAsyncUpdate) {
          this.onAsyncUpdate(this.computeState(this.currentP, x));
        }
      },
    });

    return this.computeState(p, x);
  }

  private computeState(p: number, x: number): ChoreographyOutput {
    const { manifest: m, metrics } = this;
    const walkStart = m.ranges.walk.start;
    const walkCount = m.ranges.walk.count; // 30 frames del GIF
    const stanceFrame = m.ranges.settle.start; // frame con las 4 patas apoyadas
    const hop = 28 * metrics.k;

    let frame = walkStart + (Math.floor((this.anim.odometer / m.strideUnits) * walkCount) % walkCount);
    let groundY = metrics.groundY;
    let alpha = 1;
    let restMix = 0;
    let shadow = 1;
    let crouch = 0;

    if (inRange(p, BEATS.settle) && p > BEATS.walkIn[1]) {
      const u = norm(p, BEATS.settle);
      const e = easeInOut(u);
      frame = stanceFrame;
      groundY = lerp(metrics.groundY, metrics.pageY, e) - Math.sin(Math.PI * u) * hop;
      crouch = e;
      shadow = 1 - e;
    } else if (p > BEATS.settle[1] && p < BEATS.standUp[0]) {
      frame = stanceFrame;
      groundY = metrics.pageY;
      crouch = 1;
      shadow = 0;
      if (inRange(p, BEATS.toRest)) restMix = easeInOut(norm(p, BEATS.toRest));
      else if (inRange(p, BEATS.fromRest)) restMix = 1 - easeInOut(norm(p, BEATS.fromRest));
      else restMix = 1;
      alpha = 1 - restMix;
    } else if (inRange(p, BEATS.standUp) && p < BEATS.walkOut[0]) {
      const u = norm(p, BEATS.standUp);
      const e = easeInOut(u);
      frame = stanceFrame;
      groundY = lerp(metrics.pageY, metrics.groundY, e) - Math.sin(Math.PI * u) * hop;
      crouch = 1 - e;
      shadow = e;
    }

    return {
      dog: { x, groundY, frame, facing: this.facing, alpha, shadow, crouch },
      restMix,
    };
  }
}
