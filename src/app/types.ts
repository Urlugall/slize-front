// src/app/types.ts

// --- Power-Ups ---
export type PowerUpType = 'SpeedBoost' | 'Stop' | 'ScoreBoost' | 'Projectile' | 'Ghost' | 'Reverse'; // <-- ADDED: Ghost and Reverse

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

// --- Player Info ---
export interface PlayerInfo {
    nickname: string;
    score: number;
    powerUpSlots: (PowerUpType | null)[];
    activeEffects: {
        isStoppedUntil: number;
        speedBoostUntil: number;
        isGhostUntil: number; // <-- ADDED: Ghost effect
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
    gameOver?: string;
}

// --- Server Messages ---
export type ServerMessage =
    | { type: 'state'; payload: GameState }
    | { type: 'player_joined'; payload: { playerId: string; nickname: string } }
    | { type: 'player_left'; payload: { playerId: string } }
    | { type: 'player_died'; payload: { playerId: string } };