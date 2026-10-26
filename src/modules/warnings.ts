/**
 * Which modules are in a WARNING state. Warned cards turn orange and are
 * never allowed to go gold, whatever their position.
 */
import type { ModuleId } from './ids';
import type { ModuleData } from '@/stores/data';
import type { StocksData, SystemData, WeatherData } from './types';

export function warningOf(id: ModuleId, d: ModuleData | undefined): string | null {
  if (!d) return null;
  if (d.status === 'error') return d.message ?? 'source unavailable';
  if (d.status !== 'ok' || !d.data) return null;
  switch (id) {
    case 'stocks': {
      const s = d.data as StocksData;
      return s.dayChangePct <= -3 ? `portfolio ${s.dayChangePct.toFixed(1)}% today` : null;
    }
    case 'system': {
      const s = d.data as SystemData;
      if (s.cpuLoad > 0.92) return `CPU ${(s.cpuLoad * 100).toFixed(0)}%`;
      if (s.memUsed / s.memTotal > 0.94) return 'memory pressure';
      if (s.disk && s.disk.used / s.disk.total > 0.95) return 'disk nearly full';
      return null;
    }
    case 'weather': {
      const w = d.data as WeatherData;
      return w.condition === 'storm' ? 'thunderstorm' : null;
    }
    default:
      return null;
  }
}
