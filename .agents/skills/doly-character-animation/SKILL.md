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

The stops live in `src/scripts/timeline/beats.ts` (`STOPS` + `SECTION_STOPS`)
and are driven by the physical finite-state machine in `DolyChoreography` across
**3 synchronized sprite sheets** (`doly-walk.webp`, `doly-sit-ground.webp`,
`doly-book-seq.webp`):

| Progress Range | Stop / Corridor | State | Visual Behavior |
| :--- | :--- | :--- | :--- |
| `0.00 – 0.02` | **Hero** | `offLeft` | Doly waits off-screen left (`0vw`). |
| `0.02 – 0.14` | **Walk In** | `walkLeftLane` | Doly walks cleanly into screen toward the left ground checkpoint (with 100%-opaque pivot turn on mid-path reversal). |
| `0.14 – 0.25` | **Parada 1 · El Problema (`0.20`)** | `sitLeft` | Sits on the ground left of the book looking forward (`0.55s` checkpoint dwell). |
| `0.25 – 0.44` | **Approach & Climb / Step Off (L)** | `walkToBook` ↔ `climbLeft` / `stepOffLeft` | Forward: stands up, walks to book, climbs (`LIE 0→20`). Reverse: steps off left (`STAND 11→26`, mirrored, 100% opaque), walks left, sits on ground. |
| `0.44` | **Parada 2 · ¿Qué es? (`0.44`)** | `bookSit` | Seated upright on top of the open book (`LIE 20`, `0.55s` checkpoint dwell). |
| `0.44 – 0.53` | **Lie Down / Sit Up** | `bookLieTrans` | Smoothly lowers onto or sits back up from the pages (`LIE 20↔29`) without spurious reversal turns. |
| `0.53` | **Parada 3 · ¿Por qué elegirnos? (`0.53`)** | `bookLie` | Resting lying down on top of the open book (`LIE 29`, `0.55s` checkpoint dwell). |
| `0.53 – 0.74` | **Step Off / Climb (R)** | `stepOffRight` / `climbRight` ↔ `walkFromBook` | Forward: wakes and steps off right (`LIE 29→27` → `STAND 2→26`, 100% opaque), walks to right stop. Reverse: walks left and climbs from the right (`LIE 0→29`, mirrored). |
| `0.74 – 0.85` | **Parada 4 · Funcionalidades (`0.80`)** | `sitRight` | Seated on the ground right of the open book (`0.55s` checkpoint dwell). |
| `0.85 – 1.00` | **Walk Out** | `walkRightLane` → `offRight` | Stands up and exits calmly off the right edge into Zone 2 `<FinalCta />` (or enters from right when scrolling up). |

## One Plane, Three Sheets

The three sheets are measured directly from the source GIFs by `npm run sprites`:

- `walkScale` — matches `doly-walk.webp` height to Doly's standing height in the book & sit sheets.
- `sitSeq` (`doly-sit-ground.webp`) — 9 sit frames extracted cleanly from `LIE 12..20` plus 3 head-locked turn poses (`9..11`) with the open book removed, scaled (`~1.136`) to match `walk` height 1:1, and `bookSitScale`/`bookSitGroundOffsetY` matched to `LIE[20]` on the book.
- All 61 frames of `doly-book-seq.webp` (`LIE[0..29]` dog-only, `STAND[0..29]` dog-only, `EMPTY[60]` canonical open book) are normalized to the exact outer cover width (`358px` target / `361px` with stroke) and flat cover baseline (`BOOK_GROUND_Y`). `DolyWalkRenderer` renders canonical `EMPTY[60]` once underneath dog-only frames `0..59` at 100% opacity so the book never resizes, shifts, bleeds through, or flashes over white pages.

## Bidirectional Scroll UX
- The pose is a pure function of the internal progress `u`, so scrolling up
  rewinds the whole performance (Doly stands up, sits, lies down and walks
  back to the left) instead of replaying it from the start.
- Never mirror the progress. Only mirror the sprite (`ctx.scale(facing, 1)`)
  when the travel direction changes, so Doly turns around instead of moonwalking.
- When scroll stops (`velocity === 0`), hold the current frame cleanly without jitter.
- Transitions between sheets are cross-fades (`BLEND` in `beats.ts`), never hard cuts.
