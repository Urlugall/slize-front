import { COLORS } from '@/features/game/config';
import { calculateCanvasSize } from '@/features/game/lib/canvasMetrics';

export type Metrics = {
  canvasSize: number;
  cellSize: number;
  gridSize: number;
};

interface ConfigureOptions {
  isStatic: boolean;
  onResize?: () => void;
}

export const resolveMetrics = (gridSize?: number | null): Metrics | null => {
  if (!gridSize || gridSize <= 0) return null;
  const canvasSize = calculateCanvasSize(gridSize);
  const cellSize = canvasSize / gridSize;
  return { canvasSize, cellSize, gridSize };
};

export const configureCanvas = (
  canvas: HTMLCanvasElement,
  metrics: Metrics,
  { isStatic, onResize }: ConfigureOptions,
): CanvasRenderingContext2D | null => {
  const dpr = window.devicePixelRatio || 1;
  const devW = Math.round(metrics.canvasSize * dpr);
  const devH = Math.round(metrics.canvasSize * dpr);

  if (canvas.width !== devW || canvas.height !== devH) {
    canvas.width = devW;
    canvas.height = devH;
    onResize?.();
  }

  canvas.style.width = `${metrics.canvasSize}px`;
  canvas.style.height = `${metrics.canvasSize}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  if (isStatic) {
    ctx.fillStyle = COLORS.grid.background;
    ctx.fillRect(0, 0, metrics.canvasSize, metrics.canvasSize);
  }

  return ctx;
};

export const roundRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

