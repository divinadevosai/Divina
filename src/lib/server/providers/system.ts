import 'server-only';
import os from 'node:os';
import { statfs } from 'node:fs/promises';
import type { ProviderResult } from '../http';
import type { SystemData } from '@/modules/types';
import { bridgeEnabled } from '../desktop/guard';

let last = os.cpus().map((c) => c.times);
const loadHistory: number[] = [];

function cpuLoad(): number {
  const now = os.cpus().map((c) => c.times);
  let idle = 0;
  let total = 0;
  now.forEach((t, i) => {
    const p = last[i] ?? t;
    const d = (k: keyof typeof t) => t[k] - p[k];
    const tot = d('user') + d('nice') + d('sys') + d('idle') + d('irq');
    idle += d('idle');
    total += tot;
  });
  last = now;
  return total > 0 ? 1 - idle / total : 0;
}

export async function getSystem(): Promise<ProviderResult<SystemData>> {
  const load = cpuLoad();
  loadHistory.push(load);
  if (loadHistory.length > 60) loadHistory.shift();
  let disk: SystemData['disk'];
  try {
    const s = await statfs(process.cwd());
    disk = { total: s.blocks * s.bsize, used: (s.blocks - s.bfree) * s.bsize };
  } catch {
    disk = undefined;
  }
  return {
    status: 'ok',
    data: {
      host: os.hostname(),
      platform: `${os.type()} ${os.release()} · ${os.arch()}`,
      cpuModel: os.cpus()[0]?.model?.trim() ?? 'CPU',
      cores: os.cpus().length,
      cpuLoad: load,
      loadHistory: [...loadHistory],
      memUsed: os.totalmem() - os.freemem(),
      memTotal: os.totalmem(),
      uptimeS: os.uptime(),
      disk,
      node: process.version,
      bridge: { enabled: bridgeEnabled(), platformSupported: process.platform === 'darwin' || process.platform === 'win32' },
      source: 'host (node:os)',
      fetchedAt: Date.now(),
    },
  };
}
