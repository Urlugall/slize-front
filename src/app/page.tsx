// src/app/page.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { GameCanvas } from '@/features/game/components/GameCanvas';
import { PowerUpBar } from '@/features/game/components/PowerUpBar';
import type { GameState, ServerMessage } from '@/features/game/types';
import { soundManager } from '@/features/game/lib/SoundManager';

type ConnectionStatus =
  | 'disconnected' | 'authenticating'
  | 'finding_lobby' | 'connecting' | 'connected';

type Direction = 'up' | 'down' | 'left' | 'right';

const getDirectionFromSnake = (snake: { body: { x: number, y: number }[] }): Direction | null => {
  if (snake.body.length < 2) return null;
  const head = snake.body[0];
  const neck = snake.body[1];
  if (head.x > neck.x) return 'right';
  if (head.x < neck.x) return 'left';
  if (head.y > neck.y) return 'down';
  if (head.y < neck.y) return 'up';
  return null;
};

const isOpposite = (d1: Direction, d2: Direction) =>
  (d1 === 'up' && d2 === 'down') || (d1 === 'down' && d2 === 'up') ||
  (d1 === 'left' && d2 === 'right') || (d1 === 'right' && d2 === 'left');

interface VFX {
  id: number;
  type: 'sparkle' | 'explosion';
  x: number;
  y: number;
  createdAt: number;
  duration: number; // in ms
}

