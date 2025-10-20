// src/features/game/canvas/CanvasRenderer.ts
// Светлый канвас: мягкие сетки, скруглённые сегменты, поверапы в едином стиле.

import type { GameOverInfo, GameState, PowerUpType } from '@/features/game/types';
import {
    BASE_CELL_SIZE, BASE_GRID_SIZE, VISUAL_SCALE_FACTOR,
    SERVER_TICK_RATE, GRID_TRANSITION_MS,
    PROJECTILE_RADIUS_RATIO, PROJECTILE_SPAWN_LEAD,
    lerp, easeInOutCubic,
} from '@/features/game/settings';
import {
    GRID_COLORS, FOOD_COLOR, SNAKE_COLORS, EFFECT_COLORS, BLOCK_COLORS,
    POWERUP_BG, POWERUP_COLORS,
} from '@/features/game/visuals';
import { drawPowerUpGlyph, POWERUP_CANVAS_GLYPH } from '@/features/game/icons';

const DIR = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } } as const;

export type VFX = {
    id: number; type: 'sparkle' | 'explosion';
    x: number; y: number; createdAt: number; duration: number;
};

type Metrics = { canvasSize: number; cellSize: number; gridSize: number };

export class CanvasRenderer {
    private staticCanvas: HTMLCanvasElement;
    private dynamicCanvas: HTMLCanvasElement;

    private prev: GameState | null = null;
    private curr: GameState | null = null;
    private lastTs = 0;
    private playerId: string | null = null;
    private deadIds: Set<string> = new Set();
    private vfx: VFX[] = [];
    private gameOver: GameOverInfo | null | undefined = null;

    private dpr = 1;
    private lastGridSize: number | null = null;
    private gridTransition: { from: number; to: number; startedAt: number } | null = null;
    private vignette: CanvasGradient | null = null;
    private noisePattern: CanvasPattern | null = null;
    private nameCache = new Map<string, HTMLCanvasElement>();

    constructor(staticCanvas: HTMLCanvasElement, dynamicCanvas: HTMLCanvasElement) {
        this.staticCanvas = staticCanvas;
        this.dynamicCanvas = dynamicCanvas;
    }

    setPreviousState(s: GameState | null) { this.prev = s; }
    setCurrentState(s: GameState | null) { this.curr = s; }
    setLastStateTimestamp(t: number) { this.lastTs = t; }
    setPlayerId(id: string | null) { this.playerId = id; }
    setDeadIds(ids: Set<string>) { this.deadIds = ids; }
    setVfx(list: VFX[]) { this.vfx = list; }
    setGameOver(info: GameOverInfo | null | undefined) { this.gameOver = info; }

    draw(now: number) {
        if (!this.curr) return;
        const m = this.resolveMetrics(this.curr.gridSize); if (!m) return;

        this.setupCanvas(this.staticCanvas, m.canvasSize, m.canvasSize, true);
        this.drawStatic();

        this.setupCanvas(this.dynamicCanvas, m.canvasSize, m.canvasSize, false);
        const ctx = this.dynamicCanvas.getContext('2d'); if (!ctx) return;
        ctx.clearRect(0, 0, m.canvasSize, m.canvasSize);

        const t = Math.min(Math.max((now - this.lastTs) / SERVER_TICK_RATE, 0), 1);

        this.drawGridLayer(ctx, m, now);
        this.drawBlocks(ctx, m);
        this.drawFood(ctx, m);
        this.drawPowerUps(ctx, m);
        this.drawProjectiles(ctx, m, t);
        this.drawSnakes(ctx, m, t);
        this.drawNicknames(ctx, m, t);
        this.drawVfx(ctx, m);
        this.drawResizeBanner(ctx, m);
        this.postFx(ctx, m);

        if (this.gameOver) {
            this.drawGameOverBanner(ctx, m, now, this.gameOver);
        }
    }

    // --- Canvas / Metrics ---

