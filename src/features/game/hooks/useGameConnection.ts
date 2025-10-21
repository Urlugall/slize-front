import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import { CLIENT_STATE } from '@/features/game/config';
import { soundManager } from '@/features/game/lib/SoundManager';
import { parseServerMessage } from '@/features/game/lib/client/messageParsers';
import type { GameModeKey, GameOverInfo } from '@/features/game/types';
import type { GameStateStore } from '@/features/game/hooks/useGameStateStore';
import type { ConnectionStatus } from '@/features/game/hooks/gameClientTypes';

interface UseGameConnectionCallbacks {
  onStateMessage: GameStateStore['handleStateMessage'];
  onGameOver: GameStateStore['handleGameOver'];
  onPlayerDied: GameStateStore['handlePlayerDied'];
}

interface UseGameConnectionOptions {
  nickname: string;
  mode: GameModeKey;
  callbacks: UseGameConnectionCallbacks;
  resetState: GameStateStore['resetState'];
  onPlayerIdChange?: (playerId: string | null) => void;
}

interface SocketMessageHandlers {
  onState: UseGameConnectionCallbacks['onStateMessage'];
  onGameOver: (info: GameOverInfo) => void;
  onPlayerDied: (playerId: string) => void;
  onTeamSwitchDenied: (message: string) => void;
  onTeamSwitched: () => void;
}

const createSocketMessageHandler =
  (
    socketRef: MutableRefObject<WebSocket | null>,
    handlers: SocketMessageHandlers,
  ) =>
    (event: MessageEvent<string>) => {
      if (event.data === 'h' && socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send('H');
        return;
      }

      const message = parseServerMessage(event.data);
      if (!message) {
        console.warn('WS non-JSON or unknown message ignored');
        return;
      }

      switch (message.type) {
        case 'state':
          handlers.onState({ state: message.payload, receivedAt: performance.now() });
          break;
        case 'game_over':
          handlers.onGameOver(message.payload);
          break;
        case 'player_died':
          handlers.onPlayerDied(message.payload.playerId);
          break;
        case 'team_switched':
          handlers.onTeamSwitched();
          break;
        case 'team_switch_denied':
          handlers.onTeamSwitchDenied('Cannot switch team right now.');
          break;
        default:
          break;
      }
    };

// ——— helpers for active-tab lock ———
const getCurrentLock = () => localStorage.getItem(CLIENT_STATE.activeTabLockKey);

const acquireLockOrThrow = (myId: string) => {
  localStorage.setItem(CLIENT_STATE.activeTabLockKey, myId);
  if (localStorage.getItem(CLIENT_STATE.activeTabLockKey) !== myId) {
    throw new Error('Failed to acquire localStorage lock.');
  }
};

const releaseMyLock = (myId: string) => {
  if (getCurrentLock() === myId) {
    localStorage.removeItem(CLIENT_STATE.activeTabLockKey);
  }
};

export interface UseGameConnectionResult {
  status: ConnectionStatus;
  error: string | null;
  isLocked: boolean;
  isSilentlyReconnecting: boolean;
  playerId: string | null;
  token: string | null;
  socketRef: MutableRefObject<WebSocket | null>;
  sendMessage: (message: object) => void;
  handleConnect: () => Promise<void>;
  handleDisconnect: () => void;
  handleLeave: () => Promise<void>;
  authBlockedReason: 'nickname_in_use' | null;
  clearAuthBlock: () => void;
}

