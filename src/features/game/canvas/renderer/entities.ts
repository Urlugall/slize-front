import { COLORS, PROJECTILES } from '@/features/game/config';
import { drawPowerUpGlyph, POWERUP_CANVAS_GLYPH } from '@/features/game/icons';
import { lerp } from '@/features/game/lib/math';
import type { Metrics } from '@/features/game/canvas/renderer/metrics';
import { roundRect } from '@/features/game/canvas/renderer/metrics';
import type { GameState, PowerUpType } from '@/features/game/types';

const DIR = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
} as const;

export const drawBlocks = (ctx: CanvasRenderingContext2D, metrics: Metrics, state: GameState) => {
  if (!state.blocks?.length) return;
  for (const block of state.blocks) {
    const x = block.x * metrics.cellSize;
    const y = block.y * metrics.cellSize;
    if (block.state === 'warning') {
      const pulse = Math.abs(Math.sin(Date.now() / 320));
      ctx.fillStyle = pulse > 0.5 ? COLORS.blocks.pulse : COLORS.blocks.warning;
    } else if (block.state === 'kill') {
      ctx.fillStyle = COLORS.blocks.kill;
    } else {
      ctx.fillStyle = COLORS.blocks.solid;
    }

    roundRect(
      ctx,
      x + 0.5,
      y + 0.5,
      metrics.cellSize - 1,
      metrics.cellSize - 1,
      Math.max(2, metrics.cellSize * 0.12),
    );
    ctx.fill();
  }
};

