import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SECTION_STOPS, clamp01 } from '../timeline/beats';

gsap.registerPlugin(ScrollTrigger);

const HASH_SECTION_INDEX: Record<string, number> = {
  '#problema': 1,
  '#que-es': 2,
  '#por-que': 3,
  '#funcionalidades': 4,
};

export interface StoryScrollDriver {
  getProgress(): number;
  pushScrollInput(deltaY: number, source: 'wheel' | 'touch' | 'key', meta?: { deltaMode?: number }): void;
  stopTouchInput(): void;
  navigateToSection(secIdx: number): void;
  seekFromExternalScroll(p: number): void;
  snapToProgress(p: number): void;
}

/**
 * Lenis + GSAP ticker sincronizado directamente con la línea de tiempo física de Doly:
 * - Dentro de `#story-track` (Zona 1), el scroll del usuario controla la velocidad acotada
 *   de Doly sin auto-asentamiento ni inercia acumulada: se detiene justo donde el lector para.
 * - Al llegar al final (`u >= 0.9995`), cede el control de forma fluida al CTA final (Zona 2).
 */
export class SmoothScroll {
  readonly lenis: Lenis;
  private driver?: StoryScrollDriver;
  private syncingScroll = false;
  private lastSyncedY = 0;
  private prevScrollY = 0;
  private pendingHashIdx: number | undefined;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  private readonly tick = (time: number) => this.lenis.raf(time * 1000);

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (this.reducedMotion || !this.driver) return;
    const active = document.activeElement as HTMLElement | null;
    if (
      active &&
      (active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.isContentEditable)
    ) {
      return;
    }

