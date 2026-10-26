'use client';
/** Settings → Licence (Windows and Mac): who it's for, and moving it to another computer. */
import { useEffect, useState } from 'react';
import { checkLicence, deactivateLicence, loadLicence, useLicence } from '@/lib/client/licence';

const btn = 'rounded-lg border border-ink-faint px-3 py-1.5 text-[13px] text-ink-mid hover:border-holo hover:text-ink disabled:opacity-50';
const day = (ms?: number) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

export function LicenceSettings() {
  const status = useLicence((s) => s.status);
  const busy = useLicence((s) => s.busy);
  const [sure, setSure] = useState(false);
  useEffect(() => void loadLicence(), []);
  if (!status) return <p className="text-[13px] text-ink-lo">Checking…</p>;
  if (status.state === 'not-required') return <p className="text-[13px] text-ink-mid">This copy of Divina doesn’t need a licence.</p>;
  if (status.state === 'none' || status.state === 'revoked') return <p className="text-[13px] text-ink-mid">Not activated on this computer.</p>;
  return (
    <div className="space-y-3 text-[13px]">
      <p className="text-ink-mid">
        <span className="text-ink">{status.product ?? 'Divina'}</span>
        {status.email ? ` · ${status.email}` : ''}
        <br />
        Activated {day(status.activatedAt)} · last checked {day(status.checkedAt)}
        {status.state === 'offline' ? ' (offline: Divina will check again when you’re connected)' : ''}
      </p>
      {status.message && <p className="text-ink-lo">{status.message}</p>}
      <div className="flex flex-wrap gap-2">
        <button className={btn} disabled={busy} onClick={() => void checkLicence()}>
          Check now
        </button>
        {!sure ? (
          <button className={btn} disabled={busy} onClick={() => setSure(true)}>
            Deactivate on this computer…
          </button>
        ) : (
          <>
            <button className={btn} disabled={busy} onClick={() => void deactivateLicence().then(() => setSure(false))}>
              Yes, deactivate
            </button>
            <button className={btn} onClick={() => setSure(false)}>
              Cancel
            </button>
          </>
        )}
      </div>
      <p className="text-[12px] leading-relaxed text-ink-lo">
        One key works on up to three computers. Deactivate here before moving Divina to a new one. Divina checks the licence with our shop, Lemon Squeezy, about once a week (your key and a random device name only), and keeps working offline for 30 days. Live scores and prices come from Divina’s data server, which also checks it.
      </p>
    </div>
  );
}
