// Signs one Windows file with the code-signing certificate, if one is set up:
//   DIVINA_WIN_SIGN='jsign --storetype ESIGNER --storepass "$SSL_COM_USER|$SSL_COM_PASS" --keypass "$SSL_COM_TOTP" --tsaurl http://ts.ssl.com --tsmode RFC3161 "%1"'
// %1 is replaced by the file. Called by build-windows.mjs for Divina.exe and
// by makensis (!finalize / !uninstfinalize) for the installer and uninstaller.
// Without DIVINA_WIN_SIGN it does nothing, and the build says it's unsigned.
import { spawnSync } from 'node:child_process';

const file = process.argv[2];
const cmd = process.env.DIVINA_WIN_SIGN;
if (!file) process.exit(2);
if (!cmd) process.exit(0);
const r = spawnSync(cmd.replaceAll('%1', file.replaceAll('"', '')), { shell: true, stdio: 'inherit' });
process.exit(r.status ?? 1);
