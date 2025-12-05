## edge RFID Emulator – User Guide

---

## 1. Installing the app (Windows)

1. Locate the installer file you received, for example:  
   **`edge RFID Emulator Setup 2.0.0.exe`**
2. Double‑click the file.
3. If Windows SmartScreen appears:
   - Click **More info**
   - Click **Run anyway**
4. Follow the installer steps until it finishes.

After installation:

- The app is installed under your Windows user, typically:  
  `C:\Users\<YourUser>\AppData\Local\Programs\edge RFID Emulator`
- A **Desktop shortcut** named **“edge RFID Emulator”** is created.
- A **Start Menu entry** named **“edge RFID Emulator”** is created.

---

## 2. Starting the app

You can start the app in any of these ways:

- Double‑click the **Desktop shortcut**:  
  **edge RFID Emulator**
- OR open the **Start Menu** and search for:  
  **edge RFID Emulator**
- OR run the executable directly from the install folder:  
  `edge RFID Emulator.exe` under  
  `C:\Users\<YourUser>\AppData\Local\Programs\edge RFID Emulator`

---

## 3. Basic usage

When you open the app, you’ll see three main tabs:

- **Fixed Reader** – emulate tags on fixed RFID reader that connects through TCP.
- **Handheld** – emulate a handheld device server (default port 10472).
- **OCR** – send OCR text messages to Edge (default port 10482).

### Fixed Reader tab (typical flow)

1. **Connect**
   - Enter the **Host** (IP Address of Edge) and **Port** (default port is `12352` for tag emulation to Edge).
   - Click **Connect**.
2. **Configure tags**
   - Set antenna, RSSI, UID (station MAC Address, check in Stations, in Edge), and any other parameters if needed.
3. **Generate EPCs**
   - From **UPC**: enter UPC codes and quantities (e.g. `00000000000001,5`).
   - Or directly enter **EPC** values.
4. **Send tags**
   - Click the **Send** button (for tags) in the Fixed tab.
   - Watch the log area for connection and tag‑sending status.

### Handheld tab (typical flow)

1. Click **Subscribe** to start the handheld server (default port `10472`).
2. Enter UPC or EPC values for the tags you want to emulate.
3. Use the **Generate EPCs → HH** button to send tags to connected handheld clients.

### OCR tab (typical flow)

1. Type the OCR message text you want to send, Inditex / Tempe messages compatible.
2. Make SURE that the Scanner IP (variable in Edge) is set to your machine's IP --> (check your IP by running ipconfig on cmd, or through Task Manager)
2. Click **Send Message**.
3. The message is sent to your OCR host (default port `10482`).

---

## 4. Uninstalling the app

To remove the app:

1. Open **Settings** → **Apps** → **Installed apps** (or **Apps & features**).
2. Find **edge RFID Emulator** in the list.
3. Click **Uninstall** and follow the prompts.

You can also run the uninstaller directly from:

`C:\Users\<YourUser>\AppData\Local\Programs\edge RFID Emulator\Uninstall edge RFID Emulator.exe`

---