package com.zeus.rfid.ui.emulation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.zeus.rfid.data.emulator.AleRepository
import com.zeus.rfid.data.emulator.EpcGenerator
import com.zeus.rfid.data.emulator.TcpEmulatorClient
import com.zeus.rfid.data.model.LogicalDevice
import com.zeus.rfid.data.model.TagData
import com.zeus.rfid.data.model.TagMode
import com.zeus.rfid.data.model.VendorDriver
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.random.Random

data class EmulationUiState(
    val serverName: String,
    val host: String,
    val port: Int = 12352, // TCP Emulator port
    val alePort: Int = 80, // Edge ALE API port
    val connectionTimeoutMs: Int = 10000, // Timeout connecting to emulator server
    val isSending: Boolean = false,
    val isLooping: Boolean = false,
    val driver: VendorDriver = VendorDriver.ALL,
    val antennas: Set<Int> = setOf(1),
    val rssi: Float = -45.0f,
    val rssiRandomize: Boolean = false,
    val rssiRandMin: Float = -90.0f,
    val rssiRandMax: Float = -20.0f,
    val logicalDevices: List<LogicalDevice> = emptyList(),
    val selectedUids: Set<String> = emptySet(),
    val isLoadingDevices: Boolean = false,
    val tagMode: TagMode = TagMode.UPC,
    val upcList: String = "00000000000000,5",
    val startSerial: Long = 1L,
    val serialContinuesAcrossLines: Boolean = true,
    val showCheckDigitHints: Boolean = true,
    val epcList: String = "E28011303000020786CA9E61\nE28011303000020786CA9E62\nE28011303000020786CA9E63\nE28011303000020786CA9E64",
    val delayMs: Long = 20L,
    val detailedTagLogging: Boolean = true,
    val maxLogLines: Int = 250,
    val soundEnabled: Boolean = com.zeus.rfid.ui.util.SoundEffectHelper.isEnabled,
    val logs: List<String> = emptyList(),
    val tagsTransmitted: Long = 0,
    val calculatedTagCount: Int = 5
)