export function useGameConnection({
  nickname,
  mode,
  callbacks,
  resetState,
  onPlayerIdChange,
}: UseGameConnectionOptions): UseGameConnectionResult {
  const [token, setToken] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isSilentlyReconnecting, setIsSilentlyReconnecting] = useState(false);
  const [authBlockedReason, setAuthBlockedReason] = useState<'nickname_in_use' | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const connectingRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const closingRef = useRef(false);
  const unloadingRef = useRef(false);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const lockIdRef = useRef<string>(crypto.randomUUID());
  const lastLobbyIdRef = useRef<string | null>(null);
  const silentReconnectingRef = useRef(false);
  const inputQueueRef = useRef<Array<{ t: number; msg: object }>>([]);

  const reconnectInProgressRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const scheduleReconnectRef = useRef<() => void>(() => { });
  const connectRef = useRef<() => Promise<void>>(() => Promise.resolve());

  const cleanupSocketLock = useCallback(() => {
    releaseMyLock(lockIdRef.current);
  }, []);

  const clearAuthBlock = useCallback(() => {
    setAuthBlockedReason(null);
    setError(null);
  }, []);

  const sendMessage = useCallback((message: object) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
      return;
    }
    inputQueueRef.current.push({ t: performance.now(), msg: message });
    const cutoff = performance.now() - 300;
    inputQueueRef.current = inputQueueRef.current.filter((entry) => entry.t >= cutoff);
  }, []);

  const flushInputQueue = useCallback((socket: WebSocket) => {
    const queued = inputQueueRef.current;
    inputQueueRef.current = [];
    for (const item of queued) {
      try {
        socket.send(JSON.stringify(item.msg));
      } catch {
        /* ignore resend errors */
      }
    }
  }, []);

  const scheduleReconnect = useCallback((): void => {
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
          await reconnectInProgressRef.current();
        } else {
          await connectRef.current();
        }
      } catch {
        scheduleReconnectRef.current();
      }
    }, delay) as unknown as number;
  }, [nickname, playerId, token]);

  scheduleReconnectRef.current = scheduleReconnect;

  const scheduleSilentReconnect = useCallback((): void => {
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
          await reconnectInProgressRef.current();
        } else {
          await connectRef.current();
        }
      } catch {
        scheduleSilentReconnect();
      }
    }, delay) as unknown as number;
  }, [nickname, playerId, token]);

  const releaseResourcesAfterClose = useCallback(() => {
    socketRef.current = null;
    connectingRef.current = false;
    cleanupSocketLock();
  }, [cleanupSocketLock]);

  const setTemporaryError = useCallback((message: string) => {
    setError(message);
    window.setTimeout(() => setError(null), 2000);
  }, []);

  const attachHandlers = useCallback(
    (socket: WebSocket, { isSilentReconnect }: { isSilentReconnect: boolean }) => {
      const canAttemptSilentReconnect = () => {
        const storedToken = token ?? sessionStorage.getItem('slize_token');
        const storedPlayerId = playerId ?? sessionStorage.getItem('slize_playerId');
        return Boolean(storedToken && storedPlayerId && nickname.trim());
      };

      const messageHandler = createSocketMessageHandler(socketRef, {
        onState: callbacks.onStateMessage,
        onGameOver: callbacks.onGameOver,
        onPlayerDied: callbacks.onPlayerDied,
        onTeamSwitchDenied: setTemporaryError,
        onTeamSwitched: () => soundManager.play('connect'),
      });

      socket.onopen = () => {
        if (reconnectTimerRef.current) {
          clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = null;
        }

        setIsLocked(false);
        setError(null);

        connectingRef.current = false;
        manualDisconnectRef.current = false;
        reconnectAttemptRef.current = 0;

        if (!isSilentReconnect) {
          resetState();
          soundManager.play('connect');
        }

        flushInputQueue(socket);

        silentReconnectingRef.current = false;
        setIsSilentlyReconnecting(false);

        // Статус один раз, без дублей
        setStatus('connected');
      };

      socket.onmessage = messageHandler;

      socket.onclose = (event) => {
        releaseResourcesAfterClose();

        // Ручной выход или замена
        if (manualDisconnectRef.current || closingRef.current || unloadingRef.current) {
          manualDisconnectRef.current = false;
          return;
        }
        if (event.code === 4000) return; // Заменен новым соединением

        // Определяем, был ли это "мягкий" обрыв (таймаут или аномалия)
        const isNetworkDrop = event.code === 1006 || event.code === 4002;
        const canSilent =
          isSilentReconnect ||
          Boolean((token ?? sessionStorage.getItem('slize_token')) &&
            (playerId ?? sessionStorage.getItem('slize_playerId')) &&
            nickname.trim());

        if (isNetworkDrop && canSilent) {
          silentReconnectingRef.current = true;
          setIsSilentlyReconnecting(true);

          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }

          (async () => {
            try {
              await reconnectInProgressRef.current(); // мгновенная попытка
            } catch (err) {
              // если не вышло — включаем обычный «тихий» backoff
              scheduleSilentReconnect();
            }
          })();
        } else {
          // "Жесткий" разрыв, показываем ошибку и используем стандартный таймер
          scheduleReconnect();
        }
      };

      socket.onerror = (event) => {
        console.warn('WS error', event);
        releaseResourcesAfterClose();
        if (manualDisconnectRef.current || closingRef.current || unloadingRef.current) return;

        const canSilent = isSilentReconnect || canAttemptSilentReconnect();
        if (canSilent) {
          scheduleSilentReconnect();
        } else {
          scheduleReconnect();
          setError('Connection error.');
          setStatus('disconnected');
        }
      };
    },
    [
      resetState,
      callbacks.onGameOver,
      callbacks.onPlayerDied,
      callbacks.onStateMessage,
      flushInputQueue,
      releaseResourcesAfterClose,
      scheduleReconnect,
      scheduleSilentReconnect,
      setTemporaryError,
      nickname,
      playerId,
      token,
    ],
  );

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
    resetState();
    setStatus('disconnected');
    setError(null);
    silentReconnectingRef.current = false;
    setIsSilentlyReconnecting(false);
    setPlayerId(null);
    setToken(null);
    onPlayerIdChange?.(null);
  }, [cleanupSocketLock, onPlayerIdChange, resetState]);

  const reconnectToLobby = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;

    if (!silentReconnectingRef.current) {
      setStatus('connecting');
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
      attachHandlers(socket, { isSilentReconnect: silentReconnectingRef.current });
    } catch (err) {
      releaseResourcesAfterClose();
      connectingRef.current = false;

      if (silentReconnectingRef.current) {
        scheduleSilentReconnect();
        throw err;
      }

      setStatus('disconnected');
      setError(err instanceof Error ? err.message : 'Reconnection failed.');
      throw err;
    }
  }, [
    attachHandlers,
    mode,
    nickname,
    releaseResourcesAfterClose,
    scheduleSilentReconnect,
    token,
  ]);

  reconnectInProgressRef.current = reconnectToLobby;

  const handleConnect = useCallback(async () => {
    if (connectingRef.current) return;

    if (authBlockedReason) return;

    const myLockId = lockIdRef.current; // Use this tab's stable ID
    const currentLock = localStorage.getItem(CLIENT_STATE.activeTabLockKey);

    if (currentLock && currentLock !== myLockId) {
      // Lock exists and belongs to another tab
      console.warn(`Lock conflict: Found lock [${currentLock}], expected [${myLockId}]. Blocking.`);
      setIsLocked(true);
      setError('Game is active in another tab. Only one tab is allowed.');
      // Do NOT set connectingRef to true here, allow retry if lock clears
      return;
    }

    // Attempt to acquire or re-affirm the lock
    try {
      localStorage.setItem(CLIENT_STATE.activeTabLockKey, myLockId);
      // Verify we actually set it ( paranoia check for weird browser states)
      if (localStorage.getItem(CLIENT_STATE.activeTabLockKey) !== myLockId) {
        throw new Error("Failed to acquire localStorage lock.");
      }
      console.log(`Lock acquired/re-affirmed: [${myLockId}]`);
      setIsLocked(false); // We definitely hold the lock now
      setError(null); // Clear any previous lock errors
    } catch (lockError) {
      console.error("Failed to set localStorage lock:", lockError);
      setIsLocked(true); // Can't guarantee lock, assume locked
      setError('Failed to manage game session lock. Check browser settings.');
      return; // Stop connection attempt
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

    if (!authBlockedReason) setError(null);
    resetState();
    setStatus('authenticating');

    try {
      if (socketRef.current) {
        try {
          socketRef.current.close(4000, 'Starting new connection'); // Use custom code
        } catch { /* ignore close errors */ }
        socketRef.current = null;
      }

      const authHeaders: HeadersInit = { 'Content-Type': 'application/json' };
      const bearerToken = token ?? sessionStorage.getItem('slize_token');
      if (bearerToken) {
        authHeaders.Authorization = `Bearer ${bearerToken}`;
      }

      const existingPlayerId = playerId ?? sessionStorage.getItem('slize_playerId') ?? undefined;
      const authPayload: Record<string, unknown> = { nickname: nickname.trim() };
      if (existingPlayerId) {
        authPayload.playerId = existingPlayerId;
      }

      const authResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(authPayload),
      });

      if (authResponse.status === 409) {
        let message = 'Nickname already in use.';
        try {
          const data = await authResponse.json();
          if (typeof data?.error === 'string') message = data.error;
        } catch { /* без паники, оставим дефолт */ }

        // Фиксируем блок и показываем понятную ошибку. Никаких реконнектов.
        setAuthBlockedReason('nickname_in_use');
        setError(message);
        setStatus('disconnected');
        connectingRef.current = false;
        return; // ← выходим без дальнейших попыток
      }

      if (!authResponse.ok) throw new Error('Authentication failed. Check client secret.');

      const {
        token: authToken,
        playerId: newPlayerId,
        nickname: normalizedNickname,
      }: { token: string; playerId: string; nickname?: string } = await authResponse.json();
      setPlayerId(newPlayerId);
      setToken(authToken);
      onPlayerIdChange?.(newPlayerId);

      try {
        sessionStorage.setItem('slize_token', authToken);
        sessionStorage.setItem('slize_playerId', newPlayerId);
        const nicknameToPersist = normalizedNickname ?? nickname.trim();
        localStorage.setItem('slize_nickname', nicknameToPersist);
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

      const teardown = () => {
        window.removeEventListener('beforeunload', onBeforeUnload);
      };

      const messageHandler = createSocketMessageHandler(socketRef, {
        onState: callbacks.onStateMessage,
        onGameOver: callbacks.onGameOver,
        onPlayerDied: callbacks.onPlayerDied,
        onTeamSwitchDenied: setTemporaryError,
        onTeamSwitched: () => soundManager.play('connect'),
      });

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

      socket.onmessage = messageHandler;

      socket.onclose = (event) => {
        teardown();
        releaseResourcesAfterClose();

        if (manualDisconnectRef.current || closingRef.current || unloadingRef.current) {
          manualDisconnectRef.current = false;
          return;
        }

        if (event.code === 4000) return;
        scheduleReconnect();
      };

      socket.onerror = (event) => {
        teardown();
        releaseResourcesAfterClose();
        if (manualDisconnectRef.current || closingRef.current || unloadingRef.current) return;

        scheduleReconnect();
        setError('Connection error.');
        setStatus('disconnected');
        console.warn('WS error', event);
      };
    } catch (err) {
      console.error("Connection process failed:", err);

      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setStatus('disconnected');
      connectingRef.current = false;
    }
  }, [
    nickname, mode, authBlockedReason, resetState, onPlayerIdChange, token, playerId,
    cleanupSocketLock,
    scheduleReconnect, // Added scheduleReconnect
    scheduleSilentReconnect, // Added scheduleSilentReconnect
    setTemporaryError, // Add setTemporaryError if used
    attachHandlers, // Add attachHandlers
    nickname, mode, authBlockedReason, token, playerId, resetState, onPlayerIdChange,
    cleanupSocketLock, scheduleReconnect, scheduleSilentReconnect, setTemporaryError, attachHandlers,
    setStatus, setError, setIsLocked, setToken, setPlayerId, setAuthBlockedReason
  ]);

  const handleLeave = useCallback(async () => {
    // 1) Пытаемся уведомить сервер через WS
    const ws = socketRef.current;
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: 'leave' }));
        // маленький grace-период, чтобы сообщение успело уйти
        await new Promise((r) => setTimeout(r, 100));
      }
    } catch { /* ignore */ }

    // 2) (опционально) дернуть REST, если WS уже закрыт и есть лобби
    try {
      const authToken = token ?? sessionStorage.getItem('slize_token');
      const lobbyId = lastLobbyIdRef.current;
      if (authToken && lobbyId) {
        // не блокируем UX, но сообщим серверу
        fetch(`${process.env.NEXT_PUBLIC_API_URL}/lobbies/${lobbyId}/leave`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${authToken}` },
          keepalive: true, // чтобы доехал даже при навигации
        }).catch(() => { });
      }
    } catch { /* ignore */ }

    // 3) Локально закрываем соединение и чистим состояние
    manualDisconnectRef.current = true;
    closingRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    try { socketRef.current?.close(1000, 'Client leave'); } catch { }
    releaseResourcesAfterClose();
    resetState();
    setStatus('disconnected');
    setError(null);
    silentReconnectingRef.current = false;
    setIsSilentlyReconnecting(false);
    setPlayerId(null);
    onPlayerIdChange?.(null);
    lastLobbyIdRef.current = null; // <- больше не пытаемся вернуться в старое лобби
  }, [onPlayerIdChange, releaseResourcesAfterClose, resetState, token, setPlayerId, setError, setStatus]);


  useEffect(() => {
    connectRef.current = handleConnect;
  }, [handleConnect]);

  useEffect(() => {
    lastLobbyIdRef.current = null;
  }, [mode]);

  useEffect(() => {
    const myLockId = lockIdRef.current;

    if (!lockIdRef.current) {
      lockIdRef.current = crypto.randomUUID();
    }

    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== CLIENT_STATE.activeTabLockKey) return;
      const value = event.newValue;

      // 1) Другой таб захватил лок → блокируемся и разрываем соединение
      if (value && value !== lockIdRef.current) {
        setIsLocked(true);
        setError('Game is active in another tab. Only one tab is allowed.');
        if (socketRef.current) {
          handleDisconnect();
        }
        return;
      }

      // 2) Лок освобождён → снимаем блок, можно реконнектиться при желании
      if (!value) {
        setIsLocked(false);
        setError(null);
        return;
      }

      // 3) Лок стал «нашим» → гарантированно снимаем блок/ошибку
      if (value === lockIdRef.current) {
        setIsLocked(false);
        setError(null);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('beforeunload', cleanupSocketLock);

    try {
      const currentLock = getCurrentLock();
      if (currentLock && currentLock !== myLockId) {
        setIsLocked(true);
        setError('Game is active in another tab. Only one tab is allowed.');
        return;
      }
      acquireLockOrThrow(myLockId); // <-- используем хелпер
      setIsLocked(false);
      setError(null);
    } catch (e) {
      console.error('Failed to set active-tab lock:', e);
      setIsLocked(true);
      setError('Failed to manage game session lock. Check browser settings.');
      return;
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('beforeunload', cleanupSocketLock);
      cleanupSocketLock();
    };
  }, [
    handleDisconnect,
    cleanupSocketLock,
    status,
    isLocked
  ]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        try {
          socketRef.current?.send('H');
        } catch {
          /* noop */
        }
        if (silentReconnectingRef.current) {
          if (reconnectTimerRef.current) {
            clearTimeout(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
          }
          (async () => {
            try {
              if (token && playerId && nickname.trim()) {
                await reconnectToLobby();
              } else {
                await handleConnect();
              }
            } catch {
              scheduleSilentReconnect();
            }
          })();
        }
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [handleConnect, nickname, playerId, reconnectToLobby, scheduleSilentReconnect, token]);

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

  return {
    status,
    error,
    isLocked,
    isSilentlyReconnecting,
    playerId,
    token,
    socketRef,
    sendMessage,
    handleConnect,
    handleDisconnect,
    handleLeave,
    authBlockedReason,
    clearAuthBlock,
  };
}
