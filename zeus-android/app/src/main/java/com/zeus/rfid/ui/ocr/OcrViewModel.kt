package com.zeus.rfid.ui.ocr

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zeus.rfid.data.ocr.OcrSendResult
import com.zeus.rfid.data.ocr.OcrSocketClient
import com.zeus.rfid.ui.util.SoundEffectHelper
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.concurrent.atomic.AtomicLong

class OcrViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(OcrUiState())
    val uiState: StateFlow<OcrUiState> = _uiState.asStateFlow()

    private val lastScanTimestamp = AtomicLong(0L)
    private var lastScannedContent: String = ""

    init {
        addLog("OCR / Barcode engine initialized. Ready on default port :${OcrSocketClient.DEFAULT_OCR_PORT}.")
    }

    fun updateHost(newHost: String) {
        _uiState.update { it.copy(host = newHost.trim()) }
    }

    fun updatePort(newPortStr: String) {
        val parsed = newPortStr.filter { it.isDigit() }.toIntOrNull() ?: return
        _uiState.update { it.copy(port = parsed.coerceIn(1, 65535)) }
    }

    fun updateMessage(newMessage: String) {
        _uiState.update { it.copy(message = newMessage) }
    }

    fun selectPreset(preset: OcrPreset) {
        _uiState.update {
            it.copy(
                message = preset.payload,
                activePresetId = preset.id
            )
        }
        addLog("Loaded preset '${preset.title}' (${preset.tag})")
    }

    fun setCameraOpen(open: Boolean) {
        _uiState.update {
            it.copy(
                isCameraOpen = open,
                // reset torch when closing
                torchEnabled = if (!open) false else it.torchEnabled
            )
        }
        if (open) {
            addLog("Camera Barcode/QR scanner opened.")
        }
    }

    fun toggleTorch() {
        _uiState.update { it.copy(torchEnabled = !it.torchEnabled) }
    }

    fun toggleAutoSend() {
        val next = !_uiState.value.autoSendOnScan
        _uiState.update { it.copy(autoSendOnScan = next) }
        addLog(if (next) "Auto-send on barcode detect ENABLED" else "Auto-send on barcode detect DISABLED (Manual review mode)")
    }

    fun toggleSound() {
        _uiState.update { it.copy(soundFeedback = !it.soundFeedback) }
    }

    fun toggleHaptic() {
        _uiState.update { it.copy(hapticFeedback = !it.hapticFeedback) }
    }

    /**
     * Sends the current text message in the manual input field.
     */
    fun sendManualMessage() {
        val currentMsg = _uiState.value.message
        if (currentMsg.isBlank()) {
            addLog("Warning: Message is empty. Cannot send.", isSuccess = false)
            return
        }
        transmitPayload(currentMsg, sourceTag = "Manual Emulation")
    }

    /**
     * Invoked when CameraX ML Kit detects a barcode or QR code.
     */
    fun onBarcodeDetected(code: String, formatName: String) {
        val now = System.currentTimeMillis()
        val lastTime = lastScanTimestamp.get()

        // Debounce: ignore same code within 1500ms, or different codes within 500ms
        val isSameCode = (code == lastScannedContent)
        val cooldown = if (isSameCode) 1500L else 500L
        if (now - lastTime < cooldown) {
            return
        }

        lastScanTimestamp.set(now)
        lastScannedContent = code

        if (_uiState.value.soundFeedback) {
            SoundEffectHelper.playTagReadBeep()
        }

        _uiState.update {
            it.copy(
                lastScannedCode = code,
                lastScannedFormat = formatName,
                lastScanStatus = "Captured: $formatName"
            )
        }

        addLog("Camera detected $formatName: $code", isSuccess = true)

        if (_uiState.value.autoSendOnScan) {
            transmitPayload(code, sourceTag = "Camera ($formatName)")
        } else {
            // Put it into the input field for user inspection
            _uiState.update { it.copy(message = code) }
            addLog("Loaded barcode into message input for manual review.")
        }
    }

    private fun transmitPayload(payload: String, sourceTag: String) {
        val host = _uiState.value.host
        val port = _uiState.value.port

        viewModelScope.launch {
            _uiState.update { it.copy(isSending = true) }
            addLog("[$sourceTag] Transmitting to $host:$port...", isNetworkEvent = true)

            when (val result = OcrSocketClient.sendPayload(host, port, payload)) {
                is OcrSendResult.Success -> {
                    addLog("[$sourceTag] SUCCESS: Sent ${result.bytesSent} bytes to $host:$port", isSuccess = true, isNetworkEvent = true)
                    val record = OcrScanRecord(
                        code = payload,
                        format = sourceTag,
                        sentSuccessfully = true
                    )
                    _uiState.update { state ->
                        state.copy(
                            isSending = false,
                            scanRecords = (listOf(record) + state.scanRecords).take(50),
                            lastScanStatus = "Sent to $host:$port"
                        )
                    }
                }
                is OcrSendResult.Error -> {
                    addLog("[$sourceTag] ERROR: ${result.message}", isSuccess = false, isNetworkEvent = true)
                    val record = OcrScanRecord(
                        code = payload,
                        format = sourceTag,
                        sentSuccessfully = false,
                        errorMessage = result.message
                    )
                    _uiState.update { state ->
                        state.copy(
                            isSending = false,
                            scanRecords = (listOf(record) + state.scanRecords).take(50),
                            lastScanStatus = "Failed: ${result.message}"
                        )
                    }
                }
            }
        }
    }

    fun clearLogs() {
        _uiState.update { it.copy(trafficLogs = emptyList()) }
    }

    fun clearHistory() {
        _uiState.update { it.copy(scanRecords = emptyList(), lastScannedCode = "", lastScanStatus = "") }
    }

    private fun addLog(message: String, isSuccess: Boolean = true, isNetworkEvent: Boolean = false) {
        val entry = OcrLogEntry(
            message = message,
            isSuccess = isSuccess,
            isNetworkEvent = isNetworkEvent
        )
        _uiState.update { state ->
            state.copy(trafficLogs = (state.trafficLogs + entry).takeLast(100))
        }
    }
}
