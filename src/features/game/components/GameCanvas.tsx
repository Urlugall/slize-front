// src/features/game/components/GameCanvas.tsx
"use client";

import { useEffect, useRef } from 'react';
import type { GameState, PowerUpType } from '@/features/game/types';
import { BASE_CELL_SIZE, SERVER_TICK_RATE, COLORS, POWERUP_VISUALS, BASE_GRID_SIZE, VISUAL_SCALE_FACTOR } from '@/features/game/config';

interface VFX {
  id: number;
  type: 'sparkle' | 'explosion';
  x: number;
  y: number;
  createdAt: number;
  duration: number; // in ms
}

interface GameCanvasProps {
  previousState: GameState | null;
  currentState: GameState | null;
  lastStateTimestamp: number; // should be performance.now() when state arrived
  playerId: string | null;
  deadPlayerIds: Set<string>;
  vfx: VFX[];
}

const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

const DIRECTION_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
} as const;

const PROJECTILE_SPAWN_LEAD = 0.6; // how far ahead of the head we start visual travel (in cells)
const PROJECTILE_RADIUS_RATIO = 0.35;
const PROJECTILE_SHADOW_BLUR = 6;
const EDGE_GRADIENT_RATIO = 1.5;
const GRID_TRANSITION_MS = 420;

