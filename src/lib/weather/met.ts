/**
 * Weather from MET Norway (api.met.no), shared by the app's server and the
 * browser edition. Their data is open for any use, commercial included, with
 * credit (CC BY 4.0) — unlike Open-Meteo's free tier, which is
 * non-commercial only. Place names come from OpenStreetMap (Nominatim).
 *
 * Terms we follow: coordinates to 2 decimals (they allow at most 4, and it
 * helps their cache), results cached 10+ minutes, the app identifies itself
 * by User-Agent and the browser edition by its Origin, credit shown on the card.
 */
import { wmo } from '@/lib/wmo';
import type { WeatherData } from '@/modules/types';

interface Details {
  air_temperature?: number;
  relative_humidity?: number;
  wind_speed?: number;
  precipitation_amount?: number;
  probability_of_precipitation?: number;
}
interface Period {
  summary?: { symbol_code?: string };
  details?: Details;
}
interface Step {
  time: string;
  data: { instant: { details: Details }; next_1_hours?: Period; next_6_hours?: Period; next_12_hours?: Period };
}
export interface MetResponse {
  properties: { timeseries: Step[] };
}

export const metForecastUrl = (lat: number, lon: number) =>
  `https://api.met.no/weatherapi/locationforecast/2.0/complete?lat=${lat.toFixed(2)}&lon=${lon.toFixed(2)}`;

export const nominatimSearchUrl = (city: string) =>
  `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(city)}`;

export type NominatimHit = { lat: string; lon: string; name?: string; display_name?: string; address?: { country_code?: string } };

export function placeFrom(hit: NominatimHit): { lat: number; lon: number; name: string } {
  const cc = hit.address?.country_code?.toUpperCase();
  const name = hit.name || hit.display_name?.split(',')[0] || 'Unknown place';
  return { lat: Number(hit.lat), lon: Number(hit.lon), name: cc ? `${name}, ${cc}` : name };
}

/** MET symbol codes → the WMO codes the rest of Divina already understands. */
export function symbolToWmo(symbol: string | undefined): number {
  const s = (symbol ?? '').replace(/_(day|night|polartwilight)$/, '');
  if (!s) return 3;
  if (s.includes('thunder')) return 95;
  const table: Record<string, number> = {
    clearsky: 0,
    fair: 1,
    partlycloudy: 2,
    cloudy: 3,
    fog: 45,
    lightrain: 61,
    rain: 63,
    heavyrain: 65,
    lightsleet: 66,
    sleet: 67,
    heavysleet: 67,
    lightsnow: 71,
    snow: 73,
    heavysnow: 75,
    lightrainshowers: 80,
    rainshowers: 81,
    heavyrainshowers: 82,
    lightsleetshowers: 81,
    sleetshowers: 81,
    heavysleetshowers: 82,
    lightsnowshowers: 85,
    snowshowers: 85,
    heavysnowshowers: 86,
  };
  return table[s] ?? 3;
}

/** "lightrainshowers_day" → "Light rain showers". */
export function symbolLabel(symbol: string | undefined): string {
  const s = (symbol ?? '').replace(/_(day|night|polartwilight)$/, '');
  const named: Record<string, string> = { clearsky: 'Clear', fair: 'Fair', partlycloudy: 'Partly cloudy', cloudy: 'Cloudy', fog: 'Fog' };
  if (!s) return 'Cloudy';
  if (named[s]) return named[s];
  const words = s
    .replace('andthunder', ' and thunder')
    .replace(/^(light|heavy)/, '$1 ')
    .replace(/(rain|sleet|snow)(showers)/, '$1 $2')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Apparent ("feels like") temperature, Australian BoM formula; wind in m/s. */
export function apparentC(t: number, rh: number, windMs: number): number {
  const e = (rh / 100) * 6.105 * Math.exp((17.27 * t) / (237.7 + t));
  return t + 0.33 * e - 0.7 * windMs - 4;
}

const localDate = (iso: string) => new Date(iso).toLocaleDateString('en-CA'); // YYYY-MM-DD, local time

export function metToWeather(r: MetResponse, place: string, source: string): WeatherData {
  const ts = r.properties?.timeseries ?? [];
  if (!ts.length) throw new Error('MET Norway returned no forecast');
  const now = ts[0];
  const cur = now.data.instant.details;
  const symbol = now.data.next_1_hours?.summary?.symbol_code ?? now.data.next_6_hours?.summary?.symbol_code;
  const code = symbolToWmo(symbol);
  const t = cur.air_temperature ?? 0;
  const rh = cur.relative_humidity ?? 70;
  const wind = cur.wind_speed ?? 0;
  const hour = new Date(now.time).getHours();
  const isDay = /_night$/.test(symbol ?? '') ? false : /_day$/.test(symbol ?? '') ? true : hour >= 6 && hour < 19;

  const hourly = ts
    .filter((s) => s.data.next_1_hours)
    .slice(0, 24)
    .map((s) => {
      const d = s.data.next_1_hours?.details ?? {};
      return { t: s.time, tempC: s.data.instant.details.air_temperature ?? 0, precip: d.probability_of_precipitation, mm: d.precipitation_amount };
    });

  const byDay = new Map<string, Step[]>();
  for (const s of ts) {
    const k = localDate(s.time);
    byDay.set(k, [...(byDay.get(k) ?? []), s]);
  }
  const daily = [...byDay.entries()].slice(0, 5).map(([date, steps]) => {
    const temps = steps.map((s) => s.data.instant.details.air_temperature).filter((x): x is number => typeof x === 'number');
    // the day's weather: the six hours around midday when there, else the first summary of the day
    const midday = steps.find((s) => new Date(s.time).getHours() >= 11 && s.data.next_6_hours) ?? steps.find((s) => s.data.next_6_hours ?? s.data.next_12_hours);
    const sym = midday?.data.next_6_hours?.summary?.symbol_code ?? midday?.data.next_12_hours?.summary?.symbol_code;
    return { date, maxC: Math.max(...temps), minC: Math.min(...temps), code: symbolToWmo(sym), label: symbolLabel(sym) };
  });

  return {
    place,
    tempC: t,
    feelsC: apparentC(t, rh, wind),
    humidity: Math.round(rh),
    windKph: wind * 3.6,
    code,
    condition: wmo(code).condition,
    label: symbolLabel(symbol),
    isDay,
    hourly,
    daily,
    source,
    fetchedAt: Date.now(),
  };
}
