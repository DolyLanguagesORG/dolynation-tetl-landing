import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { loadSpriteSheet } from '../character/CharacterAnimator';
import { DolyWalkRenderer } from '../character/DolyWalkRenderer';
import { DolyChoreography, type StageMetrics } from '../character/DolyChoreography';
import { BEATS, clamp01, easeInOut, norm } from './beats';
import type { SceneController } from '../scene/SceneController';

gsap.registerPlugin(ScrollTrigger);

interface PrintItem {
  el: HTMLElement;
  xRatio: number; // 0..1
  visitedAt: number;
}

interface ChapterRefs {
  el: HTMLElement;
  start: number;
  end: number;
  words: HTMLElement[];
  body: HTMLElement | null;
  rule: HTMLElement | null;
  index: HTMLElement | null;
}

/**
 * Orquestador principal de la experiencia 3D Scrollytelling:
 * Conecta el progreso del scroll con:
 *  1. Línea del camino + huellas multilingües ("rastro de aprendizaje")
 *  2. Libro abierto en el centro + cross-fade hacia la ilustración original de Doly
 *  3. Motor de Sprite Sheet en <canvas> (DolyWalkRenderer + DolyChoreography)
 *  4. Capítulos editoriales con revelado palabra por palabra y notas de traducción
 *  5. Cámara 3D y escena monocromática en Three.js
 */
export class MasterTimeline {
  private ctx?: gsap.Context;
  private renderer?: DolyWalkRenderer;
  private choreography?: DolyChoreography;
  private xlateTimer?: number;
  private resizeObserver?: ResizeObserver;
  private visitedPrints = new Set<PrintItem>();
  private lastDogRatio: number | null = null;

  constructor(
    private readonly trackEl: HTMLElement,
    private readonly stageEl: HTMLElement,
    private readonly scene?: SceneController,
  ) {}

  async init() {
    const canvas = this.stageEl.querySelector<HTMLCanvasElement>('[data-doly-canvas]');
    const anchor = this.stageEl.querySelector<HTMLElement>('[data-anchor]');
    const restImg = this.stageEl.querySelector<HTMLImageElement>('[data-doly-rest]');
    const bookEl = this.stageEl.querySelector<SVGElement>('[data-book]');
    const bookLeft = this.stageEl.querySelector<SVGGElement>('[data-book-half="left"]');
    const bookRight = this.stageEl.querySelector<SVGGElement>('[data-book-half="right"]');
    const pathLine = this.stageEl.querySelector<HTMLElement>('[data-path-line]');
    const pathTicks = this.stageEl.querySelector<HTMLElement>('[data-path-ticks]');
    const heroEl = this.stageEl.querySelector<HTMLElement>('[data-hero]');
    const scrollCue = this.stageEl.querySelector<HTMLElement>('[data-scroll-cue]');
    const headerProgress = document.querySelector<HTMLElement>('[data-scroll-progress]');

    if (!canvas || !anchor) return;

    const { manifest, image } = await loadSpriteSheet('/sprites/doly-walk.json');
    this.renderer = new DolyWalkRenderer(canvas, image, manifest);

    const computeMetrics = (): StageMetrics => {
      const stageRect = this.stageEl.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.renderer!.resize(stageRect.width, stageRect.height, dpr);

      const groundY = anchorRect.top - stageRect.top + anchorRect.width * 0.816;
      const pageY = anchorRect.top - stageRect.top + anchorRect.height * 0.74;
      const k = (anchorRect.width * 0.62) / manifest.standingHeight;
      this.renderer!.setScale(k);

      return {
        width: stageRect.width,
        groundY,
        pageY,
        k,
      };
    };

    const initialMetrics = computeMetrics();
    this.choreography = new DolyChoreography(manifest, initialMetrics);

    // Prepara las huellas del camino
    const prints: PrintItem[] = Array.from(this.stageEl.querySelectorAll<HTMLElement>('[data-print]')).map((el) => ({
      el,
      xRatio: Number(el.dataset.x || '0') / 100,
      visitedAt: -1,
    }));

    // Prepara referencias de los capítulos editoriales
    const chapterRefs: ChapterRefs[] = Array.from(this.stageEl.querySelectorAll<HTMLElement>('[data-chapter]')).map(
      (el) => {
        const [s, e] = (el.dataset.window || '0,1').split(',').map(Number);
        return {
          el,
          start: s,
          end: e,
          words: Array.from(el.querySelectorAll<HTMLElement>('.word')),
          body: el.querySelector<HTMLElement>('[data-chapter-body]'),
          rule: el.querySelector<HTMLElement>('[data-chapter-rule]'),
          index: el.querySelector<HTMLElement>('[data-chapter-index]'),
        };
      },
    );

    // Rotación suave de las anotaciones de traducción [palabra|word|mot|...]
    this.startTranslationNotesTicker();

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      if (restImg) restImg.style.opacity = '1';
      if (bookEl) bookEl.style.opacity = '0';
      prints.forEach((p) => (p.el.style.opacity = '0.55'));
      return;
    }

