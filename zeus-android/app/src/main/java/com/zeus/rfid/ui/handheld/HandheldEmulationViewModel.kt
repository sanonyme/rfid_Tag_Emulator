package com.zeus.rfid.ui.handheld

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zeus.rfid.data.emulator.EpcGenerator
import com.zeus.rfid.data.handheld.HandheldClient
import com.zeus.rfid.data.handheld.HandheldServer
import com.zeus.rfid.data.handheld.HandheldTagItem
import com.zeus.rfid.data.model.TagMode
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

data class HandheldEmulationUiState(
    val port: Int = 10472,
    val isServerRunning: Boolean = false,
    val clients: List<HandheldClient> = emptyList(),
    val tagMode: TagMode = TagMode.UPC,
    val upcList: String = "00000000000001,5\n00000000000002,3",
    val startSerial: Long = 1L,
    val serialContinuesAcrossLines: Boolean = true,
    val showCheckDigitHints: Boolean = true,
    val epcList: String = "E28011303000020786CA9E61\nE28011303000020786CA9E62\nE28011303000020786CA9E63\nE28011303000020786CA9E64",
    val delayMs: Long = 20L,
    val rssi: Float = 70.0f,
    val isSending: Boolean = false,
    val isLooping: Boolean = false,
    val detailedTagLogging: Boolean = true,
    val maxLogLines: Int = 250,
    val logs: List<String> = emptyList(),
    val calculatedTagCount: Int = 8,
    val tagsTransmitted: Long = 0
)

class HandheldEmulationViewModel(
    initialClientIp: String = ""
) : ViewModel() {

    private val timeFormat = SimpleDateFormat("HH:mm:ss", Locale.getDefault())

    private val _uiState = MutableStateFlow(HandheldEmulationUiState())
    val uiState: StateFlow<HandheldEmulationUiState> = _uiState.asStateFlow()

    private var sendJob: Job? = null

    init {
        // Ensure server is running on 10472
        HandheldServer.start(10472)
        addLog("Handheld server listening on port 10472")

        if (initialClientIp.isNotBlank()) {
            addLog("Handheld connected")
        }

        recalculateTagCount()
        observeServer()
    }

    private fun observeServer() {
        viewModelScope.launch {
            HandheldServer.isRunning.collect { running ->
                _uiState.update { it.copy(isServerRunning = running) }
            }
        }

        viewModelScope.launch {
            HandheldServer.currentPort.collect { p ->
                _uiState.update { it.copy(port = p) }
            }
        }

        viewModelScope.launch {
            HandheldServer.clients.collect { clientList ->
                val prevCount = _uiState.value.clients.size
                val newCount = clientList.size
                if (newCount > prevCount) {
                    addLog("Handheld connected")
                } else if (newCount < prevCount) {
                    addLog("Handheld disconnected")
                }
                _uiState.update { it.copy(clients = clientList) }
            }
        }
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
        recalculateTagCount()
    }

    fun setSerialContinuesAcrossLines(enabled: Boolean) {
        _uiState.update { it.copy(serialContinuesAcrossLines = enabled) }
        recalculateTagCount()
    }

    fun setDelayMs(delay: Long) {
        _uiState.update { it.copy(delayMs = delay.coerceAtLeast(0L)) }
    }

    fun setRssi(value: Float) {
        _uiState.update { it.copy(rssi = value) }
    }

    fun setDetailedTagLogging(enabled: Boolean) {
        _uiState.update { it.copy(detailedTagLogging = enabled) }
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

    private fun buildTagsToSend(): List<HandheldTagItem> {
        val state = _uiState.value
        return when (state.tagMode) {
            TagMode.UPC -> {
                EpcGenerator.expandUpcList(
                    state.upcList,
                    state.startSerial,
                    state.serialContinuesAcrossLines
                ).map {
                    HandheldTagItem(
                        epc = it.epc,
                        tid = it.customTid,
                        userdata = it.userdata
                    )
                }
            }
            TagMode.EPC -> {
                val parsed = EpcGenerator.parseEpcList(state.epcList)
                parsed.map {
                    HandheldTagItem(
                        epc = it.epc,
                        tid = it.tid,
                        userdata = it.userdata
                    )
                }
            }
        }
    }

    fun sendTags() {
        if (_uiState.value.isSending) return
        startSendExecution(isLooping = false)
    }

    fun toggleLoopSend() {
        if (_uiState.value.isLooping) {
            stopSending()
        } else {
            addLog("Loop send started — continuously streaming tags to handheld...")
            startSendExecution(isLooping = true)
        }
    }

    private fun startSendExecution(isLooping: Boolean) {
        val state = _uiState.value
        val tags = buildTagsToSend()

        if (tags.isEmpty()) {
            addLog("Error: No EPCs to send")
            return
        }

        if (state.clients.isEmpty()) {
            addLog("Warning: No handheld connected on port ${state.port}. Waiting for VSBL client...")
        } else {
            addLog("Broadcasting ${tags.size} tag(s) to handheld")
        }

        _uiState.update { it.copy(isSending = true, isLooping = isLooping) }

        sendJob?.cancel()
        sendJob = viewModelScope.launch {
            try {
                var round = 0
                do {
                    round++
                    if (isLooping) {
                        addLog("— Round $round (${tags.size} tag(s)) —")
                    }

                    HandheldServer.sendTags(
                        tags = tags,
                        delayMs = state.delayMs,
                        rssi = state.rssi,
                        verboseProgress = state.detailedTagLogging,
                        onProgress = { progress ->
                            if (_uiState.value.detailedTagLogging) {
                                addLog(progress)
                            }
                            _uiState.update { it.copy(tagsTransmitted = it.tagsTransmitted + 1) }
                        },
                        onComplete = { completion ->
                            addLog(completion)
                        }
                    )
                } while (_uiState.value.isLooping)
            } finally {
                _uiState.update { it.copy(isSending = false, isLooping = false) }
            }
        }
    }

    fun stopSending() {
        HandheldServer.cancelSend()
        sendJob?.cancel()
        sendJob = null
        _uiState.update { it.copy(isSending = false, isLooping = false) }
        addLog("Stopped tag broadcast.")
    }

    override fun onCleared() {
        super.onCleared()
        stopSending()
    }

    companion object {
        fun provideFactory(
            initialClientIp: String = ""
        ): androidx.lifecycle.ViewModelProvider.Factory = object : androidx.lifecycle.ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return HandheldEmulationViewModel(initialClientIp) as T
            }
        }
    }
}
