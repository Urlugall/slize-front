// src/features/game/types.ts

// --- Game Modes ---
export type GameModeKey = 'free_for_all' | 'team_battle';
export type TeamId = 'alpha' | 'bravo';

// --- Power-Ups ---
export type PowerUpType = 'SpeedBoost' | 'ScoreBoost' | 'Projectile' | 'Ghost' | 'Reverse' | 'Swap';

export interface PowerUp {
  id: string;
  type: PowerUpType;
  position: { x: number; y: number };
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  position: { x: number; y: number };
  direction: 'up' | 'down' | 'left' | 'right';
}

// --- Game State ---
export interface PlayerInfo {
  nickname: string;
  score: number;
  powerUpSlots: (PowerUpType | null)[];
  teamId: TeamId | null;
  activeEffects: {
    speedBoostUntil: number;
    isGhostUntil: number;
  };
}

export type BlockCellState = 'warning' | 'kill' | 'solid';

export interface BlockCell {
  x: number;
  y: number;
  state: BlockCellState;
  activateAt: number;
  expireAt?: number;
}

export interface PendingResize {
  from: number;
  to: number;
  announcedAt: number;
  warnMs: number;
  killMs: number;
}

// --- Game Over Info ---
export interface GameOverInfo {
  winnerId: string;
  winnerNickname: string;
  resetAt: number;
  winnerScore: number;
}

export interface TeamState {
  id: TeamId;
  displayName: string;
  score: number;
  playerIds: string[];
}

export interface GameState {
  tick: number;
  gridSize: number;
  mode: GameModeKey;
  snakes: { id: string; body: { x: number; y: number }[] }[];
  food: { x: number; y: number }[];
  players: Record<string, PlayerInfo>;
  powerUps: PowerUp[];
  projectiles: ProjectileState[];
  gameOver?: GameOverInfo | null;
  blocks?: BlockCell[];
  pendingResize?: PendingResize;
  teams?: TeamState[] | null;
}

// --- Client/Server Messages ---

// Клиент (добавляем 'switch_team')
export type ClientMessage =
  | { action: 'turn'; direction: 'up' | 'down' | 'left' | 'right' }
  | { action: 'use_powerup'; slot: number }
  | { action: 'switch_team'; teamId: TeamId }
  | { action: 'leave' };

// Сервер (добавляем 'team_switched' и 'team_switch_denied')
export type ServerMessage =
  | { type: 'state'; payload: GameState }
  | { type: 'player_joined'; payload: { playerId: string; nickname: string } }
  | { type: 'player_left'; payload: { playerId: string } }
  | { type: 'player_died'; payload: { playerId: string } }
  | { type: 'game_over'; payload: GameOverInfo }
  | { type: 'team_switched'; payload: { playerId: string; teamId: TeamId } }
  | { type: 'team_switch_denied'; payload: { reason: string } };