    let dy = 0;
    if (e.key === 'ArrowDown') dy = 80;
    else if (e.key === 'ArrowUp') dy = -80;
    else if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) dy = 180;
    else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) dy = -180;
    if (dy === 0) return;

    const bounds = this.storyBounds();
    if (!bounds) return;
    const scrollY = window.scrollY;
    if (scrollY >= bounds.bottom - 2) {
      if (dy < 0 && scrollY <= bounds.bottom + 6) {
        e.preventDefault();
        this.syncStoryProgress(this.driver.getProgress());
        this.driver.pushScrollInput(dy, 'key');
      }
      return;
    }

    if (this.driver.getProgress() >= 0.9995 && dy > 0) return;
    e.preventDefault();
    if (!(this.driver.getProgress() <= 0.0005 && dy < 0)) {
      this.driver.pushScrollInput(dy, 'key');
    }
  };

  constructor() {
    this.lenis = new Lenis({
      lerp: 0.12,
      smoothWheel: true,
      wheelMultiplier: 0.9,
      virtualScroll: (data) => this.handleVirtualScroll(data),
    });

    this.prevScrollY = window.scrollY;
    this.lastSyncedY = window.scrollY;

    this.lenis.on('scroll', () => {
      ScrollTrigger.update();
      const scrollY = window.scrollY;
      if (!this.syncingScroll && this.driver && !this.reducedMotion) {
        const bounds = this.storyBounds();
        if (bounds) {
          // Evita que la inercia de Lenis subiendo desde el CTA cruce hacia #funcionalidades de golpe
          if (this.prevScrollY > bounds.bottom + 2 && scrollY < bounds.bottom) {
            this.syncStoryProgress(this.driver.getProgress());
          } else if (Math.abs(scrollY - this.lastSyncedY) > 4 && scrollY <= bounds.bottom + 1) {
            const p = clamp01((scrollY - bounds.top) / bounds.scrollable);
            this.driver.seekFromExternalScroll(p);
            this.lastSyncedY = scrollY;
          }
        }
      }
      this.prevScrollY = window.scrollY;
    });

    gsap.ticker.add(this.tick);
    gsap.ticker.lagSmoothing(0);
    window.addEventListener('keydown', this.onKeyDown);

    // Enlaces internos (#problema, #que-es, #por-que, #funcionalidades, #cta)
    document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      a.addEventListener('click', (e) => {
        const sectionAttr = a.dataset.sectionTarget;
        if (sectionAttr !== undefined) {
          const secIdx = Number(sectionAttr);
          if (SECTION_STOPS[secIdx] === undefined) return;
          e.preventDefault();
          history.replaceState(null, '', id);

          if (!this.driver || this.reducedMotion) {
            const targetY = this.stopScrollY(secIdx);
            if (targetY !== null) {
              this.driver?.snapToProgress(SECTION_STOPS[secIdx]);
              this.lenis.scrollTo(targetY, { duration: 1.4 });
            }
            return;
          }

          const bounds = this.storyBounds();
          if (bounds && window.scrollY > bounds.bottom + 2) {
            this.driver.snapToProgress(1);
            this.lenis.scrollTo(bounds.bottom, {
              duration: 0.65,
              onComplete: () => this.driver?.navigateToSection(secIdx),
            });
          } else {
            this.driver.navigateToSection(secIdx);
          }
          return;
        }

        const target = document.querySelector<HTMLElement>(id);
        if (!target) return;
        e.preventDefault();
        const bounds = this.storyBounds();
        if (this.driver && bounds && target.offsetTop >= bounds.bottom - 2) {
          this.driver.seekFromExternalScroll(1);
        }
        this.lenis.scrollTo(target, { duration: 1.6 });
      });
    });

    const hashIdx = HASH_SECTION_INDEX[window.location.hash];
    if (hashIdx !== undefined) {
      this.pendingHashIdx = hashIdx;
      requestAnimationFrame(() => {
        if (!this.driver) {
          const targetY = this.stopScrollY(hashIdx);
          if (targetY !== null) this.lenis.scrollTo(targetY, { immediate: true });
        }
      });
    }
  }

  attachStoryDriver(driver: StoryScrollDriver) {
    this.driver = driver;
    if (this.pendingHashIdx !== undefined) {
      const idx = this.pendingHashIdx;
      this.pendingHashIdx = undefined;
      const p = SECTION_STOPS[idx];
      if (p !== undefined) {
        driver.snapToProgress(p);
        this.syncStoryProgress(p);
      }
    }
  }

  syncStoryProgress(u: number) {
    const bounds = this.storyBounds();
    if (!bounds) return;
    const targetY = bounds.top + clamp01(u) * bounds.scrollable;
    this.lastSyncedY = targetY;
    if (Math.abs(window.scrollY - targetY) < 0.5) return;

    this.syncingScroll = true;
    this.lenis.scrollTo(targetY, { immediate: true, force: true });
    ScrollTrigger.update();
    this.prevScrollY = window.scrollY;
    this.syncingScroll = false;
  }

  private storyBounds(): { top: number; scrollable: number; bottom: number } | null {
    const track = document.getElementById('story-track');
    if (!track) return null;
    const scrollable = Math.max(1, track.scrollHeight - window.innerHeight);
    const top = track.offsetTop;
    return { top, scrollable, bottom: top + scrollable };
  }

  private stopScrollY(secIdx: number): number | null {
    const bounds = this.storyBounds();
    const progress = SECTION_STOPS[secIdx];
    if (!bounds || progress === undefined) return null;
    return bounds.top + progress * bounds.scrollable;
  }

  private handleVirtualScroll(data: { deltaX: number; deltaY: number; event: WheelEvent | TouchEvent }): boolean {
    if (!this.driver || this.reducedMotion) return true;

    const ev = data.event;
    if (ev.type === 'touchstart') return true;

    const bounds = this.storyBounds();
    if (!bounds) return true;
    const scrollY = window.scrollY;

    if (ev.type === 'touchend') {
      this.driver.stopTouchInput();
      if (scrollY < bounds.bottom - 2) return false;
      return true;
    }

    const isTouch = ev.type.includes('touch');
    const dy = data.deltaY;
    if (isTouch && Math.abs(data.deltaX) > Math.abs(dy)) return true;

    const source = isTouch ? 'touch' : 'wheel';
    const meta = !isTouch && 'deltaMode' in ev ? { deltaMode: ev.deltaMode } : undefined;

    // Zona 1: recorrido de Doly
    if (scrollY < bounds.bottom - 2) {
      if (this.driver.getProgress() >= 0.9995 && dy > 0) return true;
      if (ev.cancelable) ev.preventDefault();
      if (!(this.driver.getProgress() <= 0.0005 && dy < 0)) {
        this.driver.pushScrollInput(dy, source, meta);
      }
      return false;
    }

    // Zona 2: CTA final y pie de página — al subir desde arriba del CTA vuelve a Zona 1
    if (dy < 0 && scrollY <= bounds.bottom + 6) {
      if (ev.cancelable) ev.preventDefault();
      this.syncStoryProgress(this.driver.getProgress());
      this.driver.pushScrollInput(dy, source, meta);
      return false;
    }

    return true;
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    gsap.ticker.remove(this.tick);
    this.lenis.destroy();
  }
}
