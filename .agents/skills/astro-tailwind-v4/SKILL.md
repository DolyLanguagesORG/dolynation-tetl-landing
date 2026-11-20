---
name: astro-tailwind-v4
description: >-
  Use this skill when scaffolding, configuring, styling, or structuring Astro
  components and Tailwind CSS v4 in the dolynation-tetl-landing project. Covers
  CSS-first Tailwind v4 configuration via Vite, SSR-safe client scripts, and
  lifecycle cleanup.
---

# Astro + Tailwind CSS v4 Architecture Skill

## Purpose
Standardize how Astro pages, layouts, styles, and client-side interactive scripts are structured for the `dolynation-tetl-landing` 3D Scrollytelling site.

## Core Rules

1. **Tailwind CSS v4 (CSS-First):**
   - Register `@tailwindcss/vite` inside `astro.config.mjs` under `vite.plugins`.
   - Do **not** create a legacy `tailwind.config.js` or `tailwind.config.mjs`.
   - Define design tokens (colors, fonts, spacing) using `@theme` inside `src/styles/global.css` after `@import "tailwindcss";`.
   - Import `src/styles/global.css` once in the root layout (`src/layouts/Layout.astro`).

2. **Static-First & Zero-Hydration Overhead:**
   - Keep markup in `.astro` components. Avoid adding React/Vue/Svelte unless a complex stateful UI widget strictly requires it.
   - Put client-side animation and WebGL logic in modular TypeScript files under `src/scripts/` (e.g., `src/scripts/scene/`, `src/scripts/animation/`) and import them from `<script>` tags inside `.astro` components.

3. **SSR Safety & Cleanup:**
   - Never access `window`, `document`, or `HTMLCanvasElement` inside Astro frontmatter (`---`).
   - Guard browser-only modules with DOM element existence checks.
   - If Astro View Transitions / ClientRouter are enabled, register cleanup handlers on `astro:before-swap` to dispose WebGL renderers, Lenis instances, and `ScrollTrigger` instances.

4. **Monochrome Design Tokens:**
   - Base surface: `#1a1a1a` / `#000000` (matching the dark charcoal backdrop of the Doly illustration).
   - Foreground ink: `#ffffff` and neutral grays (`#f5f5f5`, `#e5e5e5`, `#999999`, `#666666`, `#333333`).
   - Avoid decorative neon gradients or unrelated accent colors.

## Validation Checklist
- `npm run build` succeeds with zero TypeScript or SSR errors.
- `astro.config.mjs` uses `@tailwindcss/vite`.
- No `window` or `document` references in `.astro` frontmatter.
