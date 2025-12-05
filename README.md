# edge RFID Emulator

This repository contains two versions of the edge RFID Emulator:

## 1. Modern UI (`/modern-ui`)
The new, modern version of the emulator built with Electron, React, and TypeScript.
- **Location**: `modern-ui/`
- **Features**: Modern interface, dark mode, persistent profiles, improved UX.
- **Run**: Go to `modern-ui` directory and run `npm run electron:dev` (dev) or use the built installer in `dist-app`.

## 2. Legacy Java UI (`/legacy-java`)
The original Java Swing-based implementation.
- **Location**: `legacy-java/`
- **Run**: Run `run.bat` or `RFIDEmulator.jar`.

---
## Quick Start (Modern UI)

1. Navigate to the modern UI folder:
   ```bash
   cd modern-ui
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run electron:dev
   ```

4. Build executable:
   ```bash
   npm run build
   ```



