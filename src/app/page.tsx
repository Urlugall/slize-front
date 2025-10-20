// src/app/page.tsx
"use client";

import { GameCanvas } from '@/features/game/components/GameCanvas';
import { PowerUpBar } from '@/features/game/components/PowerUpBar';
import { TeamPanel } from '@/features/game/components/TeamPanel';
import { useGameClient } from '@/features/game/hooks/useGameClient';
import { GAME_TIMING } from '@/features/game/config';

export default function HomePage() {
  const {
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
  } = useGameClient();

  const isConnecting = status !== 'disconnected' && status !== 'connected';
  const myPlayerInfo = playerId ? currentState?.players[playerId] ?? null : null;

  return (
    <main className="flex flex-col items-center justify-start min-h-screen p-4 md:p-8">
      <h1
        className={`font-extrabold mb-12 bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-sky-600 tracking-tighter ${status === 'connected' ? 'text-3xl mt-4 hidden xl:block' : 'text-5xl md:text-6xl mt-8'}`}
      >
        Slize - Multiplayer Snake Game
      </h1>
      {status !== 'connected' ? (
        <div className="w-full max-w-sm bg-card-bg p-8 rounded-xl shadow-lg flex flex-col gap-4 border border-gray-200">
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Enter your nickname"
            className="p-3 rounded bg-gray-50 border border-gray-300 text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--accent-hover)] transition shadow-inner"
            disabled={isConnecting}
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('free_for_all')}
              disabled={isConnecting}
              className={`p-3 rounded-lg text-sm font-semibold border-2 transition ${mode === 'free_for_all' ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)] shadow-inner' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
            >
              Free For All
            </button>
            <button
              onClick={() => setMode('team_battle')}
              disabled={isConnecting}
              className={`p-3 rounded-lg text-sm font-semibold border-2 transition ${mode === 'team_battle' ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)] shadow-inner' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'}`}
            >
              Team Battle
            </button>
          </div>
          <button
            onClick={handleConnect}
            disabled={isConnecting || nickname.trim().length < 3 || isLocked}
            className="p-3 rounded bg-[var(--accent)] hover:bg-[var(--accent-hover)] font-bold text-white disabled:bg-gray-400 disabled:text-gray-200 disabled:cursor-wait transition shadow-md hover:shadow-lg active:scale-[.99] transform duration-150"
          >
            {isConnecting
              ? `Connecting: ${status.replace('_', ' ')}...`
              : isLocked
              ? 'Game Active Elsewhere'
              : 'Play'}
          </button>
          {error && <p className="text-red-500 text-center text-sm">{error}</p>}
        </div>
      ) : (
        <div className="w-full max-w-7xl flex flex-col xl:grid xl:grid-cols-[150px_1fr_250px] gap-8 items-center xl:items-start">
          <div className="order-1 xl:order-1 w-full max-w-sm xl:w-full xl:max-w-none p-0">
            <div className="xl:sticky xl:top-8 flex flex-col items-center xl:items-start gap-4">
              <button
                onClick={handleDisconnect}
                className="w-full xl:w-auto p-2 rounded bg-red-600 hover:bg-red-500 font-bold text-white transition shadow-md active:scale-[.99] text-sm"
              >
                Quit Game
              </button>
            </div>
            {currentState && playerId && (
              <TeamPanel currentState={currentState} playerId={playerId} onSwitchTeam={handleSwitchTeam} />
            )}
          </div>
          <div className="order-3 xl:order-2 flex-shrink-0 flex justify-center w-full">
            <GameCanvas
              previousState={previousState}
              currentState={currentState}
              lastStateTimestamp={lastStateTimestamp}
              playerId={playerId}
              deadPlayerIds={deadPlayerIds}
              vfx={vfx}
              gameOver={gameOverInfo}
            />
          </div>
          <div className="order-2 xl:order-3 w-full max-w-sm xl:w-full">
            <div className="bg-card-bg p-6 rounded-xl shadow-lg border border-gray-200">
              <h2 className="text-xl font-bold mb-4 border-b border-[var(--accent)]/50 text-[var(--accent)] pb-2 tracking-wide">
                Leaderboard
              </h2>
              {currentState && (
                <div
                  className="px-2.5 py-1 rounded-md text-xs font-semibold"
                  style={{ background: 'rgba(15,23,42,0.06)', color: 'var(--foreground)' }}
                  title="Time left in the round"
                >
                  {(() => {
                    const elapsed = currentState.tick * GAME_TIMING.serverTickRate;
                    const remain = Math.max(0, GAME_TIMING.roundDurationMs - elapsed);
                    const seconds = Math.floor(remain / 1000);
                    const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
                    const ss = String(seconds % 60).padStart(2, '0');
                    return (
                      <>
                        Round&nbsp;<span className="text-[var(--accent)]">{mm}:{ss}</span>
                      </>
                    );
                  })()}
                </div>
              )}
              <div className="flex flex-col gap-1">
                {currentState?.players &&
                  Object.entries(currentState.players)
                    .sort(([, a], [, b]) => b.score - a.score)
                    .map(([id, player], index) => (
                      <div
                        key={id}
                        className={`flex justify-between items-center p-2 rounded-lg transition duration-150 text-sm ${id === playerId ? 'bg-[var(--accent)]/10 border border-[var(--accent)]/30 shadow-inner' : 'hover:bg-gray-100'}`}
                      >
                        <span
                          className={`font-semibold truncate ${id === playerId ? 'text-[var(--accent)] font-bold' : 'text-foreground'}`}
                        >
                          {index + 1}. {player.nickname}
                        </span>
                        <span className="font-mono text-base text-[var(--accent)] font-bold">{player.score}</span>
                      </div>
                    ))}
              </div>
            </div>

            <PowerUpBar powerUpSlots={myPlayerInfo?.powerUpSlots} onUsePowerUp={handleUsePowerUp} />
          </div>
        </div>
      )}
      {status === 'connected' && (
        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>
            Use <b>W, A, S, D</b> or <b>Arrow Keys</b> to move.
          </p>
          <p>
            Use keys <b>1, 2, 3</b> to activate abilities.
          </p>
        </div>
      )}
    </main>
  );
}
