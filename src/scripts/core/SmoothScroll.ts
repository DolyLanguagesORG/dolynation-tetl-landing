import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/** Progreso exacto dentro de #story-track donde se centra cada sección editorial (0..4) */
const SECTION_PROGRESS: Record<number, number> = {
  0: 0,
  1: 0.21, // El Problema (0.12 - 0.31)
  2: 0.4, // ¿Qué es? (0.31 - 0.50)
  3: 0.59, // ¿Por qué elegirnos? (0.50 - 0.69)
  4: 0.78, // Funcionalidades (0.69 - 0.88)
};

/**
 * Lenis + GSAP ticker: un único loop de scroll suave sincronizado con ScrollTrigger.
 */
export class SmoothScroll {
  readonly lenis: Lenis;
  private readonly tick = (time: number) => this.lenis.raf(time * 1000);

  constructor() {
    this.lenis = new Lenis({ lerp: 0.1, smoothWheel: true, wheelMultiplier: 0.9 });
    this.lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(this.tick);
    gsap.ticker.lagSmoothing(0);

    // Enlaces internos (#problema, #que-es, #por-que, #funcionalidades, #cta)
    document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      a.addEventListener('click', (e) => {
        const sectionAttr = a.dataset.sectionTarget;
        if (sectionAttr !== undefined) {
          const secIdx = Number(sectionAttr);
          const track = document.getElementById('story-track');
          const progress = SECTION_PROGRESS[secIdx];
          if (track && progress !== undefined) {
            e.preventDefault();
            const scrollable = Math.max(0, track.scrollHeight - window.innerHeight);
            const targetY = track.offsetTop + progress * scrollable;
            this.lenis.scrollTo(targetY, { duration: 1.4 });
            history.replaceState(null, '', id);
            return;
          }
        }

        const target = document.querySelector<HTMLElement>(id);
        if (!target) return;
        e.preventDefault();
        this.lenis.scrollTo(target, { duration: 1.4 });
      });
    });
  }

  destroy() {
    gsap.ticker.remove(this.tick);
    this.lenis.destroy();
  }
}
