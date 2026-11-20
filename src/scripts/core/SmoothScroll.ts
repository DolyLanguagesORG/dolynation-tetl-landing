import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

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

    // anclas internas (#cta) con desplazamiento suave
    document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((a) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      a.addEventListener('click', (e) => {
        const target = document.querySelector<HTMLElement>(id);
        if (!target) return;
        e.preventDefault();
        this.lenis.scrollTo(target, { duration: 1.6 });
      });
    });
  }

  destroy() {
    gsap.ticker.remove(this.tick);
    this.lenis.destroy();
  }
}
