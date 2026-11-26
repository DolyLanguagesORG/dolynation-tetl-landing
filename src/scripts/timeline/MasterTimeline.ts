import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { buildSpriteManifestUrl } from '../../lib/spriteUrls';
import { loadSpriteSheet } from '../character/CharacterAnimator';
import { DolyWalkRenderer } from '../character/DolyWalkRenderer';
import { DolyChoreography, type StageMetrics } from '../character/DolyChoreography';
import { SECTION_STOPS, clamp01, sectionFor } from './beats';
import type { SceneController } from '../scene/SceneController';
import type { SmoothScroll } from '../core/SmoothScroll';

gsap.registerPlugin(ScrollTrigger);

interface PrintItem {
  el: HTMLElement;
  xRatio: number; // 0..1
  opacity: number; // último valor escrito (evita escribir en el DOM cada frame)
}

/**
 * Orquestador principal por secciones (velocidad fija con GSAP):
 * --------------------------------------------------------------
 * El recorrido se divide en 6 tramos:
 *     0: Hero ("Bienvenido a DolyNation") · Doly fuera a la izquierda
 *     1: ¿Qué problema resuelve?          · Parada 1: sentada en suelo (izquierda del libro)
 *     2: ¿Qué es DolyNation?              · Parada 2: sentada encima del libro
 *     3: ¿Por qué elegir DolyNation?      · Parada 3: acostada encima del libro
 *     4: Características y Funcionalidades· Parada 4: sentada en suelo (derecha del libro)
 *     5: Transición al CTA final          · Doly se para y sale por la derecha
 */
export class MasterTimeline {
  private ctx?: gsap.Context;
  private mm?: gsap.MatchMedia;
  private renderer?: DolyWalkRenderer;
  private choreography?: DolyChoreography;
  private xlateTimer?: number;
  private resizeObserver?: ResizeObserver;
  private resizeTimer?: number;
  private visitedPrints = new Set<PrintItem>();
  private lastDogRatio: number | null = null;
  private activeSection = -1;
  /** movimiento reducido: sin barridos de texto ni scroll continuo del personaje */
  private reduced = false;

  constructor(
    private readonly trackEl: HTMLElement,
    private readonly stageEl: HTMLElement,
    private scene?: SceneController,
    private smoothScroll?: SmoothScroll,
  ) {}

  /** La escena 3D se carga en diferido: se engancha cuando llega. */
  attachScene(scene: SceneController) {
    this.scene = scene;
  }

