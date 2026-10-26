'use client';
/**
 * Divina for Windows and Mac are paid: until this computer is activated with
 * a licence key, this screen covers the room. The key comes in the receipt
 * email from the shop.
 */
import { useEffect, useRef, useState } from 'react';
import { activateLicence, loadLicence, useLicence } from '@/lib/client/licence';
import { WEB } from '@/lib/edition';

export function LicenceGate() {
  const status = useLicence((s) => s.status);
  const busy = useLicence((s) => s.busy);
  const [key, setKey] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const locked = !WEB && !!status && !status.ok;

  useEffect(() => {
    void loadLicence();
    // check again when Divina comes back to the front (a long-open window)
    const again = () => document.visibilityState === 'visible' && void loadLicence();
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, []);

  // while locked, keyboard shortcuts don't reach the room behind
  useEffect(() => {
    if (!locked) return;
    input.current?.focus();
    // stopping the event doesn't stop typing, Tab or Enter-to-submit: those are the browser's own defaults
    const stop = (e: KeyboardEvent) => e.stopImmediatePropagation();
    window.addEventListener('keydown', stop, true);
    return () => window.removeEventListener('keydown', stop, true);
  }, [locked]);

  if (!locked || !status) return null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!key.trim() || busy) return;
    const s = await activateLicence(key);
    if (s?.ok) setKey('');
  };
  return (
    <div id="licence-gate" className="fixed inset-0 z-[95] grid place-items-center bg-void/80 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="licence-title">
      <form onSubmit={submit} className="glass w-[min(460px,94vw)] rounded-2xl p-6">
        <p className="hud-label !text-holo-hi">Divina for {navigator.userAgent.includes('Mac') ? 'Mac' : 'Windows'}</p>
        <h2 id="licence-title" className="mt-2 text-[22px] font-semibold text-ink">Activate Divina</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-ink-mid">
          Enter the licence key from your receipt email. One key works on up to three of your computers.
        </p>
        <label className="mt-4 block text-[12px] text-ink-lo" htmlFor="licence-key">
          Licence key
        </label>
        <input
          id="licence-key"
          ref={input}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
          autoComplete="off"
          spellCheck={false}
          className="mt-1 w-full rounded-lg border border-ink-faint bg-void/60 px-3 py-2.5 font-mono text-[14px] text-ink outline-none focus:border-holo"
        />
        {status.message && (
          <p className="mt-3 text-[13px] leading-relaxed text-ink-mid" role="status">
            {status.message}
          </p>
        )}
        <button type="submit" disabled={busy || !key.trim()} className="mt-4 w-full rounded-lg border border-holo/60 bg-holo/15 px-3 py-2.5 text-[14px] text-ink hover:bg-holo/25 disabled:opacity-50">
          {busy ? 'Checking…' : 'Activate'}
        </button>
        <p className="mt-4 text-[12px] leading-relaxed text-ink-lo">
          No key yet?{' '}
          <a className="text-holo-hi underline" href={status.buyUrl} target="_blank" rel="noopener">
            Buy Divina
          </a>{' '}
          · Lost your key? Email <a className="underline" href="mailto:dev@divinaos.site">dev@divinaos.site</a>. Activating sends your key and a random device name to our shop, Lemon Squeezy, and nothing else.
        </p>
      </form>
    </div>
  );
}
