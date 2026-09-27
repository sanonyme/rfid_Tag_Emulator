package com.zeus.rfid.ui.netscan

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zeus.rfid.data.netscan.EdgeDiscoveredDevice
import com.zeus.rfid.data.netscan.LanScannerEngine
import com.zeus.rfid.data.netscan.NetInterfaceInfo
import com.zeus.rfid.data.netscan.NetScanTabMode
import com.zeus.rfid.data.netscan.PingScanEvent
import com.zeus.rfid.data.netscan.PingScanRow
import com.zeus.rfid.data.netscan.RawUdpMessage
import com.zeus.rfid.data.netscan.ReaderCandidate
import com.zeus.rfid.data.netscan.ReaderScanEvent
import com.zeus.rfid.data.netscan.SubnetUtils
import com.zeus.rfid.data.netscan.TargetScope
import com.zeus.rfid.data.netscan.UdpDiscoveryEvent
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class LanScannerViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(LanScannerUiState())
    val uiState: StateFlow<LanScannerUiState> = _uiState.asStateFlow()

    private var readerScanJob: Job? = null
    private var pingScanJob: Job? = null
    private var udpJob: Job? = null
    private var udpTimerJob: Job? = null

    private val exceptionHandler = CoroutineExceptionHandler { _, throwable ->
        _uiState.update {
            it.copy(
                isReaderScanning = false,
                isPingScanning = false,
                errorMessage = throwable.localizedMessage ?: "Scan encountered an error"
            )
        }
    }

    private val ipComparator = Comparator<String> { ip1, ip2 ->
        val pa = ip1.split(".").mapNotNull { it.toIntOrNull() }
        val pb = ip2.split(".").mapNotNull { it.toIntOrNull() }
        for (i in 0 until minOf(pa.size, pb.size)) {
            val cmp = pa[i].compareTo(pb[i])
            if (cmp != 0) return@Comparator cmp
        }
        pa.size.compareTo(pb.size)
    }

    init {
        refreshInterfaces()
    }

    fun setTab(mode: NetScanTabMode) {
        _uiState.update { it.copy(activeTab = mode, errorMessage = null) }
    }

    fun setTargetScope(scope: TargetScope) {
        _uiState.update { it.copy(targetScope = scope, errorMessage = null) }
    }

    fun updateCidr(value: String) {
        _uiState.update { it.copy(cidr = value) }
    }

    fun updateRangeStart(value: String) {
        _uiState.update { it.copy(rangeStart = value) }
    }

    fun updateRangeEnd(value: String) {
        _uiState.update { it.copy(rangeEnd = value) }
    }

    fun updateConcurrency(value: String) {
        val sanitized = value.filter { it.isDigit() }
        _uiState.update { it.copy(concurrency = sanitized.ifEmpty { "40" }) }
    }

    fun updateTimeoutMs(value: String) {
        val sanitized = value.filter { it.isDigit() }
        _uiState.update { it.copy(timeoutMs = sanitized.ifEmpty { "1200" }) }
    }

    fun updateUdpLocalPort(value: String) {
        val sanitized = value.filter { it.isDigit() }
        _uiState.update { it.copy(udpLocalPort = sanitized.ifEmpty { "7000" }) }
    }

    fun updateUdpDuration(value: String) {
        val sanitized = value.filter { it.isDigit() }
        _uiState.update { it.copy(udpDurationSeconds = sanitized.ifEmpty { "60" }) }
    }

    fun updateUdpProbeIp(value: String) {
        _uiState.update { it.copy(udpProbeIp = value) }
    }

    fun updateUdpRemotePort(value: String) {
        val sanitized = value.filter { it.isDigit() }
        _uiState.update { it.copy(udpRemotePort = sanitized.ifEmpty { "23" }) }
    }

    fun updateUdpProbeMessage(value: String) {
        _uiState.update { it.copy(udpProbeMessage = value) }
    }

    fun toggleAliveOnly(enabled: Boolean) {
        _uiState.update { it.copy(aliveOnly = enabled) }
    }

    fun toggleShowRawUdp() {
        _uiState.update { it.copy(showRawUdp = !it.showRawUdp) }
    }

    fun selectInterface(iface: NetInterfaceInfo) {
        _uiState.update {
            it.copy(
                selectedInterface = iface,
                cidr = iface.networkCidr,
                rangeStart = iface.startIp,
                rangeEnd = iface.endIp
            )
        }
    }

    fun refreshInterfaces() {
        viewModelScope.launch {
            val ifaces = SubnetUtils.getIpv4Interfaces()
            _uiState.update { state ->
                val first = ifaces.firstOrNull()
                state.copy(
                    interfaces = ifaces,
                    selectedInterface = first,
                    cidr = first?.networkCidr ?: state.cidr,
                    rangeStart = first?.startIp ?: state.rangeStart,
                    rangeEnd = first?.endIp ?: state.rangeEnd
                )
            }
        }
    }

    // --- Radar Action Hub ---
    fun onRadarHubClicked() {
        when (_uiState.value.activeTab) {
            NetScanTabMode.READER_DISCOVERY -> {
                if (_uiState.value.isReaderScanning) stopReaderScan() else startReaderScan()
            }
            NetScanTabMode.PING_SCAN -> {
                if (_uiState.value.isPingScanning) stopPingScan() else startPingScan()
            }
            NetScanTabMode.UDP_DISCOVERY -> {
                if (_uiState.value.isUdpListening) stopUdpDiscovery() else startUdpDiscovery()
            }
        }
    }

    // --- RFID Reader Discovery ---
    fun startReaderScan() {
        readerScanJob?.cancel()
        val ips = resolveTargetIps() ?: return

        val concurrency = _uiState.value.concurrency.toIntOrNull() ?: 48
        val timeoutMs = _uiState.value.timeoutMs.toIntOrNull() ?: 1200

        _uiState.update {
            it.copy(
                isReaderScanning = true,
                readerDone = 0,
                readerTotal = ips.size,
                readerFound = 0,
                readerResults = emptyList(),
                errorMessage = null
            )
        }

        readerScanJob = viewModelScope.launch(exceptionHandler) {
            LanScannerEngine.scanReaders(ips, concurrency, timeoutMs).collect { event ->
                when (event) {
                    is ReaderScanEvent.Progress -> {
                        _uiState.update {
                            it.copy(readerDone = event.done, readerTotal = event.total, readerFound = event.found)
                        }
                    }
                    is ReaderScanEvent.Found -> {
                        _uiState.update { state ->
                            val currentList = state.readerResults.filter { it.ip != event.reader.ip }.toMutableList()
                            currentList.add(event.reader)
                            currentList.sortWith { a, b -> ipComparator.compare(a.ip, b.ip) }
                            state.copy(
                                readerDone = event.done,
                                readerTotal = event.total,
                                readerFound = event.found,
                                readerResults = currentList
                            )
                        }
                    }
                    is ReaderScanEvent.Finished -> {
                        _uiState.update {
                            it.copy(
                                isReaderScanning = false,
                                readerDone = event.total,
                                readerTotal = event.total,
                                readerFound = event.found,
                                statusMessage = "Reader scan finished (${event.found} readers found)"
                            )
                        }
                    }
                    is ReaderScanEvent.Error -> {
                        _uiState.update {
                            it.copy(isReaderScanning = false, errorMessage = event.message)
                        }
                    }
                }
            }
        }
    }

    fun stopReaderScan() {
        readerScanJob?.cancel()
        _uiState.update { it.copy(isReaderScanning = false, statusMessage = "Reader scan stopped") }
    }

    fun clearReaderResults() {
        _uiState.update { it.copy(readerResults = emptyList(), readerDone = 0, readerTotal = 0, readerFound = 0) }
    }

    // --- Ping Scan ---
    fun startPingScan() {
        pingScanJob?.cancel()
        val ips = resolveTargetIps() ?: return

        val concurrency = _uiState.value.concurrency.toIntOrNull() ?: 40
        val timeoutMs = _uiState.value.timeoutMs.toIntOrNull() ?: 1000

        _uiState.update {
            it.copy(
                isPingScanning = true,
                pingDone = 0,
                pingTotal = ips.size,
                pingAlive = 0,
                pingResults = emptyList(),
                errorMessage = null
            )
        }

        pingScanJob = viewModelScope.launch(exceptionHandler) {
            LanScannerEngine.scanPing(ips, concurrency, timeoutMs).collect { event ->
                when (event) {
                    is PingScanEvent.HostResult -> {
                        _uiState.update { state ->
                            val currentList = state.pingResults.filter { it.ip != event.row.ip }.toMutableList()
                            currentList.add(event.row)
                            currentList.sortWith { a, b -> ipComparator.compare(a.ip, b.ip) }
                            state.copy(
                                pingDone = event.done,
                                pingTotal = event.total,
                                pingAlive = event.aliveCount,
                                pingResults = currentList
                            )
                        }
                    }
                    is PingScanEvent.Finished -> {
                        _uiState.update {
                            it.copy(
                                isPingScanning = false,
                                pingDone = event.total,
                                pingTotal = event.total,
                                pingAlive = event.aliveCount,
                                statusMessage = "Ping scan finished (${event.aliveCount} alive hosts)"
                            )
                        }
                    }
                    is PingScanEvent.Error -> {
                        _uiState.update {
                            it.copy(isPingScanning = false, errorMessage = event.message)
                        }
                    }
                }
            }
        }
    }

    fun stopPingScan() {
        pingScanJob?.cancel()
        _uiState.update { it.copy(isPingScanning = false, statusMessage = "Ping scan stopped") }
    }

    fun clearPingResults() {
        _uiState.update { it.copy(pingResults = emptyList(), pingDone = 0, pingTotal = 0, pingAlive = 0) }
    }

    // --- UDP Discovery ---
    fun startUdpDiscovery() {
        udpJob?.cancel()
        udpTimerJob?.cancel()

        val port = _uiState.value.udpLocalPort.toIntOrNull() ?: 7000
        val duration = _uiState.value.udpDurationSeconds.toIntOrNull() ?: 60

        _uiState.update {
            it.copy(
                isUdpListening = true,
                udpDevices = emptyList(),
                udpRawMessages = emptyList(),
                statusMessage = "Listening on UDP port $port..."
            )
        }

        udpJob = viewModelScope.launch {
            LanScannerEngine.startUdpListener(port).collect { event ->
                when (event) {
                    is UdpDiscoveryEvent.Started -> {
                        _uiState.update { it.copy(isUdpListening = true) }
                    }
                    is UdpDiscoveryEvent.DeviceFound -> {
                        _uiState.update { state ->
                            val key = event.device.mac.ifEmpty { event.device.ip }
                            val list = state.udpDevices.filter { (it.mac.ifEmpty { it.ip }) != key }.toMutableList()
                            list.add(event.device)
                            state.copy(udpDevices = list)
                        }
                    }
                    is UdpDiscoveryEvent.RawMessageReceived -> {
                        _uiState.update { state ->
                            val rawList = state.udpRawMessages.toMutableList()
                            rawList.add(0, event.raw)
                            if (rawList.size > 150) rawList.removeAt(rawList.size - 1)
                            state.copy(udpRawMessages = rawList)
                        }
                    }
                    is UdpDiscoveryEvent.Stopped -> {
                        _uiState.update { it.copy(isUdpListening = false) }
                    }
                    is UdpDiscoveryEvent.Error -> {
                        _uiState.update { it.copy(errorMessage = event.message) }
                    }
                }
            }
        }

        if (duration > 0) {
            udpTimerJob = viewModelScope.launch {
                delay(duration * 1000L)
                stopUdpDiscovery()
                _uiState.update { it.copy(statusMessage = "UDP discovery timed out after ${duration}s") }
            }
        }
    }

    fun stopUdpDiscovery() {
        udpJob?.cancel()
        udpTimerJob?.cancel()
        _uiState.update { it.copy(isUdpListening = false, statusMessage = "UDP discovery stopped") }
    }

    fun sendUdpProbe() {
        val targetIp = _uiState.value.udpProbeIp.trim()
        val port = _uiState.value.udpRemotePort.toIntOrNull() ?: 23
        val message = _uiState.value.udpProbeMessage.ifEmpty { " " }

        viewModelScope.launch {
            val result = LanScannerEngine.sendUdpProbe(targetIp, port, message)
            if (result.isSuccess) {
                _uiState.update { it.copy(statusMessage = "Probe sent to $targetIp:$port") }
            } else {
                _uiState.update { it.copy(errorMessage = "Probe failed: ${result.exceptionOrNull()?.message}") }
            }
        }
    }

    fun clearUdpDevices() {
        _uiState.update { it.copy(udpDevices = emptyList(), udpRawMessages = emptyList()) }
    }

    fun dismissMessage() {
        _uiState.update { it.copy(errorMessage = null, statusMessage = null) }
    }

    private fun resolveTargetIps(): List<String>? {
        val state = _uiState.value
        val ips = when (state.targetScope) {
            TargetScope.CIDR -> SubnetUtils.enumerateCidr(state.cidr)
            TargetScope.RANGE -> SubnetUtils.enumerateIpRange(state.rangeStart, state.rangeEnd)
            TargetScope.ALL_SUBNETS -> SubnetUtils.enumerateAllLocalSubnetsMerged()
        }

        if (ips == null || ips.isEmpty()) {
            _uiState.update {
                it.copy(
                    errorMessage = when (state.targetScope) {
                        TargetScope.CIDR -> "Invalid CIDR network format (e.g. 192.168.1.0/24) or exceeds 4094 hosts."
                        TargetScope.RANGE -> "Invalid IP range format or exceeds 4094 hosts."
                        TargetScope.ALL_SUBNETS -> "No scannable active local subnets found, or merged subnets exceed 4094 hosts."
                    }
                )
            }
            return null
        }
        return ips
    }

    override fun onCleared() {
        super.onCleared()
        readerScanJob?.cancel()
        pingScanJob?.cancel()
        udpJob?.cancel()
        udpTimerJob?.cancel()
    }
}
