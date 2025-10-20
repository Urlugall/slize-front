// src/features/game/components/GameCanvas.tsx
"use client";

// Тонкая React-обёртка вокруг CanvasRenderer.
// Держит только рефы и жизненный цикл. Вся отрисовка — в CanvasRenderer.

import { useEffect, useRef } from 'react';
import type { GameState, GameOverInfo } from '@/features/game/types';
import { CanvasRenderer, type VFX } from '@/features/game/canvas/CanvasRenderer';
import { calculateCanvasSize } from '@/features/game/lib/canvasMetrics';

interface GameCanvasProps {
  previousState: GameState | null;
  currentState: GameState | null;
  lastStateTimestamp: number;
  playerId: string | null;
  deadPlayerIds: Set<string>;
  vfx: VFX[];
  gameOver: GameOverInfo | null | undefined;
}

export function GameCanvas({
  previousState,
  currentState,
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

  // Прокидываем новые снапшоты/refs в рендерер — без лишних перерисовок React
  useEffect(() => { rendererRef.current?.setPreviousState(previousState); }, [previousState]);
  useEffect(() => { rendererRef.current?.setCurrentState(currentState); }, [currentState]);
  useEffect(() => { rendererRef.current?.setLastStateTimestamp(lastStateTimestamp); }, [lastStateTimestamp]);
  useEffect(() => { rendererRef.current?.setPlayerId(playerId); }, [playerId]);
  useEffect(() => { rendererRef.current?.setDeadIds(deadPlayerIds); }, [deadPlayerIds]);
  useEffect(() => { rendererRef.current?.setVfx(vfx); }, [vfx]);
  useEffect(() => { rendererRef.current?.setGameOver(gameOver); }, [gameOver]);

  // Вычисляем CSS-размер по текущему gridSize (как раньше)
  const gridSizeForLayout = currentState?.gridSize ?? previousState?.gridSize ?? null;
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