    const applyProgress = (p: number) => {
      // 1. Barra superior de progreso
      if (headerProgress) {
        headerProgress.style.transform = `scaleX(${p.toFixed(4)})`;
      }

      // 2. Hero y cue de scroll al inicio (0.00 -> 0.11)
      if (heroEl) {
        const hOut = easeInOut(norm(p, BEATS.heroOut));
        heroEl.style.opacity = String(1 - hOut);
        heroEl.style.transform = `translate3d(0, ${(-hOut * 36).toFixed(1)}px, 0)`;
        heroEl.style.visibility = hOut >= 0.99 ? 'hidden' : 'visible';
      }
      if (scrollCue) {
        const cueOut = clamp01(p / 0.06);
        scrollCue.style.opacity = String(1 - cueOut);
      }

      // 3. Línea del camino (empieza vacía en p=0 y se dibuja al iniciar el scroll)
      const pathP = easeInOut(norm(p, BEATS.pathDraw));
      if (pathLine) {
        pathLine.style.transform = `scaleX(${pathP.toFixed(4)})`;
        pathLine.style.opacity = String(pathP);
      }
      if (pathTicks) {
        pathTicks.style.transform = `scaleX(${pathP.toFixed(4)})`;
        pathTicks.style.opacity = String(pathP * 0.85);
      }

      // 4. Coreografía de Doly (caminata + llegada al libro + pose final + salida + loop)
      const { dog, restMix } = this.choreography!.update(p);
      this.renderer!.render(dog);

      // 5. Libro abierto en el centro (se abre antes de que llegue Doly y hace cross-fade con la ilustración original)
      const bookAppear = easeInOut(norm(p, BEATS.bookIn));
      if (bookEl) {
        const svgBookAlpha = bookAppear * (1 - restMix);
        bookEl.style.opacity = svgBookAlpha.toFixed(3);
        const bookScale = 0.88 + 0.12 * bookAppear;
        bookEl.style.transform = `scale(${bookScale.toFixed(3)})`;
      }
      if (bookLeft && bookRight) {
        const openAngle = (1 - bookAppear) * 24;
        bookLeft.style.transformOrigin = '187px 268px';
        bookRight.style.transformOrigin = '187px 268px';
        bookLeft.style.transform = `rotate(${openAngle.toFixed(1)}deg)`;
        bookRight.style.transform = `rotate(${(-openAngle).toFixed(1)}deg)`;
      }

      // 6. Ilustración original de Doly recostada sobre el libro
      if (restImg) {
        restImg.style.opacity = restMix.toFixed(3);
        const s = 0.97 + 0.03 * restMix;
        restImg.style.transform = `scale(${s.toFixed(4)})`;
      }

      // 7. Rastro de huellas y palabras a medida que Doly pisa cada punto del camino
      const stageWidth = Math.max(1, this.stageEl.clientWidth);
      const dogRatio = dog.x / stageWidth;
      if (p <= 0.02) {
        this.visitedPrints.clear();
        prints.forEach((pr) => (pr.el.style.opacity = '0'));
      } else if (this.lastDogRatio !== null) {
        const minR = Math.min(this.lastDogRatio, dogRatio);
        const maxR = Math.max(this.lastDogRatio, dogRatio);
        for (const pr of prints) {
          if (pr.xRatio >= minR - 0.015 && pr.xRatio <= maxR + 0.015) {
            this.visitedPrints.add(pr);
          }
          const dist = Math.abs(pr.xRatio - dogRatio);
          if (this.visitedPrints.has(pr)) {
            const glow = dist < 0.08 ? 0.95 : 0.42;
            pr.el.style.opacity = String(glow * pathP);
          } else {
            pr.el.style.opacity = '0';
          }
        }
      }
      this.lastDogRatio = dogRatio;

      // 8. Capítulos editoriales sincronizados al tramo del recorrido
      for (const ch of chapterRefs) {
        if (p < ch.start || p > ch.end) {
          ch.el.style.visibility = 'hidden';
          ch.el.style.opacity = '0';
          continue;
        }
        ch.el.style.visibility = 'visible';
        const span = ch.end - ch.start;
        const local = (p - ch.start) / span; // 0..1
        const enter = clamp01(local / 0.22);
        const exit = clamp01((1 - local) / 0.2);
        const vis = easeInOut(Math.min(enter, exit));

        ch.el.style.opacity = vis.toFixed(3);
        if (ch.rule) ch.rule.style.transform = `scaleX(${easeInOut(enter).toFixed(3)})`;
        if (ch.index) {
          ch.index.style.opacity = (vis * 0.45).toFixed(3);
          ch.index.style.transform = `translate3d(0, ${((1 - vis) * 18).toFixed(1)}px, 0)`;
        }
        const totalWords = Math.max(1, ch.words.length);
        ch.words.forEach((w, idx) => {
          const wStart = (idx / totalWords) * 0.14;
          const wEnter = easeInOut(clamp01((local - wStart) / 0.18));
          const wVis = Math.min(wEnter, easeInOut(exit));
          w.style.transform = `translate3d(0, ${((1 - wVis) * 105).toFixed(1)}%, 0)`;
        });
        if (ch.body) {
          const bVis = easeInOut(Math.min(clamp01((local - 0.08) / 0.2), exit));
          ch.body.style.opacity = bVis.toFixed(3);
          ch.body.style.transform = `translate3d(0, ${((1 - bVis) * 14).toFixed(1)}px, 0)`;
        }
      }

      // 9. Escena 3D en Three.js (avance de cámara + parallax con la posición de Doly)
      const dogXNorm = clamp01(dogRatio) * 2 - 1;
      this.scene?.setProgress(p, dogXNorm);
    };

