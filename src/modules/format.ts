export const fmt = {
  money(v: number, currency = 'USD', compact = false) {
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency, notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 2 }).format(v);
    } catch {
      return `${v.toFixed(2)} ${currency}`;
    }
  },
  num(v: number, compact = false) {
    return new Intl.NumberFormat(undefined, { notation: compact ? 'compact' : 'standard', maximumFractionDigits: compact ? 1 : 0 }).format(v);
  },
  pct(v: number, digits = 2, sign = true) {
    return `${sign && v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
  },
  bytes(v: number) {
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (v >= 1024 && i < u.length - 1) {
      v /= 1024;
      i++;
    }
    return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${u[i]}`;
  },
  age(at?: number, now = Date.now()) {
    if (!at) return '—';
    const s = Math.max(0, Math.round((now - at) / 1000));
    if (s < 5) return 'now';
    if (s < 60) return `${s}s ago`;
    const m = Math.round(s / 60);
    if (m < 60) return `${m}m ago`;
    return `${Math.round(m / 60)}h ago`;
  },
  /** Minute-level age for the 3D cards: redrawing a card costs a texture upload, so its label changes at most once a minute. */
  ageCoarse(at?: number, now = Date.now()) {
    if (!at) return '—';
    const m = Math.floor(Math.max(0, now - at) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    return `${Math.floor(m / 60)}h ago`;
  },
  time(iso: string) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  },
  day(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });
  },
  duration(s: number) {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  },
};
