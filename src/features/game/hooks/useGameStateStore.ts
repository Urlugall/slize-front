import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import type { GameOverInfo, GameState } from '@/features/game/types';
import { soundManager } from '@/features/game/lib/SoundManager';
import { findPlayerDirection, type Direction } from '@/features/game/lib/client/direction';
import type { VFX } from '@/features/game/canvas/types';
import { GAME_TIMING, NET_SMOOTHING } from '@/features/game/config';

interface UseGameStateStoreParams {
  playerId: string | null;
}

interface HandleStateParams {
  state: GameState;
  receivedAt: number;
}

export interface GameStateStore {
  previousState: GameState | null;
  currentState: GameState | null;
  lastStateTimestamp: number;
  snapshots: Array<{ t: number; state: GameState }>;
  interpDelayMs: number;
  gameOverInfo: GameOverInfo | null;
  deadPlayerIds: Set<string>;
  vfx: VFX[];
  currentStateRef: MutableRefObject<GameState | null>;
  myCurrentDirectionRef: MutableRefObject<Direction | null>;
  lastSentDirectionRef: MutableRefObject<Direction | null>;
  handleStateMessage: (params: HandleStateParams) => void;
  handleGameOver: (info: GameOverInfo) => void;
  handlePlayerDied: (playerId: string) => void;
  resetState: () => void;
  appendVfx: (entry: VFX) => void;
  setGameOverInfo: (info: GameOverInfo | null) => void;
}

