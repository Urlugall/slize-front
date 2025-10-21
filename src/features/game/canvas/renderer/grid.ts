import { COLORS, GAME_TIMING } from '@/features/game/config';
import { easeInOutCubic } from '@/features/game/lib/math';
import { calculateCanvasSize } from '@/features/game/lib/canvasMetrics';

import type { Metrics } from '@/features/game/canvas/renderer/metrics';

export interface GridState {
  lastGridSize: number | null;
  transition: { from: number; to: number; startedAt: number } | null;
}

export const createGridState = (): GridState => ({
  lastGridSize: null,
  transition: null,
});

export const computeGridTransition = (
  metrics: Metrics,
  now: number,
  state: GridState,
): { cellSize: number; eased: number; inTransition: boolean } => {
  if (state.lastGridSize && state.lastGridSize !== metrics.gridSize && !state.transition) {
    const prevCell = calculateCanvasSize(state.lastGridSize) / state.lastGridSize;
    state.transition = { from: prevCell, to: metrics.cellSize, startedAt: now };
  }
  state.lastGridSize = metrics.gridSize;

  if (!state.transition) {
    return { cellSize: metrics.cellSize, eased: 1, inTransition: false };
  }

  const elapsed = now - state.transition.startedAt;
  const progress = Math.min(elapsed / GAME_TIMING.gridTransitionMs, 1);
  const eased = easeInOutCubic(progress);
  const cellSize = state.transition.from + (state.transition.to - state.transition.from) * eased;

  // закончился переход — фиксируем
  if (progress >= 1) {
    state.transition = null;
    return { cellSize: metrics.cellSize, eased: 1, inTransition: false };
  }

  return { cellSize, eased, inTransition: true };
};

export const drawGridLayer = (
  ctx: CanvasRenderingContext2D,
  metrics: Metrics,
  now: number,
  state: GridState,
) => {
  if (state.lastGridSize && state.lastGridSize !== metrics.gridSize && !state.transition) {
    const prevCell = calculateCanvasSize(state.lastGridSize) / state.lastGridSize;
    state.transition = { from: prevCell, to: metrics.cellSize, startedAt: performance.now() };
  }
  state.lastGridSize = metrics.gridSize;

  const draw = (cellSize: number, alpha: number) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;

    const lines = Math.round(metrics.canvasSize / cellSize);
    ctx.strokeStyle = COLORS.grid.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < lines; x++) {
      const pos = x * cellSize;
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, metrics.canvasSize);
    }
    for (let y = 1; y < lines; y++) {
      const pos = y * cellSize;
      ctx.moveTo(0, pos);
      ctx.lineTo(metrics.canvasSize, pos);
    }
    ctx.stroke();
    ctx.restore();
  };

  if (state.transition) {
    const elapsed = now - state.transition.startedAt;
    const progress = Math.min(elapsed / GAME_TIMING.gridTransitionMs, 1);
    const eased = easeInOutCubic(progress);
    draw(state.transition.from, 1 - eased);
    draw(metrics.cellSize, eased);
    if (progress >= 1) state.transition = null;
  } else {
    draw(metrics.cellSize, 1);
  }
};

export const drawGridImmediate = (ctx: CanvasRenderingContext2D, metrics: Metrics) => {
  const cellSize = metrics.cellSize;
  const lines = Math.round(metrics.canvasSize / cellSize);

  ctx.save();
  ctx.strokeStyle = COLORS.grid.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 1; x < lines; x++) {
    const pos = x * cellSize;
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, metrics.canvasSize);
  }
  for (let y = 1; y < lines; y++) {
    const pos = y * cellSize;
    ctx.moveTo(0, pos);
    ctx.lineTo(metrics.canvasSize, pos);
  }
  ctx.stroke();
  ctx.restore();
};