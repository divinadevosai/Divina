import 'server-only';
import { setting } from '@/lib/server/settings';
import { cached, fetchJson, type ProviderResult } from '../http';
import type { WeatherData } from '@/modules/types';
import { wmo } from '@/lib/wmo';
import { metForecastUrl, metToWeather, nominatimSearchUrl, placeFrom, type MetResponse, type NominatimHit } from '@/lib/weather/met';

export { wmo };

async function geocode(city: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const hits = await fetchJson<NominatimHit[]>(nominatimSearchUrl(city), { timeoutMs: 5000 });
  return hits[0] ? placeFrom(hits[0]) : null;
}

async function reverseName(lat: number, lon: number): Promise<string> {
  try {
    const r = await fetchJson<{ address?: { city?: string; town?: string; village?: string; country_code?: string } }>(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`,
      { timeoutMs: 3000 },
    );
    const a = r.address;
    const n = a?.city ?? a?.town ?? a?.village;
    return n ? `${n}${a?.country_code ? `, ${a.country_code.toUpperCase()}` : ''}` : 'Near you';
  } catch {
    return 'Near you';
  }
}

export async function getWeather(q: URLSearchParams): Promise<ProviderResult<WeatherData>> {
  // A city chosen in Settings wins over the browser's location.
  const city = setting('DIVINA_CITY');
  let lat = NaN;
  let lon = NaN;
  let place = '';
  if (city) {
    const g = await cached(`geo:${city.toLowerCase()}`, 24 * 3600_000, () => geocode(city));
    if (!g) return { status: 'unconfigured', message: `Couldn’t find a place called “${city}”. Check the spelling in Settings → Weather.` };
    ({ lat, lon, name: place } = g);
  } else {
    lat = Number(q.get('lat') ?? setting('DIVINA_LAT') ?? NaN);
    lon = Number(q.get('lon') ?? setting('DIVINA_LON') ?? NaN);
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { status: 'unconfigured', message: 'Allow location access in the browser, or type your city in Settings → Weather.' };
  }
  const data = await cached(`wx:${lat.toFixed(2)},${lon.toFixed(2)}`, 10 * 60_000, async () => {
    const r = await fetchJson<MetResponse>(metForecastUrl(lat, lon));
    return metToWeather(r, place || (await reverseName(lat, lon)), 'MET Norway · places © OpenStreetMap contributors');
  });
  return { status: 'ok', data };
}