  async init() {
    const canvas = this.stageEl.querySelector<HTMLCanvasElement>('[data-doly-canvas]');
    const anchor = this.stageEl.querySelector<HTMLElement>('[data-anchor]');
    const pathLine = this.stageEl.querySelector<HTMLElement>('[data-path-line]');
    const pathTicks = this.stageEl.querySelector<HTMLElement>('[data-path-ticks]');
    const heroEl = this.stageEl.querySelector<HTMLElement>('[data-hero]');
    const scrollCue = this.stageEl.querySelector<HTMLElement>('[data-scroll-cue]');
    const headerProgress = document.querySelector<HTMLElement>('[data-scroll-progress]');
    const navLinks = Array.from(document.querySelectorAll<HTMLElement>('.nav-link[data-section-target]'));
    const checkpointPips = Array.from(document.querySelectorAll<HTMLElement>('[data-checkpoint-pip]'));

    if (!canvas || !anchor) return;

    // Oculta el Hero de inmediato si la recarga cae en mitad del recorrido (antes de esperar sprites)
    const initialTotal = Math.max(1, this.trackEl.scrollHeight - window.innerHeight);
    const initialProgress = clamp01(-this.trackEl.getBoundingClientRect().top / initialTotal);
    const initialSection = sectionFor(initialProgress);
    if (heroEl && initialSection !== 0) {
      gsap.set(heroEl, { autoAlpha: 0, y: -28 });
    }
    let scrollCueVisible = initialSection === 0 && initialProgress <= 0.002;
    if (scrollCue && !scrollCueVisible) {
      gsap.set(scrollCue, { autoAlpha: 0 });
    }
    if (headerProgress) {
      headerProgress.style.transform = `scaleX(${initialProgress.toFixed(4)})`;
    }

    const updateScrollCue = (show: boolean, immediate = false) => {
      if (!scrollCue || show === scrollCueVisible) return;
      scrollCueVisible = show;
      if (immediate) {
        gsap.set(scrollCue, { autoAlpha: show ? 1 : 0 });
      } else {
        gsap.to(scrollCue, {
          autoAlpha: show ? 1 : 0,
          duration: 0.25,
          overwrite: true,
        });
      }
    };

    const spritesVersion =
      document.querySelector<HTMLMetaElement>('meta[name="doly-sprites-version"]')?.content ?? undefined;
    const sheet = await loadSpriteSheet(buildSpriteManifestUrl('/sprites/doly-walk.json', spritesVersion));
    this.renderer = new DolyWalkRenderer(canvas, sheet.walkImage, sheet.sitImage, sheet.bookImage, sheet.manifest);
    void sheet.loadBook().then((img) => this.renderer?.setBookImage(img));

    const computeMetrics = (): StageMetrics => {
      const stageRect = this.stageEl.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, window.innerWidth < 768 ? 1.5 : 2);
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
      opacity: -1,
    }));

    const setPrintOpacity = (pr: PrintItem, value: number) => {
      if (Math.abs(pr.opacity - value) < 0.01) return;
      pr.opacity = value;
      pr.el.style.opacity = String(value);
    };

    const updateTrailPrints = (dogX: number, section: number) => {
      const stageWidth = Math.max(1, this.stageEl.clientWidth);
      const dogRatio = dogX / stageWidth;
      if (section <= 0 && dogRatio < 0) {
        this.visitedPrints.clear();
        prints.forEach((pr) => setPrintOpacity(pr, 0));
      } else if (this.lastDogRatio !== null) {
        const minR = Math.min(this.lastDogRatio, dogRatio);
        const maxR = Math.max(this.lastDogRatio, dogRatio);
        for (const pr of prints) {
          if (pr.xRatio >= minR - 0.02 && pr.xRatio <= maxR + 0.02) {
            this.visitedPrints.add(pr);
          }
          const dist = Math.abs(pr.xRatio - dogRatio);
          if (this.visitedPrints.has(pr)) {
            setPrintOpacity(pr, dist < 0.08 ? 0.95 : 0.45);
          } else {
            setPrintOpacity(pr, 0);
          }
        }
      }
      this.lastDogRatio = dogRatio;
      const dogXNorm = clamp01(dogRatio) * 2 - 1;
      this.scene?.setProgress(section / 5, dogXNorm);
    };

    const chapters = Array.from(this.stageEl.querySelectorAll<HTMLElement>('[data-chapter]'));

    const activateSection = (sectionIndex: number, immediate = false) => {
      if (sectionIndex === this.activeSection) return;
      this.activeSection = sectionIndex;

      // 0. Menú superior y marcadores de checkpoint
      navLinks.forEach((link) => {
        const target = Number(link.dataset.sectionTarget);
        link.classList.toggle('is-active', target === sectionIndex);
      });
      checkpointPips.forEach((pip) => {
        const target = Number(pip.dataset.checkpointPip);
        pip.classList.toggle('is-active', target === sectionIndex);
        pip.classList.toggle('is-passed', sectionIndex > target);
      });

      // 1. Línea del camino: se dibuja al salir del Hero (section >= 1)
      const showPath = sectionIndex >= 1;
      if (pathLine) {
        if (immediate) {
          gsap.set(pathLine, { scaleX: showPath ? 1 : 0, opacity: showPath ? 1 : 0 });
        } else {
          gsap.to(pathLine, {
            scaleX: showPath ? 1 : 0,
            opacity: showPath ? 1 : 0,
            duration: 0.7,
            ease: 'power2.out',
            overwrite: true,
          });
        }
      }
      if (pathTicks) {
        if (immediate) {
          gsap.set(pathTicks, { scaleX: showPath ? 1 : 0, opacity: showPath ? 0.85 : 0 });
        } else {
          gsap.to(pathTicks, {
            scaleX: showPath ? 1 : 0,
            opacity: showPath ? 0.85 : 0,
            duration: 0.7,
            ease: 'power2.out',
            overwrite: true,
          });
        }
      }

      // 3. Hero (visible en Sección 0)
      if (heroEl) {
        const isHero = sectionIndex === 0;
        if (immediate) {
          gsap.set(heroEl, { autoAlpha: isHero ? 1 : 0, y: isHero ? 0 : -28 });
        } else {
          gsap.to(heroEl, {
            autoAlpha: isHero ? 1 : 0,
            y: isHero ? 0 : -28,
            duration: 0.55,
            ease: 'power2.out',
            overwrite: true,
          });
        }
      }
      if (this.reduced || immediate) {
        updateScrollCue(sectionIndex === 0 && (this.choreography?.getProgress() ?? initialProgress) <= 0.002, immediate);
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
          if (this.reduced) {
            gsap.set([rule, body, cards], { clearProps: 'all' });
            gsap.set([rule, body, cards], { opacity: 1, y: 0, scaleX: 1 });
            return;
          }
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
          if (immediate) {
            gsap.set(ch, { autoAlpha: 0, pointerEvents: 'none' });
          } else {
            gsap.to(ch, {
              autoAlpha: 0,
              pointerEvents: 'none',
              duration: 0.35,
              ease: 'power2.inOut',
              overwrite: true,
            });
          }
        }
      });
    };

    const initialMetrics = computeMetrics();
    let ready = false;
    this.choreography = new DolyChoreography(sheet.manifest, initialMetrics, ({ dog, dogX, u, activeSection }) => {
      this.renderer?.render(dog);
      updateTrailPrints(dogX, activeSection);
      if (headerProgress) {
        headerProgress.style.transform = `scaleX(${u.toFixed(4)})`;
      }
      if (!this.reduced) {
        activateSection(activeSection);
        updateScrollCue(activeSection === 0 && u <= 0.002);
        if (ready) this.smoothScroll?.syncStoryProgress(u);
      }
    });

    this.startTranslationNotesTicker();

    // Movimiento reducido: Doly se queda sentada en el libro y los bloques
    // aparecen sin barrido. La rama se revierte sola si la preferencia cambia.
    this.mm = gsap.matchMedia();
    this.mm.add('(prefers-reduced-motion: reduce)', () => {
      this.reduced = true;
      this.choreography?.setFrozen(true);
      return () => {
        this.reduced = false;
        this.choreography?.setFrozen(false);
      };
    });

    this.ctx = gsap.context(() => {
      if (pathLine) gsap.set(pathLine, { scaleX: 0, opacity: 0 });
      if (pathTicks) gsap.set(pathTicks, { scaleX: 0, opacity: 0 });

      // Estado inicial determinista: el navegador puede restaurar el scroll o abrir un hash
      const total = Math.max(1, this.trackEl.scrollHeight - window.innerHeight);
      const restored = clamp01(-this.trackEl.getBoundingClientRect().top / total);
      this.activeSection = -1;
      this.choreography?.snapToProgress(restored);
      activateSection(sectionFor(restored), true);
      if (this.choreography) {
        this.smoothScroll?.attachStoryDriver(this.choreography);
      }
      ready = true;

      ScrollTrigger.create({
        trigger: this.trackEl,
        start: 'top top',
        end: 'bottom bottom',
        onUpdate: (self) => {
          if (!this.reduced) return;
          const p = self.progress;
          if (headerProgress) {
            headerProgress.style.transform = `scaleX(${p.toFixed(4)})`;
          }
          activateSection(sectionFor(p));
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

    // El resize se agrupa: recalcular métricas en cada frame de un drag
    // redimensionando la ventana provoca saltos en la animación.
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.choreography) return;
      if (this.resizeTimer) clearTimeout(this.resizeTimer);
      this.resizeTimer = window.setTimeout(() => {
        this.choreography?.setMetrics(computeMetrics());
        ScrollTrigger.refresh();
      }, 120);
    });
    this.resizeObserver.observe(this.stageEl);
  }

  /** Puntos donde el scroll debe asentar: uno por sección editorial */
  get sectionStops(): readonly number[] {
    return SECTION_STOPS;
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
          y: -4,
          duration: 0.18,
          onComplete: () => {
            noteEl.textContent = nextWord;
            gsap.to(noteEl, { opacity: 1, y: 0, duration: 0.22 });
          },
        });
      }
    }, 2400);
  }

  destroy() {
    if (this.xlateTimer) clearInterval(this.xlateTimer);
    if (this.resizeTimer) clearTimeout(this.resizeTimer);
    this.resizeObserver?.disconnect();
    this.choreography?.destroy();
    this.ctx?.revert();
    this.mm?.revert();
    this.renderer?.dispose();
  }
}
