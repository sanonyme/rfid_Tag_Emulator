# Edge RFID Emulator

A comprehensive RFID tag emulation suite providing both a modern, feature-rich desktop application and a legacy Java-based utility. This tool is designed to simulate RFID tag data transmission over TCP/IP to RFID reader software and Edge servers, facilitating testing and development without physical hardware.

![License](https://img.shields.io/github/license/sanonyme/rfid_Tag_Emulator)
![Version](https://img.shields.io/github/v/release/sanonyme/rfid_Tag_Emulator)

## 🌟 Modern UI

The **Modern UI** is the recommended version for most users. It is a cross-platform desktop application built with Electron, React, and TypeScript, offering a sleek interface and advanced features.

### Key Features
*   **Fixed Reader Emulation**: Connect to Edge servers via TCP (default port `12352`) to simulate fixed RFID readers.
*   **Handheld Device Emulation**: Acts as a handheld server (default port `10472`) allowing clients to subscribe to tag events.
*   **OCR Emulation**: Send OCR text messages to Edge systems (default port `10482`), compatible with Inditex/Tempe message formats.
*   **Automation Builder**: Create and save complex sequences of actions (Delays, OCR messages, Tag reads) to automate testing scenarios.
*   **EPC Tools**: Built-in SGTIN-96 Decoder and Encoder with support for custom filters, partitions, and automatic check-digit validation.
*   **Smart EPC Generation**: Automatically generate valid EPCs from UPC codes or input them manually.
*   **Profile Management**: Save and switch between different configuration profiles (IPs, ports, simulation settings).
*   **User Experience**: Dark mode support, intuitive dashboard, and persistent settings.

### 📥 Installation (Windows & Linux)

1.  Go to the [**Releases Page**](https://github.com/sanonyme/rfid_Tag_Emulator/releases).
2.  **Windows**: Download `edge RFID Emulator Setup X.X.X.exe` and run it.
3.  **Linux**: Download `rfid-emulator-modern-X.X.X.tar.gz`, extract it, and run the executable.
4.  Launch **Edge RFID Emulator**.

### 🛠️ Development Setup

If you want to contribute or build from source:

1.  **Prerequisites**: Node.js (v18+ recommended).
2.  **Navigate to the directory**:
    ```bash
    cd modern-ui
    ```
3.  **Install dependencies**:
    ```bash
    npm install
    ```
4.  **Run in development mode**:
    ```bash
    npm run electron:dev
    ```
5.  **Build for production**:
    ```bash
    npm run electron:build
    ```

---

## ☕ Legacy Java UI

The **Legacy Java UI** is the original implementation provided for backward compatibility or lightweight usage.

### Features
*   Simple TCP socket connection.
*   Support for multiple vendor protocols (LLRP, ARP, ImpinjETK, etc.).
*   Bulk tag sending with configurable delays.

### Usage
1.  Ensure you have **Java JDK 8** or higher installed.
2.  Navigate to the `legacy-java` directory.
3.  **Run**:
    *   Windows: Double-click `run.bat` or the `RFIDEmulator.jar` file.
4.  **Build from source**:
    *   Run `build.bat` to compile the Java sources.

---

## 📂 Project Structure

*   `modern-ui/`: Source code for the Electron/React application.
*   `legacy-java/`: Source code for the Java Swing application.
*   `LICENSE`: MIT License.

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Copyright (c) 2025 Samy Chemaly
