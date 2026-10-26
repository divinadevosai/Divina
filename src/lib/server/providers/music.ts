import 'server-only';
import type { ProviderResult } from '../http';
import type { MusicData } from '@/modules/types';
import { bridgeEnabled } from '../desktop/guard';
import { dispatch } from '../desktop/verbs';
import { liveDeps } from '../desktop';

export async function getMusic(): Promise<ProviderResult<MusicData>> {
  if ((process.platform !== 'darwin' && process.platform !== 'win32') || !bridgeEnabled()) {
    return {
      status: 'unconfigured',
      message:
        process.platform !== 'darwin' && process.platform !== 'win32'
          ? 'Now-playing comes from the desktop bridge (macOS or Windows); this server is neither. The Divina ambient engine is available below.'
          : 'Start the server with DIVINA_DESKTOP_BRIDGE=1 to read what is playing.',
    };
  }
  const r = await dispatch('now_playing', {}, liveDeps);
  if (!r.ok) return { status: 'error', message: r.message };
  const d = r.data as Omit<MusicData, 'source' | 'fetchedAt'>;
  return { status: 'ok', data: { ...d, source: `${d.player} via desktop bridge`, fetchedAt: Date.now() } };
}
