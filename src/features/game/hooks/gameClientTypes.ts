import type { GameModeKey, GameOverInfo, GameState, TeamId } from '@/features/game/types';
import type { VFX } from '@/features/game/canvas/types';

export type ConnectionStatus =
  | 'disconnected'
  | 'authenticating'
  | 'finding_lobby'
  | 'connecting'
  | 'connected';

export interface GameClientResult {
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
  authBlockedReason: 'nickname_in_use' | null;
  clearAuthBlock: () => void;
}

