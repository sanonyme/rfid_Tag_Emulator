# Installing Zeus RFID Emulator on Your Phone

## Option 1: PWA (Progressive Web App) – Easiest

1. **Build the app:**
   ```bash
   npm run build:mobile
   ```

2. **Deploy** the `dist/` folder to a web server over **HTTPS** (required for PWA):
   - **Netlify:** Drag the `dist` folder to [netlify.com/drop](https://app.netlify.com/drop)
   - **Vercel:** `npx vercel dist`
   - **GitHub Pages:** Push `dist/` to a `gh-pages` branch
   - Or use any hosting with SSL (e.g. your own server)

3. **Install on your phone:**
   - **Android (Chrome):** Open the URL → tap menu (⋮) → **Install app** or **Add to Home screen**
   - **iOS (Safari):** Open the URL → tap Share → **Add to Home Screen**

4. The app will open full-screen like a native app.

---

## Option 2: Capacitor (Native App – App Store / Play Store)

### Android

1. **Install Android Studio** from [developer.android.com](https://developer.android.com/studio)

2. **Build and open:**
   ```bash
   npm run cap:android
   ```

3. **Run on device or emulator:**
   - Connect an Android phone via USB (enable USB debugging)
   - Or create an Android Virtual Device (AVD) in Android Studio
   - Click the Run button (▶) in Android Studio

4. **For Play Store:** Build a release APK/AAB in Android Studio (Build → Generate Signed Bundle/APK)

### iOS (requires Mac)

1. **Install Xcode** from the Mac App Store

2. **Build and open:**
   ```bash
   npm run cap:ios
   ```

3. **Run on device or simulator:**
   - Select a simulator or connected iPhone
   - Click Run (▶) in Xcode

4. **For App Store:** Configure signing in Xcode, then Archive and upload to App Store Connect

---

## Quick local test (same Wi‑Fi)

1. Run `npm run dev:mobile`
2. Find your PC’s IP (e.g. `ipconfig` on Windows)
3. On your phone, open `http://YOUR_PC_IP:5174` in the browser
4. Use device mode or add to home screen for a closer app experience

---

## Troubleshooting: "NetworkError" or "Auth failed" on iPhone

**Logical devices and OCR require the dev server proxy.** Both your iPhone and PC must be on the **same WiFi network**.

1. **Same WiFi:** iPhone on cellular won't reach `192.168.x.x` — switch to the same WiFi as your PC.
2. **Access URL:** Use `http://YOUR_PC_IP:5174` (e.g. `http://192.168.10.100:5174`), not localhost.
3. **Test proxy:** Open `http://YOUR_PC_IP:5174/api/ping` in Safari — should show `{"ok":true}`.
4. **Port 10482:** This is the OCR reader's port, not the iPhone's. The PC proxy sends TCP to the reader.
