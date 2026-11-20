---
name: gsap-lenis-scrollytelling
description: >-
  Use this skill when building or modifying scroll-driven timelines, smooth
  scrolling, directional scroll triggers, or section transitions with GSAP,
  ScrollTrigger, and Lenis in dolynation-tetl-landing.
---

# GSAP + ScrollTrigger + Lenis Scrollytelling Skill

## Purpose
Ensure buttery-smooth, deterministic, bidirectional scroll-driven choreography where vertical scroll acts as a playback scrubber for both 3D camera motion and the Doly character path.

## Core Architecture

1. **Single Smooth Scroll Engine (Lenis + GSAP Ticker):**
   - Initialize `Lenis` once on the client.
   - Connect `lenis.on('scroll', ScrollTrigger.update)`.
   - Drive `lenis.raf(time * 1000)` from `gsap.ticker.add(...)` and disable lag smoothing via `gsap.ticker.lagSmoothing(0)`.
   - Disable native CSS `scroll-behavior: smooth` on `html` so it does not fight Lenis/ScrollTrigger.

2. **Master Timeline Pattern:**
   - Use a tall scroll container (e.g., `#scroll-track` with explicit height in `vh`, such as `450vh`–`600vh`) paired with a `fixed inset-0` stage container.
   - Bind one master `gsap.timeline({ scrollTrigger: { trigger: '#scroll-track', start: 'top top', end: 'bottom bottom', scrub: 1.2 } })`.
   - Use `ease: 'none'` on scrubbed camera/path tweens so scroll distance maps linearly to spatial movement.

3. **Bidirectional Scroll & Direction Detection:**
   - Read `self.direction` (`1` = scrolling down, `-1` = scrolling up) inside `ScrollTrigger` `onUpdate` callbacks.
   - Use `self.progress` (`0` to `1`) as the single source of truth for character position, walk-cycle frame progression, and book state.
   - Manage `pointer-events` dynamically on overlaid UI panels so inactive layers never block links or buttons.

4. **Accessibility & Responsiveness (`gsap.matchMedia`):**
   - Wrap scroll animations in `gsap.matchMedia()`.
   - Provide a `(prefers-reduced-motion: reduce)` branch that skips continuous scrubbing and displays the final resting composition cleanly.
   - Handle desktop vs. mobile viewport proportions cleanly and call `ScrollTrigger.refresh()` on debounced resize.

## Cleanup Rule
Always encapsulate GSAP setup in `gsap.context()` and return a `destroy()` function that calls `ctx.revert()`, `lenis.destroy()`, and removes `gsap.ticker` listeners.
