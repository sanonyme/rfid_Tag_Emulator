# How to Run the Modern RFID Emulator with Java Backend

The modern Electron UI now connects to the actual Java backend servers!

## Architecture

- **Electron Frontend** (modern-ui) - Beautiful React UI
- **Java Backend** (root directory) - Handles actual TCP/IP connections and RFID emulation

## Running the App

### Option 1: Development Mode (Recommended for testing)

**Step 1: Start the Java Backend (if needed for Fixed Reader mode)**
The Java backend `TCPEmulator` connects to RFID readers. You typically don't need to start it separately unless you're testing with actual reader hardware.

**Step 2: Run the Electron App**
```bash
cd modern-ui
npm run electron:dev
```

The app will:
- Connect to Java backend when you click "Connect" (Fixed Reader tab)
- Start/connect to Handheld Server on port 10472 (Handheld tab)
- Send OCR messages to specified host (OCR tab)

### Option 2: Production Mode (Built .exe)

**Run the app:**
```
modern-ui\dist-app\win-unpacked\edge RFID Emulator.exe
```

## How It Works

### Fixed Reader Tab
- **Connect**: Creates TCP connection to specified host:port (typically your RFID reader)
- **Send Tags**: Sends formatted RFID tag data over TCP using the selected driver format
- Formats: LLRP, ARP, ImpinjETK, Octane, SEUIC

### Handheld Tab  
- **Subscribe**: Connects to Java Handheld Server on localhost:10472
- **Generate & Send**: Creates EPCs and broadcasts them to connected handheld devices
- The Java backend handles the server socket and client connections

### OCR Tab
- **Send Message**: Sends barcode/OCR data via TCP to specified host

## Differences from Java UI

✅ **Same Backend**: Uses the same Java TCP emulation logic
✅ **Same Protocols**: Compatible with all RFID drivers (LLRP, ARP, Impinj, etc.)
✅ **Better UI**: Modern, responsive interface with dark mode
✅ **Cross-Platform**: Works on Windows, Mac, and Linux

## Troubleshooting

### "Electron API not available"
- You're running in a browser instead of Electron
- Use `npm run electron:dev` instead of `npm run dev`

### Connection Refused
- Ensure the target RFID reader/server is running and accessible
- Check firewall settings
- Verify the correct host:port

### Handheld Server Issues
- The app automatically manages the Java Handheld Server
- Port 10472 must be available
- Ensure no other app is using this port

## Technical Details

The Electron app communicates with Java backend via:
1. **IPC (Inter-Process Communication)** between React UI and Electron main process
2. **Node.js TCP Sockets** in the Electron main process
3. **Real TCP/IP** to Java backend servers and RFID hardware

Files:
- `electron/tcp-handler.ts` - Real TCP socket implementation
- `electron/main.ts` - IPC handlers and Electron main process
- `electron/preload.ts` - Secure bridge between renderer and main
- `src/lib/tcp-client.ts` - React/TypeScript TCP client wrapper