export function GameCanvas({
  previousState,
  currentState,
  lastStateTimestamp,
  playerId,
  deadPlayerIds,
  vfx,
}: GameCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const dynamicCanvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const dprRef = useRef<number>(1);

  // latest data refs (avoid relying on React rerenders per tick)
  const prevStateRef = useRef<GameState | null>(null);
  const currStateRef = useRef<GameState | null>(null);
  const lastTsRef = useRef<number>(0);
  const playerIdRef = useRef<string | null>(null);
  const deadIdsRef = useRef<Set<string>>(new Set());
  const vfxRef = useRef<VFX[]>([]);
  const lastGridSizeRef = useRef<number | null>(null);
  const gridTransitionRef = useRef<{ from: number; to: number; startedAt: number } | null>(null);

  useEffect(() => { prevStateRef.current = previousState; }, [previousState]);
  useEffect(() => { currStateRef.current = currentState; }, [currentState]);
  useEffect(() => { lastTsRef.current = lastStateTimestamp; }, [lastStateTimestamp]);
  useEffect(() => { playerIdRef.current = playerId; }, [playerId]);
  useEffect(() => { deadIdsRef.current = deadPlayerIds; }, [deadPlayerIds]);
  useEffect(() => { vfxRef.current = vfx; }, [vfx]);

  const setupCanvas = (canvas: HTMLCanvasElement, cssWidth: number, cssHeight: number) => {
    const dpr = window.devicePixelRatio || 1;
    dprRef.current = dpr;
    const devW = Math.round(cssWidth * dpr);
    const devH = Math.round(cssHeight * dpr);
    if (canvas.width !== devW || canvas.height !== devH) {
      canvas.width = devW;
      canvas.height = devH;
    }
    // Ensure CSS size matches wrapper to avoid overflow/underflow
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Favor crisp pixel rendering for grid/rectangles
      ctx.imageSmoothingEnabled = false;
    }
  };

  const resolveMetrics = (gridSize?: number | null) => {
    if (!gridSize || gridSize <= 0) return null;
    const canvasSize =
      BASE_CELL_SIZE * (BASE_GRID_SIZE + VISUAL_SCALE_FACTOR * (gridSize - BASE_GRID_SIZE));
    const cellSize = canvasSize / gridSize;
    return { canvasSize, cellSize, gridSize };
  };

  const easeInOutCubic = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const drawGridLayer = (
    ctx: CanvasRenderingContext2D,
    canvasSize: number,
    cellSize: number,
    alpha: number
  ) => {
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha *= alpha;

    const gridLines = Math.round(canvasSize / cellSize);
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < gridLines; i++) {
      const pos = i * cellSize;
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvasSize);
    }
    for (let j = 1; j < gridLines; j++) {
      const pos = j * cellSize;
      ctx.moveTo(0, pos);
      ctx.lineTo(canvasSize, pos);
    }
    ctx.stroke();

    const edgeWidth = Math.min(cellSize * EDGE_GRADIENT_RATIO, canvasSize / 3);

    const topGradient = ctx.createLinearGradient(0, 0, 0, edgeWidth);
    topGradient.addColorStop(0, COLORS.gridEdgeStart);
    topGradient.addColorStop(1, COLORS.gridEdgeEnd);
    ctx.fillStyle = topGradient;
    ctx.fillRect(0, 0, canvasSize, edgeWidth);

    const bottomGradient = ctx.createLinearGradient(0, canvasSize, 0, canvasSize - edgeWidth);
    bottomGradient.addColorStop(0, COLORS.gridEdgeStart);
    bottomGradient.addColorStop(1, COLORS.gridEdgeEnd);
    ctx.fillStyle = bottomGradient;
    ctx.fillRect(0, canvasSize - edgeWidth, canvasSize, edgeWidth);

    const leftGradient = ctx.createLinearGradient(0, 0, edgeWidth, 0);
    leftGradient.addColorStop(0, COLORS.gridEdgeStart);
    leftGradient.addColorStop(1, COLORS.gridEdgeEnd);
    ctx.fillStyle = leftGradient;
    ctx.fillRect(0, 0, edgeWidth, canvasSize);

    const rightGradient = ctx.createLinearGradient(canvasSize, 0, canvasSize - edgeWidth, 0);
    rightGradient.addColorStop(0, COLORS.gridEdgeStart);
    rightGradient.addColorStop(1, COLORS.gridEdgeEnd);
    ctx.fillStyle = rightGradient;
    ctx.fillRect(canvasSize - edgeWidth, 0, edgeWidth, canvasSize);

    ctx.restore();
  };

  // draw static background once per resize or initialisation
  const drawStatic = () => {
    const game = currStateRef.current;
    const canvas = staticCanvasRef.current;
    const metrics = resolveMetrics(game?.gridSize);
    if (!metrics || !canvas) return;
    const { canvasSize } = metrics;
    setupCanvas(canvas, canvasSize, canvasSize);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvasSize, canvasSize);
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvasSize, canvasSize);
  };

  // nickname cache as pre-rendered canvases
  const nameCacheRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  const drawDynamic = (now: number) => {
    const game = currStateRef.current;
    const prev = prevStateRef.current;
    const canvas = dynamicCanvasRef.current;
    const metrics = resolveMetrics(game?.gridSize);
    if (!game || !canvas || !metrics) return;
    const { canvasSize, cellSize } = metrics;
    setupCanvas(canvas, canvasSize, canvasSize);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvasSize, canvasSize);

    const elapsed = Math.max(0, now - lastTsRef.current);
    const t = Math.min(elapsed / SERVER_TICK_RATE, 1.0);
    const { food, players, powerUps, snakes, projectiles } = game;

    const transition = gridTransitionRef.current;
    if (transition) {
      const progress = Math.min((now - transition.startedAt) / GRID_TRANSITION_MS, 1);
      const eased = easeInOutCubic(progress);
      drawGridLayer(ctx, canvasSize, transition.from, 1 - eased);
      drawGridLayer(ctx, canvasSize, cellSize, eased);
      if (progress >= 1) gridTransitionRef.current = null;
    } else {
      drawGridLayer(ctx, canvasSize, cellSize, 1);
    }

    // food
    const foodRadius = cellSize / 2.5;
    ctx.fillStyle = COLORS.food;
    for (let i = 0; i < food.length; i++) {
      const f = food[i];
      const centerX = f.x * cellSize + cellSize / 2;
      const centerY = f.y * cellSize + cellSize / 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, foodRadius, 0, 2 * Math.PI);
      ctx.fill();
    }

    // power-ups
    const powerRadius = cellSize / 2;
    ctx.font = `${Math.max(12, cellSize * 0.8)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < powerUps.length; i++) {
      const p = powerUps[i];
      const x = p.position.x * cellSize;
      const y = p.position.y * cellSize;
      ctx.fillStyle = COLORS.powerUpBg;
      ctx.beginPath();
      ctx.arc(x + cellSize / 2, y + cellSize / 2, powerRadius, 0, 2 * Math.PI);
      ctx.fill();
      const visual = POWERUP_VISUALS[p.type as PowerUpType] || { icon: '?', color: 'gray' };
      ctx.fillStyle = visual.color;
      ctx.fillText(visual.icon, x + cellSize / 2, y + cellSize / 2 + Math.max(1, cellSize * 0.05));
    }

    // projectiles
    const projectileRadius = cellSize * PROJECTILE_RADIUS_RATIO;
    ctx.fillStyle = COLORS.projectile;
    ctx.shadowColor = COLORS.projectile;
    const projectileShadowBlur = Math.max(4, PROJECTILE_SHADOW_BLUR * (cellSize / BASE_CELL_SIZE));
    ctx.shadowBlur = projectileShadowBlur;
    for (let i = 0; i < projectiles.length; i++) {
      const currentProj = projectiles[i];
      const prevProj = prev?.projectiles.find(p => p.id === currentProj.id);
      const direction = DIRECTION_VECTORS[currentProj.direction] ?? DIRECTION_VECTORS.right;

      const targetCenterX = currentProj.position.x + 0.5;
      const targetCenterY = currentProj.position.y + 0.5;

      let startCenterX: number;
      let startCenterY: number;

      if (prevProj) {
        startCenterX = prevProj.position.x + 0.5;
        startCenterY = prevProj.position.y + 0.5;
      } else {
        const ownerPrevSnake = prev?.snakes.find(s => s.id === currentProj.ownerId);
        const ownerCurrSnake = snakes.find(s => s.id === currentProj.ownerId);
        const ownerHead = ownerPrevSnake?.body[0] ?? ownerCurrSnake?.body[0];
        if (ownerHead) {
          startCenterX = ownerHead.x + 0.5 + direction.x * PROJECTILE_SPAWN_LEAD;
          startCenterY = ownerHead.y + 0.5 + direction.y * PROJECTILE_SPAWN_LEAD;
        } else {
          startCenterX = targetCenterX - direction.x * PROJECTILE_SPAWN_LEAD;
          startCenterY = targetCenterY - direction.y * PROJECTILE_SPAWN_LEAD;
        }
      }

      const renderCenterX = lerp(startCenterX, targetCenterX, t) * cellSize;
      const renderCenterY = lerp(startCenterY, targetCenterY, t) * cellSize;

      ctx.beginPath();
      ctx.arc(renderCenterX, renderCenterY, projectileRadius, 0, 2 * Math.PI);
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    // snakes
    const strokeStyle = `rgba(${parseInt(COLORS.background.slice(1, 3), 16)}, ${parseInt(COLORS.background.slice(3, 5), 16)}, ${parseInt(COLORS.background.slice(5, 7), 16)}, 0.5)`;
    for (let s = 0; s < snakes.length; s++) {
      const currentSnake = snakes[s];
      const prevSnake = prev?.snakes.find(x => x.id === currentSnake.id);
      const playerInfo = players[currentSnake.id];
      const isMe = currentSnake.id === playerIdRef.current;
      const isGhost = playerInfo?.activeEffects.isGhostUntil > Date.now();
      const isDead = deadIdsRef.current.has(currentSnake.id);
      const baseOpacity = isDead ? 0.35 : (isGhost ? 0.3 : 0.9);
      const baseColor = isDead ? COLORS.deadSnake : (isMe ? COLORS.mySnake : COLORS.otherSnake);

      for (let index = 0; index < currentSnake.body.length; index++) {
        const currentSegment = currentSnake.body[index];
        let prevSegment = prevSnake?.body[index];
        if (!prevSegment && prevSnake && prevSnake.body.length) {
          prevSegment = prevSnake.body[prevSnake.body.length - 1];
        }

        const startX = prevSegment?.x ?? currentSegment.x;
        const startY = prevSegment?.y ?? currentSegment.y;
        const posX = lerp(startX, currentSegment.x, t) * cellSize;
        const posY = lerp(startY, currentSegment.y, t) * cellSize;

        ctx.fillStyle = `rgba(${parseInt(baseColor.slice(1, 3), 16)}, ${parseInt(baseColor.slice(3, 5), 16)}, ${parseInt(baseColor.slice(5, 7), 16)}, ${baseOpacity})`;
        ctx.fillRect(posX, posY, cellSize, cellSize);

        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 1;
        ctx.strokeRect(posX, posY, cellSize, cellSize);

        if (isGhost) {
          ctx.fillStyle = COLORS.ghostEffect;
          ctx.fillRect(posX, posY, cellSize, cellSize);
        }

        if (index === 0) {
          if (playerInfo?.activeEffects.speedBoostUntil > Date.now()) {
            const blurSize = Math.max(6, cellSize * 0.45);
            ctx.shadowColor = COLORS.speedBoostEffect; ctx.shadowBlur = blurSize;
            ctx.fillRect(posX, posY, cellSize, cellSize);
            ctx.shadowBlur = 0;
          }
          // eyes
          ctx.fillStyle = COLORS.eyes;
          const eyeSize = Math.max(2, cellSize * 0.25);
          const eyeOffset = Math.max(2, cellSize * 0.2);
          ctx.fillRect(posX + eyeOffset, posY + eyeOffset, eyeSize, eyeSize);
          ctx.fillRect(posX + cellSize - eyeOffset - eyeSize, posY + eyeOffset, eyeSize, eyeSize);
        }
      }
    }

    // nicknames (cached)
    for (let s = 0; s < snakes.length; s++) {
      const snake = snakes[s];
      const nickname = players[snake.id]?.nickname || '';
      if (snake.body.length === 0) continue;
      const prevSnake = prev?.snakes.find(x => x.id === snake.id);
      const currentHead = snake.body[0];
      const prevHead = prevSnake?.body[0] || currentHead;
      const textX = lerp(prevHead.x, currentHead.x, t) * cellSize + cellSize / 2;
      const textY = lerp(prevHead.y, currentHead.y, t) * cellSize - Math.max(6, cellSize * 0.3);

      const key = `${snake.id}:${nickname}`;
      let sprite = nameCacheRef.current.get(key);
      if (!sprite) {
        const cnv = document.createElement('canvas');
        cnv.width = 200; cnv.height = 32; // enough room
        const cctx = cnv.getContext('2d');
        if (cctx) {
          cctx.clearRect(0, 0, cnv.width, cnv.height);
          cctx.fillStyle = COLORS.nickname;
          cctx.font = 'bold 12px sans-serif';
          cctx.textAlign = 'center';
          cctx.shadowColor = 'rgba(255,255,255,0.7)'; cctx.shadowBlur = 3;
          cctx.fillText(nickname, cnv.width / 2, cnv.height / 2 + 4);
          cctx.shadowBlur = 0;
        }
        nameCacheRef.current.set(key, cnv);
        sprite = cnv;
      }
      if (sprite) {
        ctx.drawImage(sprite, Math.round(textX - sprite.width / 2), Math.round(textY - sprite.height / 2));
      }
    }

    // vfx
    const list = vfxRef.current;
    for (let i = 0; i < list.length; i++) {
      const effect = list[i];
      const age = Date.now() - effect.createdAt; // createdAt set via Date.now()
      const progress = Math.max(0, age / effect.duration);
      if (progress > 1) continue;
      const centerX = effect.x * cellSize + cellSize / 2;
      const centerY = effect.y * cellSize + cellSize / 2;
      ctx.save();
      if (effect.type === 'sparkle') {
        const particleCount = 5;
        const maxRadius = cellSize * 0.8;
        for (let j = 0; j < particleCount; j++) {
          const angle = (j / particleCount) * 2 * Math.PI;
          const radius = maxRadius * progress;
          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius;
          ctx.fillStyle = `rgba(251, 191, 36, ${1 - progress})`;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1.5, cellSize * 0.12) * (1 - progress), 0, 2 * Math.PI);
          ctx.fill();
        }
      } else if (effect.type === 'explosion') {
        const radius = cellSize * 1.5 * progress;
        ctx.fillStyle = `rgba(220, 38, 38, ${0.5 * (1 - progress)})`;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  // RAF loop owned by canvas
  useEffect(() => {
    const tick = () => {
      drawDynamic(performance.now());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  // initial static draw and on gridSize/devicePixelRatio changes
  useEffect(() => {
    const gridSize = currentState?.gridSize;
    if (!gridSize || gridSize <= 0) return;
    const metrics = resolveMetrics(gridSize);
    if (!metrics) return;
    const previousGrid = lastGridSizeRef.current;
    if (previousGrid && previousGrid !== gridSize) {
      // Для корректной анимации перехода сетки считаем старый cellSize так же, как текущий.
      const previousCell =
        (BASE_CELL_SIZE *
          (BASE_GRID_SIZE + VISUAL_SCALE_FACTOR * (previousGrid - BASE_GRID_SIZE))) /
        previousGrid;
      gridTransitionRef.current = {
        from: previousCell,
        to: metrics.cellSize,
        startedAt: performance.now(),
      };
    }
    lastGridSizeRef.current = gridSize;
    drawStatic();
  }, [currentState?.gridSize]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      drawStatic();
    });
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    const onDpr = () => drawStatic();
    window.addEventListener('resize', onDpr);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', onDpr);
    };
  }, []);

  const gridSizeForLayout = currStateRef.current?.gridSize ?? currentState?.gridSize ?? null;
  const metricsForLayout = resolveMetrics(gridSizeForLayout);
  const cssSize = metricsForLayout?.canvasSize ?? 0;
  return (
    <div
      ref={wrapperRef}
      style={{ position: 'relative', width: cssSize, height: cssSize, overflow: 'hidden' }}
      className="box-content rounded-xl shadow-xl border-4 border-gray-300"
    >
      <canvas ref={staticCanvasRef} style={{ position: 'absolute', inset: 0 }} />
      <canvas ref={dynamicCanvasRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
