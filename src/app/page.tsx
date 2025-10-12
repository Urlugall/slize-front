// src/app/page.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { GameCanvas } from '../components/GameCanvas';
import { PowerUpBar } from '../components/PowerUpBar';
import type { GameState, ServerMessage } from './types';
import { soundManager } from '../lib/SoundManager';

type ConnectionStatus =
  | 'disconnected' | 'registering' | 'authenticating'
  | 'finding_lobby' | 'connecting' | 'connected';

type Direction = 'up' | 'down' | 'left' | 'right';

interface VFX {
    id: number;
    type: 'sparkle' | 'explosion';
    x: number;
    y: number;
    createdAt: number;
    duration: number; // in ms
}

const SERVER_TICK_RATE = 150;

export default function HomePage() {
  const [nickname, setNickname] = useState('');
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);

  const [previousState, setPreviousState] = useState<GameState | null>(null);
  const [currentState, setCurrentState] = useState<GameState | null>(null);
  const [lastStateTimestamp, setLastStateTimestamp] = useState(0);
  const animationFrameId = useRef<number | null>(null);
  const [renderTrigger, setRenderTrigger] = useState(0);
  
  const [vfx, setVfx] = useState<VFX[]>([]);
  const [deadPlayerIds, setDeadPlayerIds] = useState<Set<string>>(new Set());
  const socketRef = useRef<WebSocket | null>(null);

  // --- НАЧАЛО ИЗМЕНЕНИЯ: Новая логика обработки ввода ---
  const latestDirectionInputRef = useRef<Direction | null>(null);
  const lastSentDirectionRef = useRef<Direction | null>(null);
  // --- КОНЕЦ ИЗМЕНЕНИЯ ---

  const sendWsMessage = (message: object) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  };

  const handleUsePowerUp = (slot: number) => {
    sendWsMessage({ action: 'use_powerup', slot });
  };

  // --- ИЗМЕНЕНИЕ: Обработчик нажатий теперь только сохраняет намерение ---
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

      // Просто запоминаем последнее нажатое направление
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
  }, []); // Зависимости не нужны, т.к. `handleUsePowerUp` стабильна

  // --- ИЗМЕНЕНИЕ: Главный цикл теперь отправляет команды ---
  const gameLoop = useCallback(() => {
    // Отправляем команду на поворот, если она изменилась с последней отправки
    const latestDir = latestDirectionInputRef.current;
    if (latestDir && latestDir !== lastSentDirectionRef.current) {
        sendWsMessage({ action: 'turn', direction: latestDir });
        lastSentDirectionRef.current = latestDir;
    }

    setVfx(prev => prev.filter(effect => Date.now() - effect.createdAt < effect.duration));
    setRenderTrigger(performance.now());
    animationFrameId.current = requestAnimationFrame(gameLoop);
  }, []); // `sendWsMessage` обернута в useCallback или её зависимости не меняются

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

    // ... (useEffect для VFX и звуков остается без изменений)
    useEffect(() => {
        if (!currentState || !previousState || !playerId) return;
        const myOldPlayer = previousState.players[playerId];
        const myNewPlayer = currentState.players[playerId];
        const myOldSnake = previousState.snakes.find(s => s.id === playerId);
        const myNewSnake = currentState.snakes.find(s => s.id === playerId);
        if (!myOldPlayer || !myNewPlayer || !myOldSnake || !myNewSnake) return;
        if (myNewSnake.body.length > myOldSnake.body.length) {
            soundManager.play('eat');
            const head = myNewSnake.body[0];
            setVfx(prev => [...prev, {
                id: Date.now(), type: 'sparkle', x: head.x, y: head.y,
                createdAt: Date.now(), duration: 300
            }]);
        }
        const pickedUp = myNewPlayer.powerUpSlots.some((slot, i) => slot && !myOldPlayer.powerUpSlots[i]);
        if (pickedUp) {
            soundManager.play('powerup');
        }
        if (currentState.projectiles.length > previousState.projectiles.length) {
            const myNewProjectile = currentState.projectiles.find(p =>
                p.ownerId === playerId && !previousState.projectiles.some(op => op.id === p.id)
            );
            if (myNewProjectile) {
                soundManager.play('shoot');
            }
        }
    }, [currentState, previousState, playerId]);

  const handleConnect = async () => {
    // ... (this function remains unchanged)
    if (nickname.trim().length < 3) {
      setError("Nickname must be at least 3 characters.");
      return;
    }
    setError(null);
    setCurrentState(null);
    setPreviousState(null);
    setDeadPlayerIds(new Set());
    setStatus('registering');
    try {
      const regResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ nickname }),
      });
      if (!regResponse.ok) throw new Error('Registration failed. Try another nickname.');
      const { playerId } = await regResponse.json();
      setPlayerId(playerId);
      setStatus('authenticating');
      const authResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId, nickname }),
      });
      if (!authResponse.ok) throw new Error('Authentication failed.');
      const { token } = await authResponse.json();
      setStatus('finding_lobby');
      const lobbyResponse = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/lobbies/find-best`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (!lobbyResponse.ok) throw new Error('Could not find a lobby.');
      const { lobbyId } = await lobbyResponse.json();
      setStatus('connecting');
      const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/lobbies/${lobbyId}/ws?token=${token}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      socket.onopen = () => {
        setStatus('connected');
        soundManager.play('connect');
      };
      socket.onmessage = (event) => {
        const message: ServerMessage = JSON.parse(event.data);
        switch (message.type) {
          case 'state':
            setCurrentState(prev => {
              setPreviousState(prev);
              return message.payload;
            });
            setLastStateTimestamp(Date.now());
            break;
          case 'player_died':
            soundManager.play('death');
            setDeadPlayerIds(prev => new Set(prev).add(message.payload.playerId));
            const deadSnake = currentState?.snakes.find(s => s.id === message.payload.playerId);
            if (deadSnake && deadSnake.body.length > 0) {
              const head = deadSnake.body[0];
              setVfx(prev => [...prev, {
                id: Date.now(), type: 'explosion', x: head.x, y: head.y,
                createdAt: Date.now(), duration: 400,
              }]);
            }
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
      socket.onclose = () => {
          setStatus('disconnected');
          setCurrentState(null);
          setPreviousState(null);
          // --- ИЗМЕНЕНИЕ: Сбрасываем все refs при отключении ---
          lastSentDirectionRef.current = null;
          latestDirectionInputRef.current = null;
      };
      socket.onerror = () => { setError('Connection error.'); setStatus('disconnected'); };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
      setStatus('disconnected');
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    }
  };

  const handleDisconnect = () => {
    // ... (остальной код handleDisconnect и рендеринга без изменений)
    if (socketRef.current) {
        socketRef.current.close(1000, 'User initiated disconnect');
        socketRef.current = null;
    }
    setCurrentState(null);
    setPreviousState(null);
    setStatus('disconnected');
    setDeadPlayerIds(new Set());
    setError(null);
    lastSentDirectionRef.current = null;
    latestDirectionInputRef.current = null;
  };
    
  const isConnecting = status !== 'disconnected' && status !== 'connected';
  const myPlayerInfo = playerId ? currentState?.players[playerId] : null;

  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-4 md:p-8">
        <h1 className={`font-extrabold mb-12 bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-blue-600 tracking-tighter ${status === 'connected' ? 'text-3xl mt-4 hidden xl:block' : 'text-5xl md:text-6xl mt-8'}`}>
            Slize - Multiplayer Snake Game 🐍
        </h1>
        {status !== 'connected' ? (
            <div className="w-full max-w-sm bg-card-bg p-8 rounded-xl shadow-lg flex flex-col gap-4 border border-gray-200">
                <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Enter your nickname" className="p-3 rounded bg-gray-50 border border-gray-300 text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--accent-hover)] transition shadow-inner" disabled={isConnecting} />
                <button onClick={handleConnect} disabled={isConnecting || nickname.trim().length < 3} className="p-3 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] font-bold text-white disabled:bg-gray-400 disabled:text-gray-200 disabled:cursor-wait transition shadow-md hover:shadow-lg active:scale-[.99] transform duration-150">
                    {isConnecting ? `Connecting: ${status.replace('_', ' ')}...` : 'Play'}
                </button>
                {error && <p className="text-red-500 text-center text-sm">{error}</p>}
            </div>
        ) : (
            <div className="w-full max-w-7xl flex flex-col xl:grid xl:grid-cols-[150px_1fr_250px] gap-8 items-center xl:items-start">
                <div className="order-1 xl:order-1 w-full max-w-sm xl:w-full xl:max-w-none p-0">
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
                        renderTrigger={renderTrigger}
                        vfx={vfx}
                    />
                </div>
                <div className="order-2 xl:order-3 w-full max-w-sm xl:w-full">
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
        {status === 'connected' && (
            <div className="mt-8 text-center text-gray-500 text-sm">
                <p>Use <b>W, A, S, D</b> or <b>Arrow Keys</b> to move.</p>
                <p>Use keys <b>1, 2, 3</b> to activate abilities.</p>
            </div>
        )}
    </main>
  );
}