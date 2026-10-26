import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { providerFor, readInbox } from '../src/lib/server/providers/email';
import { coinIds, marketsUrl, toCryptoData } from '../src/lib/crypto/coingecko';
import { checkSetting } from '../src/lib/settingsSchema';

test('email providers: known servers, Outlook explained, unknown needs a server', () => {
  assert.equal((providerFor('me@gmail.com') as { host: string }).host, 'imap.gmail.com');
  assert.equal((providerFor('me@icloud.com') as { host: string }).host, 'imap.mail.me.com');
  assert.equal(providerFor('me@outlook.com'), 'microsoft');
  assert.equal(providerFor('me@example.org'), null);
});

test('email settings are checked', () => {
  assert.equal(checkSetting('DIVINA_EMAIL_ADDRESS', 'me@gmail.com'), null);
  assert.notEqual(checkSetting('DIVINA_EMAIL_ADDRESS', 'not an email'), null);
  assert.equal(checkSetting('DIVINA_EMAIL_PASSWORD', 'abcd efgh ijkl mnop'), null);
  assert.notEqual(checkSetting('DIVINA_EMAIL_HOST', '192.168.1.1'), null); // no numeric addresses
  assert.notEqual(checkSetting('DIVINA_EMAIL_HOST', 'imap.example.com:25'), null);
  assert.equal(checkSetting('DIVINA_EMAIL_HOST', 'imap.example.com'), null);
});

/** A tiny IMAP server that answers like Gmail and records every command. */
function fakeImap() {
  const seen: string[] = [];
  const msgs = [
    { uid: 11, seen: true, from: 'Alice Smith', addr: 'alice@example.com', subject: 'Lunch?', date: 'Mon, 28 Sep 2026 12:00:00 +0000' },
    { uid: 12, seen: false, from: 'Bank', addr: 'noreply@bank.example', subject: 'Your statement', date: 'Tue, 29 Sep 2026 09:30:00 +0000' },
  ];
  const server = net.createServer((sock) => {
    sock.write('* OK [CAPABILITY IMAP4rev1] ready\r\n');
    let buf = '';
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const [tag, cmdRaw, ...rest] = line.split(' ');
        const cmd = (cmdRaw ?? '').toUpperCase();
        seen.push(cmd === 'UID' ? `UID ${rest[0]?.toUpperCase()}` : cmd);
        const ok = (t = 'done') => sock.write(`${tag} OK ${t}\r\n`);
        if (cmd === 'CAPABILITY') sock.write('* CAPABILITY IMAP4rev1\r\n'), ok();
        else if (cmd === 'LOGIN') (rest[1]?.replace(/"/g, '') === 'right-app-password' ? ok('logged in') : sock.write(`${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`));
        else if (cmd === 'EXAMINE' || cmd === 'SELECT') sock.write(`* ${msgs.length} EXISTS\r\n* 0 RECENT\r\n* FLAGS (\\Seen)\r\n* OK [UIDVALIDITY 1] ok\r\n* OK [UIDNEXT 13] ok\r\n${tag} OK [READ-${cmd === 'EXAMINE' ? 'ONLY' : 'WRITE'}] done\r\n`);
        else if (cmd === 'STATUS') sock.write(`* STATUS INBOX (MESSAGES ${msgs.length} UNSEEN 1)\r\n`), ok();
        else if (cmd === 'FETCH' || (cmd === 'UID' && /FETCH/i.test(rest[0] ?? ''))) {
          msgs.forEach((m, k) =>
            sock.write(`* ${k + 1} FETCH (UID ${m.uid} FLAGS (${m.seen ? '\\Seen' : ''}) ENVELOPE ("${m.date}" "${m.subject}" (("${m.from}" NIL "${m.addr.split('@')[0]}" "${m.addr.split('@')[1]}")) NIL NIL NIL NIL NIL NIL "<${m.uid}@x>"))\r\n`),
          );
          ok();
        } else if (cmd === 'LOGOUT') sock.write('* BYE\r\n'), ok(), sock.end();
        else ok();
      }
    });
  });
  return { server, seen };
}

test('the inbox is read read-only: headers only, nothing marked, moved or sent', async () => {
  const { server, seen } = fakeImap();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as net.AddressInfo).port;
  try {
    const d = await readInbox('127.0.0.1', 'me@gmail.com', 'right-app-password', 'https://mail.google.com/', { port, secure: false });
    assert.equal(d.unread, 1);
    assert.equal(d.total, 2);
    assert.equal(d.messages[0].from, 'Bank'); // newest first
    assert.equal(d.messages[0].unread, true);
    assert.equal(d.messages[1].subject, 'Lunch?');
    assert.ok(seen.includes('EXAMINE'), `opened read-only: ${seen.join(',')}`);
    for (const forbidden of ['SELECT', 'STORE', 'UID STORE', 'COPY', 'MOVE', 'EXPUNGE', 'APPEND', 'DELETE']) assert.ok(!seen.includes(forbidden), `never ${forbidden}`);
    await assert.rejects(readInbox('127.0.0.1', 'me@gmail.com', 'wrong', undefined, { port, secure: false }));
  } finally {
    server.close();
  }
});

test('crypto: the request, and turning CoinGecko rows into a card', () => {
  assert.deepEqual(coinIds(' Bitcoin, ethereum ,bad id!, solana'), ['bitcoin', 'ethereum', 'solana']);
  const u = new URL(marketsUrl(['bitcoin', 'ethereum'], 'gbp', 'CG-key'));
  assert.equal(u.host, 'api.coingecko.com');
  assert.equal(u.searchParams.get('ids'), 'bitcoin,ethereum');
  assert.equal(u.searchParams.get('vs_currency'), 'gbp');
  const d = toCryptoData(
    [
      { id: 'ethereum', symbol: 'eth', name: 'Ethereum', current_price: 2500, market_cap: 3e11, price_change_percentage_24h: -1.2, sparkline_in_7d: { price: Array.from({ length: 168 }, (_, i) => 2400 + i) } },
      { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', current_price: 50000, market_cap: 1e12, price_change_percentage_24h: 2.5 },
    ],
    ['bitcoin', 'ethereum'],
    'gbp',
  );
  assert.deepEqual(d.coins.map((c) => c.id), ['bitcoin', 'ethereum']); // the person's order
  assert.equal(d.coins[1].spark.length, 42);
  assert.equal(d.source, 'Data provided by CoinGecko');
});
