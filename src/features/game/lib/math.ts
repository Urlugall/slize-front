// src/features/game/lib/math.ts
// Numeric helpers used across rendering and client logic.

export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