export default function HomePage() {
  const [nickname, setNickname] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  // --- ИЗМЕНЕНИЕ: Возвращаем состояния для интерполяции ---
  const [previousState, setPreviousState] = useState<GameState | null>(null);
  const [currentState, setCurrentState] = useState<GameState | null>(null);
  const [lastStateTimestamp, setLastStateTimestamp] = useState(0);
  const animationFrameId = useRef<number | null>(null);
  const previousStateForEffectsRef = useRef<GameState | null>(null);


  const [vfx, setVfx] = useState<VFX[]>([]);
  const [deadPlayerIds, setDeadPlayerIds] = useState<Set<string>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);
  const connectingRef = useRef<boolean>(false);
  const lastTurnSentAtRef = useRef<number>(0);
  const manualDisconnectRef = useRef<boolean>(false);

  const latestDirectionInputRef = useRef<Direction | null>(null);
  const lastSentDirectionRef = useRef<Direction | null>(null);
  const myCurrentDirectionRef = useRef<Direction | null>(null);

  const sendWsMessage = (message: object) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  };

  const handleUsePowerUp = (slot: number) => {
    sendWsMessage({ action: 'use_powerup', slot });
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      const code = e.code;
      let direction: Direction | null = null;
      switch (code) {
        case 'ArrowUp': case 'KeyW': direction = 'up'; break;
        case 'ArrowDown': case 'KeyS': direction = 'down'; break;
        case 'ArrowLeft': case 'KeyA': direction = 'left'; break;
        case 'ArrowRight': case 'KeyD': direction = 'right'; break;
      }

      if (direction) {
        e.preventDefault();
        latestDirectionInputRef.current = direction;
        return;
      }

      switch (code) {
        case 'Digit1': e.preventDefault(); handleUsePowerUp(0); break;
        case 'Digit2': e.preventDefault(); handleUsePowerUp(1); break;
        case 'Digit3': e.preventDefault(); handleUsePowerUp(2); break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);


  // --- ИЗМЕНЕНИЕ: Игровой цикл теперь снова простой ---
  const gameLoop = useCallback(() => {
    // Логика отправки инпута
    const latestInput = latestDirectionInputRef.current;
    const actualDirection = myCurrentDirectionRef.current;
    if (latestInput && actualDirection && latestInput !== actualDirection && !isOpposite(actualDirection, latestInput)) {
      const now = performance.now();
      if (now - lastTurnSentAtRef.current > 40) {
        sendWsMessage({ action: 'turn', direction: latestInput });
        lastTurnSentAtRef.current = now;
      }
    }

    // Очистка старых VFX и запуск нового кадра
    animationFrameId.current = requestAnimationFrame(gameLoop);
  }, []); // Зависимости убраны для стабильности

  useEffect(() => {
    if (status === 'connected') {
      animationFrameId.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [status, gameLoop]);

  // --- ИЗМЕНЕНИЕ: Логика эффектов и звуков теперь зависит от currentState и previousState ---
  useEffect(() => {
    if (!currentState || !playerId) {
      myCurrentDirectionRef.current = null;
      return;
    };

    const mySnake = currentState.snakes.find(s => s.id === playerId);
    if (mySnake) {
      myCurrentDirectionRef.current = getDirectionFromSnake(mySnake);
    } else {
      myCurrentDirectionRef.current = null;
      lastSentDirectionRef.current = null;
    }

    const previousStateForEffects = previousStateForEffectsRef.current;
    if (!previousStateForEffects) return;

    const myOldPlayer = previousStateForEffects.players[playerId];
    const myNewPlayer = currentState.players[playerId];
    const myOldSnake = previousStateForEffects.snakes.find(s => s.id === playerId);
    const myNewSnake = currentState.snakes.find(s => s.id === playerId);

    if (myNewPlayer && myOldPlayer && myNewSnake && myOldSnake && myNewSnake.body.length > myOldSnake.body.length) {
      soundManager.play('eat');
      const head = myNewSnake.body[0];
      setVfx(prev => [...prev, {
        id: Date.now(), type: 'sparkle', x: head.x, y: head.y,
        createdAt: Date.now(), duration: 300
      }]);
    }
    if (myNewPlayer && myOldPlayer) {
      const pickedUp = myNewPlayer.powerUpSlots.some((slot, i) => slot && !myOldPlayer.powerUpSlots[i]);
      if (pickedUp) soundManager.play('powerup');
    }
    if (currentState.projectiles.length > previousStateForEffects.projectiles.length) {
      const myNewProjectile = currentState.projectiles.find(p =>
        p.ownerId === playerId && !previousStateForEffects.projectiles.some(op => op.id === p.id)
      );
      if (myNewProjectile) soundManager.play('shoot');
    }
  }, [currentState, playerId]); // previousStateForEffectsRef is a ref, no need to list it

  useEffect(() => {
    const savedToken = localStorage.getItem('slize_token');
    const savedPlayerId = localStorage.getItem('slize_playerId');
    const savedNickname = localStorage.getItem('slize_nickname');

    if (savedToken && savedPlayerId && savedNickname) {
      setToken(savedToken);
      setPlayerId(savedPlayerId);
      setNickname(savedNickname);
    }
  }, []);

  const handleConnect = async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;
    manualDisconnectRef.current = false;
    if (nickname.trim().length < 3) {
      setError("Nickname must be at least 3 characters.");
      connectingRef.current = false;
      return;
    }
    setError(null);
    setCurrentState(null);
    setPreviousState(null);
    previousStateForEffectsRef.current = null;
    setDeadPlayerIds(new Set());
    setStatus('authenticating');

    try {
      // Close any existing socket before establishing a new one
      if (socketRef.current) {
        try { socketRef.current.close(1000, 'Reconnecting'); } catch {}
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
        localStorage.setItem('slize_token', authToken);
        localStorage.setItem('slize_playerId', newPlayerId);
        localStorage.setItem('slize_nickname', nickname);
      } catch {}

      setStatus('finding_lobby');
      const lobbyResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/lobbies/find-best`, {
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      if (!lobbyResponse.ok) throw new Error('Could not find a lobby.');
      const { lobbyId } = await lobbyResponse.json();

      setStatus('connecting');
      const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/lobbies/${lobbyId}/ws?token=${authToken}&nickname=${encodeURIComponent(nickname)}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        setStatus('connected');
        connectingRef.current = false;
        manualDisconnectRef.current = false;
        soundManager.play('connect');

        // ВАЖНО: корректно закрываем WS при уходе/перезагрузке,
        // чтобы DO сразу получил close и не держал "зомби".
        const onUnload = () => socket.close(1000, 'Page unloading');
        window.addEventListener('pagehide', onUnload);   // мобильные/Safari
        window.addEventListener('beforeunload', onUnload);

        // снять подписки при закрытии
        socket.onclose = (ev) => {
          window.removeEventListener('pagehide', onUnload);
          window.removeEventListener('beforeunload', onUnload);
          if (manualDisconnectRef.current) {
            manualDisconnectRef.current = false;
            return;
          }
          if (ev.code === 4000) {
            // server replaced this connection with a fresher one; ignore quietly
            return;
          }
          setStatus('disconnected');
        };
      };

      socket.onmessage = (event) => {
        if (event.data === 'ping') {
          socketRef.current?.send('pong');
          return;
        }

        const message: ServerMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'state':
            // --- ИЗМЕНЕНИЕ: Правильно обновляем оба состояния ---
            setCurrentState(prev => {
              setPreviousState(prev); // Текущее становится предыдущим
              previousStateForEffectsRef.current = prev; // Also update ref for sound/VFX
              return message.payload; // Новое состояние становится текущим
            });
            setLastStateTimestamp(performance.now()); // Запоминаем время получения
            break;
          case 'player_died':
            soundManager.play('death');
            const deadSnake = (previousStateForEffectsRef.current || currentState)?.snakes.find(s => s.id === message.payload.playerId);
            if (deadSnake?.body.length) {
              const head = deadSnake.body[0];
              setVfx(prev => [...prev, {
                id: Date.now(), type: 'explosion', x: head.x, y: head.y,
                createdAt: Date.now(), duration: 400,
              }]);
            }
            setDeadPlayerIds(prev => new Set(prev).add(message.payload.playerId));
            setTimeout(() => {
              setDeadPlayerIds(prev => {
                const next = new Set(prev);
                next.delete(message.payload.playerId);
                return next;
              });
            }, 500);
            break;
        }
      };

      
      // onclose is assigned in onopen to ensure cleanup of listeners
      socket.onerror = (e) => {
        if (manualDisconnectRef.current) return;
        setError('Connection error.');
        setStatus('disconnected');
        connectingRef.current = false;
        if (typeof console !== 'undefined') console.warn('WS error', e);
      };

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setStatus('disconnected');
      if (socketRef.current) socketRef.current.close();
      connectingRef.current = false;
    }
  };

  const handleDisconnect = () => {
    manualDisconnectRef.current = true;
    if (socketRef.current) {
      socketRef.current.close(1000, 'User initiated disconnect');
    }
    setStatus('disconnected');
    setError(null);
    // Сброс состояний
    setCurrentState(null);
    setPreviousState(null);
    previousStateForEffectsRef.current = null;
    setDeadPlayerIds(new Set());
    lastSentDirectionRef.current = null;
    latestDirectionInputRef.current = null;
    myCurrentDirectionRef.current = null;
  };

  const isConnecting = status !== 'disconnected' && status !== 'connected';
  const myPlayerInfo = playerId ? currentState?.players[playerId] : null;

  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-4 md:p-8">
      {/* ... (заголовок без изменений) ... */}
      <h1 className={`font-extrabold mb-12 bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-blue-600 tracking-tighter ${status === 'connected' ? 'text-3xl mt-4 hidden xl:block' : 'text-5xl md:text-6xl mt-8'}`}>
        Slize - Multiplayer Snake Game 🐍
      </h1>
      {status !== 'connected' ? (
        <div className="w-full max-w-sm bg-card-bg p-8 rounded-xl shadow-lg flex flex-col gap-4 border border-gray-200">
          {/* ... (форма входа без изменений) ... */}
          <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Enter your nickname" className="p-3 rounded bg-gray-50 border border-gray-300 text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--accent-hover)] transition shadow-inner" disabled={isConnecting} />
          <button onClick={handleConnect} disabled={isConnecting || nickname.trim().length < 3} className="p-3 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] font-bold text-white disabled:bg-gray-400 disabled:text-gray-200 disabled:cursor-wait transition shadow-md hover:shadow-lg active:scale-[.99] transform duration-150">
            {isConnecting ? `Connecting: ${status.replace('_', ' ')}...` : 'Play'}
          </button>
          {error && <p className="text-red-500 text-center text-sm">{error}</p>}
        </div>
      ) : (
        <div className="w-full max-w-7xl flex flex-col xl:grid xl:grid-cols-[150px_1fr_250px] gap-8 items-center xl:items-start">
          <div className="order-1 xl:order-1 w-full max-w-sm xl:w-full xl:max-w-none p-0">
            {/* ... (кнопка выхода без изменений) ... */}
            <div className="xl:sticky xl:top-8 flex flex-col items-center xl:items-start gap-4">
              <button onClick={handleDisconnect} className="w-full xl:w-auto p-2 rounded bg-red-600 hover:bg-red-500 font-bold text-white transition shadow-md active:scale-[.99] text-sm">
                ← Quit Game
              </button>
            </div>
          </div>
          <div className="order-3 xl:order-2 flex-shrink-0 flex justify-center w-full">
            <GameCanvas
              previousState={previousState}
              currentState={currentState}
              lastStateTimestamp={lastStateTimestamp}
              playerId={playerId}
              deadPlayerIds={deadPlayerIds}
              vfx={vfx}
            />
          </div>
          <div className="order-2 xl:order-3 w-full max-w-sm xl:w-full">
            {/* ... (лидерборд и панель способностей без изменений) ... */}
            <div className="bg-card-bg p-6 rounded-xl shadow-lg border border-gray-200">
              <h2 className="text-xl font-bold mb-4 border-b border-[var(--accent)]/50 text-[var(--accent)] pb-2 tracking-wide">
                Leaderboard
              </h2>
              <div className="flex flex-col gap-1">
                {currentState?.players && Object.entries(currentState.players)
                  .sort(([, a], [, b]) => b.score - a.score)
                  .map(([id, player], index) => (
                    <div key={id} className={`flex justify-between items-center p-2 rounded-lg transition duration-150 text-sm ${id === playerId ? 'bg-[var(--accent)]/10 border border-[var(--accent)]/30 shadow-inner' : 'hover:bg-gray-100'}`}>
                      <span className={`font-semibold truncate ${id === playerId ? 'text-[var(--accent)] font-bold' : 'text-foreground'}`}>
                        {index + 1}. {player.nickname}
                      </span>
                      <span className="font-mono text-base text-[var(--accent)] font-bold">{player.score}</span>
                    </div>
                  ))}
              </div>
            </div>
            <PowerUpBar
              powerUpSlots={myPlayerInfo?.powerUpSlots}
              onUsePowerUp={handleUsePowerUp}
            />
          </div>
        </div>
      )}
      {/* ... (подсказки по управлению без изменений) ... */}
      {status === 'connected' && (
        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>Use <b>W, A, S, D</b> or <b>Arrow Keys</b> to move.</p>
          <p>Use keys <b>1, 2, 3</b> to activate abilities.</p>
        </div>
      )}
    </main>
  );
}







