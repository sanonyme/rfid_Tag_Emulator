# Zeus RFID — Android Native App

Native Android application built with **Kotlin** and **Jetpack Compose (Material 3)**, utilizing single-activity architecture, type-safe Navigation Compose, and reactive local-network discovery via Android's `NsdManager` (mDNS/DNS-SD).

---

## Architecture & Tech Stack

- **UI Framework**: Jetpack Compose (Material 3, edge-to-edge, dynamic light/dark theming)
- **Architecture**: MVVM with Unidirectional Data Flow (UDF)
  - UI State exposed via `StateFlow`
  - One-off navigation and feedback events via buffered `Channel` / `Flow`
- **Networking & Discovery**:
  - `NsdManager` wrapped in a `callbackFlow` inside `DiscoveryRepository`
  - Automatic `WifiManager.MulticastLock` management to prevent Wi-Fi chipsets from dropping mDNS broadcast packets
  - Lifecycle-aware cancellation: discovery and locks cleanly terminate when leaving screen composition
  - `ServerRepository` interface with realistic connection flow (connecting state, progress indicator, error retry)
- **Navigation**: Type-safe Compose Navigation 2.8+ using Kotlin Serialization (`@Serializable` route objects)
- **Build System**: Gradle 8.9 (Kotlin DSL) + Version Catalog (`libs.versions.toml`)

---

## Screen Flows (Milestone 1)

1. **Screen 1: Mode Select (`ModeSelectScreen`)**
   - **Fixed**: Navigates to network server discovery.
   - **Handheld**: Placeholder navigation to a "Coming Soon" screen with return action.
2. **Screen 2: Discover Servers (`DiscoverScreen`)**
   - Centered action hub button with Apple/Home Assistant-inspired concentric halftone particle rings that animate, rotate, and pulse outward during active scanning.
   - Handles `Idle`, `Scanning`, `Found (N servers)`, `Empty` (with retry), and `Error` states.
   - Dynamically reveals **"See servers (N)"** button when services are found, opening a Material 3 bottom sheet.
   - Realistic server connection flow with progress spinner, simulated handshake, and error handling.
   - Bottom link: *"Enter address manually"*.
3. **Screen 3: Options List (`OptionsScreen`)**
   - Displays active connected server badge with IP, port, and status.
   - Displays "Emulation" option with disabled badge ("Next Iteration").

---

## How to Change `SERVICE_TYPE`

The mDNS/DNS-SD service type is defined in a single centralized constant in [`NsdConfig.kt`](app/src/main/java/com/zeus/rfid/data/repository/NsdConfig.kt):

```kotlin
object NsdConfig {
    const val SERVICE_TYPE = "_example._tcp."
}
```

To search for a different service, simply update this string (e.g., `"_zeus._tcp."`, `"_http._tcp."`, `"_rfid._tcp."`).

---

## Testing Discovery: Emulator vs Real Device

### 1. Real Android Device (Recommended)
1. Ensure the Android device and your server (or laptop) are on the **same Wi-Fi network**.
2. **Wi-Fi AP Isolation**: Make sure "Client Isolation" or "Guest Mode" is **disabled** on your router. Routers with client isolation block multicast and broadcast traffic between peers.
3. Broadcast your service using any mDNS tool on your computer:
   - **macOS / Linux (`dns-sd` / `avahi`)**:
     ```bash
     dns-sd -R "Zeus Fixed Reader 01" _example._tcp local 5084
     ```
   - **Node.js (`bonjour-service`)**:
     ```javascript
     import { Bonjour } from 'bonjour-service'
     const bonjour = new Bonjour()
     bonjour.publish({ name: 'Zeus Fixed Reader 01', type: 'example', port: 5084 })
     ```
4. Launch Zeus RFID, tap **Fixed**, then tap the center **Find** button.

### 2. Android Emulator
The standard Android emulator runs behind a virtual router NAT on `10.0.2.15` and does not forward host multicast (mDNS) packets into the virtual subnet by default.

To test on an emulator:
- **Option A (Fake Repository for Rapid UI Validation)**:
  In `ZeusApplication.kt`, you can swap `NsdDiscoveryRepository` with `FakeDiscoveryRepository()`:
  ```kotlin
  override val discoveryRepository: DiscoveryRepository by lazy {
      FakeDiscoveryRepository() // Emits simulated servers with realistic delays
  }
  ```
- **Option B (Real Discovery via Bridge/Wi-Fi)**:
  Run the app on a physical device or an Android device connected via ADB over Wi-Fi.

---

## Manifest Permissions Explained

| Permission | Purpose |
| :--- | :--- |
| `android.permission.INTERNET` | Allows opening network sockets and connecting to the Zeus server. |
| `android.permission.ACCESS_NETWORK_STATE` | Inspects whether Wi-Fi/Ethernet is connected before initiating search. |
| `android.permission.ACCESS_WIFI_STATE` | Queries Wi-Fi status and link details. |
| `android.permission.CHANGE_WIFI_MULTICAST_STATE` | **Critical for mDNS**. Allows acquiring a `MulticastLock`. Without this, Android Wi-Fi drivers drop multicast packets to save battery. |
| `android.permission.NEARBY_WIFI_DEVICES` (Android 13+) | Configured with `usesPermissionFlags="neverForLocation"` to discover local Wi-Fi devices without requesting coarse or fine location permissions. |

---

## How to Build & Run

### Command Line
```bash
cd zeus-android
./gradlew assembleDebug
```

### Android Studio
1. Open Android Studio.
2. Select **Open** and choose the `zeus-android` directory.
3. Allow Gradle to sync dependencies.
4. Select a connected device or emulator and click **Run (Shift + F10)**.
