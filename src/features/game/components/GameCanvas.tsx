// src/features/game/components/GameCanvas.tsx
"use client";

// Тонкая React-обёртка вокруг CanvasRenderer.
// Держит только рефы и жизненный цикл. Вся отрисовка — в CanvasRenderer.

import { useEffect, useRef } from 'react';
import type { GameState, GameOverInfo } from '@/features/game/types';
import { CanvasRenderer } from '@/features/game/canvas/CanvasRenderer';
import type { VFX } from '@/features/game/canvas/types';
import { calculateCanvasSize } from '@/features/game/lib/canvasMetrics';

interface GameCanvasProps {
  snapshots: Array<{ t: number; state: GameState }>;
  interpDelayMs: number;
  lastStateTimestamp: number;
  playerId: string | null;
  deadPlayerIds: Set<string>;
  vfx: VFX[];
  gameOver: GameOverInfo | null | undefined;
}

export function GameCanvas({
  snapshots,
  interpDelayMs,
  lastStateTimestamp,
  playerId,
  deadPlayerIds,
  vfx,
  gameOver,
}: GameCanvasProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const staticCanvasRef = useRef<HTMLCanvasElement>(null);
  const dynamicCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const rafRef = useRef<number | null>(null);

  // Инициализация рендерера единажды
  useEffect(() => {
    const staticCnv = staticCanvasRef.current;
    const dynamicCnv = dynamicCanvasRef.current;
    if (!staticCnv || !dynamicCnv) return;
    rendererRef.current = new CanvasRenderer(staticCnv, dynamicCnv);

    const tick = () => {
      rendererRef.current!.draw(performance.now());
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Ресайз/ранний DPR апдейт — достаточно перерисовать статический фон
    const ro = new ResizeObserver(() => rendererRef.current?.draw(performance.now()));
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    const onResize = () => rendererRef.current?.draw(performance.now());
    window.addEventListener('resize', onResize);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      window.removeEventListener('resize', onResize);
      rendererRef.current = null;
    };
  }, []);

  // подсовываем рендереру пару снапшотов, обрамляющих target time
  useEffect(() => {
    const target = performance.now() - interpDelayMs;
    let a: { t: number; state: GameState } | null = null;
    let b: { t: number; state: GameState } | null = null;
    // линейный поиск от конца (буфер маленький)
    for (let i = snapshots.length - 1; i >= 0; i--) {
      if (snapshots[i].t <= target) {
        a = snapshots[i];
        b = snapshots[i + 1] ?? snapshots[i]; // если нет бОльшего — дублируем
        break;
      }
    }
    // если target раньше всех — берём самый ранний
    if (!a && snapshots.length) {
      a = snapshots[0];
      b = snapshots[1] ?? snapshots[0];
    }
    rendererRef.current?.setPreviousState(a?.state ?? null);
    rendererRef.current?.setCurrentState(b?.state ?? null);
    // Для интерполяции в CanvasRenderer используем "время b"
    rendererRef.current?.setLastStateTimestamp(b?.t ?? 0);
  }, [snapshots, interpDelayMs]);

  // Прокидываем новые снапшоты/refs в рендерер — без лишних перерисовок React
  useEffect(() => { rendererRef.current?.setLastStateTimestamp(lastStateTimestamp); }, [lastStateTimestamp]);
  useEffect(() => { rendererRef.current?.setPlayerId(playerId); }, [playerId]);
  useEffect(() => { rendererRef.current?.setDeadIds(deadPlayerIds); }, [deadPlayerIds]);
  useEffect(() => { rendererRef.current?.setVfx(vfx); }, [vfx]);
  useEffect(() => { rendererRef.current?.setGameOver(gameOver); }, [gameOver]);

  // Вычисляем CSS-размер по текущему gridSize (как раньше)
  const latest = snapshots[snapshots.length - 1]?.state ?? null;
  const before = snapshots[snapshots.length - 2]?.state ?? null;
  const gridSizeForLayout = latest?.gridSize ?? before?.gridSize ?? null;
  
  const cssSize =
    gridSizeForLayout && gridSizeForLayout > 0 ? calculateCanvasSize(gridSizeForLayout) : 0;

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'relative', width: cssSize, height: cssSize, overflow: 'hidden' }}
      className="box-content rounded-xl shadow-lg border border-[rgba(15,23,42,0.08)] bg-white"
    >
      <canvas ref={staticCanvasRef} style={{ position: 'absolute', inset: 0 }} />
      <canvas ref={dynamicCanvasRef} style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}