    private setupCanvas(canvas: HTMLCanvasElement, cssW: number, cssH: number, isStatic: boolean) {
        const dpr = window.devicePixelRatio || 1;
        this.dpr = dpr;
        const devW = Math.round(cssW * dpr), devH = Math.round(cssH * dpr);
        if (canvas.width !== devW || canvas.height !== devH) {
            canvas.width = devW; canvas.height = devH;
            this.vignette = null; // градиент зависит от размера
        }
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.imageSmoothingEnabled = false;
            if (isStatic) {
                ctx.fillStyle = GRID_COLORS.background;
                ctx.fillRect(0, 0, cssW, cssH);
            }
        }
    }

    private resolveMetrics(gridSize?: number | null): Metrics | null {
        if (!gridSize || gridSize <= 0) return null;
        const canvasSize =
            BASE_CELL_SIZE * (BASE_GRID_SIZE + VISUAL_SCALE_FACTOR * (gridSize - BASE_GRID_SIZE));
        const cellSize = canvasSize / gridSize;
        return { canvasSize, cellSize, gridSize };
    }

    // --- Helpers ---

    private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
        // r ограничиваем, чтобы не «схлопывался» прямоугольник
        const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    }

    // --- Layers ---

    private drawStatic() { /* фон уже залит в setupCanvas */ }

    private drawGridLayer(ctx: CanvasRenderingContext2D, m: Metrics, now: number) {
        if (this.lastGridSize && this.lastGridSize !== m.gridSize && !this.gridTransition) {
            const prevCell =
                (BASE_CELL_SIZE *
                    (BASE_GRID_SIZE + VISUAL_SCALE_FACTOR * (this.lastGridSize - BASE_GRID_SIZE))) /
                this.lastGridSize;
            this.gridTransition = { from: prevCell, to: m.cellSize, startedAt: performance.now() };
        }
        this.lastGridSize = m.gridSize;

        const draw = (cellSize: number, alpha: number) => {
            if (alpha <= 0) return;
            ctx.save();
            ctx.globalAlpha *= alpha;

            const gridLines = Math.round(m.canvasSize / cellSize);

            // ТОЛЬКО линии сетки; никаких краевых градиентов и «ободков»
            ctx.strokeStyle = GRID_COLORS.line;
            ctx.lineWidth = 1;
            ctx.beginPath();
            // Не рисуем 0-ю и последнюю линии — убирает «рамку» по периметру
            for (let i = 1; i < gridLines; i++) {
                const pos = i * cellSize; ctx.moveTo(pos, 0); ctx.lineTo(pos, m.canvasSize);
            }
            for (let j = 1; j < gridLines; j++) {
                const pos = j * cellSize; ctx.moveTo(0, pos); ctx.lineTo(m.canvasSize, pos);
            }
            ctx.stroke();

            ctx.restore();
        };

        if (this.gridTransition) {
            const progress = Math.min((now - this.gridTransition.startedAt) / GRID_TRANSITION_MS, 1);
            const eased = easeInOutCubic(progress);
            draw(this.gridTransition.from, 1 - eased);
            draw(m.cellSize, eased);
            if (progress >= 1) this.gridTransition = null;
        } else {
            draw(m.cellSize, 1);
        }
    }

    private drawBlocks(ctx: CanvasRenderingContext2D, m: Metrics) {
        const g = this.curr!; if (!g.blocks?.length) return;
        for (const b of g.blocks) {
            const x = b.x * m.cellSize, y = b.y * m.cellSize;
            if (b.state === 'warning') {
                const ph = Math.abs(Math.sin(Date.now() / 320));
                ctx.fillStyle = ph > 0.5 ? BLOCK_COLORS.pulse : BLOCK_COLORS.warning;
            } else if (b.state === 'kill') {
                ctx.fillStyle = BLOCK_COLORS.kill;
            } else {
                ctx.fillStyle = BLOCK_COLORS.solid;
            }
            // Скругляем блоки чуть-чуть, чтобы общий стиль был дружелюбнее
            this.roundRect(ctx, x + 0.5, y + 0.5, m.cellSize - 1, m.cellSize - 1, Math.max(2, m.cellSize * 0.12));
            ctx.fill();
        }
    }

    private drawFood(ctx: CanvasRenderingContext2D, m: Metrics) {
        const r = m.cellSize / 2.6; ctx.fillStyle = FOOD_COLOR;
        for (const f of this.curr!.food) {
            const cx = f.x * m.cellSize + m.cellSize / 2;
            const cy = f.y * m.cellSize + m.cellSize / 2;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        }
    }

    private drawPowerUps(ctx: CanvasRenderingContext2D, m: Metrics) {
        const list = this.curr!.powerUps;
        for (const p of list) {
            const cx = p.position.x * m.cellSize + m.cellSize / 2;
            const cy = p.position.y * m.cellSize + m.cellSize / 2;
            const R = m.cellSize * 0.48;
            const color = POWERUP_COLORS[p.type as PowerUpType];

            // Мягкое внешнее сияние
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(cx, cy, R * 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.restore();

            // Таблетка (светлая)
            ctx.save();
            ctx.fillStyle = POWERUP_BG;
            ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

            // Цветное кольцо
            ctx.lineWidth = Math.max(2, m.cellSize * 0.08);
            ctx.strokeStyle = color;
            ctx.beginPath(); ctx.arc(cx, cy, R - ctx.lineWidth * 0.5, 0, Math.PI * 2); ctx.stroke();
            ctx.restore();

            // Глиф
            const glyph = POWERUP_CANVAS_GLYPH[p.type as PowerUpType] ?? '?';
            const iconPx = Math.max(12, m.cellSize * 0.80);
            drawPowerUpGlyph(ctx, glyph, cx, cy, iconPx, '#0F172A'); // тёмный глиф на светлой таблетке
        }
    }

    private drawProjectiles(ctx: CanvasRenderingContext2D, m: Metrics, t: number) {
        const g = this.curr!, prev = this.prev, rad = m.cellSize * PROJECTILE_RADIUS_RATIO;

        for (const pr of g.projectiles) {
            const prevPr = prev?.projectiles.find(p => p.id === pr.id);
            const dir = DIR[pr.direction] ?? DIR.right;
            const targetCX = pr.position.x + 0.5, targetCY = pr.position.y + 0.5;

            let startCX: number, startCY: number;
            if (prevPr) { startCX = prevPr.position.x + 0.5; startCY = prevPr.position.y + 0.5; }
            else {
                const ownerPrev = prev?.snakes.find(s => s.id === pr.ownerId);
                const ownerCurr = g.snakes.find(s => s.id === pr.ownerId);
                const head = ownerPrev?.body[0] ?? ownerCurr?.body[0];
                if (head) {
                    startCX = head.x + 0.5 + dir.x * PROJECTILE_SPAWN_LEAD;
                    startCY = head.y + 0.5 + dir.y * PROJECTILE_SPAWN_LEAD;
                } else {
                    startCX = targetCX - dir.x * PROJECTILE_SPAWN_LEAD;
                    startCY = targetCY - dir.y * PROJECTILE_SPAWN_LEAD;
                }
            }

            const x = lerp(startCX, targetCX, t) * m.cellSize;
            const y = lerp(startCY, targetCY, t) * m.cellSize;

            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.fillStyle = EFFECT_COLORS.projectile;
            ctx.globalAlpha = 0.14; ctx.beginPath(); ctx.arc(x, y, rad * 2.2, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 0.28; ctx.beginPath(); ctx.arc(x, y, rad * 1.5, 0, Math.PI * 2); ctx.fill();
            ctx.globalAlpha = 1.00; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    }

    private drawSnakes(ctx: CanvasRenderingContext2D, m: Metrics, t: number) {
        const g = this.curr!, prev = this.prev;

        for (const s of g.snakes) {
            const prevSnake = prev?.snakes.find(x => x.id === s.id);
            const info = g.players[s.id];
            const isMe = s.id === this.playerId;
            const isGhost = info?.activeEffects.isGhostUntil > Date.now();
            const isDead = this.deadIds.has(s.id);
            const hasSpeed = info?.activeEffects.speedBoostUntil > Date.now();

            const baseOpacity = isDead ? 0.45 : isGhost ? 0.40 : 0.98;
            const baseColor = isDead ? SNAKE_COLORS.dead : isMe ? SNAKE_COLORS.me : SNAKE_COLORS.other;

            const rc = (hex: string, off: number) => parseInt(hex.slice(1 + off, 3 + off), 16);
            const rgba = `rgba(${rc(baseColor, 0)}, ${rc(baseColor, 2)}, ${rc(baseColor, 4)}, ${baseOpacity})`;
            const radius = Math.max(2, m.cellSize * 0.18);

            for (let i = 0; i < s.body.length; i++) {
                const cur = s.body[i];
                let prevSeg = prevSnake?.body[i];
                if (!prevSeg && prevSnake?.body.length) prevSeg = prevSnake.body[prevSnake.body.length - 1];

                const sx = prevSeg?.x ?? cur.x, sy = prevSeg?.y ?? cur.y;
                const x = lerp(sx, cur.x, t) * m.cellSize, y = lerp(sy, cur.y, t) * m.cellSize;

                // ---- УСКОРЕНИЕ: сияние вокруг КАЖДОГО сегмента ----
                if (hasSpeed) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    const cx = x + m.cellSize / 2, cy = y + m.cellSize / 2;
                    const rOuter = Math.max(6, m.cellSize * 0.85);
                    ctx.fillStyle = EFFECT_COLORS.speedBoostGlow;
                    ctx.globalAlpha = 0.10; ctx.beginPath(); ctx.arc(cx, cy, rOuter, 0, Math.PI * 2); ctx.fill();
                    ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(cx, cy, rOuter * 0.6, 0, Math.PI * 2); ctx.fill();
                    ctx.restore();
                }

                // Тело
                ctx.fillStyle = rgba;
                this.roundRect(ctx, x, y, m.cellSize, m.cellSize, radius);
                ctx.fill();

                // Обводка (тонкая и очень лёгкая)
                ctx.strokeStyle = 'rgba(2, 6, 23, 0.10)';
                ctx.lineWidth = 1;
                this.roundRect(ctx, x, y, m.cellSize, m.cellSize, radius);
                ctx.stroke();

                // Призрак
                if (isGhost) {
                    ctx.fillStyle = EFFECT_COLORS.ghostOverlay;
                    this.roundRect(ctx, x, y, m.cellSize, m.cellSize, radius);
                    ctx.fill();
                }

                // Голова — глаза с лёгким свечением
                if (i === 0) {
                    // Тёмные «пиксельные» глаза
                    ctx.fillStyle = SNAKE_COLORS.eyes;
                    const eye = Math.max(2, m.cellSize * 0.22);
                    const off = Math.max(2, m.cellSize * 0.18);
                    const ex1 = x + off, ey1 = y + off;
                    const ex2 = x + m.cellSize - off - eye, ey2 = y + off;

                    // Сами глаза
                    ctx.fillRect(ex1, ey1, eye, eye);
                    ctx.fillRect(ex2, ey2, eye, eye);
                }
            }
        }
    }

    private drawNicknames(ctx: CanvasRenderingContext2D, m: Metrics, t: number) {
        const g = this.curr!, prev = this.prev;
        for (const s of g.snakes) {
            const nickname = g.players[s.id]?.nickname || '';
            if (!s.body.length) continue;
            const prevSnake = prev?.snakes.find(x => x.id === s.id);
            const curHead = s.body[0];
            const prevHead = prevSnake?.body[0] || curHead;
            const tx = lerp(prevHead.x, curHead.x, t) * m.cellSize + m.cellSize / 2;
            const ty = lerp(prevHead.y, curHead.y, t) * m.cellSize - Math.max(6, m.cellSize * 0.3);

            const key = `${s.id}:${nickname}`;
            let sprite = this.nameCache.get(key);
            if (!sprite) {
                const cnv = document.createElement('canvas');
                cnv.width = 220; cnv.height = 34;
                const c = cnv.getContext('2d');
                if (c) {
                    c.clearRect(0, 0, cnv.width, cnv.height);
                    c.fillStyle = SNAKE_COLORS.nickname;
                    c.font = '600 12px system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
                    c.textAlign = 'center';
                    // Небольшая светлая «подложка» вокруг текста для читабельности
                    c.shadowColor = 'rgba(255,255,255,0.75)';
                    c.shadowBlur = 2;
                    c.fillText(nickname, cnv.width / 2, cnv.height / 2 + 4);
                    c.shadowBlur = 0;
                }
                this.nameCache.set(key, cnv);
                sprite = cnv;
            }
            if (sprite) ctx.drawImage(sprite, Math.round(tx - sprite.width / 2), Math.round(ty - sprite.height / 2));
        }
    }

    private drawVfx(ctx: CanvasRenderingContext2D, m: Metrics) {
        const now = Date.now();
        for (const fx of this.vfx) {
            const age = now - fx.createdAt, k = Math.max(0, age / fx.duration);
            if (k > 1) continue;
            const cx = fx.x * m.cellSize + m.cellSize / 2;
            const cy = fx.y * m.cellSize + m.cellSize / 2;

            ctx.save();
            if (fx.type === 'sparkle') {
                const count = 5, maxR = m.cellSize * 0.8;
                for (let j = 0; j < count; j++) {
                    const ang = (j / count) * Math.PI * 2;
                    const rad = maxR * k;
                    const x = cx + Math.cos(ang) * rad, y = cy + Math.sin(ang) * rad;
                    ctx.fillStyle = `rgba(251,191,36, ${1 - k})`;
                    ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, m.cellSize * 0.12) * (1 - k), 0, Math.PI * 2); ctx.fill();
                }
            } else {
                const rad = m.cellSize * 1.5 * k;
                ctx.fillStyle = EFFECT_COLORS.vfxExplosion;
                ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }
    }

    private drawResizeBanner(ctx: CanvasRenderingContext2D, m: Metrics) {
        const p = this.curr!.pendingResize; if (!p) return;
        const fillAt = p.announcedAt + p.warnMs, shrinkAt = fillAt + p.killMs, now = Date.now();

        let text = '';
        if (now < fillAt) text = `Zone turns deadly in ${((fillAt - now) / 1000).toFixed(1)}s (target ${p.to}x${p.to})`;
        else if (now < shrinkAt) text = `Shrinking in ${((shrinkAt - now) / 1000).toFixed(1)}s (to ${p.to}x${p.to})`;
        else text = 'Shrinking...';

        ctx.save();
        const fs = Math.max(12, m.cellSize * 0.7);
        ctx.font = `700 ${fs}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
        const padX = 12, padY = 6;
        const mt = ctx.measureText(text);
        const boxW = mt.width + padX * 2, boxH = fs + padY * 2;
        const boxX = (m.canvasSize - boxW) / 2, boxY = Math.max(8, m.cellSize * 0.15);

        // Светлая «плашка» с тонкой тенью вместо тёмной
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(boxX, boxY, boxW, boxH);
        ctx.fillStyle = '#0F172A';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, m.canvasSize / 2, boxY + boxH / 2);
        ctx.restore();
    }

    // --- Post FX ---

    private postFx(ctx: CanvasRenderingContext2D, m: Metrics) {
        ctx.save();
        if (!this.vignette) {
            const g = ctx.createRadialGradient(
                m.canvasSize / 2, m.canvasSize / 2, m.canvasSize * 0.30,
                m.canvasSize / 2, m.canvasSize / 2, m.canvasSize * 0.75
            );
            g.addColorStop(0.0, 'rgba(255,255,255,0.00)');
            g.addColorStop(1.0, 'rgba(15,23,42,0.06)');
            this.vignette = g;
        }
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = this.vignette;
        ctx.fillRect(0, 0, m.canvasSize, m.canvasSize);
        ctx.restore();

        // Зерно — почти незаметное
        const pattern = this.ensureNoisePattern();
        if (pattern) {
            ctx.save();
            ctx.globalAlpha = 0.02;
            ctx.globalCompositeOperation = 'overlay';
            ctx.fillStyle = pattern;
            ctx.fillRect(0, 0, m.canvasSize, m.canvasSize);
            ctx.restore();
        }
    }

    private drawGameOverBanner(ctx: CanvasRenderingContext2D, m: Metrics, now: number, info: GameOverInfo) {
        ctx.save();

        const realNow = Date.now();
        const remain = Math.max(0, info.resetAt - realNow);
        const seconds = Math.floor(remain / 1000);
        const secondsStr = seconds.toString().padStart(2, '0');

        ctx.fillStyle = 'rgba(247, 250, 252, 0.85)';
        ctx.fillRect(0, 0, m.canvasSize, m.canvasSize);

        // 2. Центральный блок
        const boxW = m.canvasSize * 0.75, boxH = m.canvasSize * 0.40;
        const boxX = (m.canvasSize - boxW) / 2, boxY = (m.canvasSize - boxH) / 2;

        ctx.shadowColor = 'rgba(2, 6, 23, 0.08)';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#FFFFFF';
        this.roundRect(ctx, boxX, boxY, boxW, boxH, 16);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Тексты
        const titleY = boxY + boxH * 0.25;
        ctx.fillStyle = SNAKE_COLORS.me;
        ctx.font = `700 ${Math.max(24, m.canvasSize * 0.04)}px system-ui`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('ROUND WINNER', m.canvasSize / 2, titleY);

        const nicknameY = titleY + Math.max(8, m.canvasSize * 0.05);
        ctx.fillStyle = '#0F172A';
        ctx.font = `700 ${Math.max(36, m.canvasSize * 0.07)}px system-ui`;
        ctx.fillText(info.winnerNickname, m.canvasSize / 2, nicknameY);

        const winnerScore = this.curr!.players[info.winnerId]?.score ?? 'N/A';
        const scoreY = nicknameY + Math.max(6, m.canvasSize * 0.04);
        ctx.fillStyle = '#0EA5A6';
        ctx.font = `700 ${Math.max(24, m.canvasSize * 0.04)}px system-ui`;
        ctx.fillText(`Score: ${winnerScore}`, m.canvasSize / 2, scoreY);

        const timerY = boxY + boxH * 0.85;
        ctx.fillStyle = seconds === 0 ? BLOCK_COLORS.kill : 'rgba(15, 23, 42, 0.6)'; // (было '#52525B')
        ctx.font = `600 ${Math.max(18, m.canvasSize * 0.03)}px system-ui`;
        ctx.fillText(`Restarting in ${secondsStr} seconds...`, m.canvasSize / 2, timerY);

        ctx.restore();
    }

    private ensureNoisePattern(): CanvasPattern | null {
        if (this.noisePattern) return this.noisePattern;
        const size = 128;
        const cnv = document.createElement('canvas');
        cnv.width = size; cnv.height = size;
        const c = cnv.getContext('2d'); if (!c) return null;

        const img = c.createImageData(size, size);
        for (let i = 0; i < img.data.length; i += 4) {
            const v = 200 + (Math.random() * 30 - 15); // светлое, почти незаметное
            img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 8;
        }
        c.putImageData(img, 0, 0);
        this.noisePattern = c.createPattern(cnv, 'repeat');
        return this.noisePattern;
    }
}
