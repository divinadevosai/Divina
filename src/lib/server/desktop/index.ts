import 'server-only';
import { existsSync } from 'node:fs';
import { run, launchDetached } from './exec';
import { scanApps } from './apps';
import { scanWindowsApps } from './windows';
import type { BridgeDeps } from './common';

export const liveDeps: BridgeDeps = {
  platform: process.platform,
  run,
  launch: launchDetached,
  scanApps: () => (process.platform === 'win32' ? scanWindowsApps({ run, env: process.env }) : scanApps()),
  exists: existsSync,
  env: process.env,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export { dispatch, VERBS } from './verbs';
export { guard, bridgeEnabled, BRIDGE_HEADER } from './guard';

/** Platforms with a desktop bridge implementation. */
export const bridgePlatform = () => process.platform === 'darwin' || process.platform === 'win32';
