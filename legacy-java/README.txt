====================================
RFID TAG EMULATOR
====================================

OVERVIEW:
This is a simple RFID tag emulator that sends tag data over TCP to RFID reader software.

REQUIREMENTS:
- Java JDK 8 or higher installed
- Java must be in your system PATH

BUILD INSTRUCTIONS:
1. Open Command Prompt or PowerShell
2. Navigate to this directory
3. Run: build.bat
4. Wait for compilation to complete

RUN INSTRUCTIONS:
1. After building, run: run.bat
2. The GUI will open

HOW TO USE:
1. CONNECTION:
   - Enter the host (IP address or hostname) of the RFID server
   - Enter the port number (default: 5084)
   - Click "Connect" to establish connection
   
2. ADD TAGS:
   - Enter EPCs in the text area (one per line)
   - You can paste multiple EPCs at once
   - Configure default values for all tags:
     * TID: Tag ID (default: E280)
     * UID: Unique ID (default: 0000)
     * Antenna: Antenna number 1-16 (default: 1)
     * RSSI: Signal strength (default: -45)
   
3. CONFIGURE SENDING:
   - Select a Driver from the dropdown (llrp, arp, impinjetk, etc.)
   - Set the Delay (ms) between sending tags
   
4. SEND TAGS:
   - Click "Send Tags" to transmit all EPCs from the text area
   - Each EPC will use the configured default values (TID, UID, Antenna, RSSI)
   - Progress will be shown in the log area
   
5. MANAGE EPCS:
   - Edit EPCs directly in the text area
   - Add or remove lines as needed
   - Each line represents one tag to send

CLEANING:
- Run clean.bat to remove compiled files

FILE STRUCTURE:
- TagData.java         - RFID tag data model
- VendorDriver.java    - Supported RFID reader vendors
- TCPEmulator.java     - TCP connection and sending logic
- EmulatorUI.java      - Graphical user interface
- build.bat            - Compile the application
- run.bat              - Run the application
- clean.bat            - Clean compiled files

TROUBLESHOOTING:
- If "javac" is not recognized: Make sure Java JDK is installed and in PATH
- If connection fails: Check the host/port and ensure the server is running
- If tags don't send: Make sure you're connected first

====================================

