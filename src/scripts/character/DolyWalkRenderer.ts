import type { CharacterFrameState, CharacterRenderer, SpriteManifest } from './CharacterAnimator';

/**
 * Renderiza en <canvas> los 3 GIFs completos de Doly:
 *   1. Secuencia del libro (`doly-book-seq.webp`: libro vacío, Doly recostándose y Doly levantándose)
 *   2. Secuencia de caminata (`doly-walk.webp`: Doly caminando hacia el libro y saliendo hacia la derecha)
 */
export class DolyWalkRenderer implements CharacterRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private k = 1;
  private dpr = 1;
  private w = 0;
  private h = 0;
  private last = '';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly walkImage: HTMLImageElement,
    private readonly bookImage: HTMLImageElement,
    private readonly manifest: SpriteManifest,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number) {
    this.w = width;
    this.h = height;
    this.dpr = dpr;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
    this.last = '';
  }

  setScale(pxPerUnit: number) {
    this.k = pxPerUnit;
    this.last = '';
  }

  render(s: CharacterFrameState) {
    const key = [
      s.x.toFixed(1),
      s.stageCenterX.toFixed(1),
      s.groundY.toFixed(1),
      s.frame,
      s.facing,
      s.alpha.toFixed(3),
      s.bookFrame,
      s.bookAlpha.toFixed(3),
      s.bookScale.toFixed(3),
      s.bookFlip,
    ].join('|');
    if (key === this.last) return;
    this.last = key;

    const { ctx, k, manifest: m } = this;
    ctx.clearRect(0, 0, this.w, this.h);

    // 1. Dibuja el libro o la secuencia de Doly sobre el libro (recostándose / levantándose)
    if (s.bookAlpha > 0.001) {
      const b = m.bookSeq;
      const col = s.bookFrame % b.cols;
      const row = Math.floor(s.bookFrame / b.cols);
      const isStand = s.bookFrame >= b.standStart && s.bookFrame < b.standStart + b.standCount;
      const spineX = isStand ? b.standSpineX : b.lieSpineX;

      const bw = b.frameW * k;
      const bh = b.frameH * k;

      ctx.save();
      ctx.globalAlpha = s.bookAlpha;
      ctx.translate(s.stageCenterX, s.groundY);
      ctx.scale(s.bookFlip * s.bookScale, s.bookScale);
      ctx.drawImage(
        this.bookImage,
        col * b.frameW,
        row * b.frameH,
        b.frameW,
        b.frameH,
        -spineX * k,
        -b.groundY * k,
        bw,
        bh,
      );
      ctx.restore();
    }

    // 2. Dibuja a Doly caminando (antes de subir al libro y después de bajar del libro)
    if (s.alpha > 0.001) {
      const ws = m.walkScale ?? 1;
      const kw = k * ws;
      const dw = m.designW * kw;
      const dh = m.designH * kw;
      if (s.x + dw >= 0 && s.x - dw <= this.w) {
        ctx.save();
        ctx.globalAlpha = s.alpha;

        if (s.shadow > 0) {
          const shadowR = 135 * kw;
          const grad = ctx.createRadialGradient(s.x, s.groundY, 0, s.x, s.groundY, shadowR);
          grad.addColorStop(0, `rgba(0,0,0,${0.46 * s.shadow})`);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(s.x, s.groundY + 2 * kw, shadowR, 9 * kw, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        const col = s.frame % m.cols;
        const row = Math.floor(s.frame / m.cols);
        ctx.translate(s.x, s.groundY);
        ctx.scale(s.facing, 1);
        ctx.drawImage(
          this.walkImage,
          col * m.frameW,
          row * m.frameH,
          m.frameW,
          m.frameH,
          -m.centerX * kw,
          -m.groundY * kw,
          dw,
          dh,
        );
        ctx.restore();
      }
    }
  }

  dispose() {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }
}
