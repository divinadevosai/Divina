import type { WeatherData } from '@/modules/types';

// WMO weather interpretation codes → room condition + label.
export function wmo(code: number): { condition: WeatherData['condition']; label: string } {
  if (code === 0) return { condition: 'clear', label: 'Clear' };
  if (code <= 2) return { condition: 'clouds', label: 'Partly cloudy' };
  if (code === 3) return { condition: 'clouds', label: 'Overcast' };
  if (code === 45 || code === 48) return { condition: 'fog', label: 'Fog' };
  if (code >= 51 && code <= 57) return { condition: 'rain', label: 'Drizzle' };
  if (code >= 61 && code <= 67) return { condition: 'rain', label: 'Rain' };
  if (code >= 71 && code <= 77) return { condition: 'snow', label: 'Snow' };
  if (code >= 80 && code <= 82) return { condition: 'rain', label: 'Showers' };
  if (code >= 85 && code <= 86) return { condition: 'snow', label: 'Snow showers' };
  if (code >= 95) return { condition: 'storm', label: 'Thunderstorm' };
  return { condition: 'clouds', label: 'Cloudy' };
}
