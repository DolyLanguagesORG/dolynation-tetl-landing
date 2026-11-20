import type { CharacterFrameState, CharacterRenderer, SpriteManifest } from './CharacterAnimator';

/**
 * Dibuja a Doly desde un sprite sheet .webp sobre un <canvas> 2D.
 * Sin video, sin GIF: cada frame se elige según el progreso del scroll.
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
    private readonly image: HTMLImageElement,
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
    const key = `${s.x.toFixed(1)}|${s.groundY.toFixed(1)}|${s.frame}|${s.facing}|${s.alpha.toFixed(3)}|${s.shadow.toFixed(2)}`;
    if (key === this.last) return;
    this.last = key;

    const { ctx, k, manifest: m } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    if (s.alpha <= 0.001) return;

    const dw = m.designW * k;
    const dh = m.designH * k;
    // fuera de pantalla: nada que dibujar
    if (s.x + dw < 0 || s.x - dw > this.w) return;

    ctx.save();
    ctx.globalAlpha = s.alpha;

    // sombra suave en el piso
    if (s.shadow > 0) {
      const grad = ctx.createRadialGradient(s.x, s.groundY, 0, s.x, s.groundY, 110 * k);
      grad.addColorStop(0, `rgba(0,0,0,${0.45 * s.shadow})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(s.x, s.groundY + 2 * k, 110 * k, 9 * k, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const col = s.frame % m.cols;
    const row = Math.floor(s.frame / m.cols);
    ctx.translate(s.x, 0);
    ctx.scale(s.facing, 1);
    ctx.drawImage(
      this.image,
      col * m.frameW,
      row * m.frameH,
      m.frameW,
      m.frameH,
      -m.centerX * k,
      s.groundY - m.groundY * k,
      dw,
      dh,
    );
    ctx.restore();
  }

  dispose() {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  get pixelRatio() {
    return this.dpr;
  }
}
