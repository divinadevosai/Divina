'use client';
/**
 * If anything on the page crashes, a plain explanation and a way back —
 * never the framework's "Application error" message.
 */
import { useEffect } from 'react';

export default function PageError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    try {
      sessionStorage.setItem('divina.flat', '1'); // start again without the 3D room
    } catch {
      /* storage unavailable */
    }
    console.error(error);
  }, [error]);
  return (
    <main className="fixed inset-0 grid place-items-center bg-void p-6 text-center">
      <div className="max-w-sm space-y-4">
        <p className="hud-label">divina</p>
        <h1 className="text-[22px] text-ink">Something went wrong</h1>
        <p className="text-[14px] leading-relaxed text-ink-mid">
          This device couldn’t keep up with the 3D room. Divina can carry on in the simple view, with all your cards, voice and typing.
        </p>
        <div className="flex justify-center gap-2">
          <button className="glass rounded-full px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink" onClick={() => reset()}>
            simple view
          </button>
          <button
            className="rounded-full border border-ink-faint px-4 py-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-mid"
            onClick={() => {
              try {
                sessionStorage.removeItem('divina.flat');
              } catch {
                /* storage unavailable */
              }
              location.reload();
            }}
          >
            try 3D again
          </button>
        </div>
      </div>
    </main>
  );
}
