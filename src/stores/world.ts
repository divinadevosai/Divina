import { create } from 'zustand';
import { applyCustomWorld, type WorldId } from '@/render/world/worlds';
import type { CustomWorld } from '@/lib/worlds';
import { clock } from '@/core/clock/masterClock';

export type WeatherCondition = 'clear' | 'clouds' | 'fog' | 'rain' | 'snow' | 'storm' | 'none';

interface WorldState {
  world: WorldId;
  /** the person's world on show when world is 'custom' */
  custom: CustomWorld | null;
  /** go to (or redesign) the custom world */
  setCustom(w: CustomWorld): void;
  weather: WeatherCondition;
  /** reflects weather into the room only while the weather module is active */
  weatherActive: boolean;
  marketFloor: boolean;
  motionOn: boolean;
  setWorld(w: WorldId): void;
  setWeather(c: WeatherCondition): void;
  setWeatherActive(v: boolean): void;
  setMarketFloor(v: boolean): void;
  setMotion(on: boolean): void;
}

export const useWorld = create<WorldState>((set, get) => ({
  world: 'studio',
  custom: null,
  setCustom: (w) => {
    applyCustomWorld(w);
    if (get().world !== 'custom' || get().custom?.id !== w.id) clock.cut();
    set({ custom: w, world: 'custom' });
  },
  weather: 'none',
  weatherActive: false,
  marketFloor: false,
  // Measured stillness: ambient motion is OFF by default.
  motionOn: false,
  setWorld: (world) => {
    if (world === get().world) return;
    clock.cut();
    set({ world });
  },
  setWeather: (weather) => set({ weather }),
  setWeatherActive: (weatherActive) => set({ weatherActive }),
  setMarketFloor: (marketFloor) => set({ marketFloor }),
  setMotion: (motionOn) => {
    clock.setMotion(motionOn);
    set({ motionOn });
  },
}));
