import 'server-only';
/**
 * Email, read over IMAP on this computer: the standard way mail apps work.
 * The person gives an *app password* (made in their own account's security
 * settings), never their real password, and Divina:
 *   - connects only over TLS (port 993, certificate checked)
 *   - opens the inbox read-only (EXAMINE), so nothing is marked read,
 *     moved, deleted or sent
 *   - fetches only headers (sender, subject, date, read flag)
 * Gmail's own API is not used: it would need Google's paid yearly security
 * assessment for every app that reads mail.
 */
import { ImapFlow } from 'imapflow';
import { redactSecrets, setting } from '@/lib/server/settings';
import { cached, type ProviderResult } from '../http';
import type { EmailData, EmailMessage } from '@/modules/types';

interface Provider {
  host: string;
  web?: string;
  help: string;
}

const GOOGLE: Provider = { host: 'imap.gmail.com', web: 'https://mail.google.com/', help: 'Google Account → Security → 2-Step Verification → App passwords' };
const APPLE: Provider = { host: 'imap.mail.me.com', web: 'https://www.icloud.com/mail', help: 'account.apple.com → Sign-In and Security → App-Specific Passwords' };
const YAHOO: Provider = { host: 'imap.mail.yahoo.com', web: 'https://mail.yahoo.com/', help: 'Yahoo Account Security → Generate app password' };

export const PROVIDERS: Record<string, Provider> = {
  'gmail.com': GOOGLE,
  'googlemail.com': GOOGLE,
  'icloud.com': APPLE,
  'me.com': APPLE,
  'mac.com': APPLE,
  'yahoo.com': YAHOO,
  'yahoo.co.uk': YAHOO,
  'ymail.com': YAHOO,
  'aol.com': { host: 'imap.aol.com', web: 'https://mail.aol.com/', help: 'AOL Account Security → Generate app password' },
  'fastmail.com': { host: 'imap.fastmail.com', web: 'https://app.fastmail.com/', help: 'Fastmail Settings → Privacy & Security → App passwords' },
  'zoho.com': { host: 'imap.zoho.com', web: 'https://mail.zoho.com/', help: 'Zoho Accounts → Security → App passwords' },
  'gmx.com': { host: 'imap.gmx.com', web: 'https://www.gmx.com/', help: 'GMX Settings → POP3 & IMAP (allow access)' },
  'gmx.co.uk': { host: 'imap.gmx.co.uk', web: 'https://www.gmx.co.uk/', help: 'GMX Settings → POP3 & IMAP (allow access)' },
};

const MICROSOFT = /^(outlook|hotmail|live|msn)\./;

export function providerFor(address: string): Provider | 'microsoft' | null {
  const domain = address.split('@')[1]?.toLowerCase() ?? '';
  if (MICROSOFT.test(domain)) return 'microsoft';
  return PROVIDERS[domain] ?? null;
}

const HOW =
  'Connect your inbox: in ⚙ Settings → Email, enter your address and an app password (a separate password your email provider makes for apps like Divina — not your normal password).';

export async function getEmail(): Promise<ProviderResult<EmailData>> {
  const address = setting('DIVINA_EMAIL_ADDRESS');
  const password = setting('DIVINA_EMAIL_PASSWORD');
  if (!address || !password) return { status: 'unconfigured', message: HOW };
  const known = providerFor(address);
  if (known === 'microsoft') {
    return { status: 'unconfigured', message: 'Outlook.com and Hotmail only allow Microsoft’s own sign-in for apps, which Divina doesn’t support yet. Gmail, iCloud, Yahoo and most other providers work.' };
  }
  const host = setting('DIVINA_EMAIL_HOST') ?? known?.host;
  if (!host) return { status: 'unconfigured', message: `Divina doesn’t know the mail server for ${address.split('@')[1]}. Add its IMAP server in ⚙ Settings → Email (your provider’s help pages list it, e.g. imap.example.com).` };

  try {
    const data = await cached(`mail:${address}:${host}`, 2.5 * 60_000, () => readInbox(host, address, password, known?.web));
    return { status: 'ok', data };
  } catch (err) {
    const e = err as { authenticationFailed?: boolean; code?: string; message?: string };
    if (e.authenticationFailed || /auth|credentials|login/i.test(e.message ?? '')) {
      return { status: 'error', message: `The mail server refused the password. Use an app password, not your normal one${known ? ` (${known.help})` : ''}.` };
    }
    if (e.code === 'ENOTFOUND' || e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT') {
      return { status: 'error', message: `Couldn’t reach the mail server ${host}. Check your internet connection and the server name.` };
    }
    return { status: 'error', message: redactSecrets(`Couldn’t read your inbox: ${e.message ?? String(err)}`) };
  }
}

/** Exported for the tests, which talk to a local stand-in server without TLS; Divina itself always uses the defaults. */
export async function readInbox(host: string, user: string, pass: string, webUrl?: string, conn: { port: number; secure: boolean } = { port: 993, secure: true }): Promise<EmailData> {
  const client = new ImapFlow({
    host,
    port: conn.port,
    secure: conn.secure, // TLS only in Divina; the certificate is verified
    auth: { user, pass },
    logger: false, // never log the conversation (it contains the login)
    socketTimeout: 20_000,
    greetingTimeout: 10_000,
    emitLogs: false,
  });
  // ImapFlow reports socket trouble as 'error' events; unhandled, one would take the whole server down
  client.on('error', () => {});
  try {
    await client.connect();
  } catch (err) {
    client.close(); // a refused login must not leave a socket behind
    throw err;
  }
  try {
    const lock = await client.getMailboxLock('INBOX', { readOnly: true });
    try {
      const status = await client.status('INBOX', { messages: true, unseen: true });
      const total = status.messages ?? 0;
      const messages: EmailMessage[] = [];
      if (total > 0) {
        for await (const m of client.fetch(`${Math.max(1, total - 7)}:*`, { envelope: true, flags: true, uid: true })) {
          const from = m.envelope?.from?.[0];
          messages.push({
            id: String(m.uid),
            from: (from?.name || from?.address || 'Unknown sender').slice(0, 120),
            subject: (m.envelope?.subject ?? '').slice(0, 200),
            at: m.envelope?.date ? new Date(m.envelope.date).getTime() : Date.now(),
            unread: !m.flags?.has('\\Seen'),
          });
        }
      }
      messages.sort((a, b) => b.at - a.at);
      return { address: user, unread: status.unseen ?? 0, total, messages, webUrl, source: `IMAP · ${host} · read-only`, fetchedAt: Date.now() };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}
