---
name: doly-character-animation
description: >-
  Use this skill when implementing the interactive scroll-driven animation of
  Doly (the black-and-white dog) walking across a straight path from left to
  right and resting on the open book in dolynation-tetl-landing.
---

# Doly Character & Book Scroll Animation Skill

## Purpose
Deliver a lightweight, zero-video, zero-GIF interactive animation of Doly walking from the left edge of the viewport along a straight horizontal path to the open book in the center, resting on it, and responding smoothly to both downward and upward scrolling.

## Visual Reference
- Reference illustration: [doly-book-reference.png](./resources/doly-book-reference.png)
- Style: Crisp high-contrast black-and-white vector/ink illustration on a dark charcoal background (`#1d1d1d`–`#222222`).

## Strict Media Constraints
- **NO looping `<video>`** elements.
- **NO heavy animated `.gif`** files.
- Prefer either:
  1. **Canvas Sprite Sheet (`.webp`)** — A single horizontal sprite sheet (8–12 walk frames + transition frames, total size `< 200 KB`) rendered onto a dedicated `<canvas>` and synced to scroll progress, cross-fading cleanly into the exact resting illustration on the open book.
  2. **Articulated SVG + GSAP** — Layered `<g>` groups (body, head, ears, front/back legs, tail) animated directly via GSAP timelines synced to scroll.
  3. **Optional Future Drop-In** — Keep the character renderer behind a clean interface (`CharacterAnimator.update(progress: number, direction: 1 | -1)`) so a `.riv` (Rive) or `.glb` (Three.js) asset can replace it without rewriting the scroll timeline.

## Choreography Timeline (`progress: 0.0 -> 1.0`)

| Progress Range | Beat | Visual Behavior |
| :--- | :--- | :--- |
| `0.00 – 0.12` | **Stage Entry** | Screen starts dark and minimal. The straight horizontal path line draws from left to right (`stroke-dashoffset` or canvas line). The open book fades/opens gently at the center (`x = 50%`). |
| `0.12 – 0.55` | **Walk In (Left → Center)** | Doly enters from off-screen left (`x = -12%`) and walks along the straight line to the book (`x = 50%`). Walk-cycle frames advance strictly with scroll delta (no auto-loop when user stops scrolling). |
| `0.55 – 0.72` | **Settle on the Book** | Doly transitions from walking posture to resting her front paws on the open book, resolving into the exact reference pose. |
| `0.72 – 1.00` | **Reveal / Continuation** | Subtle 3D camera push-in, brand/hero copy reveal (or optional continuation walking off toward the right edge, depending on final narrative choice). |

## Bidirectional Scroll UX
- Track `direction` from GSAP `ScrollTrigger` (`1` = forward/down, `-1` = backward/up).
- When `direction === -1` during the walking segment, horizontally flip the character (`scaleX(-1)` or canvas `ctx.scale(-1, 1)`) so Doly turns around and walks back toward the left naturally instead of moonwalking.
- When scroll stops (`velocity === 0`), hold the current frame cleanly without jitter.
