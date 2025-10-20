// src/features/game/visuals.ts
// Светлая «Soft Light» палитра: читаемо, современно, без «мрака».

import type { PowerUpType } from './types';

export const GRID_COLORS = {
    background: '#F8FAFC',            // светлый холст
    line: 'rgba(2,6,23,0.06)',        // очень тонкая сетка
    edgeStart: 'rgba(255,255,255,0.00)', // по краям еле-заметная дымка
    edgeEnd: 'rgba(15,23,42,0.06)',
} as const;

export const FOOD_COLOR = '#F59E0B'; // amber-500 (сохраняем читаемость)

export const SNAKE_COLORS = {
    me: '#2DD4BF',
    other: '#818CF8',

    teamAlpha: '#F43F5E', // Rose-500
    teamBravo: '#3B82F6', // Blue-500

    dead: '#94A3B8',      // slate-400 (норм)
    nickname: '#0F172A',  // тёмный ник на светлом фоне
    eyes: '#0F172A',      // тёмные глаза (контрастно на светлом)
} as const;

export const EFFECT_COLORS = {
    projectile: '#8B5CF6',     // violet-500 (мягче, чем розовый)
    speedBoostGlow: '#22D3EE', // cyan-400
    ghostOverlay: 'rgba(99,102,241,0.18)', // indigo veil
    vfxSpark: 'rgba(250,204,21,1)',
    vfxExplosion: 'rgba(239,68,68,0.35)',
} as const;

export const BLOCK_COLORS = {
    warning: 'rgba(244,63,94,0.14)',
    pulse: 'rgba(244,63,94,0.22)',
    kill: 'rgba(239,68,68,0.78)',
    solid: 'rgba(15,23,42,0.12)', // вместо глухого: полупрозрачный «solid»
} as const;

/* Подложка под значок поверапов — светлая «таблетка».
   Важно: на светлом холсте делаем её белой и чуть полупрозрачной. */
export const POWERUP_BG = 'rgba(255,255,255,0.95)';

export const POWERUP_COLORS: Record<PowerUpType, string> = {
    SpeedBoost: '#06B6D4', // cyan-500
    ScoreBoost: '#10B981', // emerald-500
    Projectile: '#EC4899', // pink-500
    Ghost: '#8B5CF6',      // violet-500
    Reverse: '#38BDF8',    // sky-400
    Swap: '#F59E0B',       // amber-500
};
