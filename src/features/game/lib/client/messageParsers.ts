import type { ServerMessage } from '@/features/game/types';

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const hasString = (payload: unknown, key: string) =>
  isObject(payload) && typeof payload[key] === 'string';

const hasNumber = (payload: unknown, key: string) =>
  isObject(payload) && typeof payload[key] === 'number';

export const isServerMessage = (data: unknown): data is ServerMessage => {
  if (!isObject(data)) return false;
  const { type, payload } = data as { type?: unknown; payload?: unknown };
  if (typeof type !== 'string') return false;

  switch (type) {
    case 'state':
      return isObject(payload);
    case 'player_joined':
      return hasString(payload, 'playerId') && hasString(payload, 'nickname');
    case 'player_left':
    case 'player_died':
      return hasString(payload, 'playerId');
    case 'game_over':
      return (
        hasString(payload, 'winnerId') &&
        hasString(payload, 'winnerNickname') &&
        hasNumber(payload, 'resetAt') &&
        hasNumber(payload, 'winnerScore')
      );
    case 'team_switched':
      return hasString(payload, 'playerId') && hasString(payload, 'teamId');
    case 'team_switch_denied':
      return hasString(payload, 'reason');
    default:
      return false;
  }
};

export const parseServerMessage = (data: unknown): ServerMessage | null => {
  if (typeof data !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return isServerMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

