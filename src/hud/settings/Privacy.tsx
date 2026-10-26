'use client';
/** Settings → Privacy & cookies: what's stored on this device, the choice about preferences, and deleting everything. */
import { useState } from 'react';
import { STORED, eraseBrowserData, setConsent, useConsent } from '@/lib/consent';
import { WEB } from '@/lib/edition';

const chip = (on: boolean) => `rounded-full border px-3 py-1.5 text-[13px] transition ${on ? 'border-holo/70 bg-holo/15 text-ink' : 'border-ink-faint text-ink-mid hover:text-ink'}`;

/** Where the legal pages are: beside the page in the browser edition and the iPhone app, under /legal in the Windows app. */
const legal = (page: string) => (WEB ? `/${page}` : `/legal/${page}`);

export function PrivacySettings() {
  const choice = useConsent((s) => s.choice);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const erase = async () => {
    if (!window.confirm('Delete everything Divina keeps on this device: settings, API keys, notes, agents, memory, routines, worlds and preferences? This can’t be undone. (Make a backup first if you might want them.)')) return;
    setBusy(true);
    try {
      if (!WEB) {
        const r = await fetch('/api/erase', { method: 'POST', headers: { 'content-type': 'application/json', 'x-divina-bridge': '1' }, body: '{"confirm":"erase"}' });
        const j = (await r.json()) as { ok: boolean; message?: string };
        if (!j.ok) throw new Error(j.message ?? 'Couldn’t delete it.');
      }
      await eraseBrowserData();
      location.reload();
    } catch (err) {
      setBusy(false);
      setMsg((err as Error).message);
    }
  };
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="hud-label">remember preferences between visits?</div>
        <div className="flex flex-wrap gap-2">
          <button className={chip(choice === 'all')} onClick={() => setConsent('all')}>
            Yes, remember them
          </button>
          <button className={chip(choice === 'essential')} onClick={() => setConsent('essential')}>
            Essential only
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="hud-label">what Divina keeps on this device</div>
        <ul className="space-y-1.5">
          {STORED.map((s) => (
            <li key={s.what} className="flex gap-3 text-[13px]">
              <span className={`mt-[3px] h-fit shrink-0 rounded px-1.5 font-mono text-[10px] uppercase tracking-wider ${s.kind === 'essential' ? 'bg-holo/15 text-holo-hi' : 'bg-ink-faint text-ink-mid'}`}>{s.kind}</span>
              <span>
                <span className="text-ink">{s.what}.</span> <span className="text-ink-lo">{s.why}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="text-[12px] text-ink-lo">
          No cookies, analytics, ads or trackers, and nothing is sent to us. What you ask the AI goes to the AI company you picked, with your own key.{' '}
          <a className="underline" href={legal('cookies.html')}>
            Cookies
          </a>{' '}
          ·{' '}
          <a className="underline" href={legal('privacy.html')}>
            Privacy
          </a>
        </p>
      </div>
      <div className="space-y-2 border-t border-ink-faint pt-4">
        <div className="text-[14px] text-ink">Delete everything</div>
        <p className="text-[12.5px] leading-snug text-ink-mid">Removes all of it from this device at once. Your API keys stay valid with their companies: revoke them there if you’re done with them.</p>
        <button className="rounded-lg border border-warn/60 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-warn hover:bg-warn/10 disabled:opacity-40" disabled={busy} onClick={() => void erase()}>
          {busy ? 'deleting…' : 'delete everything'}
        </button>
        {msg && <p className="text-[12px] text-warn">{msg}</p>}
      </div>
    </div>
  );
}
