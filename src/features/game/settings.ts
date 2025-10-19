// src/features/game/settings.ts
// Концентрируем все параметры симуляции и отрисовки

export const SERVER_TICK_RATE = 150;      // мс между серверными снапшотами
export const BASE_GRID_SIZE = 30;         // базовый размер сетки (клеток)
export const BASE_CELL_SIZE = 20;         // базовый пиксельный размер клетки при BASE_GRID_SIZE
export const VISUAL_SCALE_FACTOR = 0.4;   // скейл полотна при отличии gridSize от BASE_GRID_SIZE

// Canvas переходы/анимации
export const GRID_TRANSITION_MS = 420;

// Снаряды/эффекты (используются в рендере)
export const PROJECTILE_SPAWN_LEAD = 0.6;   // старт «впереди головы» в клетках
export const PROJECTILE_RADIUS_RATIO = 0.35;
export const PROJECTILE_SHADOW_BLUR = 6;

// Служебное: интерполяция
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Еasing для перехода сетки
export const easeInOutCubic = (t: number) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
