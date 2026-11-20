import { gsap } from 'gsap';
import type { WelcomeLanguage } from '../../data/landing';

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzअआइईउऊあいうえおアイウエオ漢字語';

/**
 * Controla la rotación multilenguaje del título de bienvenida:
 * - Mantiene "DolyNation" fijo en serif itálica como ancla visual.
 * - Transforma el saludo (prefijo / sufijo) entre Español, Inglés, Francés,
 *   Italiano, Japonés, Portugués, Alemán, Coreano, Chino y Náhuatl con efecto
 *   de decodificación tipográfica (glyph morph).
 * - Deja un "rastro de aprendizaje": cada idioma visitado queda encendido en
 *   la barra superior de idiomas y deja un eco tipográfico sutil al cambiar.
 */
export class LanguageTitle {
  private index = 0;
  private timer: gsap.core.Tween | null = null;
  private morphRaf: number | null = null;
  private readonly prefixEl: HTMLElement | null;
  private readonly suffixEl: HTMLElement | null;
  private readonly titleEl: HTMLElement | null;
  private readonly nativeEl: HTMLElement | null;
  private readonly countEl: HTMLElement | null;
  private readonly progressEl: HTMLElement | null;
  private readonly ghostsEl: HTMLElement | null;
  private readonly tags: Map<string, HTMLElement> = new Map();
  private readonly intervalSec = 3.2;

  constructor(
    private readonly root: HTMLElement,
    private readonly languages: WelcomeLanguage[],
  ) {
    this.prefixEl = root.querySelector<HTMLElement>('[data-t-prefix]');
    this.suffixEl = root.querySelector<HTMLElement>('[data-t-suffix]');
    this.titleEl = root.querySelector<HTMLElement>('[data-lang-title]');
    this.nativeEl = root.querySelector<HTMLElement>('[data-lang-native]');
    this.countEl = root.querySelector<HTMLElement>('[data-lang-count]');
    this.progressEl = root.querySelector<HTMLElement>('[data-lang-progress]');
    this.ghostsEl = root.querySelector<HTMLElement>('[data-title-ghosts]');

    root.querySelectorAll<HTMLElement>('[data-lang-tag]').forEach((el) => {
      const code = el.dataset.langTag;
      if (code) this.tags.set(code, el);
    });

    // Permite hacer clic en cualquier etiqueta de idioma para saltar a él
    this.tags.forEach((el, code) => {
      el.style.pointerEvents = 'auto';
      el.style.cursor = 'pointer';
      el.addEventListener('click', () => {
        const targetIndex = this.languages.findIndex((l) => l.code === code);
        if (targetIndex >= 0 && targetIndex !== this.index) {
          this.goTo(targetIndex);
        }
      });
    });
  }

  start() {
    if (this.languages.length <= 1) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    this.scheduleNext();
  }

  private scheduleNext() {
    this.timer?.kill();
    if (this.progressEl) {
      gsap.fromTo(
        this.progressEl,
        { scaleX: 0 },
        { scaleX: 1, duration: this.intervalSec, ease: 'none', overwrite: true },
      );
    }
    this.timer = gsap.delayedCall(this.intervalSec, () => {
      this.goTo((this.index + 1) % this.languages.length);
    });
  }

  private goTo(nextIndex: number) {
    const prev = this.languages[this.index];
    const next = this.languages[nextIndex];
    this.index = nextIndex;

    this.spawnGhostEcho(prev);
    this.updateIndicators(next, nextIndex);
    this.morphText(prev, next);
    this.scheduleNext();
  }

  /** Crea un eco/rastro visual fugaz del idioma que acaba de aprenderse */
  private spawnGhostEcho(lang: WelcomeLanguage) {
    if (!this.ghostsEl || !this.titleEl) return;
    const ghost = document.createElement('div');
    ghost.className =
      'pointer-events-none select-none font-mono text-xs uppercase tracking-[0.25em] text-ink-500/50 whitespace-nowrap';
    ghost.textContent = `${lang.tag} · ${lang.prefix}DolyNation${lang.suffix}`;
    ghost.style.position = 'absolute';
    ghost.style.left = '50%';
    ghost.style.top = '0';
    ghost.style.transform = 'translate(-50%, 0)';
    this.ghostsEl.appendChild(ghost);

    gsap.to(ghost, {
      y: -34,
      opacity: 0,
      scale: 0.94,
      duration: 1.1,
      ease: 'power2.out',
      onComplete: () => ghost.remove(),
    });
  }

  private updateIndicators(next: WelcomeLanguage, idx: number) {
    this.tags.forEach((el, code) => {
      const active = code === next.code;
      el.classList.toggle('is-active', active);
      if (active) el.classList.add('is-visited');
    });

    if (this.titleEl) this.titleEl.setAttribute('lang', next.code);
    if (this.nativeEl) {
      this.nativeEl.setAttribute('lang', next.code);
      gsap.to(this.nativeEl, {
        opacity: 0,
        y: -4,
        duration: 0.16,
        onComplete: () => {
          if (!this.nativeEl) return;
          this.nativeEl.textContent = next.native;
          gsap.to(this.nativeEl, { opacity: 1, y: 0, duration: 0.24 });
        },
      });
    }
    if (this.countEl) {
      const total = String(this.languages.length).padStart(2, '0');
      const cur = String(idx + 1).padStart(2, '0');
      this.countEl.textContent = `${cur} / ${total}`;
    }
  }

  private morphText(prev: WelcomeLanguage, next: WelcomeLanguage) {
    if (this.morphRaf !== null) cancelAnimationFrame(this.morphRaf);

    const start = performance.now();
    const duration = 520;

    const scrambleSegment = (fromStr: string, toStr: string, t: number): string => {
      const maxLen = Math.max(fromStr.length, toStr.length);
      const curLen = Math.round(fromStr.length + (toStr.length - fromStr.length) * t);
      let out = '';
      for (let i = 0; i < curLen; i++) {
        const revealThreshold = (i / Math.max(1, maxLen)) * 0.65 + 0.35;
        if (t >= revealThreshold) {
          out += toStr[i] ?? '';
        } else if (t < 0.2 && i < fromStr.length) {
          out += fromStr[i];
        } else {
          const ch = toStr[i] ?? fromStr[i] ?? ' ';
          if (ch === ' ') {
            out += ' ';
          } else {
            const gIdx = (i * 13 + Math.floor(t * 28)) % GLYPHS.length;
            out += GLYPHS[gIdx];
          }
        }
      }
      return out;
    };

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      if (this.prefixEl) {
        this.prefixEl.textContent = t < 1 ? scrambleSegment(prev.prefix, next.prefix, t) : next.prefix;
        this.prefixEl.classList.toggle('glyph-scramble', t < 0.85 && next.prefix.length > 0);
      }
      if (this.suffixEl) {
        this.suffixEl.textContent = t < 1 ? scrambleSegment(prev.suffix, next.suffix, t) : next.suffix;
        this.suffixEl.classList.toggle('glyph-scramble', t < 0.85 && next.suffix.length > 0);
      }
      if (t < 1) {
        this.morphRaf = requestAnimationFrame(step);
      } else {
        this.morphRaf = null;
      }
    };

    this.morphRaf = requestAnimationFrame(step);
  }

  destroy() {
    this.timer?.kill();
    if (this.morphRaf !== null) cancelAnimationFrame(this.morphRaf);
  }
}
