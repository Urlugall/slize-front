import { useCallback, useEffect, useRef, useState } from 'react';

import { CLIENT_STATE } from '@/features/game/config';
import type { GameModeKey, TeamId } from '@/features/game/types';
import { isOpposite, type Direction } from '@/features/game/lib/client/direction';
import { useGameConnection } from '@/features/game/hooks/useGameConnection';
import { useGameStateStore } from '@/features/game/hooks/useGameStateStore';
import { useKeyboardControls } from '@/features/game/hooks/useKeyboardControls';
import type { GameClientResult } from '@/features/game/hooks/gameClientTypes';

export function useGameClient(initialMode: GameModeKey = 'free_for_all'): GameClientResult {
  const [nickname, setNickname] = useState('');
  const [mode, setMode] = useState<GameModeKey>(initialMode);
  const [playerId, setPlayerId] = useState<string | null>(null);

  const {
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
  } = useGameStateStore({ playerId });

  const {
    status,
    error,
    isLocked,
    isSilentlyReconnecting,
    playerId: resolvedPlayerId,
    sendMessage,
    handleConnect,
    handleDisconnect,
    handleLeave,
    authBlockedReason,
    clearAuthBlock,
  } = useGameConnection({
    nickname,
    mode,
    callbacks: {
      onStateMessage: handleStateMessage,
      onGameOver: handleGameOver,
      onPlayerDied: handlePlayerDied,
      onPlayerList: handlePlayerList,
      onPlayerJoined: handlePlayerJoined,
      onPlayerLeft: handlePlayerLeft,
      onScoreUpdate: handleScoreUpdate,
      onPowerupUpdate: handlePowerupUpdate,
    },
    resetState,
    onPlayerIdChange: setPlayerId,
  });

  useEffect(() => {
    if (resolvedPlayerId && resolvedPlayerId !== playerId) {
      setPlayerId(resolvedPlayerId);
    }
  }, [playerId, resolvedPlayerId]);

  useEffect(() => {
    if (initialMode && initialMode !== mode) {
      setMode(initialMode);
    }
  }, [initialMode, mode]);

  const latestDirectionInputRef = useRef<Direction | null>(null);
  const lastTurnSentAtRef = useRef(0);
  const animationFrameId = useRef<number | null>(null);

  const handleUsePowerUp = useCallback(
    (slot: number) => {
      const activePlayerId = playerId;
      if (!activePlayerId) return;
      const state = currentStateRef.current;
      if (!state) return;
      const me = state.players[activePlayerId];
      if (!me?.powerUpSlots[slot]) return;
      sendMessage({ action: 'use_powerup', slot });
    },
    [currentStateRef, playerId, sendMessage],
  );

  const handleSwitchTeam = useCallback(
    (teamId: TeamId) => {
      sendMessage({ action: 'switch_team', teamId });
    },
    [sendMessage],
  );

  useKeyboardControls({
    onDirection: (direction) => {
      latestDirectionInputRef.current = direction;
    },
    onUsePowerUp: handleUsePowerUp,
  });

  const gameLoop = useCallback(() => {
    const latestInput = latestDirectionInputRef.current;
    const actualDirection = myCurrentDirectionRef.current;

    // Check if we need to send an update
    const needsToSend = latestInput && (
      // 1. Standard turn: Input is different from server state
      (actualDirection && latestInput !== actualDirection && !isOpposite(actualDirection, latestInput)) ||
      // 2. Break lock: Input is different from what we *last sent*
      (latestInput !== lastSentDirectionRef.current)
    );

    if (needsToSend) {
      const now = performance.now();
      if (now - lastTurnSentAtRef.current > CLIENT_STATE.inputThrottleMs) {
        sendMessage({ action: 'turn', direction: latestInput });
        lastTurnSentAtRef.current = now;
        lastSentDirectionRef.current = latestInput;
      }
    }

    animationFrameId.current = requestAnimationFrame(gameLoop);
  }, [lastSentDirectionRef, myCurrentDirectionRef, sendMessage]);

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
    const savedNickname = localStorage.getItem('slize_nickname');
    if (savedNickname) {
      setNickname(savedNickname);
    }
  }, []);

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
    handleLeave,
    handleSwitchTeam,
    handleUsePowerUp,
    isSilentlyReconnecting,
    authBlockedReason,
    clearAuthBlock,
  };
}

export type UseGameClientResult = GameClientResult;
