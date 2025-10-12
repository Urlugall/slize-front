// src/components/PowerUpBar.tsx
"use client";

import type { PowerUpType } from '../app/types';

interface PowerUpBarProps {
    powerUpSlots: (PowerUpType | null)[] | undefined;
    onUsePowerUp: (slot: number) => void;
}

// Map power-up types to emojis for display
const POWERUP_ICONS: Record<PowerUpType, string> = {
    SpeedBoost: '⚡',
    Stop: '🛑',
    ScoreBoost: '💰',
    Projectile: '🚀',
    Ghost: '👻', // <-- ADDED
    Reverse: '🔄', // <-- ADDED
};

export function PowerUpBar({ powerUpSlots, onUsePowerUp }: PowerUpBarProps) {
// ... (остальной код без изменений)
    const slots = powerUpSlots || [null, null, null];

    return (
        <div className="w-full bg-card-bg p-4 rounded-xl shadow-lg border border-gray-200 mt-4">
            <h3 className="text-lg font-bold mb-3 text-center text-[var(--accent)] tracking-wide">
                Abilities
            </h3>
            <div className="grid grid-cols-3 gap-3">
                {slots.map((powerUp, index) => (
                    <button
                        key={index}
                        onClick={() => onUsePowerUp(index)}
                        disabled={!powerUp}
                        className="relative flex flex-col items-center justify-center aspect-square p-2 border-2 border-gray-300 rounded-lg bg-gray-50 disabled:bg-gray-100 disabled:opacity-50 transition hover:border-[var(--accent)] hover:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-hover)]"
                        aria-label={`Use Power-Up in Slot ${index + 1}`}
                    >
                        {/* Keybinding hint */}
                        <span className="absolute top-1 right-1.5 text-xs font-mono text-gray-400">{index + 1}</span>

                        {powerUp ? (
                            <span className="text-3xl" title={powerUp}>{POWERUP_ICONS[powerUp]}</span>
                        ) : (
                            <span className="text-gray-300 text-lg font-bold">-</span>
                        )}
                    </button>
                ))}
            </div>
        </div>
    );
}