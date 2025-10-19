// src/features/game/icons.tsx
// ЕДИНАЯ точка правды по иконкам поверапов:
// - React-иконки (lucide-react) для UI (кнопки, панели)
// - Глифы (Material Symbols) для канваса (через fillText)

import type { ComponentType } from 'react';
import type { SVGProps } from 'react';
import type { PowerUpType } from './types';
import {
    Zap,            // SpeedBoost
    Gem,            // ScoreBoost
    Crosshair,      // Projectile
    Ghost,          // Ghost
    RefreshCw,      // Reverse
    ArrowLeftRight, // Swap
} from 'lucide-react';

// ====== React-иконки для UI ======
export type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

export const POWERUP_ICON_MAP: Record<PowerUpType, LucideIcon> = {
    SpeedBoost: Zap,
    ScoreBoost: Gem,
    Projectile: Crosshair,
    Ghost: Ghost,
    Reverse: RefreshCw,
    Swap: ArrowLeftRight,
};

// ====== Глифы для Canvas (Material Symbols Rounded) ======
// В Canvas используем лигатуры из Material Symbols (см. globals.css).
// NB: названия — это ТЕКСТ, который шрифт превращает в иконку.
export const POWERUP_CANVAS_GLYPH: Record<PowerUpType, string> = {
    SpeedBoost: 'bolt',         // молния
    ScoreBoost: 'diamond',      // алмаз
    Projectile: 'my_location',  // прицел
    Ghost: 'blur_on',             // призрак
    Reverse: 'u_turn_left',     // разворот
    Swap: 'swap_horiz',         // свап
};

// Рендер глифа в React (панель поверапов)
export function PowerUpGlyph({
    glyph,
    size = 28,
    color,
    title,
}: { glyph: string; size?: number; color?: string; title?: string }) {
    // Важно: шрифт Material Symbols уже подключён в globals.css
    return (
        <span
            className="msr"
            aria-hidden="true"
            title={title}
            style={{
                fontFamily: '"Material Symbols Rounded"',
                fontWeight: 600,
                fontSize: size,
                lineHeight: 1,
                display: 'inline-block',
                color,
                // лёгкий оптический сдвиг, как в Canvas
                transform: 'translateY(1px)',
            }}
        >
            {glyph}
        </span>
    );
}

// Хелпер: отрисовать иконку поверапа в Canvas
export function drawPowerUpGlyph(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    centerY: number,
    px: number,
    color: string,
) {
    // ВАЖНО: Material Symbols — моно-глифы, рендерим по центру.
    // Небольшой вертикальный сдвиг делает оптический центр ровнее.
    ctx.save();
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Полужирный вес даёт читаемость в маленьком размере
    ctx.font = `600 ${px}px "Material Symbols Rounded"`;
    ctx.fillText(text, centerX, centerY + Math.max(1, px * 0.05));
    ctx.restore();
}
