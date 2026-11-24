import * as THREE from 'three';
import { gsap } from 'gsap';

/**
 * Escena 3D monocromática en Three.js (Single-Canvas Background):
 * - Fondo charcoal (#1c1c1c) con niebla exponencial (THREE.FogExp2).
 * - Líneas de perspectiva sutiles en el plano del suelo que acompañan el camino de Doly.
 * - Anillos concéntricos editoriales y partículas flotantes que responden al progreso
 *   del scroll (z-travel de cámara) y a la posición horizontal de la perrita (parallax X).
 */
export class SceneController {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer?: THREE.WebGLRenderer;
  private ringsGroup!: THREE.Group;
  private dustPoints!: THREE.Points;
  private gridGroup!: THREE.Group;
  private targetProgress = 0;
  private currentProgress = 0;
  private targetDogOffset = 0; // -1 (izq) a +1 (der)
  private currentDogOffset = 0;
  private disposed = false;
  /** gama baja: menos partículas y menos resolución para no cargar el móvil */
  private readonly light = window.matchMedia('(max-width: 767px)').matches || navigator.hardwareConcurrency <= 4;

  private readonly onTick = () => this.renderFrame();
  private readonly onResize = () => this.handleResize();

  constructor(private readonly canvas: HTMLCanvasElement) {
    try {
      this.init();
    } catch {
      // Fallback limpio si el navegador no tiene WebGL disponible
      this.disposed = true;
    }
  }

  private init() {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x1c1c1c, 0.055);

    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0.4, 9);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.light,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio());

    this.buildHorizonGrid();
    this.buildOrbitalRings();
    this.buildFloatingDust();

    gsap.ticker.add(this.onTick);
    window.addEventListener('resize', this.onResize, { passive: true });
  }

  /** DPR limitado: en gama baja basta con 1.5 (o menos) para que no se note */
  private pixelRatio(): number {
    const cap = this.light ? 1.5 : 2;
    return Math.min(window.devicePixelRatio || 1, cap);
  }

  /** Plano de profundidad con líneas paralelas bajo el camino de Doly */
  private buildHorizonGrid() {
    this.gridGroup = new THREE.Group();
    this.gridGroup.position.y = -2.1;

    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.08,
    });

    const points: THREE.Vector3[] = [];
    // Líneas transversales de perspectiva
    for (let i = -14; i <= 14; i += 2) {
      points.push(new THREE.Vector3(i * 1.1, 0, -14));
      points.push(new THREE.Vector3(i * 1.1, 0, 8));
    }
    // Líneas horizontales de profundidad
    for (let z = -12; z <= 6; z += 1.8) {
      points.push(new THREE.Vector3(-16, 0, z));
      points.push(new THREE.Vector3(16, 0, z));
    }

    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const segments = new THREE.LineSegments(geo, lineMat);
    this.gridGroup.add(segments);
    this.scene.add(this.gridGroup);
  }

  /** Anillos concéntricos de puntos y líneas finas al fondo */
  private buildOrbitalRings() {
    this.ringsGroup = new THREE.Group();
    this.ringsGroup.position.set(0, 0.5, -2.5);

    const lineMat = new THREE.LineBasicMaterial({
      color: 0xf4f4f2,
      transparent: true,
      opacity: 0.14,
    });
    const dotMat = new THREE.PointsMaterial({
      color: 0xf4f4f2,
      size: 0.038,
      transparent: true,
      opacity: 0.45,
    });

    const radii = [2.4, 3.8, 5.4];
    radii.forEach((radius, idx) => {
      const segs = (this.light ? 40 : 72) + idx * (this.light ? 12 : 24);
      const verts: number[] = [];
      for (let j = 0; j < segs; j++) {
        const theta = (j / segs) * Math.PI * 2;
        verts.push(Math.cos(theta) * radius, Math.sin(theta) * radius, 0);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));

      const loop = new THREE.LineLoop(geo, lineMat);
      const pts = new THREE.Points(geo, dotMat);
      const ring = new THREE.Group();
      ring.add(loop, pts);
      ring.rotation.x = 0.35 + idx * 0.28;
      ring.rotation.y = idx * 0.5;
      this.ringsGroup.add(ring);
    });

    this.scene.add(this.ringsGroup);
  }

  /** Partículas flotantes monocromáticas (como polvo de papel / glifos en el espacio) */
  private buildFloatingDust() {
    const count = this.light ? 70 : 220;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 22;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 11;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 18;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xe5e5e5,
      size: 0.032,
      transparent: true,
      opacity: 0.35,
    });
    this.dustPoints = new THREE.Points(geo, mat);
    this.scene.add(this.dustPoints);
  }

  /**
   * Actualiza los objetivos de cámara desde el ScrollTrigger maestro.
   * @param progress 0 a 1 (progreso total del scroll)
   * @param dogXNorm -1 (extremo izquierdo) a +1 (extremo derecho)
   */
  setProgress(progress: number, dogXNorm = 0) {
    this.targetProgress = progress;
    this.targetDogOffset = Math.max(-1, Math.min(1, dogXNorm));
  }

  private renderFrame() {
    if (this.disposed || !this.renderer || document.hidden) return;

    this.currentProgress += (this.targetProgress - this.currentProgress) * 0.08;
    this.currentDogOffset += (this.targetDogOffset - this.currentDogOffset) * 0.08;

    const p = this.currentProgress;

    // Avance de cámara en eje Z (3D Scrollytelling) + ligero seguimiento horizontal a Doly
    this.camera.position.z = 9 - p * 4.2;
    this.camera.position.x = this.currentDogOffset * 0.65;
    this.camera.position.y = 0.4 + Math.sin(p * Math.PI) * 0.22;
    this.camera.lookAt(this.currentDogOffset * 0.25, 0, -2);

    // Rotación suave de los anillos con el scroll + deriva orgánica
    this.ringsGroup.rotation.z = p * Math.PI * 1.4;
    this.ringsGroup.rotation.y = p * Math.PI * 0.85 + this.currentDogOffset * 0.2;
    this.ringsGroup.children.forEach((child, i) => {
      child.rotation.x += 0.0007 * (i % 2 === 0 ? 1 : -1);
      child.rotation.y += 0.0005;
    });

    this.dustPoints.rotation.y = p * 0.35;
    this.renderer.render(this.scene, this.camera);
  }

  private handleResize() {
    if (this.disposed || !this.renderer) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio());
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    gsap.ticker.remove(this.onTick);
    window.removeEventListener('resize', this.onResize);
    this.scene?.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material?.dispose();
      }
    });
    this.renderer?.dispose();
  }
}
