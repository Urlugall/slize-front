import type { GameState } from '@/features/game/types';

export type Direction = 'up' | 'down' | 'left' | 'right';

export const getDirectionFromSnake = (snake: { body: { x: number; y: number }[] }): Direction | null => {
  if (snake.body.length < 2) return null;
  const [head, neck] = snake.body;
  if (head.x > neck.x) return 'right';
  if (head.x < neck.x) return 'left';
  if (head.y > neck.y) return 'down';
  if (head.y < neck.y) return 'up';
  return null;
};

export const isOpposite = (a: Direction, b: Direction) =>
  (a === 'up' && b === 'down') ||
  (a === 'down' && b === 'up') ||
  (a === 'left' && b === 'right') ||
  (a === 'right' && b === 'left');

export const findPlayerDirection = (state: GameState | null, playerId: string | null): Direction | null => {
  if (!state || !playerId) return null;
  const snake = state.snakes.find((item) => item.id === playerId);
  return snake ? getDirectionFromSnake(snake) : null;
};

