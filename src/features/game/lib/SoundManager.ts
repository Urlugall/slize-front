// src/features/game/lib/SoundManager.ts
import { Howl } from 'howler';

// Define the sound effects we'll use in the game.
export type SoundEffect = 'eat' | 'powerup' | 'death' | 'shoot' | 'connect';

class SoundManager {
  private sounds: Record<SoundEffect, Howl>;

  constructor() {
    // Preload all sound files.
    // Make sure you have these files in /public/sounds/
    this.sounds = {
      eat: new Howl({ src: ['/sounds/eat.mp3'], volume: 0.6 }),
      powerup: new Howl({ src: ['/sounds/powerup.mp3'], volume: 0.8 }),
      death: new Howl({ src: ['/sounds/death.mp3'], volume: 0.7 }),
      shoot: new Howl({ src: ['/sounds/shoot.mp3'], volume: 0.5 }),
      connect: new Howl({ src: ['/sounds/connect.mp3'], volume: 0.9 }),
    };
  }

  /**
   * Plays a specified sound effect.
   * @param sound The name of the sound effect to play.
   */
  public play(sound: SoundEffect) {
    if (this.sounds[sound]) {
      this.sounds[sound].play();
    }
  }
}

// Export a singleton instance so the sounds are only loaded once.
export const soundManager = new SoundManager();