export function useGameStateStore({ playerId }: UseGameStateStoreParams): GameStateStore {
  const [previousState, setPreviousState] = useState<GameState | null>(null);
  const [currentState, setCurrentState] = useState<GameState | null>(null);
  const [lastStateTimestamp, setLastStateTimestamp] = useState(0);
  const [gameOverInfo, setGameOverInfo] = useState<GameOverInfo | null>(null);
  const [deadPlayerIds, setDeadPlayerIds] = useState<Set<string>>(new Set());
  const [vfx, setVfx] = useState<VFX[]>([]);

  const currentStateRef = useRef<GameState | null>(null);
  const previousStateForEffectsRef = useRef<GameState | null>(null);
  const myCurrentDirectionRef = useRef<Direction | null>(null);
  const lastSentDirectionRef = useRef<Direction | null>(null);

  const [snapshots, setSnapshots] = useState<Array<{ t: number; state: GameState }>>([]);
  const lastInterArrivalRef = useRef<number | null>(null);
  const jitterEmaRef = useRef(0);
  const [interpDelayMs, setInterpDelayMs] = useState<number>(NET_SMOOTHING.interpBaseMs);

  useEffect(() => {
    currentStateRef.current = currentState;
  }, [currentState]);

  const resetState = useCallback(() => {
    setPreviousState(null);
    setCurrentState(null);
    setLastStateTimestamp(0);
    setGameOverInfo(null);
    setDeadPlayerIds(new Set());
    setVfx([]);
    previousStateForEffectsRef.current = null;
    myCurrentDirectionRef.current = null;
    lastSentDirectionRef.current = null;
  }, []);

  const appendVfx = useCallback((entry: VFX) => {
    setVfx((prev) => [...prev, entry]);
  }, []);

  const handleStateMessage = useCallback(
    ({ state, receivedAt }: HandleStateParams) => {
      // 1) обновляем "традиционные" поля
      setCurrentState((prev) => {
        setPreviousState(prev);
        previousStateForEffectsRef.current = prev;
        if (state.gameOver) setGameOverInfo(state.gameOver);
        return state;
      });
      setLastStateTimestamp(receivedAt);

      // 2) пушим в буфер
      setSnapshots((prev) => {
        const next = [...prev, { t: receivedAt, state }];
        if (next.length > NET_SMOOTHING.snapshotBuffer) next.shift();
        return next;
      });

      // 3) оцениваем джиттер межпакетных интервалов
      const expected = GAME_TIMING.serverTickRate; // целимcя в 1 тик
      const lastT = lastInterArrivalRef.current;
      if (lastT != null) {
        const ia = receivedAt - lastT; // inter-arrival
        const dev = Math.abs(ia - expected);
        jitterEmaRef.current =
          (1 - NET_SMOOTHING.jitterAlpha) * jitterEmaRef.current +
          NET_SMOOTHING.jitterAlpha * dev;
        const adaptive =
          NET_SMOOTHING.interpBaseMs +
          NET_SMOOTHING.jitterFactor * jitterEmaRef.current;
        setInterpDelayMs(
          Math.max(NET_SMOOTHING.interpMinMs, Math.min(NET_SMOOTHING.interpMaxMs, adaptive)),
        );
      }
      lastInterArrivalRef.current = receivedAt;
    },
    [],
  );

  const handleGameOver = useCallback((info: GameOverInfo) => {
    setGameOverInfo(info);
    soundManager.play('death');
  }, []);

  const handlePlayerDied = useCallback(
    (id: string) => {
      soundManager.play('death');
      const fallbackState = previousStateForEffectsRef.current || currentStateRef.current;
      const deadSnake = fallbackState?.snakes.find((snake) => snake.id === id);
      if (deadSnake?.body.length) {
        const head = deadSnake.body[0];
        appendVfx({
          id: Date.now(),
          type: 'explosion',
          x: head.x,
          y: head.y,
          createdAt: Date.now(),
          duration: 400,
        });
      }
      setDeadPlayerIds((prevIds) => {
        const next = new Set(prevIds);
        next.add(id);
        return next;
      });
      window.setTimeout(() => {
        setDeadPlayerIds((prevIds) => {
          const next = new Set(prevIds);
          next.delete(id);
          return next;
        });
      }, 500);
    },
    [appendVfx],
  );

  useEffect(() => {
    if (!currentState || !playerId) {
      myCurrentDirectionRef.current = null;
      return;
    }

    myCurrentDirectionRef.current = findPlayerDirection(currentState, playerId);
    if (!myCurrentDirectionRef.current) {
      lastSentDirectionRef.current = null;
    }

    const previousStateForEffects = previousStateForEffectsRef.current;
    if (!previousStateForEffects) return;

    const myOldPlayer = previousStateForEffects.players[playerId];
    const myNewPlayer = currentState.players[playerId];
    const myOldSnake = previousStateForEffects.snakes.find((snake) => snake.id === playerId);
    const myNewSnake = currentState.snakes.find((snake) => snake.id === playerId);

    if (!currentState.gameOver && gameOverInfo) {
      setGameOverInfo(null);
    }

    if (myNewPlayer && myOldPlayer && myNewSnake && myOldSnake) {
      if (myNewSnake.body.length > myOldSnake.body.length) {
        soundManager.play('eat');
        const head = myNewSnake.body[0];
        appendVfx({
          id: Date.now(),
          type: 'sparkle',
          x: head.x,
          y: head.y,
          createdAt: Date.now(),
          duration: 300,
        });
      }

      const pickedUp = myNewPlayer.powerUpSlots.some(
        (slot, index) => slot && !myOldPlayer.powerUpSlots[index],
      );
      if (pickedUp) soundManager.play('powerup');
    }

    if (currentState.projectiles.length > previousStateForEffects.projectiles.length) {
      const myNewProjectile = currentState.projectiles.find(
        (projectile) =>
          projectile.ownerId === playerId &&
          !previousStateForEffects.projectiles.some(
            (prevProjectile) => prevProjectile.id === projectile.id,
          ),
      );
      if (myNewProjectile) soundManager.play('shoot');
    }
  }, [appendVfx, currentState, gameOverInfo, playerId]);

  return {
    previousState,
    currentState,
    lastStateTimestamp,
    snapshots,
    interpDelayMs,
    gameOverInfo,
    deadPlayerIds,
    vfx,
    currentStateRef,
    myCurrentDirectionRef,
    lastSentDirectionRef,
    handleStateMessage,
    handleGameOver,
    handlePlayerDied,
    resetState,
    appendVfx,
    setGameOverInfo,
  };
}

