// src/components/GameCanvas.tsx
"use client";

import { useEffect, useRef, useMemo } from 'react';
import type { GameState, PowerUpType } from '../app/types';

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
    lastStateTimestamp: number;
    playerId: string | null;
    deadPlayerIds: Set<string>;
    renderTrigger: number;
    vfx: VFX[];
}

const CELL_SIZE = 20;
const SERVER_TICK_RATE = 150; // Важно, чтобы это значение соответствовало серверному
const COLORS = {
    background: '#F7FAFC',
    grid: '#D1D5DB',
    food: '#F59E0B',
    mySnake: '#00796B',
    otherSnake: '#3B82F6',
    deadSnake: '#DC2626',
    nickname: '#1a1a1a',
    eyes: '#F0F0F0',
    projectile: '#4F46E5',
    powerUpBg: 'rgba(255, 255, 255, 0.8)',
    speedBoostEffect: '#FBBF24',
    ghostEffect: 'rgba(0, 200, 255, 0.3)',
};

const POWERUP_VISUALS: Record<PowerUpType, { icon: string, color: string }> = {
    SpeedBoost: { icon: '⚡', color: '#F59E0B' },
    ScoreBoost: { icon: '💰', color: '#10B981' },
    Projectile: { icon: '🚀', color: '#4F46E5' },
    Ghost: { icon: '👻', color: '#A855F7' },
    Reverse: { icon: '🔄', color: '#00B8D9' },
    Swap: { icon: '↔️', color: '#EC4899' },
};

const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

