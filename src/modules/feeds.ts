/**
 * Client-side polling of every module's provider. One interval per module
 * at its own cadence; results land in the data store.
 */
import { MODULES } from './meta';
import type { ModuleId } from './ids';
import { useData, type ModuleData } from '@/stores/data';
import { useWorld } from '@/stores/world';
import { log } from '@/stores/system';
import type { WeatherData } from './types';

let started = false;
let coords: { lat: number; lon: number } | null = null;
const timers: number[] = [];

async function geolocate(prompt: boolean): Promise<void> {
  if (coords || typeof navigator === 'undefined' || !navigator.geolocation) return;
  try {
    const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (perm && perm.state !== 'granted' && !prompt) return;
  } catch {
    if (!prompt) return;
  }
  await new Promise<void>((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (p) => {
        coords = { lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) };
        resolve();
      },
      () => resolve(),
      { maximumAge: 30 * 60_000, timeout: 6000 },
    ),
  );
}

export async function refresh(id: ModuleId): Promise<void> {
  const prev = useData.getState().modules[id];
  if (!prev) useData.getState().put(id, { status: 'loading' });
  let qs = '';
  if (id === 'weather' && coords) qs = `?lat=${coords.lat}&lon=${coords.lon}`;
  try {
    const res = await fetch(`/api/modules/${id}${qs}`, { cache: 'no-store' });
    const r = (await res.json()) as { status: ModuleData['status']; data?: { source?: string; fetchedAt?: number }; message?: string };
    const next: ModuleData = { status: r.status, data: r.data, message: r.message, source: r.data?.source, fetchedAt: r.data?.fetchedAt ?? Date.now() };
    if (r.status === 'error' && prev?.status === 'ok') {
      // keep last good numbers; say they are stale
      useData.getState().put(id, { ...prev, message: r.message });
      return;
    }
    if (prev?.status !== r.status && r.status !== 'ok') log(r.status === 'error' ? 'warn' : 'info', `${id}: ${r.message ?? r.status}`);
    if (prev?.status !== 'ok' && r.status === 'ok') log('ok', `${id} online · ${next.source ?? ''}`);
    useData.getState().put(id, next);
    if (id === 'weather' && r.status === 'ok') useWorld.getState().setWeather((r.data as WeatherData).condition);
  } catch (err) {
    if (!prev || prev.status !== 'ok') useData.getState().put(id, { status: 'error', message: `Could not reach the Divina server (${(err as Error).message}).` });
  }
}

export function startFeeds() {
  if (started) return;
  started = true;
  void geolocate(false).then(() => {
    for (const m of MODULES) {
      void refresh(m.id);
      timers.push(window.setInterval(() => document.visibilityState === 'visible' && refresh(m.id), m.refreshMs));
    }
  });
}

/** Called when the user opens Weather: now it is fair to ask for location. */
export async function ensureLocation() {
  if (coords) return;
  await geolocate(true);
  if (coords) await refresh('weather');
}
