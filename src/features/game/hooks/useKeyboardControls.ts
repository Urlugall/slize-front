import { useEffect } from 'react';

import type { Direction } from '@/features/game/lib/client/direction';

interface UseKeyboardControlsOptions {
  onDirection: (direction: Direction) => void;
  onUsePowerUp: (slot: number) => void;
}

export function useKeyboardControls({ onDirection, onUsePowerUp }: UseKeyboardControlsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;

      let direction: Direction | null = null;
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW':
          direction = 'up';
          break;
        case 'ArrowDown':
        case 'KeyS':
          direction = 'down';
          break;
        case 'ArrowLeft':
        case 'KeyA':
          direction = 'left';
          break;
        case 'ArrowRight':
        case 'KeyD':
          direction = 'right';
          break;
        default:
          break;
      }

      if (direction) {
        event.preventDefault();
        onDirection(direction);
        return;
      }

      switch (event.code) {
        case 'Digit1':
          event.preventDefault();
          onUsePowerUp(0);
          break;
        case 'Digit2':
          event.preventDefault();
          onUsePowerUp(1);
          break;
        case 'Digit3':
          event.preventDefault();
          onUsePowerUp(2);
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDirection, onUsePowerUp]);
}