export function GameCanvas({
    previousState,
    currentState,
    lastStateTimestamp,
    playerId,
    deadPlayerIds,
    renderTrigger, // Используем renderTrigger вместо прямого currentState
    vfx,
}: GameCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const gameState = currentState;
        if (!canvasRef.current || !gameState) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const now = Date.now();
        const elapsed = now - lastStateTimestamp;
        const interpolationFactor = Math.min(elapsed / SERVER_TICK_RATE, 1.0);
        const { gridSize, food, players, powerUps, snakes, projectiles } = gameState;
        const canvasSize = gridSize * CELL_SIZE;
        canvas.width = canvasSize;
        canvas.height = canvasSize;

        // --- Отрисовка фона, сетки, еды, бонусов (без изменений) ---
        ctx.fillStyle = COLORS.background;
        ctx.fillRect(0, 0, canvasSize, canvasSize);
        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 1;
        for (let i = 0; i <= canvasSize; i += CELL_SIZE) {
            ctx.beginPath();
            ctx.moveTo(i, 0); ctx.lineTo(i, canvasSize); ctx.stroke();
            ctx.moveTo(0, i); ctx.lineTo(canvasSize, i); ctx.stroke();
        }
        ctx.fillStyle = COLORS.food;
        food.forEach(f => {
            ctx.beginPath();
            ctx.arc(f.x * CELL_SIZE + CELL_SIZE / 2, f.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE / 2.5, 0, 2 * Math.PI);
            ctx.fill();
        });
        powerUps.forEach(p => {
            const x = p.position.x * CELL_SIZE; const y = p.position.y * CELL_SIZE;
            ctx.fillStyle = COLORS.powerUpBg;
            ctx.beginPath();
            ctx.arc(x + CELL_SIZE / 2, y + CELL_SIZE / 2, CELL_SIZE / 2, 0, 2 * Math.PI);
            ctx.fill();
            ctx.font = '16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            const visual = POWERUP_VISUALS[p.type as PowerUpType] || { icon: '?', color: 'gray' };
            ctx.fillText(visual.icon, x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 1);
        });

        // --- Отрисовка снарядов с интерполяцией ---
        projectiles.forEach(currentProj => {
            const prevProj = previousState?.projectiles.find(p => p.id === currentProj.id);
            const startX = prevProj?.position.x ?? currentProj.position.x;
            const startY = prevProj?.position.y ?? currentProj.position.y;
            const projPosX = lerp(startX, currentProj.position.x, interpolationFactor);
            const projPosY = lerp(startY, currentProj.position.y, interpolationFactor);

            ctx.fillStyle = COLORS.projectile;
            ctx.fillRect(projPosX * CELL_SIZE, projPosY * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        });

        // --- Отрисовка змеек с ИСПРАВЛЕННОЙ интерполяцией ---
        snakes.forEach(currentSnake => {
            const prevSnake = previousState?.snakes.find(s => s.id === currentSnake.id);
            const isDead = deadPlayerIds.has(currentSnake.id);
            const isMe = currentSnake.id === playerId;
            const playerInfo = players[currentSnake.id];
            const isGhost = playerInfo?.activeEffects.isGhostUntil > now;
            const baseOpacity = isGhost ? 0.5 : 1.0;

            currentSnake.body.forEach((currentSegment, index) => {
                let prevSegment = prevSnake?.body[index];

                // --- ГЛАВНЫЙ ФИКС: Плавный рост и движение ---
                if (!prevSegment && prevSnake && prevSnake.body.length > 0) {
                    // Если это новый сегмент (змея выросла), его стартовая позиция
                    // для интерполяции - это позиция предыдущего сегмента из прошлого состояния.
                    // Это создает эффект "вытягивания" хвоста.
                    prevSegment = prevSnake.body[index - 1] || prevSnake.body[prevSnake.body.length - 1];
                }

                const startX = prevSegment?.x ?? currentSegment.x;
                const startY = prevSegment?.y ?? currentSegment.y;

                const posX = lerp(startX, currentSegment.x, interpolationFactor) * CELL_SIZE;
                const posY = lerp(startY, currentSegment.y, interpolationFactor) * CELL_SIZE;

                const baseColor = isDead ? COLORS.deadSnake : (isMe ? COLORS.mySnake : COLORS.otherSnake);
                ctx.fillStyle = `rgba(${parseInt(baseColor.slice(1, 3), 16)}, ${parseInt(baseColor.slice(3, 5), 16)}, ${parseInt(baseColor.slice(5, 7), 16)}, ${baseOpacity})`;
                ctx.fillRect(posX, posY, CELL_SIZE, CELL_SIZE);
                ctx.strokeStyle = `rgba(${parseInt(COLORS.background.slice(1, 3), 16)}, ${parseInt(COLORS.background.slice(3, 5), 16)}, ${parseInt(COLORS.background.slice(5, 7), 16)}, 0.5)`;
                ctx.lineWidth = 1;
                ctx.strokeRect(posX, posY, CELL_SIZE, CELL_SIZE);

                if (index === 0) { // Эффекты для головы
                    if (playerInfo?.activeEffects.speedBoostUntil > now) {
                        ctx.shadowColor = COLORS.speedBoostEffect; ctx.shadowBlur = 10;
                        ctx.fillRect(posX, posY, CELL_SIZE, CELL_SIZE);
                        ctx.shadowBlur = 0;
                    }
                    if (isGhost) {
                        ctx.fillStyle = COLORS.ghostEffect;
                        ctx.fillRect(posX, posY, CELL_SIZE, CELL_SIZE);
                    }
                    // Глаза
                    ctx.fillStyle = COLORS.eyes;
                    const eyeSize = 4, eyeOffset = 4;
                    ctx.fillRect(posX + eyeOffset, posY + eyeOffset, eyeSize, eyeSize);
                    ctx.fillRect(posX + CELL_SIZE - eyeOffset - eyeSize, posY + eyeOffset, eyeSize, eyeSize);
                }
            });
        });

        // --- Отрисовка никнеймов с интерполяцией ---
        snakes.forEach(currentSnake => {
            const nickname = players[currentSnake.id]?.nickname || '';
            if (currentSnake.body.length > 0) {
                const prevSnake = previousState?.snakes.find(s => s.id === currentSnake.id);
                const currentHead = currentSnake.body[0];
                const prevHead = prevSnake?.body[0] || currentHead;

                const textX = lerp(prevHead.x, currentHead.x, interpolationFactor) * CELL_SIZE + CELL_SIZE / 2;
                const textY = lerp(prevHead.y, currentHead.y, interpolationFactor) * CELL_SIZE - 6;

                ctx.fillStyle = COLORS.nickname; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
                ctx.shadowColor = 'rgba(255,255,255,0.7)'; ctx.shadowBlur = 3;
                ctx.fillText(nickname, textX, textY);
                ctx.shadowBlur = 0;
            }
        });

        // Отрисовка VFX (без изменений)
        vfx.forEach(effect => {
            const age = Date.now() - effect.createdAt;
            const progress = age / effect.duration;
            if (progress > 1) return;
            const centerX = effect.x * CELL_SIZE + CELL_SIZE / 2;
            const centerY = effect.y * CELL_SIZE + CELL_SIZE / 2;
            ctx.save();
            if (effect.type === 'sparkle') {
                const particleCount = 5;
                const maxRadius = CELL_SIZE * 0.8;
                for (let i = 0; i < particleCount; i++) {
                    const angle = (i / particleCount) * 2 * Math.PI;
                    const radius = maxRadius * progress;
                    const x = centerX + Math.cos(angle) * radius;
                    const y = centerY + Math.sin(angle) * radius;
                    ctx.fillStyle = `rgba(251, 191, 36, ${1 - progress})`;
                    ctx.beginPath();
                    ctx.arc(x, y, 3 * (1 - progress), 0, 2 * Math.PI);
                    ctx.fill();
                }
            } else if (effect.type === 'explosion') {
                const radius = CELL_SIZE * 1.5 * progress;
                ctx.fillStyle = `rgba(220, 38, 38, ${0.5 * (1 - progress)})`;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                ctx.fill();
            }
            ctx.restore();
        });

    }, [currentState, previousState, lastStateTimestamp, playerId, deadPlayerIds, renderTrigger, vfx]);

    return <canvas ref={canvasRef} className="border-4 border-gray-300 rounded-xl shadow-xl transition duration-500 hover:shadow-teal-400/50" />;
}