import { COLORS } from '@/features/game/config';
import { lerp } from '@/features/game/lib/math';
import type { Metrics } from '@/features/game/canvas/renderer/metrics';
import { roundRect } from '@/features/game/canvas/renderer/metrics';
import type { GameState } from '@/features/game/types';

export const drawNicknames = (
  ctx: CanvasRenderingContext2D,
  metrics: Metrics,
  current: GameState,
  previous: GameState | null,
  interpolation: number,
  cache: Map<string, HTMLCanvasElement>,
) => {
  for (const snake of current.snakes) {
    if (!snake.body.length) continue;
    const nickname = current.players[snake.id]?.nickname ?? '';
    const prevSnake = previous?.snakes.find((item) => item.id === snake.id);
    const currentHead = snake.body[0];
    const prevHead = prevSnake?.body[0] ?? currentHead;

    const tx = lerp(prevHead.x, currentHead.x, interpolation) * metrics.cellSize + metrics.cellSize / 2;
    const ty =
      lerp(prevHead.y, currentHead.y, interpolation) * metrics.cellSize - Math.max(6, metrics.cellSize * 0.3);

    const key = `${snake.id}:${nickname}`;
    let sprite = cache.get(key);
    if (!sprite) {
      const cnv = document.createElement('canvas');
      cnv.width = 220;
      cnv.height = 34;
      const c = cnv.getContext('2d');
      if (c) {
        c.clearRect(0, 0, cnv.width, cnv.height);
        c.fillStyle = COLORS.snakes.nickname;
        c.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(nickname, cnv.width / 2, cnv.height / 2);
      }
      cache.set(key, cnv);
      sprite = cnv;
    }

    if (!sprite) continue;

    const spriteHalfW = sprite.width / 2;
    const spriteHalfH = sprite.height / 2;
    const drawX = tx - spriteHalfW;
    const drawY = ty - spriteHalfH;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.drawImage(sprite, drawX, drawY);
    ctx.restore();
  }
};

export const drawResizeBanner = (ctx: CanvasRenderingContext2D, metrics: Metrics, state: GameState) => {
  const resize = state.pendingResize;
  if (!resize) return;

  const fillAt = resize.announcedAt + resize.warnMs;
  const shrinkAt = fillAt + resize.killMs;
  const now = Date.now();

  let text: string;
  if (now < fillAt) {
    text = `Zone turns deadly in ${((fillAt - now) / 1000).toFixed(1)}s (target ${resize.to}x${resize.to})`;
  } else if (now < shrinkAt) {
    text = `Shrinking in ${((shrinkAt - now) / 1000).toFixed(1)}s (to ${resize.to}x${resize.to})`;
  } else {
    text = 'Shrinking...';
  }

  ctx.save();
  const fontSize = Math.max(12, metrics.cellSize * 0.7);
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;

  const padX = 12;
  const padY = 6;
  const measure = ctx.measureText(text);
  const boxW = measure.width + padX * 2;
  const boxH = fontSize + padY * 2;
  const boxX = (metrics.canvasSize - boxW) / 2;
  const boxY = Math.max(8, metrics.cellSize * 0.15);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  roundRect(ctx, boxX, boxY, boxW, boxH, Math.max(8, metrics.cellSize * 0.1));
  ctx.fill();

  ctx.fillStyle = '#0F172A';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, metrics.canvasSize / 2, boxY + boxH / 2);
  ctx.restore();
};