export const drawFood = (ctx: CanvasRenderingContext2D, metrics: Metrics, state: GameState) => {
  ctx.fillStyle = COLORS.food;
  const radius = metrics.cellSize / 2.6;
  for (const item of state.food) {
    const cx = item.x * metrics.cellSize + metrics.cellSize / 2;
    const cy = item.y * metrics.cellSize + metrics.cellSize / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
};

export const drawPowerUps = (ctx: CanvasRenderingContext2D, metrics: Metrics, state: GameState) => {
  for (const powerUp of state.powerUps) {
    const cx = powerUp.position.x * metrics.cellSize + metrics.cellSize / 2;
    const cy = powerUp.position.y * metrics.cellSize + metrics.cellSize / 2;
    const ringRadius = metrics.cellSize * 0.48;
    const color = COLORS.powerUps[powerUp.type as PowerUpType];

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = COLORS.powerUpBg;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = Math.max(2, metrics.cellSize * 0.08);
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius - ctx.lineWidth * 0.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const glyph = POWERUP_CANVAS_GLYPH[powerUp.type as PowerUpType] ?? '?';
    const iconSize = Math.max(12, metrics.cellSize * 0.8);
    drawPowerUpGlyph(ctx, glyph, cx, cy, iconSize, '#0F172A');
  }
};

export const drawProjectiles = (
  ctx: CanvasRenderingContext2D,
  metrics: Metrics,
  current: GameState,
  previous: GameState | null,
  interpolation: number,
) => {
  const radius = metrics.cellSize * PROJECTILES.radiusRatio;

  for (const projectile of current.projectiles) {
    const prevProjectile = previous?.projectiles.find((entry) => entry.id === projectile.id);
    const dir = DIR[projectile.direction] ?? DIR.right;
    const targetX = projectile.position.x + 0.5;
    const targetY = projectile.position.y + 0.5;

    let startX: number;
    let startY: number;
    if (prevProjectile) {
      startX = prevProjectile.position.x + 0.5;
      startY = prevProjectile.position.y + 0.5;
    } else {
      const ownerPrev = previous?.snakes.find((snake) => snake.id === projectile.ownerId);
      const ownerCurr = current.snakes.find((snake) => snake.id === projectile.ownerId);
      const head = ownerPrev?.body[0] ?? ownerCurr?.body[0];
      if (head) {
        startX = head.x + 0.5 + dir.x * PROJECTILES.spawnLead;
        startY = head.y + 0.5 + dir.y * PROJECTILES.spawnLead;
      } else {
        startX = targetX - dir.x * PROJECTILES.spawnLead;
        startY = targetY - dir.y * PROJECTILES.spawnLead;
      }
    }

    const x = lerp(startX, targetX, interpolation) * metrics.cellSize;
    const y = lerp(startY, targetY, interpolation) * metrics.cellSize;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = COLORS.effects.projectile;
    ctx.globalAlpha = 0.14;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
};

interface DrawSnakesOptions {
  current: GameState;
  previous: GameState | null;
  metrics: Metrics;
  ctx: CanvasRenderingContext2D;
  playerId: string | null;
  deadIds: Set<string>;
  interpolation: number;
}

export const drawSnakes = ({
  current,
  previous,
  metrics,
  ctx,
  playerId,
  deadIds,
  interpolation,
}: DrawSnakesOptions) => {
  for (const snake of current.snakes) {
    const prevSnake = previous?.snakes.find((item) => item.id === snake.id);
    const info = current.players[snake.id];
    const isMe = snake.id === playerId;
    const isGhost = info?.activeEffects.isGhostUntil > Date.now();
    const isDead = deadIds.has(snake.id);
    const hasSpeed = info?.activeEffects.speedBoostUntil > Date.now();
    const teamId = info?.teamId;

    let baseColor: string;
    if (isDead) {
      baseColor = COLORS.snakes.dead;
    } else if (teamId) {
      baseColor = teamId === 'alpha' ? COLORS.snakes.teamAlpha : COLORS.snakes.teamBravo;
    } else {
      baseColor = isMe ? COLORS.snakes.me : COLORS.snakes.other;
    }

    const baseOpacity = isDead ? 0.45 : isGhost ? 0.4 : isMe ? 1 : 0.95;
    const channel = (hex: string, offset: number) => parseInt(hex.slice(1 + offset, 3 + offset), 16);
    const fill = `rgba(${channel(baseColor, 0)}, ${channel(baseColor, 2)}, ${channel(
      baseColor,
      4,
    )}, ${baseOpacity})`;
    const radius = Math.max(2, metrics.cellSize * 0.18);

    for (let index = 0; index < snake.body.length; index++) {
      const segment = snake.body[index];
      let prevSegment = prevSnake?.body[index];
      if (!prevSegment && prevSnake?.body.length) {
        prevSegment = prevSnake.body[prevSnake.body.length - 1];
      }

      const startX = prevSegment?.x ?? segment.x;
      const startY = prevSegment?.y ?? segment.y;
      const x = lerp(startX, segment.x, interpolation) * metrics.cellSize;
      const y = lerp(startY, segment.y, interpolation) * metrics.cellSize;

      if (hasSpeed) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const centerX = x + metrics.cellSize / 2;
        const centerY = y + metrics.cellSize / 2;
        const outer = Math.max(6, metrics.cellSize * 0.85);
        ctx.fillStyle = COLORS.effects.speedBoostGlow;
        ctx.globalAlpha = 0.1;
        ctx.beginPath();
        ctx.arc(centerX, centerY, outer, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(centerX, centerY, outer * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.fillStyle = fill;
      roundRect(ctx, x, y, metrics.cellSize, metrics.cellSize, radius);
      ctx.fill();

      ctx.strokeStyle = 'rgba(2, 6, 23, 0.10)';
      ctx.lineWidth = 1;
      roundRect(ctx, x, y, metrics.cellSize, metrics.cellSize, radius);
      ctx.stroke();

      if (isGhost) {
        ctx.fillStyle = COLORS.effects.ghostOverlay;
        roundRect(ctx, x, y, metrics.cellSize, metrics.cellSize, radius);
        ctx.fill();
      }

      if (index === 0) {
        ctx.fillStyle = COLORS.snakes.eyes;
        const eye = Math.max(2, metrics.cellSize * 0.22);
        const offset = Math.max(2, metrics.cellSize * 0.18);
        const ex1 = x + offset;
        const ey1 = y + offset;
        const ex2 = x + metrics.cellSize - offset - eye;
        const ey2 = y + offset;
        ctx.fillRect(ex1, ey1, eye, eye);
        ctx.fillRect(ex2, ey2, eye, eye);
      }
    }
  }
};