    this.ctx = gsap.context(() => {
      // Estado inicial en p = 0
      applyProgress(0);

      ScrollTrigger.create({
        trigger: this.trackEl,
        start: 'top top',
        end: 'bottom bottom',
        scrub: 0.6,
        onUpdate: (self) => applyProgress(self.progress),
      });

      // Animación de entrada de la sección CTA final
      const ctaEl = document.querySelector<HTMLElement>('[data-cta]');
      if (ctaEl) {
        const ctaWords = ctaEl.querySelectorAll<HTMLElement>('.word');
        const ctaReveals = ctaEl.querySelectorAll<HTMLElement>('[data-cta-reveal]');
        gsap.fromTo(
          ctaWords,
          { yPercent: 105 },
          {
            yPercent: 0,
            duration: 0.9,
            stagger: 0.04,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: ctaEl,
              start: 'top 75%',
              toggleActions: 'play none none reverse',
            },
          },
        );
        gsap.fromTo(
          ctaReveals,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            stagger: 0.1,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: ctaEl,
              start: 'top 72%',
              toggleActions: 'play none none reverse',
            },
          },
        );
      }
    });

    // Recalcular métricas en resize
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.choreography) return;
      this.choreography.setMetrics(computeMetrics());
      ScrollTrigger.refresh();
    });
    this.resizeObserver.observe(this.stageEl);
  }

  private startTranslationNotesTicker() {
    const notes = Array.from(document.querySelectorAll<HTMLElement>('[data-xlate]'));
    if (!notes.length) return;
    let step = 0;
    this.xlateTimer = window.setInterval(() => {
      step++;
      for (const wrap of notes) {
        const list = (wrap.dataset.xlate || '').split('|').filter(Boolean);
        const noteEl = wrap.querySelector<HTMLElement>('.xlate__note');
        if (!noteEl || list.length <= 1) continue;
        const nextWord = list[step % list.length];
        gsap.to(noteEl, {
          opacity: 0,
          y: -6,
          duration: 0.18,
          onComplete: () => {
            noteEl.textContent = nextWord;
            gsap.to(noteEl, { opacity: 1, y: -3.2, duration: 0.22 });
          },
        });
      }
    }, 2400);
  }

  destroy() {
    if (this.xlateTimer) clearInterval(this.xlateTimer);
    this.resizeObserver?.disconnect();
    this.ctx?.revert();
    this.renderer?.dispose();
  }
}
