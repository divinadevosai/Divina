'use client';
/**
 * The new tab's search box (extension only). Searches go to the browser's own
 * search engine through chrome.search, so Divina never picks or changes it;
 * anything that looks like a web address opens directly.
 */
import { useState } from 'react';

declare const chrome: { search?: { query(o: { text: string; disposition: 'CURRENT_TAB' }): Promise<void> } } | undefined;

/** A web address to open, or null to search. Only http(s): never javascript:, data: or chrome: pages. */
export function addressFor(input: string): string | null {
  const s = input.trim();
  if (!s || /\s/.test(s)) return null;
  if (/^https?:\/\/[^/]/i.test(s)) return s;
  if (/^localhost(:\d+)?(\/\S*)?$/i.test(s)) return `http://${s}`;
  if (/^[\w-]+(\.[\w-]+)*\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(s)) return `https://${s}`;
  return null;
}

export function SearchBar() {
  const [q, setQ] = useState('');
  const go = () => {
    const text = q.trim();
    if (!text) return;
    const address = addressFor(text);
    if (address) window.location.href = address;
    else void chrome?.search?.query({ text, disposition: 'CURRENT_TAB' });
  };
  return (
    <form
      role="search"
      className="glass pointer-events-auto flex w-[min(560px,calc(100vw-32px))] items-center gap-3 rounded-full px-5 py-3"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none text-ink-mid" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the web or type an address"
        aria-label="Search the web or type an address"
        autoComplete="off"
        spellCheck={false}
        className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-lo"
      />
    </form>
  );
}
