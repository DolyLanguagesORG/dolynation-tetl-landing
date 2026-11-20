---
name: threejs-monochrome-scene
description: >-
  Use this skill when creating, lighting, animating, or optimizing the Three.js
  WebGL background scene for dolynation-tetl-landing. Enforces single-canvas
  architecture, monochrome minimalist aesthetics, and GPU performance caps.
---

# Three.js Monochrome 3D Scene Skill

## Purpose
Provide a lightweight, atmospheric 3D spatial backdrop that elevates the landing page into a true **3D Scrollytelling** experience without overpowering the Doly + book focal illustration.

## Visual Direction
- **Palette:** Strict monochrome (`#1a1a1a` / `#0a0a0a` background with matching `THREE.FogExp2`, white/gray wireframe geometry, subtle floating dust/page particles, and minimal horizon/path perspective lines).
- **Role in Composition:** The 3D scene creates depth, parallax, and camera travel (`camera.position.z`, subtle `camera.position.x` tracking the character). It must **never** visually clutter or compete with the character silhouettes.

## Technical Rules

1. **Single Persistent Canvas:**
   - Mount one `<canvas id="webgl-canvas" class="fixed inset-0 w-full h-full -z-10 pointer-events-none"></canvas>`.
   - Instantiate `WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' })`.

2. **Performance Caps:**
   - Cap pixel ratio: `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`.
   - Keep total draw calls minimal (prefer `BufferGeometry`, `Points`, `LineSegments`, or `InstancedMesh`).
   - Drive rendering from a single loop (ideally synchronized with `gsap.ticker` rather than competing `requestAnimationFrame` loops).
   - Pause rendering when `document.hidden` is true.

3. **Camera Synchronization:**
   - Expose camera and scene groups via a clean TypeScript controller (`src/scripts/scene/SceneController.ts`) so the GSAP master timeline can scrub camera depth and subtle parallax directly.

4. **Graceful Fallback & Disposal:**
   - Wrap WebGL initialization in `try/catch`; if WebGL is unavailable, degrade cleanly to a CSS dark monochrome backdrop without breaking the character scroll animation.
   - Implement a `dispose()` method that disposes geometries, materials, textures, and the renderer on teardown.
