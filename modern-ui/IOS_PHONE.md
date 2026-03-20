# Install Zeus on your iPhone (Xcode)

## After you change the web app

```bash
cd modern-ui
npm run cap:sync      # rebuild web + copy to iOS
```

Then in Xcode press **⌘R** to run on your device again.

## Full flow (first time or fresh clone)

1. **Build & sync** (already done if you ran this recently):

   ```bash
   cd modern-ui
   npm install
   npm run cap:sync
   ```

2. **Open Xcode**:

   ```bash
   npx cap open ios
   ```

   Opens: `ios/App/App.xcodeproj`

3. **Connect your iPhone** (USB), unlock it, tap **Trust** if asked.

4. **Select device**  
   Top toolbar: choose your **iPhone** (not a simulator).

5. **Signing**  
   Left sidebar → blue **App** project → **App** target → **Signing & Capabilities**:
   - Enable **Automatically manage signing**
   - **Team:** your Apple ID

   If the bundle ID is taken, change **Bundle Identifier** (e.g. `com.yourname.zeusrfid`) to match what you own under your team.

6. **Run**  
   **⌘R** or the Play button.

7. **Trust developer (first install)**  
   On iPhone: **Settings → General → VPN & Device Management** → trust your developer app → launch the app again.

## Quick reference

| Action              | Command                          |
|---------------------|----------------------------------|
| Rebuild web + iOS   | `npm run cap:sync`               |
| Open Xcode          | `npx cap open ios`               |
| One shot (sync+open)| `npm run cap:ios`                |

## Zeus app icon

The iOS asset `AppIcon` is generated from `public/zeus-removebg-preview.png` (1024×1024). After replacing that file, re-run `npm run cap:sync` and in Xcode do **Product → Clean Build Folder**, then build.

## Logical devices (ALE) on the phone

- **HTTP + local Wi‑Fi** is allowed (`Info.plist` ATS + local network usage).
- **Credentials** must be in `modern-ui/.env` as `VITE_ALE_USERNAME` / `VITE_ALE_PASSWORD`, then run `npm run cap:sync` so they are baked into the bundle. Without them, logical device fetch will fail.

## Fixed reader (tag send) on the phone

The desktop app sends tag lines over **TCP** (default **`host:12352`**) — the same as `electron/tcp-handler.ts`. On iPhone this is implemented by **`FixedReaderTcpPlugin.swift`** (connect, then one line per tag). Connect in the app first, then send tags; approve **Local Network** when prompted.

## OCR on the phone

Native **TCP to `host:10482`** uses `OCRTcpPlugin.swift`, registered from **`AppBridgeViewController`** (Capacitor 8). Approve **Local Network** if iOS asks. Reader must be on the same Wi‑Fi as the phone.

If you see **“OCRTcp … not implemented”**, clean build in Xcode (**Product → Clean Build Folder**), run `npm run cap:sync`, and rebuild — the storyboard must use `AppBridgeViewController`, not the stock `CAPBridgeViewController`.
