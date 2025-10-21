// src/features/game/hooks/useGameClient.ts
// Encapsulates all client-side networking and game-loop state for the game feature.

import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  GameModeKey,
  GameOverInfo,
  GameState,
  ServerMessage,
  TeamId,
} from '@/features/game/types';
import { soundManager } from '@/features/game/lib/SoundManager';
import { CLIENT_STATE } from '@/features/game/config';
import type { VFX } from '@/features/game/canvas/CanvasRenderer';

export type ConnectionStatus =
  | 'disconnected'
  | 'authenticating'
  | 'finding_lobby'
  | 'connecting'
  | 'connected';

type Direction = 'up' | 'down' | 'left' | 'right';

const isServerMessage = (data: unknown): data is ServerMessage => {
  if (!data || typeof data !== 'object') return false;
  const maybe = data as { type?: unknown; payload?: unknown };
  if (typeof maybe.type !== 'string') return false;

  switch (maybe.type) {
    case 'state':
      return typeof maybe.payload === 'object' && maybe.payload !== null;
    case 'player_joined':
      return (
        !!maybe.payload &&
        typeof (maybe.payload as { playerId?: unknown }).playerId === 'string' &&
        typeof (maybe.payload as { nickname?: unknown }).nickname === 'string'
      );
    case 'player_left':
    case 'player_died':
      return (
        !!maybe.payload &&
        typeof (maybe.payload as { playerId?: unknown }).playerId === 'string'
      );
    case 'game_over':
      return (
        !!maybe.payload &&
        typeof (maybe.payload as { winnerId?: unknown }).winnerId === 'string' &&
        typeof (maybe.payload as { winnerNickname?: unknown }).winnerNickname === 'string' &&
        typeof (maybe.payload as { resetAt?: unknown }).resetAt === 'number' &&
        typeof (maybe.payload as { winnerScore?: unknown }).winnerScore === 'number'
      );
    case 'team_switched':
      return (
        !!maybe.payload &&
        typeof (maybe.payload as { playerId?: unknown }).playerId === 'string' &&
        typeof (maybe.payload as { teamId?: unknown }).teamId === 'string'
      );
    case 'team_switch_denied':
      return (
        !!maybe.payload &&
        typeof (maybe.payload as { reason?: unknown }).reason === 'string'
      );
    default:
      return false;
  }
};

