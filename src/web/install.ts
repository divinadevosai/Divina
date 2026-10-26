/**
 * Imported first by the Shell so that, in the browser edition, the in-browser
 * backend is in place before any module calls /api/*. Does nothing in the app.
 */
import { WEB } from '@/lib/edition';
import { installWebBackend } from './backend';

if (WEB && typeof window !== 'undefined') installWebBackend();
