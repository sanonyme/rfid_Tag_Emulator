# Android UI revamp

The shared Compose experience is applied to every existing Android module: home, Edge discovery, connected-reader options, fixed emulation, handheld connection and emulation, GS1 codec, Files, Database, OCR, LAN scanner, and Tag Synthesizer.

## Interaction and appearance

- Module colors, ambient gradients, animated activity bars and live status summaries.
- Panel reveals and expanding content; spring feedback and soft sounds on primary actions.
- Short slide, fade and scale transitions between destinations.
- Persistent app sound and reduced-motion controls, available on home and module screens.
- A shared module header now shows each screen's live status and activity state, with stronger contrast in light mode.
- Unified navy and slate surfaces, clearer text colors, and module-colored primary actions across the Android screens.
- The original dotted Edge-search halo is retained.
- Tag Synthesizer now follows the app's light/dark theme.

## Electron alignment

| Area | Comparison / correction |
| --- | --- |
| Fixed reader | Field order, optional user data and LF termination match `modern-ui/src/lib/tcp-wire-format.ts`; covered by tests. |
| Handheld | JSON fields, empty-TID fallback, optional user data and CRLF match `modern-ui/src/lib/handheld-wire-format.ts`; covered by tests. Disconnection during sending no longer reports a successful broadcast to zero clients. |
| Database | MySQL/PostgreSQL identifier quoting, parameter binding, 1,000-row SQL cap, and container-item lookup fields/deleted-row filtering aligned with desktop helpers. |
| Files | Changing protocol disconnects the previous session; folder navigation uses the backend's full path, including S3 prefixes. |
| Navigation | Removed duplicate OCR destination; home shortcuts retain their existing feature destinations. |
| Discovery / OCR / LAN / synthesis | Existing networking, decoding and generation implementations retained; visible status is driven by actual ViewModel state. Existing parser, socket, subnet and synthesis tests pass. |

This is alignment of the existing Android modules, not a complete port of every Electron feature. Electron-only Edge management, API, Automation, administration, log analysis, and other desktop utilities remain outside this implementation. Real external reader, database and remote-storage connections still require testing against the user's services.

## Verification

- `:app:assembleDebug` and `:app:testDebugUnitTest` passed, 28 tests and zero failures.
- Debug APK: `app/build/outputs/apk/debug/app-debug.apk`.
- Emulator screenshots: `artifacts/ui-review/`.
- Compilation on this Windows host uses JDK 21. A Java Unix-domain pipe failure was worked around for the build process by setting `jdk.net.unixdomain.tmpdir` to a nonexistent path, making Java fall back to TCP for its local pipe. No machine-wide Java settings were changed.
