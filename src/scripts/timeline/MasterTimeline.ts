import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { loadSpriteSheet } from '../character/CharacterAnimator';
import { DolyWalkRenderer } from '../character/DolyWalkRenderer';
import { DolyChoreography, type StageMetrics } from '../character/DolyChoreography';
import { clamp01 } from './beats';
import type { SceneController } from '../scene/SceneController';

gsap.registerPlugin(ScrollTrigger);

interface PrintItem {
  el: HTMLElement;
  xRatio: number; // 0..1
}

/**
 * Orquestador principal por secciones (Velocidad fija con GSAP):
 * --------------------------------------------------------------
 * En lugar de que la velocidad de Doly dependa de qué tan rápido el usuario mueve el scroll:
 *  - El recorrido se divide en 6 secciones:
 *      0: Hero ("Bienvenido a DolyNation")
 *      1: ¿Qué problema resuelve?
 *      2: ¿Qué es DolyNation?
 *      3: ¿Por qué elegir DolyNation? (Doly sube al libro y se recuesta)
 *      4: Características y Funcionalidades (Doly se levanta del libro y avanza a la derecha)
 *      5: Transición al CTA final (Doly termina de cruzar por el borde derecho)
 *  - Al entrar a cada sección, GSAP dispara una animación a velocidad fija (`goToSection(index)`)
 *    tanto para los pasos de Doly como para la entrada editorial de los textos y tarjetas.
 */
export class MasterTimeline {
  private ctx?: gsap.Context;
  private renderer?: DolyWalkRenderer;
  private choreography?: DolyChoreography;
  private xlateTimer?: number;
  private resizeObserver?: ResizeObserver;
  private visitedPrints = new Set<PrintItem>();
  private lastDogRatio: number | null = null;
  private activeSection = -1;

  constructor(
    private readonly trackEl: HTMLElement,
    private readonly stageEl: HTMLElement,
    private readonly scene?: SceneController,
  ) {}

