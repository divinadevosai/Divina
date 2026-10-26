# Releasing Divina

Divina is free software (GNU AGPL-3.0). A release is a git tag: GitHub Actions
builds everything and attaches it to the GitHub release.

## Cut a release

1. Bump `version` in `package.json` and commit.
2. Either push a tag (`git tag v1.0.1 && git push origin v1.0.1`), or on
   GitHub open **Actions → Release → Run workflow**, which tags the current
   commit with the version from `package.json`.

3. `.github/workflows/release.yml` runs the tests, then builds and attaches:

   | File | What it is |
   | --- | --- |
   | `Divina-Setup.exe` | the Windows installer, always the latest (the website's Download button links here) |
   | `Divina-Setup-<version>.exe` | the same installer, by version (~34 MB, works offline) |
   | `Divina-Setup-<version>-web.exe` | the small installer (~13 MB) that downloads Node.js during setup |
   | `divina-web-<version>.zip` | the browser edition, served from `/app/`, with an `_headers` file |
   | `SHA256SUMS.txt` | checksums for all of the above |

   The latest release's files are always at
   `https://github.com/divinadevosai/divina/releases/latest/download/<file>`.

You can build the same files yourself: `npm run build:windows` (needs NSIS:
`apt install nsis`) and `npm run build:web`.

## Signing the Windows installer (optional)

Unsigned, Windows shows "Windows protected your PC · Unknown publisher" and
people click **More info → Run anyway**. To sign, buy a code-signing
certificate (for example SSL.com OV with eSigner, which works from the cloud),
then add a repository secret `DIVINA_WIN_SIGN` with the signing command, `%1`
standing for the file:

```
jsign --storetype ESIGNER --storepass "$SSL_COM_USER|$SSL_COM_PASS" --keypass "$SSL_COM_TOTP" --tsaurl http://ts.ssl.com --tsmode RFC3161 "%1"
```

and the secrets that command uses. Without `DIVINA_WIN_SIGN` the build skips
signing and says so.

## Mac and Linux

Coming soon. The Mac app builds (`npm run build:mac`) but must be signed with
an Apple Developer ID and notarized before people can open it; `codemagic.yaml`
has the workflow. There's no Linux build yet.
