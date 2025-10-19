// src/features/game/components/PowerUpBar.tsx
"use client";

import type { PowerUpType } from '@/features/game/types';
import { POWERUP_CANVAS_GLYPH, PowerUpGlyph } from '@/features/game/icons';
import { POWERUP_COLORS } from '@/features/game/visuals';
import { THEME } from '@/features/game/theme';

interface PowerUpBarProps {
  powerUpSlots: (PowerUpType | null)[] | undefined;
  onUsePowerUp: (slot: number) => void;
}

export function PowerUpBar({ powerUpSlots, onUsePowerUp }: PowerUpBarProps) {
  const slots = powerUpSlots || [null, null, null];

  return (
    <div
      className="w-full p-4 rounded-xl shadow-lg border mt-4"
      style={{ background: 'var(--card-bg)', borderColor: 'rgba(0,0,0,0.08)' }}
    >
      <h3
        className="text-lg font-bold mb-3 text-center tracking-wide"
        style={{ color: THEME.accent as string }}
      >
        Abilities
      </h3>

      <div className="grid grid-cols-3 gap-3">
        {slots.map((powerUp, index) => {
          const glyph = powerUp ? POWERUP_CANVAS_GLYPH[powerUp] : null;
          const color = powerUp ? POWERUP_COLORS[powerUp] : undefined;

          return (
            <button
              key={index}
              onClick={() => onUsePowerUp(index)}
              disabled={!powerUp}
              className="relative flex flex-col items-center justify-center aspect-square p-2 border-2 rounded-lg transition focus:outline-none focus:ring-2"
              style={{
                borderColor: '#D1D5DB',
                background: powerUp ? '#FFFFFF' : '#F3F4F6',
                opacity: powerUp ? 1 : 0.6,
              }}
              aria-label={`Use Power-Up in Slot ${index + 1}`}
            >
              <span className="absolute top-1 right-1.5 text-xs font-mono text-gray-400">
                {index + 1}
              </span>

              {glyph ? (
                <PowerUpGlyph
                  glyph={glyph}
                  size={28}
                  color={color}
                  title={powerUp ?? undefined}
                />
              ) : (
                <span className="text-gray-300 text-lg font-bold">-</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
