// src/features/game/config.ts
// Centralized configuration and design tokens for the game feature.

import type { PowerUpType } from '@/features/game/types';

export const GRID_DIMENSIONS = {
  baseGridSize: 32,
  baseCellSize: 20,
  visualScaleFactor: 0.4,
} as const;

export const GAME_TIMING = {
  serverTickRate: 150,
  gridTransitionMs: 420,
  roundDurationMs: 3 * 60 * 1000,
} as const;

export const NET_SMOOTHING = {
  // базовая задержка рендера (мс), чтобы рисовать "в прошлом"
  interpBaseMs: 120,
  interpMinMs: 80,
  interpMaxMs: 220,
  // доля EMA для оценки джиттера межпакетных интервалов
  jitterAlpha: 0.25,
  // насколько агрессивно учитывать джиттер
  jitterFactor: 1.2,
  // размер буфера снапшотов
  snapshotBuffer: 40,
} as const;

export const PROJECTILES = {
  spawnLead: 0.6,
  radiusRatio: 0.35,
  shadowBlur: 6,
} as const;

export const CLIENT_STATE = {
  activeTabLockKey: 'slize_active_tab_lock',
  reconnectMaxDelayMs: 5_000,
  reconnectBaseDelayMs: 750,
  reconnectJitterMs: 250,
  inputThrottleMs: 65,
} as const;

export const COLORS = {
  grid: {
    background: '#F8FAFC',
    line: 'rgba(2,6,23,0.06)',
    edgeStart: 'rgba(255,255,255,0.00)',
    edgeEnd: 'rgba(15,23,42,0.06)',
  },
  food: '#F59E0B',
  snakes: {
    me: '#2DD4BF',
    other: '#818CF8',
    teamAlpha: '#F43F5E',
    teamBravo: '#3B82F6',
    dead: '#94A3B8',
    nickname: '#0F172A',
    eyes: '#0F172A',
  },
  effects: {
    projectile: '#8B5CF6',
    speedBoostGlow: '#22D3EE',
    ghostOverlay: 'rgba(99,102,241,0.18)',
    vfxSpark: 'rgba(250,204,21,1)',
    vfxExplosion: 'rgba(239,68,68,0.35)',
  },
  blocks: {
    warning: 'rgba(244,63,94,0.14)',
    pulse: 'rgba(244,63,94,0.22)',
    kill: 'rgba(239,68,68,0.78)',
    solid: 'rgba(15,23,42,0.12)',
  },
  powerUpBg: 'rgba(255,255,255,0.95)',
  powerUps: {
    SpeedBoost: '#06B6D4',
    ScoreBoost: '#10B981',
    Projectile: '#EC4899',
    Ghost: '#8B5CF6',
    Reverse: '#38BDF8',
    Swap: '#F59E0B',
  } as Record<PowerUpType, string>,
} as const;

export const THEME = {
  background: 'var(--background)',
  foreground: 'var(--foreground)',
  card: 'var(--card-bg)',
  accent: 'var(--accent)',
  accentHover: 'var(--accent-hover)',
} as const;

export const ELEVATION = {
  cardBorder: '1px solid rgba(0,0,0,0.08)',
  cardShadow: '0 8px 24px rgba(0,0,0,0.06)',
} as const;

