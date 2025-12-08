# Edge RFID Emulator v2.0

A powerful, modern desktop application for emulating RFID hardware and testing Edge Server integrations. This tool allows developers and QA engineers to simulate Fixed Readers, Handheld devices, and OCR scanners without needing physical hardware.

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![Tech](https://img.shields.io/badge/tech-Electron%20%7C%20React%20%7C%20TypeScript-green.svg)

## 🚀 Features

### 📡 Fixed Reader Emulation
- **Protocols**: Simulates LLRP and other reader drivers.
- **Tag Generation**: Generate EPCs from UPCs dynamically or input raw EPCs.
- **Batch Mode**: Send thousands of tags with configurable counts and optional custom TIDs.
- **Configuration**: Adjustable Antenna, RSSI, and UID parameters.

### 📱 Handheld Emulation
- **TCP Server**: Acts as a handheld server that the Edge Server connects to.
- **Inventory Mode**: Simulate inventory scans with bulk tag lists.
- **Flexible Data**: Support for `UPC,Count,TID` and `EPC,Count,TID` formats.

### 📷 OCR Emulation
- **Message Simulation**: Send JSON or raw text payloads to simulate OCR camera events.
- **Connection Test**: Verify host connectivity instantly.

### 🤖 Automation Builder (New in v2.0)
- **Workflow Editor**: Build complex test sequences visually.
- **Actions**:
  - `Delay`: Add pauses.
  - `OCR`: Send trigger messages.
  - `Fixed Tag`: Emulate reader events.
  - `Handheld Tag`: Emulate handheld scans.
- **Looping**: Run sequences once, N times, or infinitely.
- **Persistence**: Workflows are saved automatically with your profile.

### ⚙️ Utilities
- **Profile Manager**: Save, load, import, and export configurations (JSON) to switch between test scenarios easily.
- **Decoder**: Built-in tool to decode/encode EPCs (SGTIN-96, etc.).
- **Modern UI**: Dark mode interface with real-time logs and visual feedback.

---

## 🛠️ Installation

### For Users
1. Download the latest installer: `edge RFID Emulator Setup 2.0.0.exe`.
2. Run the installer.
3. The application will launch automatically.

### For Developers

**Prerequisites**
- Node.js (v18 or higher)
- npm (v9 or higher)

**Setup**
```bash
# Clone the repository
git clone <repository-url>

# Navigate to the project directory
cd modern-ui

# Install dependencies
npm install
```

**Running in Development Mode**
```bash
npm run dev
# OR use the provided batch file
./start-dev.bat
```

**Building for Production**
```bash
npm run build
```
The output installer will be located in `dist-app/`.

---

## 📖 Usage Guide

### 1. Connection Setup
- Enter your Edge Server **Host IP**.
- For Fixed Reader, enter the **Port** (default: `12352`).
- Click the **Connect** icon (plug) in the top right.

### 2. Generating Tags
You can input tags in two ways in both Fixed and Handheld tabs:

**UPC List** (Generates SGTIN-96 EPCs):
Format: `UPC, Count, Optional_TID`
```csv
1234567890123, 5          # 5 tags with this UPC, default TIDs
00000000000002, 3, AB12   # 3 tags, custom TID "AB12"
```

**EPC List** (Raw Hex):
Format: `EPC, Count, Optional_TID`
```csv
3034257BF400B7800004CB3F, 1
3034257BF400B7800004CB40, 5, CUSTOM_TID_123
```

### 3. Using Automation
1. Go to the **Auto** tab.
2. Click buttons to add steps (Delay, OCR, Fixed, Handheld).
3. Select a step to configure its parameters (Host, Tags, Duration).
4. Set **Loop Count** (1, 5, 10, or Infinite).
5. Click **Start**.
   - The active step will be highlighted in green.
   - Logs will appear in the right panel.

---

## 🏗️ Project Structure

- `src/` - React Renderer process code.
  - `components/` - UI components (Tabs, Profiles, etc.).
  - `lib/` - Logic for TCP clients (LLRP, Handheld) and EPC generation.
- `electron/` - Electron Main process code (System integration, TCP sockets).
- `dist-app/` - Compiled application executables.

---

## 📝 License
Proprietary - Internal Use Only.