class EmulationViewModel(
    serverName: String,
    host: String,
    port: Int
) : ViewModel() {

    private val tcpClient = TcpEmulatorClient()
    private val aleRepository = AleRepository()
    private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    // If port was 80/8080 from discovery, use it as alePort and default TCP port to 12352
    private val initialAlePort = if (port == 80 || port == 8080) port else 80
    private val initialTcpPort = if (port != 80 && port != 8080 && port > 0) port else 12352

    private val _uiState = MutableStateFlow(
        EmulationUiState(
            serverName = serverName,
            host = host,
            port = initialTcpPort,
            alePort = initialAlePort
        )
    )
    val uiState: StateFlow<EmulationUiState> = _uiState.asStateFlow()

    private var sendJob: Job? = null

    init {
        recalculateTagCount()
        addLog("Emulation initialized for $host (TCP: $initialTcpPort, ALE: $initialAlePort)")
        fetchLogicalDevices()
    }

    private fun addLog(message: String) {
        val time = timeFormat.format(Date())
        _uiState.update { state ->
            val newLogs = state.logs + "[$time] $message"
            val max = state.maxLogLines
            val trimmed = if (max > 0 && newLogs.size > max) newLogs.takeLast(max) else newLogs
            state.copy(logs = trimmed)
        }
    }

    fun clearLogs() {
        _uiState.update { it.copy(logs = emptyList()) }
    }

    fun fetchLogicalDevices() {
        val currentHost = _uiState.value.host
        val currentAlePort = _uiState.value.alePort
        if (currentHost.isBlank()) return

        _uiState.update { it.copy(isLoadingDevices = true) }
        addLog("Fetching logical devices from $currentHost:$currentAlePort...")

        viewModelScope.launch {
            val result = aleRepository.getLogicalDevices(currentHost, currentAlePort)
            result.onSuccess { devices ->
                _uiState.update { state ->
                    val defaultSelected = if (state.selectedUids.isEmpty() && devices.isNotEmpty()) {
                        devices.firstOrNull()?.uid?.let { setOf(it) } ?: emptySet()
                    } else {
                        state.selectedUids
                    }
                    state.copy(
                        logicalDevices = devices,
                        selectedUids = defaultSelected,
                        isLoadingDevices = false
                    )
                }
                addLog("Successfully fetched ${devices.size} logical device(s)")
            }.onFailure { error ->
                _uiState.update { it.copy(isLoadingDevices = false) }
                addLog("Could not fetch logical devices: ${error.message}")
            }
        }
    }

    fun toggleDevice(uid: String) {
        _uiState.update { state ->
            val uids = state.selectedUids.toMutableSet()
            if (uids.contains(uid)) uids.remove(uid) else uids.add(uid)
            state.copy(selectedUids = uids)
        }
    }

    fun selectAllDevices() {
        _uiState.update { state ->
            state.copy(selectedUids = state.logicalDevices.map { it.uid }.toSet())
        }
    }

    fun deselectAllDevices() {
        _uiState.update { it.copy(selectedUids = emptySet()) }
    }

    fun toggleAntenna(antenna: Int) {
        _uiState.update { state ->
            val ants = state.antennas.toMutableSet()
            if (ants.contains(antenna)) {
                if (ants.size > 1) ants.remove(antenna)
            } else {
                ants.add(antenna)
            }
            state.copy(antennas = ants)
        }
    }

    fun setRssi(value: Float) {
        _uiState.update { it.copy(rssi = value) }
    }

    fun setRssiRandomize(enabled: Boolean) {
        _uiState.update { it.copy(rssiRandomize = enabled) }
    }

    fun setRssiRandRange(min: Float, max: Float) {
        _uiState.update { it.copy(rssiRandMin = min, rssiRandMax = max) }
    }

    fun setDriver(driver: VendorDriver) {
        _uiState.update { it.copy(driver = driver) }
    }

    fun setTagMode(mode: TagMode) {
        _uiState.update { it.copy(tagMode = mode) }
        recalculateTagCount()
    }

    fun setUpcList(text: String) {
        _uiState.update { it.copy(upcList = text) }
        recalculateTagCount()
    }

    fun setEpcList(text: String) {
        _uiState.update { it.copy(epcList = text) }
        recalculateTagCount()
    }

    fun setStartSerial(serial: Long) {
        _uiState.update { it.copy(startSerial = serial) }
    }

    fun setSerialContinuesAcrossLines(enabled: Boolean) {
        _uiState.update { it.copy(serialContinuesAcrossLines = enabled) }
    }

    fun setDelayMs(delay: Long) {
        _uiState.update { it.copy(delayMs = delay.coerceAtLeast(0L)) }
    }

    fun setTcpPort(port: Int) {
        _uiState.update { it.copy(port = port) }
        addLog("Updated TCP streaming port to $port")
    }

    fun setAlePort(port: Int) {
        val previousPort = _uiState.value.alePort
        _uiState.update { it.copy(alePort = port) }
        addLog("Updated ALE management port to $port")
        if (previousPort != port) {
            fetchLogicalDevices()
        }
    }

    fun setConnectionTimeoutMs(timeoutMs: Int) {
        _uiState.update { it.copy(connectionTimeoutMs = timeoutMs) }
    }

    fun setShowCheckDigitHints(enabled: Boolean) {
        _uiState.update { it.copy(showCheckDigitHints = enabled) }
    }

    fun setDetailedTagLogging(enabled: Boolean) {
        _uiState.update { it.copy(detailedTagLogging = enabled) }
    }

    fun setMaxLogLines(lines: Int) {
        _uiState.update { state ->
            val trimmed = if (lines > 0 && state.logs.size > lines) state.logs.takeLast(lines) else state.logs
            state.copy(maxLogLines = lines, logs = trimmed)
        }
    }

    fun setSoundEnabled(enabled: Boolean) {
        com.zeus.rfid.ui.util.SoundEffectHelper.isEnabled = enabled
        _uiState.update { it.copy(soundEnabled = enabled) }
    }

    fun updateFixedSettings(
        tcpPort: Int,
        alePort: Int,
        connectionTimeoutMs: Int,
        serialContinuesAcrossLines: Boolean,
        showCheckDigitHints: Boolean,
        detailedTagLogging: Boolean,
        maxLogLines: Int,
        soundEnabled: Boolean,
        delayMs: Long
    ) {
        val previousAlePort = _uiState.value.alePort
        com.zeus.rfid.ui.util.SoundEffectHelper.isEnabled = soundEnabled

        _uiState.update { state ->
            val trimmed = if (maxLogLines > 0 && state.logs.size > maxLogLines) state.logs.takeLast(maxLogLines) else state.logs
            state.copy(
                port = tcpPort,
                alePort = alePort,
                connectionTimeoutMs = connectionTimeoutMs,
                serialContinuesAcrossLines = serialContinuesAcrossLines,
                showCheckDigitHints = showCheckDigitHints,
                detailedTagLogging = detailedTagLogging,
                maxLogLines = maxLogLines,
                soundEnabled = soundEnabled,
                delayMs = delayMs,
                logs = trimmed
            )
        }

        addLog("Settings updated (TCP: $tcpPort, ALE: $alePort, SerialContinues: $serialContinuesAcrossLines, Details: $detailedTagLogging, MaxLogs: $maxLogLines, Sound: $soundEnabled)")

        if (previousAlePort != alePort) {
            fetchLogicalDevices()
        }
        recalculateTagCount()
    }

    private fun recalculateTagCount() {
        _uiState.update { state ->
            val count = when (state.tagMode) {
                TagMode.UPC -> {
                    val expanded = EpcGenerator.expandUpcList(
                        state.upcList,
                        state.startSerial,
                        state.serialContinuesAcrossLines
                    )
                    expanded.size
                }
                TagMode.EPC -> {
                    val parsed = EpcGenerator.parseEpcList(state.epcList)
                    parsed.size
                }
            }
            state.copy(calculatedTagCount = count)
        }
    }

    private fun buildTagsToSend(): List<TagData> {
        val state = _uiState.value
        val tags = ArrayList<TagData>()
        val selectedAntennas = state.antennas.ifEmpty { setOf(1) }
        val targetUids = state.selectedUids.ifEmpty { setOf("") }

        val minRssi = minOf(state.rssiRandMin, state.rssiRandMax)
        val maxRssi = maxOf(state.rssiRandMin, state.rssiRandMax)

        fun getTagRssi(): String {
            return if (!state.rssiRandomize) {
                String.format(Locale.US, "%.1f", state.rssi)
            } else {
                val rand = minRssi + Random.nextFloat() * (maxRssi - minRssi)
                String.format(Locale.US, "%.1f", rand)
            }
        }

        when (state.tagMode) {
            TagMode.UPC -> {
                val expanded = EpcGenerator.expandUpcList(
                    state.upcList,
                    state.startSerial,
                    state.serialContinuesAcrossLines
                )
                for (item in expanded) {
                    for (uid in targetUids) {
                        for (ant in selectedAntennas) {
                            tags.add(
                                TagData(
                                    epc = item.epc,
                                    tid = item.customTid ?: item.epc,
                                    uid = uid,
                                    antenna = ant,
                                    rssi = getTagRssi(),
                                    userdata = item.userdata
                                )
                            )
                        }
                    }
                }
            }
            TagMode.EPC -> {
                val parsed = EpcGenerator.parseEpcList(state.epcList)
                for (item in parsed) {
                    for (uid in targetUids) {
                        for (ant in selectedAntennas) {
                            tags.add(
                                TagData(
                                    epc = item.epc,
                                    tid = item.tid ?: item.epc,
                                    uid = uid,
                                    antenna = ant,
                                    rssi = getTagRssi(),
                                    userdata = item.userdata
                                )
                            )
                        }
                    }
                }
            }
        }
        return tags
    }

    fun sendTags() {
        if (_uiState.value.isSending) return
        startSendExecution(isLooping = false)
    }

    fun toggleLoopSend() {
        if (_uiState.value.isLooping) {
            stopSending()
        } else {
            addLog("Loop send started — continuously streaming tags...")
            startSendExecution(isLooping = true)
        }
    }

    private fun startSendExecution(isLooping: Boolean) {
        val state = _uiState.value
        val tags = buildTagsToSend()

        if (tags.isEmpty()) {
            addLog("Error: No valid EPCs generated to send")
            return
        }

        if (state.selectedUids.isEmpty()) {
            addLog("Warning: No logical devices selected. Sending without UID.")
        } else {
            addLog("Targeting ${state.selectedUids.size} logical device(s)")
        }

        addLog("Sending ${tags.size} tag(s) with driver: ${state.driver.code} on antenna(s): ${state.antennas.joinToString()}")

        _uiState.update { it.copy(isSending = true, isLooping = isLooping) }
        com.zeus.rfid.ui.util.SoundEffectHelper.playEmulationStart()

        sendJob?.cancel()
        sendJob = viewModelScope.launch {
            try {
                do {
                    tcpClient.sendTags(
                        host = state.host,
                        port = state.port,
                        tags = tags,
                        driverCode = state.driver.code,
                        delayMs = state.delayMs,
                        timeoutMs = state.connectionTimeoutMs,
                        onProgress = { progress ->
                            if (_uiState.value.detailedTagLogging) {
                                addLog(progress)
                            }
                            _uiState.update { it.copy(tagsTransmitted = it.tagsTransmitted + 1) }
                        },
                        onComplete = { completion ->
                            addLog(completion)
                            if (completion.contains("Successfully", ignoreCase = true)) {
                                com.zeus.rfid.ui.util.SoundEffectHelper.playEmulationSuccess()
                            } else {
                                com.zeus.rfid.ui.util.SoundEffectHelper.playEmulationStopped()
                            }
                        }
                    )
                } while (_uiState.value.isLooping)
            } finally {
                _uiState.update { it.copy(isSending = false, isLooping = false) }
            }
        }
    }

    fun stopSending() {
        tcpClient.cancelSend()
        sendJob?.cancel()
        sendJob = null
        _uiState.update { it.copy(isSending = false, isLooping = false) }
        addLog("Stopped tag transmission.")
        com.zeus.rfid.ui.util.SoundEffectHelper.playEmulationStopped()
    }

    override fun onCleared() {
        super.onCleared()
        stopSending()
        viewModelScope.launch {
            tcpClient.disconnect()
        }
    }

    companion object {
        fun provideFactory(
            serverName: String,
            host: String,
            port: Int
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return EmulationViewModel(serverName, host, port) as T
            }
        }
    }
}
