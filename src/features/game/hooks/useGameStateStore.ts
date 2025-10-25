import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import type {
  GameOverInfo,
  GameState,
  HotGameState,
  PlayerInfo,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  PlayerListPayload,
  PowerUpUpdatePayload,
  ScoreUpdatePayload,
} from '@/features/game/types';
import { soundManager } from '@/features/game/lib/SoundManager';
import { findPlayerDirection, type Direction } from '@/features/game/lib/client/direction';
import type { VFX } from '@/features/game/canvas/types';

const clonePlayerInfo = (player: PlayerInfo): PlayerInfo => ({
  nickname: player.nickname,
  score: player.score,
  powerUpSlots: [...player.powerUpSlots],
  teamId: player.teamId,
  activeEffects: {
    speedBoostUntil: player.activeEffects.speedBoostUntil,
    isGhostUntil: player.activeEffects.isGhostUntil,
  },
});

interface UseGameStateStoreParams {
  playerId: string | null;
}

interface HandleStateParams {
  state: HotGameState;
  receivedAt: number;
}

export interface GameStateStore {
  previousState: GameState | null;
  currentState: GameState | null;
  lastStateTimestamp: number;
  gameOverInfo: GameOverInfo | null;
  deadPlayerIds: Set<string>;
  vfx: VFX[];
  currentStateRef: MutableRefObject<GameState | null>;
  myCurrentDirectionRef: MutableRefObject<Direction | null>;
  lastSentDirectionRef: MutableRefObject<Direction | null>;
  handleStateMessage: (params: HandleStateParams) => void;
  handlePlayerList: (payload: PlayerListPayload) => void;
  handlePlayerJoined: (payload: PlayerJoinedPayload) => void;
  handlePlayerLeft: (payload: PlayerLeftPayload) => void;
  handleScoreUpdate: (payload: ScoreUpdatePayload) => void;
  handlePowerupUpdate: (payload: PowerUpUpdatePayload) => void;
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
  const playersRef = useRef<Record<string, PlayerInfo>>({});
  const slotToPlayerIdRef = useRef<Map<number, string>>(new Map());
  const playerIdToSlotRef = useRef<Map<string, number>>(new Map());
  const isGameOverActiveRef = useRef(false);

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
    isGameOverActiveRef.current = false;
    previousStateForEffectsRef.current = null;
    myCurrentDirectionRef.current = null;
    lastSentDirectionRef.current = null;
    playersRef.current = {};
    slotToPlayerIdRef.current = new Map();
    playerIdToSlotRef.current = new Map();
  }, []);

  const appendVfx = useCallback((entry: VFX) => {
    setVfx((prev) => [...prev, entry]);
  }, []);

  const updatePlayersInState = useCallback(() => {
    setCurrentState((prev) => {
      if (!prev) return prev;
      const nextPlayers: Record<string, PlayerInfo> = {};
      for (const [id, info] of Object.entries(playersRef.current)) {
        nextPlayers[id] = clonePlayerInfo(info);
      }
      return {
        ...prev,
        players: nextPlayers,
      };
    });
  }, []);

  const handleStateMessage = useCallback(
    ({ state: hotState, receivedAt }: HandleStateParams) => {
      if (isGameOverActiveRef.current) {
        setGameOverInfo(null); // Скрыть баннер
        isGameOverActiveRef.current = false; // Сбросить флаг
      }

      const resolvePlayerId = (identifier: number | string): string => {
        if (typeof identifier === 'string') return identifier;
        return slotToPlayerIdRef.current.get(identifier) ?? String(identifier);
      };

      const snakes = hotState.snakes.map((snake) => ({
        ...snake,
        id: resolvePlayerId(snake.id),
      }));

      const projectiles = hotState.projectiles.map((projectile) => ({
        ...projectile,
        ownerId: resolvePlayerId(projectile.ownerId),
      }));

      const players: Record<string, PlayerInfo> = {};
      for (const [id, info] of Object.entries(playersRef.current)) {
        players[id] = clonePlayerInfo(info);
      }

      const mergedState: GameState = {
        ...hotState,
        snakes,
        projectiles,
        players,
        gameOver: undefined,
      };

      setCurrentState((prev) => {
        setPreviousState(prev);
        previousStateForEffectsRef.current = prev;
        return mergedState;
      });
      setLastStateTimestamp(receivedAt);
    },
    [setGameOverInfo],
  );

  const handlePlayerList = useCallback(
    ({ players, slotAssignments }: PlayerListPayload) => {
      const nextPlayers: Record<string, PlayerInfo> = {};
      for (const [id, info] of Object.entries(players)) {
        nextPlayers[id] = clonePlayerInfo(info);
      }
      playersRef.current = nextPlayers;
      slotToPlayerIdRef.current = new Map(
        slotAssignments.map(({ slotId, playerId }) => [slotId, playerId] as const),
      );
      playerIdToSlotRef.current = new Map(
        slotAssignments.map(({ slotId, playerId }) => [playerId, slotId] as const),
      );
      updatePlayersInState();
    },
    [updatePlayersInState],
  );

  const handlePlayerJoined = useCallback(
    ({ playerId, slotId, player }: PlayerJoinedPayload) => {
      playersRef.current = {
        ...playersRef.current,
        [playerId]: clonePlayerInfo(player),
      };
      slotToPlayerIdRef.current.set(slotId, playerId);
      playerIdToSlotRef.current.set(playerId, slotId);
      updatePlayersInState();
    },
    [updatePlayersInState],
  );

  const handlePlayerLeft = useCallback(
    ({ playerId, slotId }: PlayerLeftPayload) => {
      if (!(playerId in playersRef.current)) return;
      const nextPlayers = { ...playersRef.current };
      delete nextPlayers[playerId];
      playersRef.current = nextPlayers;
      slotToPlayerIdRef.current.delete(slotId);
      playerIdToSlotRef.current.delete(playerId);
      updatePlayersInState();
    },
    [updatePlayersInState],
  );

  const handleScoreUpdate = useCallback(
    ({ playerId, score }: ScoreUpdatePayload) => {
      const existing = playersRef.current[playerId];
      if (!existing || existing.score === score) return;
      playersRef.current = {
        ...playersRef.current,
        [playerId]: {
          ...existing,
          score,
        },
      };
      updatePlayersInState();
    },
    [updatePlayersInState],
  );

  const handlePowerupUpdate = useCallback(
    ({ playerId, powerUpSlots, activeEffects }: PowerUpUpdatePayload) => {
      const existing = playersRef.current[playerId];
      if (!existing) return;

      const nowClient = performance.now(); // Время клиента для сравнения

      let shouldUpdate = existing.powerUpSlots.length !== powerUpSlots.length;
      if (!shouldUpdate) {
        shouldUpdate = existing.powerUpSlots.some((slot, index) => slot !== powerUpSlots[index]);
      }
      const sameEffects =
        existing.activeEffects.speedBoostUntil === activeEffects.speedBoostUntil &&
        existing.activeEffects.isGhostUntil === activeEffects.isGhostUntil;
      if (!shouldUpdate && sameEffects) {
        return;
      }
      playersRef.current = {
        ...playersRef.current,
        [playerId]: {
          ...existing,
          powerUpSlots: [...powerUpSlots],
          activeEffects: {
            speedBoostUntil: activeEffects.speedBoostUntil,
            isGhostUntil: activeEffects.isGhostUntil,
          },
        },
      };
      updatePlayersInState();
    },
    [updatePlayersInState],
  );

  const handleGameOver = useCallback((info: GameOverInfo) => {
    setGameOverInfo(info);
    isGameOverActiveRef.current = true;
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
  }, [appendVfx, currentState, playerId]);

  return {
    previousState,
    currentState,
    lastStateTimestamp,
    gameOverInfo,
    deadPlayerIds,
    vfx,
    currentStateRef,
    myCurrentDirectionRef,
    lastSentDirectionRef,
    handleStateMessage,
    handlePlayerList,
    handlePlayerJoined,
    handlePlayerLeft,
    handleScoreUpdate,
    handlePowerupUpdate,
    handleGameOver,
    handlePlayerDied,
    resetState,
    appendVfx,
    setGameOverInfo,
  };
}

