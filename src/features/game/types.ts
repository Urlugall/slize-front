// src/features/game/types.ts

// --- Power-Ups ---
export type PowerUpType = 'SpeedBoost' | 'ScoreBoost' | 'Projectile' | 'Ghost' | 'Reverse' | 'Swap';

// --- Game Over Info ---
export interface GameOverInfo {
  winnerId: string;
  winnerNickname: string;
  resetAt: number; // UNIX timestamp
}

export interface PowerUp {
  id: string;
  type: PowerUpType;
  position: { x: number; y: number };
}

export interface Snake {
  id: string;
  body: { x: number; y: number }[];
}

export interface ProjectileState {
  id: string;
  ownerId: string;
  position: { x: number; y: number };
  direction: 'up' | 'down' | 'left' | 'right';
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

// --- Player Info ---
export interface PlayerInfo {
  nickname: string;
  score: number;
  powerUpSlots: (PowerUpType | null)[];
  activeEffects: {
    speedBoostUntil: number;
    isGhostUntil: number;
  };
}

// --- Game State (from server) ---
export interface GameState {
  tick: number;
  gridSize: number;
  snakes: { id: string; body: { x: number; y: number }[] }[];
  food: { x: number; y: number }[];
  players: Record<string, PlayerInfo>;
  powerUps: PowerUp[];
  projectiles: ProjectileState[];
  gameOver?: GameOverInfo | null;
  blocks?: BlockCell[];
  pendingResize?: PendingResize;
}

// --- Server Messages ---
export type ServerMessage =
  | { type: 'state'; payload: GameState }
  | { type: 'player_joined'; payload: { playerId: string; nickname: string } }
  | { type: 'player_left'; payload: { playerId: string } }
  | { type: 'player_died'; payload: { playerId: string } }
  | { type: 'game_over'; payload: GameOverInfo };