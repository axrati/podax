# Podax

Podax is an offline Electron desktop application for encrypting files and folders on Windows,
macOS, and Linux. It does not require an account or a network connection, and the production
application blocks outbound web requests.

> Keep a separate, secure record of every password. Podax never stores passwords and cannot recover
> one that is lost. Verify restored data before deleting an original or backup.

## Security and file format

New `.podax` archives use a versioned streaming format with:

- AES-256-GCM authenticated encryption;
- a random 128-bit salt and 96-bit initialization vector per archive;
- a 256-bit key derived with `scrypt` (`N=2^17`, `r=8`, `p=1`);
- portable path-component metadata rather than source-OS absolute paths;
- private staging and an authenticated commit before restored output becomes visible;
- collision-safe output names and restrictive Unix permissions.

New archive passwords must contain at least 12 characters; the built-in generator produces eight
random words. Podax can still decrypt unauthenticated AES-CTR archives up to 64 MiB created by the
original release, including insecure archives created with a blank password. The size cap prevents
that legacy whole-archive format from exhausting application memory. Important restored data should
be encrypted again to migrate it to the authenticated format.

Symbolic links and special filesystem entries are rejected instead of being followed. Empty
directories, regular file contents, timestamps, and an owner's executable bit are preserved where
the destination operating system supports them; restored data is never made accessible to other
local users through inherited Unix mode bits.

Completed archives and restored data are written to a `Podax` folder in the current user's home
directory. Existing output is never silently overwritten.

## Development

Requirements:

- Node.js 24 LTS (the declared compatibility range also includes supported even-numbered Node
  releases from 22.12 onward)
- npm 11

From the application directory:

```bash
cd podax
npm ci
npm start
```

`npm start` launches Vite and Electron together. DevTools stay closed unless
`PODAX_OPEN_DEVTOOLS=1` is set.

Useful checks:

```bash
npm run lint
npm test
npm run build
npm run verify
```

`npm run verify` is the release gate: lint, renderer tests, archive-service tests, and a production
renderer build. The tests cover authenticated streaming, deep and empty folders, tamper and
wrong-password failure, output collisions, symlink rejection, legacy archives, and renderer flows.

## Packaging

The build directories have separate purposes:

- `dist/` — Vite renderer output included in the application ASAR
- `build-resources/` — platform icons and packaging resources
- `release/` — unpacked applications and distributable installers

Build an unpacked application for the current host:

```bash
npm run pack
```

Build installers for the current host, or explicitly select a platform:

```bash
npm run dist
npm run dist:mac -- --universal --publish never
npm run dist:win -- --x64 --arm64 --publish never
npm run dist:linux -- --x64 --arm64 --publish never
```

Configured artifacts are:

| Platform | Architectures | Artifacts |
| --- | --- | --- |
| macOS | Universal (Intel + Apple Silicon) | DMG and ZIP |
| Windows | x64 and ARM64 | NSIS installer |
| Linux | x64 and ARM64 | AppImage and DEB |

Use a native host for release artifacts. In particular, macOS signing and notarization require
macOS. The repository's GitHub Actions workflow builds on all three native runners, smoke-tests a
native package on each platform, uploads installers, and publishes tag releases with SHA-256
checksums.

## Signing and releases

Normal local and pull-request macOS packages are ad-hoc signed so they can launch on Apple Silicon.
They are development artifacts, not public releases.

Create the following GitHub Actions secrets before pushing a `v*` release tag:

| Secret | Purpose |
| --- | --- |
| `MAC_CSC_LINK` | Base64 or URL for a Developer ID Application `.p12` |
| `MAC_CSC_KEY_PASSWORD` | Password for the macOS certificate |
| `APPLE_API_KEY` | Base64 App Store Connect `.p8` key |
| `APPLE_API_KEY_ID` | App Store Connect key ID |
| `APPLE_API_ISSUER` | App Store Connect issuer ID |
| `WIN_CSC_LINK` | Base64 or URL for an Authenticode `.pfx` |
| `WIN_CSC_KEY_PASSWORD` | Password for the Windows certificate |

The tag workflow fails before publishing if the required macOS or Windows signing credentials are
missing. electron-builder signs with the supplied certificates, notarizes and staples the macOS
artifacts, and GitHub publishes only after every platform job succeeds.

## Architecture

- `electron/main.cjs` owns dialogs, path validation, encryption, decryption, and the restricted
  application protocol.
- `electron/preload.cjs` exposes only six purpose-built promise APIs to the renderer.
- The renderer has no Node.js integration. Context isolation, renderer sandboxing, a restrictive
  Content Security Policy, blocked navigation/new windows, IPC sender validation, and hardened
  Electron fuses are enabled.
- `electron/archive.cjs` implements the streaming archive format and legacy reader independently of
  Electron, so it can be tested with Node's built-in test runner.

## License

Podax is distributed under the [MIT License](podax/LICENSE). Bundled dependency and font licenses
are recorded in [THIRD_PARTY_NOTICES.txt](podax/THIRD_PARTY_NOTICES.txt) and included with every
packaged application.
