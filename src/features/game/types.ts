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

export interface HotSnake {
  id: number;
  body: { x: number; y: number }[];
}

export interface HotProjectileState extends Omit<ProjectileState, 'ownerId'> {
  ownerId: number;
}

export interface HotGameState extends Omit<GameState, 'players' | 'snakes' | 'projectiles'> {
  snakes: HotSnake[];
  projectiles: HotProjectileState[];
}

export interface SlotAssignment {
  slotId: number;
  playerId: string;
}

export interface PlayerListPayload {
  players: Record<string, PlayerInfo>;
  slotAssignments: SlotAssignment[];
}

export interface ScoreUpdatePayload {
  playerId: string;
  score: number;
}

export interface PowerUpUpdatePayload {
  playerId: string;
  powerUpSlots: (PowerUpType | null)[];
  activeEffects: PlayerInfo['activeEffects'];
}

export interface PlayerJoinedPayload {
  playerId: string;
  slotId: number;
  player: PlayerInfo;
}

export interface PlayerLeftPayload {
  playerId: string;
  slotId: number;
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
  | { type: 'state'; payload: HotGameState }
  | { type: 'player_list'; payload: PlayerListPayload }
  | { type: 'score_update'; payload: ScoreUpdatePayload }
  | { type: 'powerup_update'; payload: PowerUpUpdatePayload }
  | { type: 'player_joined'; payload: PlayerJoinedPayload }
  | { type: 'player_left'; payload: PlayerLeftPayload }
  | { type: 'player_died'; payload: { playerId: string } }
  | { type: 'game_over'; payload: GameOverInfo }
  | { type: 'team_switched'; payload: { playerId: string; teamId: TeamId } }
  | { type: 'team_switch_denied'; payload: { reason: string } };