  async init() {
    const canvas = this.stageEl.querySelector<HTMLCanvasElement>('[data-doly-canvas]');
    const anchor = this.stageEl.querySelector<HTMLElement>('[data-anchor]');
    const pathLine = this.stageEl.querySelector<HTMLElement>('[data-path-line]');
    const pathTicks = this.stageEl.querySelector<HTMLElement>('[data-path-ticks]');
    const heroEl = this.stageEl.querySelector<HTMLElement>('[data-hero]');
    const scrollCue = this.stageEl.querySelector<HTMLElement>('[data-scroll-cue]');
    const headerProgress = document.querySelector<HTMLElement>('[data-scroll-progress]');

    if (!canvas || !anchor) return;

    const { manifest, image, bookImage } = await loadSpriteSheet('/sprites/doly-walk.json');
    this.renderer = new DolyWalkRenderer(canvas, image, bookImage, manifest);

    const computeMetrics = (): StageMetrics => {
      const stageRect = this.stageEl.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.renderer!.resize(stageRect.width, stageRect.height, dpr);

      const groundY = anchorRect.top - stageRect.top + anchorRect.width * 0.816;
      const k = anchorRect.width / 355;
      this.renderer!.setScale(k);

      return {
        width: stageRect.width,
        groundY,
        k,
      };
    };

    const prints: PrintItem[] = Array.from(this.stageEl.querySelectorAll<HTMLElement>('[data-print]')).map((el) => ({
      el,
      xRatio: Number(el.dataset.x || '0') / 100,
    }));

    const updateTrailPrints = (dogX: number) => {
      const stageWidth = Math.max(1, this.stageEl.clientWidth);
      const dogRatio = dogX / stageWidth;
      if (this.activeSection <= 0 && dogRatio < 0) {
        this.visitedPrints.clear();
        prints.forEach((pr) => (pr.el.style.opacity = '0'));
      } else if (this.lastDogRatio !== null) {
        const minR = Math.min(this.lastDogRatio, dogRatio);
        const maxR = Math.max(this.lastDogRatio, dogRatio);
        for (const pr of prints) {
          if (pr.xRatio >= minR - 0.02 && pr.xRatio <= maxR + 0.02) {
            this.visitedPrints.add(pr);
          }
          const dist = Math.abs(pr.xRatio - dogRatio);
          if (this.visitedPrints.has(pr)) {
            pr.el.style.opacity = dist < 0.08 ? '0.95' : '0.45';
          } else {
            pr.el.style.opacity = '0';
          }
        }
      }
      this.lastDogRatio = dogRatio;
      const dogXNorm = clamp01(dogRatio) * 2 - 1;
      this.scene?.setProgress(this.activeSection / 5, dogXNorm);
    };

    const initialMetrics = computeMetrics();
    this.choreography = new DolyChoreography(manifest, initialMetrics, ({ dog }) => {
      this.renderer?.render(dog);
      updateTrailPrints(dog.x);
    });

    const chapters = Array.from(this.stageEl.querySelectorAll<HTMLElement>('[data-chapter]'));

    const activateSection = (sectionIndex: number) => {
      if (sectionIndex === this.activeSection) return;
      this.activeSection = sectionIndex;

      // 1. Línea del camino: se dibuja al salir del Hero (section >= 1)
      const showPath = sectionIndex >= 1;
      if (pathLine) {
        gsap.to(pathLine, {
          scaleX: showPath ? 1 : 0,
          opacity: showPath ? 1 : 0,
          duration: 0.7,
          ease: 'power2.out',
          overwrite: true,
        });
      }
      if (pathTicks) {
        gsap.to(pathTicks, {
          scaleX: showPath ? 1 : 0,
          opacity: showPath ? 0.85 : 0,
          duration: 0.7,
          ease: 'power2.out',
          overwrite: true,
        });
      }

      // 3. Hero (visible en Sección 0)
      if (heroEl) {
        const isHero = sectionIndex === 0;
        gsap.to(heroEl, {
          autoAlpha: isHero ? 1 : 0,
          y: isHero ? 0 : -28,
          duration: 0.55,
          ease: 'power2.out',
          overwrite: true,
        });
      }
      if (scrollCue) {
        gsap.to(scrollCue, {
          autoAlpha: sectionIndex === 0 ? 1 : 0,
          duration: 0.4,
          overwrite: true,
        });
      }

      // 4. Animación editorial con GSAP de la sección activa (1..4)
      chapters.forEach((ch) => {
        const chIdx = Number(ch.dataset.sectionIndex);
        const isCurrent = chIdx === sectionIndex;
        const words = ch.querySelectorAll<HTMLElement>('.word');
        const body = ch.querySelector<HTMLElement>('[data-chapter-body]');
        const rule = ch.querySelector<HTMLElement>('[data-chapter-rule]');
        const cards = ch.querySelectorAll<HTMLElement>('[data-chapter-card]');

        if (isCurrent) {
          gsap.killTweensOf([ch, words, body, rule, cards]);
          gsap.set(ch, { autoAlpha: 1, pointerEvents: 'auto' });
          if (rule) {
            gsap.fromTo(rule, { scaleX: 0 }, { scaleX: 1, duration: 0.6, ease: 'power3.out' });
          }
          gsap.fromTo(
            words,
            { yPercent: 105 },
            { yPercent: 0, duration: 0.65, stagger: 0.025, ease: 'power3.out' },
          );
          if (body) {
            gsap.fromTo(
              body,
              { opacity: 0, y: 14 },
              { opacity: 1, y: 0, duration: 0.55, delay: 0.12, ease: 'power2.out' },
            );
          }
          if (cards.length) {
            gsap.fromTo(
              cards,
              { opacity: 0, y: 22 },
              { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, delay: 0.16, ease: 'power2.out' },
            );
          }
        } else {
          gsap.to(ch, {
            autoAlpha: 0,
            pointerEvents: 'none',
            duration: 0.35,
            ease: 'power2.inOut',
            overwrite: true,
          });
        }
      });
    };

    this.startTranslationNotesTicker();

    this.ctx = gsap.context(() => {
      if (pathLine) gsap.set(pathLine, { scaleX: 0, opacity: 0 });
      if (pathTicks) gsap.set(pathTicks, { scaleX: 0, opacity: 0 });
      activateSection(0);

      // Divide el track en 6 tramos iguales (Secciones 0..5) y dispara activateSection cuando cambia el tramo
      ScrollTrigger.create({
        trigger: this.trackEl,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          const p = self.progress;
          if (headerProgress) {
            headerProgress.style.transform = `scaleX(${p.toFixed(4)})`;
          }
          // Doly sigue el camino continuo a velocidad constante sin detenerse por sección
          this.choreography?.setTargetProgress(p);

          // Mapeo de progreso a sección editorial (0..5)
          let sec = 0;
          if (p < 0.12) sec = 0;
          else if (p < 0.31) sec = 1;
          else if (p < 0.5) sec = 2;
          else if (p < 0.69) sec = 3;
          else if (p < 0.88) sec = 4;
          else sec = 5;

          activateSection(sec);
        },
      });

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
    this.choreography?.destroy();
    this.ctx?.revert();
    this.renderer?.dispose();
  }
}
