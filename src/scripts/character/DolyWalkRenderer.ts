import type { CharacterFrameState, CharacterRenderer, SitLayer, SpriteManifest } from './CharacterAnimator';

/**
 * Renderiza en <canvas> las tres hojas de Doly:
 *   1. Secuencia del libro (`doly-book-seq.webp`: libro vacío, Doly recostándose y Doly levantándose)
 *   2. Secuencia de sentado en suelo (`doly-sit-ground.webp`: Doly sentándose / levantándose sin libro)
 *   3. Secuencia de caminata (`doly-walk.webp`: Doly caminando por todo el recorrido)
 *
 * Las tres hojas comparten el mismo sistema de coordenadas (misma línea de suelo
 * y misma escala), así que todo relevo es continuo y sin saltos.
 */
export class DolyWalkRenderer implements CharacterRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private k = 1;
  private w = 0;
  private h = 0;
  private last = '';
  private lastState: CharacterFrameState | null = null;

  /** gradiente de sombra cacheado: se regenera solo cuando cambia el radio */
  private shadowGrad: CanvasGradient | null = null;
  private shadowRadius = -1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly walkImage: HTMLImageElement,
    private readonly sitImage: HTMLImageElement,
    private bookImage: HTMLImageElement | null,
    private readonly manifest: SpriteManifest,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D no disponible');
    this.ctx = ctx;
  }

  /** Cuando termina la precarga del libro, repinta de inmediato la última escena */
  setBookImage(img: HTMLImageElement | null) {
    if (img && img !== this.bookImage) {
      this.bookImage = img;
      this.last = '';
      if (this.lastState) this.render(this.lastState);
    }
  }

  resize(width: number, height: number, dpr: number) {
    this.w = width;
    this.h = height;
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
    this.lastState = s;
    const fmtSit = (layer: SitLayer | null) =>
      layer
        ? `${layer.x.toFixed(1)}:${(layer.yOffset ?? 0).toFixed(1)}:${(layer.scale ?? 1).toFixed(3)}:${layer.frame}:${layer.facing}:${layer.alpha.toFixed(3)}`
        : '-';
    const key = [
      s.stageCenterX.toFixed(1),
      s.groundY.toFixed(1),
      s.bookEmptyAlpha.toFixed(3),
      s.bookScale.toFixed(3),
      s.walk
        ? `${s.walk.x.toFixed(1)}:${s.walk.yOffset.toFixed(1)}:${s.walk.frame}:${s.walk.facing}:${s.walk.alpha.toFixed(3)}`
        : '-',
      fmtSit(s.sitA),
      fmtSit(s.sitB),
      s.bookA ? `${s.bookA.frame}:${s.bookA.alpha.toFixed(3)}:${s.bookA.flip}` : '-',
      s.bookB ? `${s.bookB.frame}:${s.bookB.alpha.toFixed(3)}:${s.bookB.flip}` : '-',
    ].join('|');
    if (key === this.last) return;
    this.last = key;

    const { ctx, k, manifest: m } = this;
    ctx.clearRect(0, 0, this.w, this.h);

    // 1. Libro canónico único de fondo (marco 60): siempre se dibuja detrás de
    //    los fotogramas sin libro (0..59), garantizando que el libro jamás cambie.
    if (s.bookEmptyAlpha > 0.001 && this.bookImage) {
      this.drawBookFrame(s.bookEmptyAlpha, m.bookSeq.emptyBookFrame, 1, s);
    }

    // 2. Siluetas de Doly sobre el libro (0..59 sin libro)
    if (this.bookImage) {
      if (s.bookA && s.bookA.alpha > 0.001) this.drawBookFrame(s.bookA.alpha, s.bookA.frame, s.bookA.flip, s);
      if (s.bookB && s.bookB.alpha > 0.001) this.drawBookFrame(s.bookB.alpha, s.bookB.frame, s.bookB.flip, s);
    }

    // 3. Doly sentándose / girando / levantándose (doly-sit-ground.webp)
    if (s.sitA && s.sitA.alpha > 0.001) this.drawSitLayer(s.sitA, s.groundY);
    if (s.sitB && s.sitB.alpha > 0.001) this.drawSitLayer(s.sitB, s.groundY);

    // 4. Doly caminando sobre el suelo
    const walk = s.walk;
    if (walk && walk.alpha > 0.001) {
      const ws = m.walkScale ?? 1;
      const kw = k * ws;
      const dw = m.designW * kw;
      const dh = m.designH * kw;
      if (walk.x + dw >= 0 && walk.x - dw <= this.w) {
        ctx.save();
        ctx.globalAlpha = walk.alpha;

        if (walk.shadow > 0) this.drawShadow(walk.x, s.groundY + walk.yOffset, kw, walk.shadow * walk.alpha);

        const col = walk.frame % m.cols;
        const row = Math.floor(walk.frame / m.cols);
        ctx.translate(walk.x, s.groundY + walk.yOffset);
        ctx.scale(walk.facing, 1);
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

  /** Dibuja un fotograma de la secuencia sentado / giro (con soporte opcional de yOffset y scale) */
  private drawSitLayer(layer: SitLayer, groundY: number) {
    const { ctx, k, manifest: m } = this;
    const sq = m.sitSeq;
    const sc = layer.scale ?? 1;
    const yOff = layer.yOffset ?? 0;
    const ks = k * sc;
    const dw = sq.frameW * ks;
    const dh = sq.frameH * ks;
    if (layer.x + dw < 0 || layer.x - dw > this.w) return;

    const alpha = layer.alpha;
    const col = layer.frame % sq.cols;
    const row = Math.floor(layer.frame / sq.cols);

    ctx.save();
    ctx.globalAlpha = alpha;
    if (yOff === 0 && layer.shadow > 0) this.drawShadow(layer.x, groundY, ks * 0.85, layer.shadow * alpha);

    ctx.translate(layer.x, groundY + yOff);
    ctx.scale(layer.facing, 1);
    ctx.drawImage(
      this.sitImage,
      col * sq.frameW,
      row * sq.frameH,
      sq.frameW,
      sq.frameH,
      -sq.centerX * ks,
      -sq.groundY * ks,
      dw,
      dh,
    );
    ctx.restore();
  }

  /** Dibuja un fotograma de la hoja del libro anclando su lomo al centro del stage */
  private drawBookFrame(alpha: number, frame: number, flip: 1 | -1, s: CharacterFrameState) {
    const { ctx, k, manifest: m } = this;
    const b = m.bookSeq;
    const col = frame % b.cols;
    const row = Math.floor(frame / b.cols);
    const isStand = frame >= b.standStart && frame < b.standStart + b.standCount;
    const spineX = isStand ? b.standSpineX : b.lieSpineX;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(s.stageCenterX, s.groundY);
    ctx.scale(flip * s.bookScale, s.bookScale);
    ctx.drawImage(
      this.bookImage!,
      col * b.frameW,
      row * b.frameH,
      b.frameW,
      b.frameH,
      -spineX * k,
      -b.groundY * k,
      b.frameW * k,
      b.frameH * k,
    );
    ctx.restore();
  }

  /** Sombra radial reutilizable */
  private drawShadow(x: number, groundY: number, kw: number, strength: number) {
    const { ctx } = this;
    const radius = 135 * kw;
    if (!this.shadowGrad || this.shadowRadius !== radius) {
      this.shadowGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      this.shadowGrad.addColorStop(0, 'rgba(0,0,0,0.46)');
      this.shadowGrad.addColorStop(1, 'rgba(0,0,0,0)');
      this.shadowRadius = radius;
    }
    ctx.save();
    ctx.globalAlpha = strength;
    ctx.translate(x, groundY);
    ctx.fillStyle = this.shadowGrad;
    ctx.beginPath();
    ctx.ellipse(0, 2 * kw, radius, 9 * kw, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  dispose() {
    this.ctx.clearRect(0, 0, this.w, this.h);
    this.shadowGrad = null;
    this.lastState = null;
  }
}
