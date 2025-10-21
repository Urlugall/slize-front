// src/app/main/play/page.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { GameCanvas } from "@/features/game/components/GameCanvas";
import { PowerUpBar } from "@/features/game/components/PowerUpBar";
import { TeamPanel } from "@/features/game/components/TeamPanel";
import { useGameClient } from "@/features/game/hooks/useGameClient";
import { GAME_TIMING } from "@/features/game/config";
import type { GameModeKey } from "@/features/game/types";

const SUPPORTED_MODES: GameModeKey[] = ["free_for_all", "team_battle"];

function resolveMode(value: string | null): GameModeKey {
  if (value && (SUPPORTED_MODES as readonly string[]).includes(value)) {
    return value as GameModeKey;
  }
  return "free_for_all";
}

function ConnectionOverlay({
  visible,
  statusText,
  error,
}: {
  visible: boolean;
  statusText: string;
  error: string | null;
}) {
  if (!visible) return null;
  return (
    <div
      className="
        pointer-events-none
        absolute inset-0 z-20
        flex items-center justify-center
        bg-[rgba(247,250,252,0.65)]
        backdrop-blur-[2px]
      "
    >
      <div className="pointer-events-auto rounded-xl border border-gray-200 bg-white shadow-lg px-5 py-3 flex items-center gap-3">
        {/* Простой «спиннер» CSS без зависимостей */}
        <span
          aria-hidden
          className="inline-block w-4 h-4 rounded-full border-2 border-gray-300 border-t-[var(--accent)] animate-spin"
        />
        <div className="text-sm text-gray-700">
          <div className="font-semibold">{statusText}</div>
          {error ? <div className="text-xs text-red-500 mt-0.5">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

function BlockingErrorModal({
  visible,
  title,
  message,
  onChangeNickname,
  onRetry,
}: {
  visible: boolean;
  title: string;
  message: string;
  onChangeNickname: () => void;
  onRetry: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-30 bg-[rgba(0,0,0,0.28)] flex items-center justify-center p-4">
      <div className="max-w-md w-full rounded-2xl bg-white shadow-xl border border-red-200">
        <div className="px-5 py-4 border-b border-red-100">
          <h3 className="text-lg font-bold text-red-600">{title}</h3>
        </div>
        <div className="px-5 py-4 text-sm text-gray-700">
          {message}
        </div>
        <div className="px-5 py-4 flex gap-3 justify-end border-t">
          <button
            onClick={onChangeNickname}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-sm font-semibold"
          >
            Change nickname
          </button>
          <button
            onClick={onRetry}
            className="px-3 py-2 rounded-lg bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white text-sm font-semibold shadow"
          >
            Retry
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlayPage() {
  const router = useRouter();
  const [modeFromParams, setModeFromParams] = useState<GameModeKey>("free_for_all");

  useEffect(() => {
    // Комментарий по сути: этот код выполнится только на клиенте после гидратации.
    // При статическом пререндере window недоступен, поэтому дефолт останется "free_for_all".
    try {
      const search = window.location.search;
      const mode = new URLSearchParams(search).get("mode");
      setModeFromParams(resolveMode(mode));
    } catch {
      setModeFromParams("free_for_all");
    }
  }, []);

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
    isSilentlyReconnecting,
    handleConnect,
    handleDisconnect,
    handleSwitchTeam,
    handleUsePowerUp,
    authBlockedReason,
    clearAuthBlock,
  } = useGameClient(modeFromParams);

  // Guard: если ника нет или короткий — назад на /main
  useEffect(() => {
    const saved = localStorage.getItem("slize_nickname") || "";
    if (saved && saved !== nickname) {
      setNickname(saved);
    }
    const trimmed = (saved || nickname).trim();
    if (trimmed.length < 3) {
      router.replace("/main");
    }
  }, [nickname, router, setNickname]);

  // === Автоконнект: НЕ запускаем, если есть auth-блок ===
  useEffect(() => {
    const trimmed = nickname.trim();
    if (
      status === "disconnected" &&
      trimmed.length >= 3 &&
      !isLocked &&
      !authBlockedReason // ← ключевой стоппер
    ) {
      handleConnect();
    }
  }, [authBlockedReason, handleConnect, isLocked, nickname, status]);

  // Синхронизация режима из URL (без UI выбора режима)
  useEffect(() => {
    if (mode !== modeFromParams) setMode(modeFromParams);
  }, [mode, modeFromParams, setMode]);

  // Кнопки модалки:
  const goChangeNickname = useCallback(() => {
    handleDisconnect();
    // Лучше replace, чтобы не вернуться «назад» в заблокированную игру
    router.replace("/main");
  }, [handleDisconnect, router]);

  const retryAuth = useCallback(() => {
    // Пользователь мог изменить ник на /main, вернуться и снова открыть play;
    // либо остаться здесь и попробовать снова — мы только снимаем блок.
    clearAuthBlock();
    handleConnect();
  }, [clearAuthBlock, handleConnect]);

  const myPlayerInfo = playerId
    ? currentState?.players[playerId] ?? null
    : null;

  const showOverlay =
    status !== "connected" || isSilentlyReconnecting || isLocked;

  const statusText =
    isLocked
      ? "Another tab is active…"
      : isSilentlyReconnecting
        ? "Reconnecting…"
        : status === "authenticating"
          ? "Signing in…"
          : status === "finding_lobby"
            ? "Finding a lobby…"
            : status === "connecting"
              ? "Connecting…"
              : "Reconnecting…";

  const handleQuit = useCallback(() => {
    handleDisconnect();

    router.replace("/main");
  }, [handleDisconnect, router]);

  return (
    <main className="relative flex flex-col items-center justify-start min-h-screen p-4 md:p-8">
      <h1
        className={`font-extrabold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-teal-500 to-sky-600 tracking-tighter ${status === "connected"
          ? "text-3xl mt-2 hidden xl:block"
          : "text-5xl md:text-6xl mt-4"
          }`}
      >
        Slize - Multiplayer Snake Game
      </h1>

      {/* Постоянный layout игры — не скрываем при обрывах */}
      <div className="relative w-full max-w-7xl flex flex-col xl:grid xl:grid-cols-[150px_1fr_250px] gap-8 items-center xl:items-start">
        <ConnectionOverlay visible={showOverlay} statusText={statusText} error={error} />

        {/* Левая колонка */}
        <div className="order-1 xl:order-1 w-full max-w-sm xl:w-full xl:max-w-none p-0">
          <div className="xl:sticky xl:top-8 flex flex-col items-center xl:items-start gap-4">
            <button
              onClick={handleQuit}
              className="w-full xl:w-auto p-2 rounded bg-red-600 hover:bg-red-500 font-bold text-white transition shadow-md active:scale-[.99] text-sm"
              title="Quit to main"
            >
              Quit Game
            </button>
          </div>
          {currentState && playerId && (
            <TeamPanel
              currentState={currentState}
              playerId={playerId}
              onSwitchTeam={handleSwitchTeam}
            />
          )}
        </div>

        {/* Центр — канвас */}
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

        {/* Правая колонка */}
        <div className="order-2 xl:order-3 w-full max-w-sm xl:w-full">
          <div className="bg-card-bg p-6 rounded-xl shadow-lg border border-gray-200">
            <h2 className="text-xl font-bold mb-4 border-b border-[var(--accent)]/50 text-[var(--accent)] pb-2 tracking-wide">
              Leaderboard
            </h2>
            {currentState && (
              <div
                className="px-2.5 py-1 rounded-md text-xs font-semibold"
                style={{
                  background: "rgba(15,23,42,0.06)",
                  color: "var(--foreground)",
                }}
                title="Time left in the round"
              >
                {(() => {
                  const elapsed = currentState.tick * GAME_TIMING.serverTickRate;
                  const remain = Math.max(0, GAME_TIMING.roundDurationMs - elapsed);
                  const seconds = Math.floor(remain / 1000);
                  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
                  const ss = String(seconds % 60).padStart(2, "0");
                  return (
                    <>
                      Round&nbsp;
                      <span className="text-[var(--accent)]">
                        {mm}:{ss}
                      </span>
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
                      className={`flex justify-between items-center p-2 rounded-lg transition duration-150 text-sm ${id === playerId
                        ? "bg-[var(--accent)]/10 border border-[var(--accent)]/30 shadow-inner"
                        : "hover:bg-gray-100"
                        }`}
                    >
                      <span
                        className={`font-semibold truncate ${id === playerId
                          ? "text-[var(--accent)] font-bold"
                          : "text-foreground"
                          }`}
                      >
                        {index + 1}. {player.nickname}
                      </span>
                      <span className="font-mono text-base text-[var(--accent)] font-bold">
                        {player.score}
                      </span>
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

      <div className="mt-8 text-center text-gray-500 text-sm">
        <p>
          Use <b>W, A, S, D</b> or <b>Arrow Keys</b> to move.
        </p>
        <p>
          Use keys <b>1, 2, 3</b> to activate abilities.
        </p>
      </div>

      {/* Маленький тост ошибки внизу, если нужно */}
      {error && !isSilentlyReconnecting && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-white border border-red-200 shadow text-sm text-red-600">
          {error}
        </div>
      )}

      <BlockingErrorModal
        visible={authBlockedReason === "nickname_in_use"}
        title="Nickname already in use"
        message={error || "This nickname is already used in another session. Change nickname or retry with a valid session."}
        onChangeNickname={goChangeNickname}
        onRetry={retryAuth}
      />
    </main>
  );
}
