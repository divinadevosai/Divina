'use client';
import { IOS, WEB } from '@/lib/edition';
import { useEffect, useState } from 'react';
import type { SystemData } from '../types';
import { fmt } from '../format';
import { Meter, Section, Spark, Stat } from './kit';
import { useSystem } from '@/stores/system';

interface ClientFacts {
  battery?: { level: number; charging: boolean } | null;
  net?: { type?: string; downlink?: number; rtt?: number } | null;
  deviceMemory?: number;
  storage?: { usage: number; quota: number } | null;
  cores?: number;
}

export function useClientFacts(): ClientFacts {
  const [f, setF] = useState<ClientFacts>({});
  useEffect(() => {
    let alive = true;
    const nav = navigator as Navigator & {
      getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener: (e: string, cb: () => void) => void }>;
      connection?: { effectiveType?: string; downlink?: number; rtt?: number };
      deviceMemory?: number;
    };
    const update = async () => {
      const out: ClientFacts = { deviceMemory: nav.deviceMemory, cores: navigator.hardwareConcurrency };
      try {
        const b = await nav.getBattery?.();
        out.battery = b ? { level: b.level, charging: b.charging } : null;
      } catch {
        out.battery = null;
      }
      out.net = nav.connection ? { type: nav.connection.effectiveType, downlink: nav.connection.downlink, rtt: nav.connection.rtt } : null;
      try {
        const s = await navigator.storage?.estimate();
        out.storage = s ? { usage: s.usage ?? 0, quota: s.quota ?? 0 } : null;
      } catch {
        out.storage = null;
      }
      if (alive) setF(out);
    };
    void update();
    const id = window.setInterval(update, 10_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);
  return f;
}

export function SystemPanel({ d, hue }: { d: SystemData; hue: number }) {
  const fps = useSystem((s) => s.fps);
  const gpu = useSystem((s) => s.gpu);
  const tier = useSystem((s) => s.tier);
  const c = useClientFacts();
  const mem = d.memUsed / d.memTotal;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <Stat label="cpu" value={`${Math.round(d.cpuLoad * 100)}%`} sub={`${d.cores} cores`} tone={d.cpuLoad > 0.92 ? 'warn' : undefined} />
        <Stat label="memory" value={`${Math.round(mem * 100)}%`} sub={fmt.bytes(d.memTotal)} tone={mem > 0.94 ? 'warn' : undefined} />
        <Stat label="fps" value={Math.round(fps)} sub={`tier ${tier}`} />
        <Stat label="uptime" value={fmt.duration(d.uptimeS)} />
      </div>
      <Section title="cpu load · live">
        <Spark values={d.loadHistory.length > 1 ? d.loadHistory.map((x) => x * 100) : [0, d.cpuLoad * 100]} hue={hue} height={64} />
      </Section>
      <Section title="diagnostics">
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-[12px]"><span className="text-ink-mid">Memory</span><span className="font-mono tabular">{fmt.bytes(d.memUsed)} / {fmt.bytes(d.memTotal)}</span></div>
            <Meter frac={mem} hue={hue} warn={mem > 0.94} />
          </div>
          {d.disk && (
            <div>
              <div className="mb-1 flex justify-between text-[12px]"><span className="text-ink-mid">Storage</span><span className="font-mono tabular">{fmt.bytes(d.disk.used)} / {fmt.bytes(d.disk.total)}</span></div>
              <Meter frac={d.disk.used / d.disk.total} hue={hue} warn={d.disk.used / d.disk.total > 0.95} />
            </div>
          )}
          {c.battery && (
            <div>
              <div className="mb-1 flex justify-between text-[12px]"><span className="text-ink-mid">Battery{c.battery.charging ? ' · charging' : ''}</span><span className="font-mono tabular">{Math.round(c.battery.level * 100)}%</span></div>
              <Meter frac={c.battery.level} hue={hue} />
            </div>
          )}
        </div>
      </Section>
      <Section title="this device">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 font-mono text-[11px]">
          <dt className="text-ink-lo">host</dt><dd className="text-ink">{d.host}</dd>
          <dt className="text-ink-lo">platform</dt><dd className="truncate text-ink">{d.platform}</dd>
          <dt className="text-ink-lo">cpu</dt><dd className="truncate text-ink">{d.cpuModel}</dd>
          <dt className="text-ink-lo">gpu</dt><dd className="truncate text-ink">{gpu}</dd>
          <dt className="text-ink-lo">network</dt><dd className="text-ink">{c.net ? `${c.net.type ?? '—'} · ${c.net.downlink ?? '—'} Mb/s · ${c.net.rtt ?? '—'} ms` : navigator.onLine ? 'online' : 'offline'}</dd>
          {c.storage && (<><dt className="text-ink-lo">browser storage</dt><dd className="text-ink">{fmt.bytes(c.storage.usage)} of {fmt.bytes(c.storage.quota)}</dd></>)}
          {WEB ? (
            <><dt className="text-ink-lo">desktop control</dt><dd className="text-ink">{IOS ? 'not on iPhone' : 'Divina for Windows'}</dd></>
          ) : (
            <>
              <dt className="text-ink-lo">desktop bridge</dt><dd className="text-ink">{d.bridge.platformSupported ? (d.bridge.enabled ? 'enabled' : 'off (DIVINA_DESKTOP_BRIDGE=1)') : 'macOS / Windows only'}</dd>
              <dt className="text-ink-lo">node</dt><dd className="text-ink">{d.node}</dd>
            </>
          )}
        </dl>
      </Section>
    </div>
  );
}
