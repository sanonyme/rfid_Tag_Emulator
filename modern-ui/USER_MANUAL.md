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
The Automation Builder is a visual, node-based workflow editor for building complex,
repeatable test scenarios. Nodes are placed on a canvas and connected with links that
define the order — and, with Condition nodes, the *branches* — of execution.

### 7.1 Adding Nodes
Click **ADD NODE** (top-right) and pick a node type:

**Actions**
- **Delay** — Wait for a set number of milliseconds.
- **OCR** — Send an OCR message.
- **Fixed Reader** — Emulate a batch of fixed-reader tags.
- **Handheld** — Emulate handheld tags.
- **Custom Message** — Send a raw TCP message.

**Building blocks**
- **Set Variable** — Store a value (supports `{{variables}}`) for later nodes.
- **Database Query** — Run a read query (SELECT) and capture a cell into a variable.
- **SQL Statement (any)** — Run *any* SQL: INSERT, UPDATE, DELETE, CREATE/ALTER/DROP,
  CALL, etc. Captures the affected-row count and (for inserts) the new auto-increment
  id into variables. Use this when you need to *change* data, not just read it.
- **HTTP Request** — Send a GET/POST/PUT/PATCH/DELETE/HEAD request to any URL (routed
  through the desktop app, so no CORS limits — the same engine the API tab uses).
  Templated URL, headers, and body; capture the status, response body, or a JSON field
  (via a dot path like `data.items.0.epc`) into variables. Bridges Automation ↔ API.
- **Run Script** — Execute an inline or on-disk script (admin only).

**Flow control**
- **Condition (if / branch)** — Compare two values and route the flow through a
  **TRUE** or **FALSE** output port. Use it to branch on tag counts, OCR responses,
  query results, script output, etc.
- **Call Sequence** — Run another sequence as a re-usable sub-routine, then continue.
  Variables are **shared** between caller and callee, so you can factor common steps
  (login, setup, cleanup) into one sequence and call it from many. Recursive calls are
  detected and skipped; nesting is capped at 20 levels.
- **Log Message** — Write a templated line to the activity log. At **Error** level it
  can also abort the whole run — useful for failing a run when a bad path is hit.

**Edge API** — Invoke an Edge block, or start/stop an Edge process.

### 7.2 Linking Nodes (Manual Connections)
Connections are **fully manual** — you decide how the flow runs:
- Every node has an **input dot** on its left and one or more **output dots** on its right.
- **Create a link**: press an output dot and drag onto the target node, then release.
- **Condition nodes** have two output dots — green **T** (true) and red **F** (false).
  Link each to the node that should run for that outcome.
- **Remove a link**: hover the arrow and click it (a red ✕ appears).
- Each output port keeps a single outgoing link; dragging a new one replaces it —
  and dragging the exact same link again removes it.
- **Self-loop**: drag a node's output dot back onto that *same* node to make it
  repeat itself (shown as a dashed amber loop under the node). Pair this with a
  Condition node's TRUE branch to build a "while" loop — e.g. loop on TRUE until a
  variable hits a threshold, then continue on FALSE. Loops run up to 10,000 steps
  per pass as a runaway-loop safety limit.
- Toolbar (top-left of the canvas):
  - **Auto-link** — chain all nodes left-to-right by position (quick linear flow).
  - **Clear links** — remove every connection in the current sequence.
- **Move a node**: drag its **⋮⋮** grip. **Configure**: click the node or its ⚙ icon.
  **Pan**: drag the empty background. **Zoom**: mouse wheel or the zoom controls.

*Existing workflows from older versions are migrated automatically into an equivalent
linear set of links, so they keep running exactly as before.*

### 7.3 How a Sequence Runs
Execution starts at the node(s) with **no incoming link** (left-most first) and follows
the links. A Condition node evaluates its expression and continues down its TRUE or
FALSE branch. Nodes that aren't reachable from a start node are skipped. Cyclic links
(loops) are allowed but capped at 10,000 steps as a safety guard.

Multiple **sequences** (left panel) run one after another in their listed order — except
sequences that are the target of a **Call Sequence** node, which become sub-routines and
run only when called (not on their own turn).

### 7.4 Running Automation
1. **Run mode**: choose **By loop count** (Once, 5x, 10x, custom, or Infinite) or
   **For duration** (run repeatedly for N seconds).
2. Click **Start**.
3. **Monitoring**:
   - The active node is highlighted in **green** with a pulsing effect.
   - The activity log on the right shows real-time progress, including which
     Condition branch was taken.
   - The **Variables** panel (above the log) is a live inspector of the run context —
     connection values (`host`, ports), captured tag data (`epc`, `epcs`, `tagCount`),
     and anything set by Set Variable / SQL / HTTP / Script nodes. It updates after each
     node and keeps the final values after the run so you can inspect results.
4. Click **Stop** at any time to abort.

### 7.5 Variables
Nodes share a set of `{{variables}}`. Insert them anywhere you see the variable picker
(URLs, SQL, messages, script args…). Standard ones include `{{host}}`, `{{epc}}`,
`{{epcs}}`, `{{epcsSql}}`, `{{tagCount}}`, and `{{lastOcrResponse}}`; nodes that save
results (SQL affected rows, HTTP status/body/JSON field, script stdout) add your own.
Watch them all live in the **Variables** panel.

### 7.6 Import / Export
Use the **Import** / **Export** buttons above the sequence list to save or share entire
workflows (nodes, positions, and links) as JSON.

---

## 8. Profile Management
Save your frequently used setups to avoid re-typing data.

- **Save**: Click "Profiles" -> "Save Current" to name and save your current configuration (including automation steps).
- **Load**: Click "Profiles" and select a saved profile from the list.
- **Import/Export**: Use these buttons to share profiles with colleagues via JSON files.

