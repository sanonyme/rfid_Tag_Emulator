# Edge RFID Emulator - User Manual

## 1. Introduction
The **Edge RFID Emulator** is a desktop application designed to simulate RFID hardware environments. It allows you to test your Edge Server configurations and logic without requiring physical RFID tags, readers, handhelds, or OCRs.

## 2. Getting Started
### 2.1 Installation
1. Locate the installer file: `edge RFID Emulator Setup 2.0.0.exe` (version may change).
2. Double-click to install. The application will launch automatically upon completion.

### 2.2 Main Interface
The application is divided into five main tabs:
- **Fixed Reader**: Simulates stationary RFID portals (e.g., tunnels, dock doors, tabletops... ANY READER).
- **Handheld**: Simulates mobile RFID handheld devices.
- **OCR**: Emulates OCR messages.
- **Decoder**: A utility to decode EPC hex strings into human-readable formats.
- **Auto**: An automation builder to create sequenced test workflows.

---

## 3. Global Settings (Title Bar)
At the top of the window, you will find the connection settings that apply to most tabs:
- **Host**: Enter the IP address of your Edge Server (e.g., `127.0.0.1` or `192.168.1.50`).
- **Port**: The port number for the Fixed Reader connection (Default: `12352`), keep it as 12352 for tag emulation.
- **Connect/Disconnect**: Click the plug icon to establish or break the connection to the host.
- **Profiles**: Click the folder icon to Save, Load, Import, or Export your configuration profiles.

---

## 4. Fixed Reader Emulation
Use this tab to simulate tags passing through a fixed portal.

### 4.1 Configuration
- **Driver**: Select the reader protocol (e.g., `llrp`, `octane`) (doesn't really matter, put any value).
- **UID**: Unique Identifier for the simulated reader (the MAC address).
- **Antenna**: The antenna port number (e.g., `1`).
- **RSSI**: Signal strength of the tag reads (default: `-45.0`).

### 4.2 Tag Input
You can generate tags using two methods:

**A. By UPC (Product Code)**
Enter UPCs to automatically generate valid SGTIN-96 EPCs.
*Format:* `UPC, Count, Optional_TID`
> Example:
> `1234567890123, 10` (Generates 10 tags with this UPC)
> `1234567890123, 5, A1B2` (Generates 5 tags with custom TID "A1B2")

**B. By EPC (Raw Hex)**
Enter specific EPC hex strings.
*Format:* `EPC, Count, Optional_TID`
> Example:
> `3034257BF400B7800004CB3F, 1`

### 4.3 Sending Tags
1. Set the **Delay (ms)** to control speed between reads.
2. Click **Send Tags**. The application will connect to the host and stream the tag data.

---

## 5. Handheld Emulation
Use this tab to simulate a handheld device performing an inventory scan.

### 5.1 Setup
1. Enter a **Device ID** (e.g., `d9865ffbsyw523507` WHATEVER).
2. IMPORTANT!!!!!! ENSURE THAT THE DEBUG OPTION IN VSBL APP IS ON, and put the IP of your PC (ipconfig on windows) with port 10472.
3. Subcribe and Generate EPCs --> HH

### 5.2 Operation
1. Just generate ^^ same format for fixed reader with the optional custom TID (made for duplicate EPCs (rip SOP))

---

## 6. OCR Emulation
Use this tab to simulate OCR messages.

1. Ensure the **Host** IP is correct.
2. Enter your **Message** payload (JSON or text).
   > Example: `{"camera_id": "CAM01", "plate": "ABC-123"}`
Or just any plain text message
IMPORTANT!!!!!! MAKE SURE THAT THE GLOBAL VARIABLE FOR BARCODE SCANNER IP IS SET TO YOUR MACHINE'S IP :p
3. Click **Send Message**.

---

## 7. Automation Builder (Auto Tab)
The Automation Builder allows you to create complex, repeatable test scenarios.

### 7.1 Creating a Workflow
1. **Add Steps**: Click buttons at the bottom left to add actions to your sequence:
   - **Delay**: Wait for a specified time.
   - **OCR**: Send a message.
   - **Fixed**: Send a batch of tags.
   - **Handheld**: Perform a handheld scan.
2. **Configure Steps**: Click on any step in the list to edit its parameters in the middle panel.
   - *Note: You can drag and drop steps to reorder them using the arrows.*

### 7.2 Running Automation
1. **Loop Count**: Choose how many times to run the sequence (Once, 5x, 10x, or Infinite).
2. Click **Start**.
3. **Monitoring**:
   - The active step will be highlighted in **green** with a pulsing effect.
   - The log panel on the right shows real-time progress.
4. Click **Stop** at any time to abort the sequence.

---

## 8. Profile Management
Save your frequently used setups to avoid re-typing data.

- **Save**: Click "Profiles" -> "Save Current" to name and save your current configuration (including automation steps).
- **Load**: Click "Profiles" and select a saved profile from the list.
- **Import/Export**: Use these buttons to share profiles with colleagues via JSON files.

