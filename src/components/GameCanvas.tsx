// src/components/GameCanvas.tsx
"use client";

import { useEffect, useRef } from 'react';
import type { GameState, PowerUpType } from '../app/types';

interface GameCanvasProps {
    previousState: GameState | null;
    currentState: GameState | null;
    lastStateTimestamp: number;
    playerId: string | null;
    deadPlayerIds: Set<string>;
    renderTrigger: number;
}

const CELL_SIZE = 20;
const SERVER_TICK_RATE = 150;

const COLORS = {
    background: '#F0F0F0',
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
    stopEffect: 'rgba(255, 255, 255, 0.7)',
    ghostEffect: 'rgba(0, 200, 255, 0.3)', // <-- NEW: Ghost transparency
};

// <-- UPDATED: Added Ghost and Reverse
const POWERUP_VISUALS: Record<PowerUpType, { icon: string, color: string }> = {
    SpeedBoost: { icon: '⚡', color: '#F59E0B' },
    Stop: { icon: '🛑', color: '#EF4444' },
    ScoreBoost: { icon: '💰', color: '#10B981' },
    Projectile: { icon: '🚀', color: '#4F46E5' },
    Ghost: { icon: '👻', color: '#A855F7' }, // <-- NEW
    Reverse: { icon: '🔄', color: '#00B8D9' }, // <-- NEW
};

const lerp = (start: number, end: number, t: number) => start + (end - start) * t;

export function GameCanvas({
    previousState,
    currentState,
    lastStateTimestamp,
    playerId,
    deadPlayerIds,
    renderTrigger
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
        // Interpolate over SERVER_TICK_RATE.
        const interpolationFactor = Math.min(elapsed / SERVER_TICK_RATE, 1.0);

        const { gridSize, food, players, powerUps, projectiles } = gameState;
        const canvasSize = gridSize * CELL_SIZE;
        canvas.width = canvasSize;
        canvas.height = canvasSize;

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
            // Используем обновленный POWERUP_VISUALS
            const visual = POWERUP_VISUALS[p.type as PowerUpType] || { icon: '?', color: 'gray' };
            ctx.fillText(visual.icon, x + CELL_SIZE / 2, y + CELL_SIZE / 2 + 1);
        });

        // 3. Projectiles with interpolation
        projectiles.forEach(currentProj => {
            const prevProj = previousState?.projectiles.find(p => p.id === currentProj.id);

            const projPosX = prevProj ? lerp(prevProj.position.x, currentProj.position.x, interpolationFactor) * CELL_SIZE : currentProj.position.x * CELL_SIZE;
            const projPosY = prevProj ? lerp(prevProj.position.y, currentProj.position.y, interpolationFactor) * CELL_SIZE : currentProj.position.y * CELL_SIZE;

            ctx.fillStyle = COLORS.projectile;
            ctx.fillRect(projPosX, projPosY, CELL_SIZE, CELL_SIZE);
        });

        // 4. Змейки с интерполяцией
        gameState.snakes.forEach(currentSnake => {
            const prevSnake = previousState?.snakes.find(s => s.id === currentSnake.id);
            const isDead = deadPlayerIds.has(currentSnake.id);
            const isMe = currentSnake.id === playerId;
            const playerInfo = players[currentSnake.id];
            
            // NEW: Base opacity for ghost effect
            const isGhost = playerInfo?.activeEffects.isGhostUntil > now;
            const baseOpacity = isGhost ? 0.5 : 1.0;

            currentSnake.body.forEach((currentSegment, index) => {
                const prevSegment = prevSnake?.body[index];

                const posX = prevSegment ? lerp(prevSegment.x, currentSegment.x, interpolationFactor) * CELL_SIZE : currentSegment.x * CELL_SIZE;
                const posY = prevSegment ? lerp(prevSegment.y, currentSegment.y, interpolationFactor) * CELL_SIZE : currentSegment.y * CELL_SIZE;

                // Set fill style with opacity
                const baseColor = isDead ? COLORS.deadSnake : (isMe ? COLORS.mySnake : COLORS.otherSnake);
                ctx.fillStyle = `rgba(${parseInt(baseColor.slice(1, 3), 16)}, ${parseInt(baseColor.slice(3, 5), 16)}, ${parseInt(baseColor.slice(5, 7), 16)}, ${baseOpacity})`;
                ctx.fillRect(posX, posY, CELL_SIZE, CELL_SIZE);
                
                ctx.strokeStyle = COLORS.background; ctx.lineWidth = 0.5;
                ctx.strokeRect(posX, posY, CELL_SIZE, CELL_SIZE);

                // Effects only on the head
                if (index === 0) {
                    // Speed Boost Effect
                    if (playerInfo?.activeEffects.speedBoostUntil > now) {
                        ctx.shadowColor = COLORS.speedBoostEffect; ctx.shadowBlur = 10;
                        ctx.fillRect(posX, posY, CELL_SIZE, CELL_SIZE);
                        ctx.shadowBlur = 0;
                    }
                    
                    // Ghost Aura (visual cue on top of transparency)
                    if (isGhost) {
                        ctx.fillStyle = COLORS.ghostEffect;
                        ctx.fillRect(posX, posY, CELL_SIZE, CELL_SIZE);
                    }

                    // Eyes
                    ctx.fillStyle = COLORS.eyes;
                    const eyeSize = 4, eyeOffset = 4;
                    ctx.fillRect(posX + eyeOffset, posY + eyeOffset, eyeSize, eyeSize);
                    ctx.fillRect(posX + CELL_SIZE - eyeOffset - eyeSize, posY + eyeOffset, eyeSize, eyeSize);
                    
                    // Stop Effect
                    if (playerInfo?.activeEffects.isStoppedUntil > now) {
                        ctx.fillStyle = COLORS.stopEffect;
                        ctx.fillRect(posX, posY, CELL_SIZE, CELL_SIZE);
                    }
                }
            });
        });

        // 5. Никнеймы
        gameState.snakes.forEach(currentSnake => {
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

    }, [currentState, previousState, playerId, deadPlayerIds, lastStateTimestamp, renderTrigger]);

    return <canvas ref={canvasRef} className="border-4 border-gray-300 rounded-xl shadow-xl transition duration-500 hover:shadow-teal-400/50" />;
}