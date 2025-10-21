import { COLORS } from '@/features/game/config';
import { roundRect } from '@/features/game/canvas/renderer/metrics';
import type { Metrics } from '@/features/game/canvas/renderer/metrics';
import type { GameOverInfo } from '@/features/game/types';
import type { VFX } from '@/features/game/canvas/types';

export interface PostFxState {
  vignette: CanvasGradient | null;
  noisePattern: CanvasPattern | null;
}

export const createPostFxState = (): PostFxState => ({
  vignette: null,
  noisePattern: null,
});

export const drawVfx = (ctx: CanvasRenderingContext2D, metrics: Metrics, vfxList: VFX[]) => {
  const now = Date.now();
  for (const fx of vfxList) {
    const age = now - fx.createdAt;
    const progress = Math.max(0, age / fx.duration);
    if (progress > 1) continue;

    const cx = fx.x * metrics.cellSize + metrics.cellSize / 2;
    const cy = fx.y * metrics.cellSize + metrics.cellSize / 2;

    ctx.save();
    if (fx.type === 'sparkle') {
      const count = 5;
      const maxRadius = metrics.cellSize * 0.8;
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const radius = maxRadius * progress;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        ctx.fillStyle = `rgba(251,191,36, ${1 - progress})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.5, metrics.cellSize * 0.12) * (1 - progress), 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      const radius = metrics.cellSize * 1.5 * progress;
      ctx.fillStyle = COLORS.effects.vfxExplosion;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
};

const ensureNoisePattern = (state: PostFxState): CanvasPattern | null => {
  if (state.noisePattern) return state.noisePattern;
  const size = 128;
  const buffer = document.createElement('canvas');
  buffer.width = size;
  buffer.height = size;
  const ctx = buffer.getContext('2d');
  if (!ctx) return null;

  const img = ctx.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const value = 200 + (Math.random() * 30 - 15);
    img.data[i] = value;
    img.data[i + 1] = value;
    img.data[i + 2] = value;
    img.data[i + 3] = 8;
  }
  ctx.putImageData(img, 0, 0);
  state.noisePattern = ctx.createPattern(buffer, 'repeat');
  return state.noisePattern;
};

export const applyPostFx = (
  ctx: CanvasRenderingContext2D,
  metrics: Metrics,
  state: PostFxState,
) => {
  ctx.save();
  if (!state.vignette) {
    const gradient = ctx.createRadialGradient(
      metrics.canvasSize / 2,
      metrics.canvasSize / 2,
      metrics.canvasSize * 0.3,
      metrics.canvasSize / 2,
      metrics.canvasSize / 2,
      metrics.canvasSize * 0.75,
    );
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(1, 'rgba(15,23,42,0.06)');
    state.vignette = gradient;
  }
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = state.vignette;
  ctx.fillRect(0, 0, metrics.canvasSize, metrics.canvasSize);
  ctx.restore();

  const pattern = ensureNoisePattern(state);
  if (pattern) {
    ctx.save();
    ctx.globalAlpha = 0.02;
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = pattern;
    ctx.fillRect(0, 0, metrics.canvasSize, metrics.canvasSize);
    ctx.restore();
  }
};

export const drawGameOverBanner = (
  ctx: CanvasRenderingContext2D,
  metrics: Metrics,
  info: GameOverInfo,
) => {
  ctx.save();

  const remainingMs = Math.max(0, info.resetAt - Date.now());
  const seconds = Math.floor(remainingMs / 1000);
  const secondsStr = seconds.toString().padStart(2, '0');

  ctx.fillStyle = 'rgba(247, 250, 252, 0.85)';
  ctx.fillRect(0, 0, metrics.canvasSize, metrics.canvasSize);

  const boxW = metrics.canvasSize * 0.75;
  const boxH = metrics.canvasSize * 0.4;
  const boxX = (metrics.canvasSize - boxW) / 2;
  const boxY = (metrics.canvasSize - boxH) / 2;

  ctx.shadowColor = 'rgba(2, 6, 23, 0.08)';
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, boxX, boxY, boxW, boxH, 16);
  ctx.fill();
  ctx.shadowBlur = 0;

  const titleY = boxY + boxH * 0.25;
  ctx.fillStyle = COLORS.snakes.me;
  ctx.font = `700 ${Math.max(24, metrics.canvasSize * 0.04)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('ROUND WINNER', metrics.canvasSize / 2, titleY);

  const nicknameY = titleY + Math.max(8, metrics.canvasSize * 0.05);
  ctx.fillStyle = '#0F172A';
  ctx.font = `700 ${Math.max(36, metrics.canvasSize * 0.07)}px system-ui`;
  ctx.fillText(info.winnerNickname, metrics.canvasSize / 2, nicknameY);

  const scoreY = nicknameY + Math.max(6, metrics.canvasSize * 0.04);
  ctx.fillStyle = '#0EA5A6';
  ctx.font = `700 ${Math.max(24, metrics.canvasSize * 0.04)}px system-ui`;
  ctx.fillText(`Score: ${info.winnerScore}`, metrics.canvasSize / 2, scoreY);

  const timerY = boxY + boxH * 0.85;
  const timerColor = seconds === 0 ? COLORS.blocks.kill : 'rgba(15, 23, 42, 0.6)';
  ctx.fillStyle = timerColor;
  ctx.font = `600 ${Math.max(18, metrics.canvasSize * 0.03)}px system-ui`;
  ctx.fillText(`Restarting in ${secondsStr} seconds...`, metrics.canvasSize / 2, timerY);

  ctx.restore();
};

