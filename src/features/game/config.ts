import type { PowerUpType } from "./types";

export const BASE_CELL_SIZE = 20;
export const SERVER_TICK_RATE = 150; // ms per server tick

export const COLORS = {
  background: "#F7FAFC",
  grid: "#D1D5DB",
  gridEdgeStart: "rgba(148, 163, 184, 0.45)",
  gridEdgeEnd: "rgba(148, 163, 184, 0)",
  food: "#F59E0B",
  mySnake: "#00796B",
  otherSnake: "#3B82F6",
  deadSnake: "#DC2626",
  nickname: "#1a1a1a",
  eyes: "#F0F0F0",
  projectile: "#4F46E5",
  powerUpBg: "rgba(255, 255, 255, 0.8)",
  speedBoostEffect: "#FBBF24",
  ghostEffect: "rgba(0, 200, 255, 0.3)",
};

export const POWERUP_VISUALS: Record<PowerUpType, { icon: string; color: string }> = {
  SpeedBoost: { icon: "⚡", color: "#F59E0B" },
  ScoreBoost: { icon: "⭐", color: "#10B981" },
  Projectile: { icon: "🟣", color: "#4F46E5" },
  Ghost: { icon: "👻", color: "#A855F7" },
  Reverse: { icon: "🔁", color: "#00B8D9" },
  Swap: { icon: "🔄", color: "#EC4899" },
};
