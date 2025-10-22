import { GAME_TIMING } from '@/features/game/config';
import {
    drawBlocks,
    drawFood,
    drawPowerUps,
    drawProjectiles,
    drawSnakes,
} from '@/features/game/canvas/renderer/entities';
import {
    applyPostFx,
    createPostFxState,
    drawGameOverBanner,
    drawVfx,
} from '@/features/game/canvas/renderer/effects';
import { createGridState, drawGridLayer, drawGridImmediate, computeGridTransition } from '@/features/game/canvas/renderer/grid';
import { drawNicknames, drawResizeBanner } from '@/features/game/canvas/renderer/hud';
import { configureCanvas, resolveMetrics } from '@/features/game/canvas/renderer/metrics';
import type { VFX } from '@/features/game/canvas/types';
import type { GameOverInfo, GameState } from '@/features/game/types';

export class CanvasRenderer {
    private readonly staticCanvas: HTMLCanvasElement;
    private readonly dynamicCanvas: HTMLCanvasElement;

    private previousState: GameState | null = null;
    private currentState: GameState | null = null;
    private lastStateTimestamp = 0;
    private playerId: string | null = null;
    private deadIds: Set<string> = new Set();
    private vfx: VFX[] = [];
    private gameOverInfo: GameOverInfo | null | undefined = null;

    private readonly gridState = createGridState();
    private readonly postFxState = createPostFxState();
    private readonly nameCache = new Map<string, HTMLCanvasElement>();

    constructor(staticCanvas: HTMLCanvasElement, dynamicCanvas: HTMLCanvasElement) {
        this.staticCanvas = staticCanvas;
        this.dynamicCanvas = dynamicCanvas;
    }

    setPreviousState(state: GameState | null) {
        this.previousState = state;
    }

    setCurrentState(state: GameState | null) {
        this.currentState = state;
    }

    setLastStateTimestamp(timestamp: number) {
        this.lastStateTimestamp = timestamp;
    }

    setPlayerId(id: string | null) {
        this.playerId = id;
    }

    setDeadIds(ids: Set<string>) {
        this.deadIds = ids;
    }

    setVfx(list: VFX[]) {
        this.vfx = list;
    }

    setGameOver(info: GameOverInfo | null | undefined) {
        this.gameOverInfo = info;
    }

    draw(now: number) {
        if (!this.currentState) return;
        const metrics = resolveMetrics(this.currentState.gridSize);
        if (!metrics) return;

        // Статический слой: фон
        configureCanvas(this.staticCanvas, metrics, {
            isStatic: true,
            onResize: () => {
                this.postFxState.vignette = null;
                this.postFxState.noisePattern = null;
            },
        });

        // Динамический слой: всё содержимое игры
        const ctx = configureCanvas(this.dynamicCanvas, metrics, {
            isStatic: false,
            onResize: () => {
                this.postFxState.vignette = null;
                this.postFxState.noisePattern = null;
            },
        });
        if (!ctx) return;

        ctx.clearRect(0, 0, metrics.canvasSize, metrics.canvasSize);

        const { cellSize: visualCellSize } = computeGridTransition(metrics, now, this.gridState);
        const scale = visualCellSize / metrics.cellSize;

        // Центрируем масштаб относительно центра холста
        const cx = metrics.canvasSize / 2;
        const cy = metrics.canvasSize / 2;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);

        const tB = this.lastStateTimestamp;
        const tA = tB - GAME_TIMING.serverTickRate; // между пакетами у нас 1 тик
        const target = now; // сюда прокинут performance.now() из GameCanvas уже «смещённый»
        const elapsedSinceState = Math.max(0, target - tA);
        const denom = Math.max(1, tB - tA);
        const interpolation = Math.min(Math.max(elapsedSinceState / denom, 0), 1);

        // Сетка — теперь «мгновенная», плавность даёт общий масштаб
        drawGridImmediate(ctx, metrics);

        // Сущности сцены
        drawBlocks(ctx, metrics, this.currentState);
        drawFood(ctx, metrics, this.currentState);
        drawPowerUps(ctx, metrics, this.currentState);
        drawProjectiles(ctx, metrics, this.currentState, this.previousState, interpolation);
        drawSnakes({
            ctx,
            current: this.currentState,
            previous: this.previousState,
            metrics,
            playerId: this.playerId,
            deadIds: this.deadIds,
            interpolation,
            elapsedSinceState,
        });
        drawNicknames(ctx, metrics, this.currentState, this.previousState, interpolation, this.nameCache);
        drawVfx(ctx, metrics, this.vfx);
        drawResizeBanner(ctx, metrics, this.currentState);

        // Постэффекты и баннер победы — тоже попадают под общий масштаб
        applyPostFx(ctx, metrics, this.postFxState);

        if (this.gameOverInfo) {
            drawGameOverBanner(ctx, metrics, this.gameOverInfo);
        }

        ctx.restore();
    }
}