const parseWsMessage = (data: unknown): ServerMessage | null => {
  if (typeof data !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return isServerMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const getDirectionFromSnake = (snake: { body: { x: number; y: number }[] }): Direction | null => {
  if (snake.body.length < 2) return null;
  const [head, neck] = snake.body;
  if (head.x > neck.x) return 'right';
  if (head.x < neck.x) return 'left';
  if (head.y > neck.y) return 'down';
  if (head.y < neck.y) return 'up';
  return null;
};

const isOpposite = (a: Direction, b: Direction) =>
  (a === 'up' && b === 'down') ||
  (a === 'down' && b === 'up') ||
  (a === 'left' && b === 'right') ||
  (a === 'right' && b === 'left');

export interface UseGameClientResult {
  nickname: string;
  setNickname: (value: string) => void;
  mode: GameModeKey;
  setMode: (value: GameModeKey) => void;
  status: ConnectionStatus;
  error: string | null;
  isLocked: boolean;
  previousState: GameState | null;
  currentState: GameState | null;
  lastStateTimestamp: number;
  playerId: string | null;
  gameOverInfo: GameOverInfo | null;
  deadPlayerIds: Set<string>;
  vfx: VFX[];
  handleConnect: () => Promise<void>;
  handleDisconnect: () => void;
  handleSwitchTeam: (teamId: TeamId) => void;
  handleUsePowerUp: (slot: number) => void;
  isSilentlyReconnecting: boolean;
}

export function useGameClient(): UseGameClientResult {
  const [nickname, setNickname] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<GameModeKey>('free_for_all');

  const [isLocked, setIsLocked] = useState(false);
  const lockIdRef = useRef<string | null>(null);

  const [previousState, setPreviousState] = useState<GameState | null>(null);
  const [currentState, setCurrentState] = useState<GameState | null>(null);
  const [lastStateTimestamp, setLastStateTimestamp] = useState(0);
  const previousStateForEffectsRef = useRef<GameState | null>(null);
  const [gameOverInfo, setGameOverInfo] = useState<GameOverInfo | null>(null);

  const currentStateRef = useRef<GameState | null>(null);
  const [vfx, setVfx] = useState<VFX[]>([]);
  const [deadPlayerIds, setDeadPlayerIds] = useState<Set<string>>(new Set());
  const [isSilentlyReconnecting, setIsSilentlyReconnecting] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const animationFrameId = useRef<number | null>(null);
  const connectingRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const closingRef = useRef(false);
  const unloadingRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const lastTurnSentAtRef = useRef(0);
  const lastLobbyIdRef = useRef<string | null>(null);

  const handleConnectRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const reconnectToLobbyRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const scheduleReconnectRef = useRef<() => void>(() => { });

  const latestDirectionInputRef = useRef<Direction | null>(null);
  const lastSentDirectionRef = useRef<Direction | null>(null);
  const myCurrentDirectionRef = useRef<Direction | null>(null);

  const silentReconnectingRef = useRef(false);
  const inputQueueRef = useRef<Array<{ t: number; msg: object }>>([]);

  const sendWsMessage = useCallback((message: object) => {
    const sock = socketRef.current;
    if (sock && sock.readyState === WebSocket.OPEN) {
      sock.send(JSON.stringify(message));
    } else {
      // на случай короткого реконнекта — буферим последние 300мс команд
      inputQueueRef.current.push({ t: performance.now(), msg: message });
      // чистим старые
      const cutoff = performance.now() - 300;
      inputQueueRef.current = inputQueueRef.current.filter((x) => x.t >= cutoff);
    }
  }, []);

  const scheduleSilentReconnect = useCallback(() => {
    if (manualDisconnectRef.current || closingRef.current || unloadingRef.current) return;
    if (reconnectTimerRef.current) return;

    silentReconnectingRef.current = true;
    setIsSilentlyReconnecting(true);

    const attempt = (reconnectAttemptRef.current += 1);
    const delay = Math.min(3200, 200 * Math.pow(2, attempt - 1));
    reconnectTimerRef.current = window.setTimeout(async () => {
      reconnectTimerRef.current = null;
      try {
        if (token && playerId && nickname.trim()) {
          await reconnectToLobbyRef.current(); // НЕ трогаем lastLobbyId
        } else {
          await handleConnectRef.current();
        }
      } catch {
        scheduleSilentReconnect(); // повтор
      }
    }, delay) as unknown as number;
  }, [nickname, playerId, token]);

  const handleUsePowerUp = useCallback(
    (slot: number) => {
      if (!currentState || !playerId) return;
      const me = currentState.players[playerId];
      if (!me?.powerUpSlots[slot]) return;
      sendWsMessage({ action: 'use_powerup', slot });
    },
    [currentState, playerId, sendWsMessage],
  );

  const handleSwitchTeam = useCallback(
    (teamId: TeamId) => {
      sendWsMessage({ action: 'switch_team', teamId });
    },
    [sendWsMessage],
  );

  const cleanupSocketLock = useCallback(() => {
    if (localStorage.getItem(CLIENT_STATE.activeTabLockKey) === lockIdRef.current) {
      localStorage.removeItem(CLIENT_STATE.activeTabLockKey);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    closingRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (socketRef.current) {
      try {
        socketRef.current.close(1001, 'User initiated disconnect');
      } catch {
        /* noop */
      }
    }

    cleanupSocketLock();

    setStatus('disconnected');
    setError(null);
    setCurrentState(null);
    setPreviousState(null);
    previousStateForEffectsRef.current = null;
    setDeadPlayerIds(new Set());
    setGameOverInfo(null);
    lastSentDirectionRef.current = null;
    latestDirectionInputRef.current = null;
    myCurrentDirectionRef.current = null;
  }, [cleanupSocketLock]);

  const reconnectToLobby = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;

    if (!silentReconnectingRef.current) {
      setStatus('connecting'); // <-- только для обычного (несilent) пути
    }
    setError(null);

    try {
      let lobbyId = lastLobbyIdRef.current;
      if (!lobbyId) {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/lobbies/find-best?mode=${mode}`,
          {
            headers: { Authorization: `Bearer ${sessionStorage.getItem('slize_token')}` },
          },
        );
        if (!response.ok) throw new Error('Could not find a lobby.');
        const json = await response.json();
        lobbyId = json.lobbyId as string;
        lastLobbyIdRef.current = lobbyId;
      }

      const authToken = token ?? sessionStorage.getItem('slize_token');
      if (!authToken || !nickname.trim()) throw new Error('Missing session data.');

      const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/lobbies/${lobbyId}/ws?token=${authToken}&nickname=${encodeURIComponent(
        nickname,
      )}&mode=${mode}`;

      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        const queued = inputQueueRef.current;
        inputQueueRef.current = [];
        for (const it of queued) {
          try { socket.send(JSON.stringify(it.msg)); } catch { /* ignore */ }
        }

        connectingRef.current = false;
        manualDisconnectRef.current = false;
        reconnectAttemptRef.current = 0;
        if (!silentReconnectingRef.current) soundManager.play('connect');
        silentReconnectingRef.current = false;
        setIsSilentlyReconnecting(false);

        setStatus('connected');
      };

      socket.onmessage = (event) => {
        if (event.data === 'h' && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send('H');
          return;
        }

        const message = parseWsMessage(event.data);
        if (!message) {
          console.warn('WS non-JSON or unknown message ignored');
          return;
        }

        switch (message.type) {
          case 'state':
            setCurrentState((prev) => {
              setPreviousState(prev);
              previousStateForEffectsRef.current = prev;
              if (message.payload.gameOver) setGameOverInfo(message.payload.gameOver);
              return message.payload;
            });
            setLastStateTimestamp(performance.now());
            break;
          case 'game_over':
            setGameOverInfo(message.payload);
            soundManager.play('death');
            break;
          case 'player_died': {
            soundManager.play('death');
            const previous = previousStateForEffectsRef.current || currentStateRef.current;
            const deadSnake = previous?.snakes.find(
              (snake) => snake.id === message.payload.playerId,
            );
            if (deadSnake?.body.length) {
              const head = deadSnake.body[0];
              setVfx((prevVfx) => [
                ...prevVfx,
                {
                  id: Date.now(),
                  type: 'explosion',
                  x: head.x,
                  y: head.y,
                  createdAt: Date.now(),
                  duration: 400,
                },
              ]);
            }
            setDeadPlayerIds((prevIds) => {
              const next = new Set(prevIds);
              next.add(message.payload.playerId);
              return next;
            });
            setTimeout(() => {
              setDeadPlayerIds((prevIds) => {
                const next = new Set(prevIds);
                next.delete(message.payload.playerId);
                return next;
              });
            }, 500);
            break;
          }
          case 'team_switched':
            soundManager.play('connect');
            break;
          case 'team_switch_denied':
            setError('Cannot switch team right now.');
            setTimeout(() => setError(null), 2000);
            break;
        }
      };

      socket.onclose = (event) => {
        socketRef.current = null;
        connectingRef.current = false;
        cleanupSocketLock();

        if (manualDisconnectRef.current || closingRef.current || unloadingRef.current) {
          manualDisconnectRef.current = false;
          return;
        }

        if (event.code === 4000) return;

        scheduleSilentReconnect();
      };

      socket.onerror = (event) => {
        cleanupSocketLock();
        if (manualDisconnectRef.current || closingRef.current || unloadingRef.current) return;

        scheduleSilentReconnect();
        connectingRef.current = false;

        console.warn('WS error (silent reconnect)', event);
      };
    } catch (err) {
      cleanupSocketLock();
      connectingRef.current = false;

      // если это silent-путь — тоже не дёргаем статус, просто эскалируем повтор
      if (silentReconnectingRef.current) {
        scheduleSilentReconnect();
        return;
      }

      setStatus('disconnected');
      setError(err instanceof Error ? err.message : 'Reconnection failed.');
      throw err;
    }
  }, [cleanupSocketLock, mode, nickname, token, scheduleSilentReconnect]);

  const handleConnect = useCallback(async () => {
    if (connectingRef.current) return;

    const currentLock = localStorage.getItem(CLIENT_STATE.activeTabLockKey);
    if (currentLock && currentLock !== lockIdRef.current) {
      setIsLocked(true);
      setError('Game is active in another tab. Only one tab is allowed.');
      connectingRef.current = false;
      return;
    }

    connectingRef.current = true;
    manualDisconnectRef.current = false;
    closingRef.current = false;
    unloadingRef.current = false;

    if (nickname.trim().length < 3) {
      setError('Nickname must be at least 3 characters.');
      connectingRef.current = false;
      return;
    }

    setError(null);
    setCurrentState(null);
    setPreviousState(null);
    previousStateForEffectsRef.current = null;
    setDeadPlayerIds(new Set());
    setGameOverInfo(null);
    setStatus('authenticating');

    try {
      if (socketRef.current) {
        try {
          socketRef.current.close(1000, 'Reconnecting');
        } catch {
          /* noop */
        }
        socketRef.current = null;
      }

      const authResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientKey: process.env.NEXT_PUBLIC_CLIENT_SECRET }),
      });

      if (!authResponse.ok) throw new Error('Authentication failed. Check client secret.');

      const { token: authToken, playerId: newPlayerId } = await authResponse.json();
      setPlayerId(newPlayerId);
      setToken(authToken);

      try {
        sessionStorage.setItem('slize_token', authToken);
        sessionStorage.setItem('slize_playerId', newPlayerId);
        localStorage.setItem('slize_nickname', nickname);
      } catch {
        /* ignore storage failures */
      }

      setStatus('finding_lobby');

      const lobbyResponse = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/lobbies/find-best?mode=${mode}`,
        { headers: { Authorization: `Bearer ${authToken}` } },
      );
      if (!lobbyResponse.ok) throw new Error('Could not find a lobby.');
      const { lobbyId } = await lobbyResponse.json();
      lastLobbyIdRef.current = lobbyId;

      setStatus('connecting');
      localStorage.setItem(CLIENT_STATE.activeTabLockKey, lockIdRef.current ?? crypto.randomUUID());
      lockIdRef.current = localStorage.getItem(CLIENT_STATE.activeTabLockKey);
      setIsLocked(false);

      const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/lobbies/${lobbyId}/ws?token=${authToken}&nickname=${encodeURIComponent(
        nickname,
      )}&mode=${mode}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      const onBeforeUnload = () => {
        unloadingRef.current = true;
        closingRef.current = true;
        try {
          socket.close(1001, 'Page unloading');
        } catch {
          /* noop */
        }
      };
      window.addEventListener('beforeunload', onBeforeUnload);

      socket.onopen = () => {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }
        setStatus('connected');
        connectingRef.current = false;
        manualDisconnectRef.current = false;
        reconnectAttemptRef.current = 0;
        soundManager.play('connect');
      };

      socket.onmessage = (event) => {
        if (event.data === 'h' && socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send('H');
          return;
        }

        const message = parseWsMessage(event.data);
        if (!message) {
          console.warn('WS non-JSON or unknown message ignored');
          return;
        }

        switch (message.type) {
          case 'state':
            setCurrentState((prev) => {
              setPreviousState(prev);
              previousStateForEffectsRef.current = prev;
              if (message.payload.gameOver) setGameOverInfo(message.payload.gameOver);
              return message.payload;
            });
            setLastStateTimestamp(performance.now());
            break;
          case 'game_over':
            setGameOverInfo(message.payload);
            soundManager.play('death');
            break;
          case 'player_died': {
            soundManager.play('death');
            const previous = previousStateForEffectsRef.current || currentStateRef.current;
            const deadSnake = previous?.snakes.find(
              (snake) => snake.id === message.payload.playerId,
            );
            if (deadSnake?.body.length) {
              const head = deadSnake.body[0];
              setVfx((prevVfx) => [
                ...prevVfx,
                {
                  id: Date.now(),
                  type: 'explosion',
                  x: head.x,
                  y: head.y,
                  createdAt: Date.now(),
                  duration: 400,
                },
              ]);
            }
            setDeadPlayerIds((prevIds) => {
              const next = new Set(prevIds);
              next.add(message.payload.playerId);
              return next;
            });
            setTimeout(() => {
              setDeadPlayerIds((prevIds) => {
                const next = new Set(prevIds);
                next.delete(message.payload.playerId);
                return next;
              });
            }, 500);
            break;
          }
          case 'team_switched':
            soundManager.play('connect');
            break;
          case 'team_switch_denied':
            setError('Cannot switch team right now.');
            setTimeout(() => setError(null), 2000);
            break;
        }
      };

      socket.onclose = (event) => {
        window.removeEventListener('beforeunload', onBeforeUnload);
        socketRef.current = null;
        connectingRef.current = false;
        cleanupSocketLock();

        if (manualDisconnectRef.current || closingRef.current || unloadingRef.current) {
          manualDisconnectRef.current = false;
          return;
        }

        if (event.code === 4000) return;

        scheduleSilentReconnect();
      };

      socket.onerror = (event) => {
        window.removeEventListener('beforeunload', onBeforeUnload);
        cleanupSocketLock();

        if (manualDisconnectRef.current || closingRef.current || unloadingRef.current) return;

        scheduleReconnectRef.current();
        setError('Connection error.');
        setStatus('disconnected');
        connectingRef.current = false;
        console.warn('WS error', event);
      };
    } catch (err) {
      cleanupSocketLock();
      closingRef.current = true;
      if (socketRef.current) {
        try {
          socketRef.current.close(1000, 'Abort connect');
        } catch {
          /* noop */
        }
      }
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setStatus('disconnected');
      connectingRef.current = false;
    }
  }, [cleanupSocketLock, mode, nickname]);

  const scheduleReconnect = useCallback(() => {
    if (manualDisconnectRef.current || closingRef.current || unloadingRef.current) return;
    if (reconnectTimerRef.current) return;

    reconnectAttemptRef.current += 1;
    const attempt = reconnectAttemptRef.current;
    const baseDelay = CLIENT_STATE.reconnectBaseDelayMs;
    const cappedDelay = Math.min(
      CLIENT_STATE.reconnectMaxDelayMs,
      baseDelay * Math.pow(2, attempt - 1),
    );
    const jitter = Math.random() * CLIENT_STATE.reconnectJitterMs;
    const delay = Math.round(cappedDelay + jitter);

    reconnectTimerRef.current = window.setTimeout(async () => {
      reconnectTimerRef.current = null;
      try {
        if (token && playerId && nickname.trim()) {
          await reconnectToLobbyRef.current();
        } else {
          await handleConnectRef.current();
        }
      } catch {
        scheduleReconnectRef.current();
      }
    }, delay) as unknown as number;
  }, [nickname, playerId, token]);

  useEffect(() => {
    lastLobbyIdRef.current = null;
  }, [mode]);

  useEffect(() => {
    if (!lockIdRef.current) {
      lockIdRef.current = crypto.randomUUID();
    }

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== CLIENT_STATE.activeTabLockKey) return;
      const value = event.newValue;
      if (value && value !== lockIdRef.current) {
        setIsLocked(true);
        setError('Game is active in another tab. Only one tab is allowed.');
        if (socketRef.current) {
          handleDisconnect();
        }
      } else if (!value) {
        setIsLocked(false);
        setError(null);
      }
    };

    const releaseLockOnUnload = () => {
      if (localStorage.getItem(CLIENT_STATE.activeTabLockKey) === lockIdRef.current) {
        localStorage.removeItem(CLIENT_STATE.activeTabLockKey);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('beforeunload', releaseLockOnUnload);

    const currentLock = localStorage.getItem(CLIENT_STATE.activeTabLockKey);
    if (currentLock && currentLock !== lockIdRef.current) {
      setIsLocked(true);
      setError('Game is active in another tab. Only one tab is allowed.');
    } else {
      setIsLocked(false);
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('beforeunload', releaseLockOnUnload);
    };
  }, [handleDisconnect]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      let direction: Direction | null = null;
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          direction = 'up';
          break;
        case 'ArrowDown':
        case 'KeyS':
          direction = 'down';
          break;
        case 'ArrowLeft':
        case 'KeyA':
          direction = 'left';
          break;
        case 'ArrowRight':
        case 'KeyD':
          direction = 'right';
          break;
        default:
          break;
      }

      if (direction) {
        event.preventDefault();
        latestDirectionInputRef.current = direction;
        return;
      }

      switch (event.code) {
        case 'Digit1':
          event.preventDefault();
          handleUsePowerUp(0);
          break;
        case 'Digit2':
          event.preventDefault();
          handleUsePowerUp(1);
          break;
        case 'Digit3':
          event.preventDefault();
          handleUsePowerUp(2);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUsePowerUp]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        try { socketRef.current?.send('H'); } catch { }
        // если мы в «тихом» режиме — дёрнем реконнект немедленно
        if (silentReconnectingRef.current) {
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          // немедленная попытка
          (async () => {
            try {
              if (token && playerId && nickname.trim()) await reconnectToLobbyRef.current();
              else await handleConnectRef.current();
            } catch {
              scheduleSilentReconnect();
            }
          })();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [nickname, playerId, token, scheduleSilentReconnect]);

  const gameLoop = useCallback(() => {
    const latestInput = latestDirectionInputRef.current;
    const actualDirection = myCurrentDirectionRef.current;

    if (
      latestInput &&
      actualDirection &&
      latestInput !== actualDirection &&
      !isOpposite(actualDirection, latestInput)
    ) {
      const now = performance.now();
      if (now - lastTurnSentAtRef.current > CLIENT_STATE.inputThrottleMs) {
        sendWsMessage({ action: 'turn', direction: latestInput });
        lastTurnSentAtRef.current = now;
      }
    }

    animationFrameId.current = requestAnimationFrame(gameLoop);
  }, [sendWsMessage]);

  useEffect(() => {
    if (status === 'connected') {
      animationFrameId.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [gameLoop, status]);

  useEffect(() => {
    currentStateRef.current = currentState;
  }, [currentState]);

  useEffect(() => {
    if (!currentState || !playerId) {
      myCurrentDirectionRef.current = null;
      return;
    }

    const mySnake = currentState.snakes.find((snake) => snake.id === playerId);
    myCurrentDirectionRef.current = mySnake ? getDirectionFromSnake(mySnake) : null;
    if (!mySnake) {
      lastSentDirectionRef.current = null;
    }

    const previousStateForEffects = previousStateForEffectsRef.current;
    if (!previousStateForEffects) return;

    const myOldPlayer = previousStateForEffects.players[playerId];
    const myNewPlayer = currentState.players[playerId];
    const myOldSnake = previousStateForEffects.snakes.find((snake) => snake.id === playerId);
    const myNewSnake = currentState.snakes.find((snake) => snake.id === playerId);

    if (currentState && !currentState.gameOver && gameOverInfo) {
      setGameOverInfo(null);
    }

    if (myNewPlayer && myOldPlayer && myNewSnake && myOldSnake) {
      if (myNewSnake.body.length > myOldSnake.body.length) {
        soundManager.play('eat');
        const head = myNewSnake.body[0];
        setVfx((prevVfx) => [
          ...prevVfx,
          {
            id: Date.now(),
            type: 'sparkle',
            x: head.x,
            y: head.y,
            createdAt: Date.now(),
            duration: 300,
          },
        ]);
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
          !previousStateForEffects.projectiles.some((prevProjectile) => prevProjectile.id === projectile.id),
      );
      if (myNewProjectile) soundManager.play('shoot');
    }
  }, [currentState, gameOverInfo, playerId]);

  useEffect(() => {
    const savedNickname = localStorage.getItem('slize_nickname');
    if (savedNickname) {
      setNickname(savedNickname);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        try {
          socketRef.current.close(1000, 'Unmount cleanup');
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  useEffect(() => {
    handleConnectRef.current = handleConnect;
  }, [handleConnect]);

  useEffect(() => {
    reconnectToLobbyRef.current = reconnectToLobby;
  }, [reconnectToLobby]);

  useEffect(() => {
    scheduleReconnectRef.current = scheduleReconnect;
  }, [scheduleReconnect]);

  return {
    nickname,
    setNickname,
    mode,
    setMode,
    status,
    error,
    isLocked,
    previousState,
    currentState,
    lastStateTimestamp,
    playerId,
    gameOverInfo,
    deadPlayerIds,
    vfx,
    handleConnect,
    handleDisconnect,
    handleSwitchTeam,
    handleUsePowerUp,
    isSilentlyReconnecting,
  };
}