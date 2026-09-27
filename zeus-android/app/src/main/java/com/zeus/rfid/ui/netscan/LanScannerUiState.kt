package com.zeus.rfid.ui.netscan

import com.zeus.rfid.data.netscan.EdgeDiscoveredDevice
import com.zeus.rfid.data.netscan.NetInterfaceInfo
import com.zeus.rfid.data.netscan.NetScanTabMode
import com.zeus.rfid.data.netscan.PingScanRow
import com.zeus.rfid.data.netscan.RawUdpMessage
import com.zeus.rfid.data.netscan.ReaderCandidate
import com.zeus.rfid.data.netscan.TargetScope

data class LanScannerUiState(
    val activeTab: NetScanTabMode = NetScanTabMode.READER_DISCOVERY,
    val targetScope: TargetScope = TargetScope.CIDR,

    // Target Range inputs
    val cidr: String = "192.168.1.0/24",
    val rangeStart: String = "192.168.1.1",
    val rangeEnd: String = "192.168.1.254",
    val concurrency: String = "48",
    val timeoutMs: String = "1200",

    // Device interfaces
    val interfaces: List<NetInterfaceInfo> = emptyList(),
    val selectedInterface: NetInterfaceInfo? = null,

    // Reader scan state
    val isReaderScanning: Boolean = false,
    val readerDone: Int = 0,
    val readerTotal: Int = 0,
    val readerFound: Int = 0,
    val readerResults: List<ReaderCandidate> = emptyList(),

    // Ping scan state
    val isPingScanning: Boolean = false,
    val pingDone: Int = 0,
    val pingTotal: Int = 0,
    val pingAlive: Int = 0,
    val pingResults: List<PingScanRow> = emptyList(),
    val aliveOnly: Boolean = false,

    // UDP discovery state
    val isUdpListening: Boolean = false,
    val udpLocalPort: String = "7000",
    val udpDurationSeconds: String = "60",
    val udpProbeIp: String = "255.255.255.255",
    val udpRemotePort: String = "23",
    val udpProbeMessage: String = "",
    val udpDevices: List<EdgeDiscoveredDevice> = emptyList(),
    val udpRawMessages: List<RawUdpMessage> = emptyList(),
    val showRawUdp: Boolean = false,

    // Active status / errors
    val errorMessage: String? = null,
    val statusMessage: String? = null
) {
    val isAnyScanning: Boolean
        get() = isReaderScanning || isPingScanning || isUdpListening

    val displayedPingRows: List<PingScanRow>
        get() = if (aliveOnly) pingResults.filter { it.alive } else pingResults
}
