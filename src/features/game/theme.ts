// src/features/game/theme.ts
// Глобальные «дизайн-токены» UI, согласованные с globals.css.
// Эти цвета используйте в React-компонентах, панелях, бордерах и т.п.
// Канвас берёт цвета из visuals.ts (там — игровой слой).

export const THEME = {
    background: 'var(--background)',
    foreground: 'var(--foreground)',
    card: 'var(--card-bg)',
    accent: 'var(--accent)',
    accentHover: 'var(--accent-hover)',
};

export const ELEVATION = {
    cardBorder: '1px solid rgba(0,0,0,0.08)',
    cardShadow: '0 8px 24px rgba(0,0,0,0.06)',
};
