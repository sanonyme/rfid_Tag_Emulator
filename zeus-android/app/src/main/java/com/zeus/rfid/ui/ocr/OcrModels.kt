package com.zeus.rfid.ui.ocr

import java.time.LocalTime
import java.time.format.DateTimeFormatter

/**
 * Log entry representing an OCR/Barcode event or network transmission.
 */
data class OcrLogEntry(
    val id: String = java.util.UUID.randomUUID().toString(),
    val timestamp: String = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss.SSS")),
    val message: String,
    val isSuccess: Boolean = true,
    val isNetworkEvent: Boolean = false
)

/**
 * Represents a barcode or QR code captured via camera or preset.
 */
data class OcrScanRecord(
    val id: String = java.util.UUID.randomUUID().toString(),
    val code: String,
    val format: String,
    val timestamp: String = LocalTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss")),
    val sentSuccessfully: Boolean = false,
    val errorMessage: String? = null
)

/**
 * Predefined barcode and OCR payload presets.
 */
data class OcrPreset(
    val id: String,
    val title: String,
    val subtitle: String,
    val payload: String,
    val tag: String
)

/**
 * UI State for the OCR & Barcode emulator screen.
 */
data class OcrUiState(
    val host: String = "192.168.1.100",
    val port: Int = 10482,
    val message: String = INDITEX_SAMPLE_CODE,
    val isSending: Boolean = false,
    val isCameraOpen: Boolean = false,
    val autoSendOnScan: Boolean = true,
    val torchEnabled: Boolean = false,
    val soundFeedback: Boolean = true,
    val hapticFeedback: Boolean = true,
    val lastScannedCode: String = "",
    val lastScannedFormat: String = "",
    val lastScanStatus: String = "",
    val scanRecords: List<OcrScanRecord> = emptyList(),
    val trafficLogs: List<OcrLogEntry> = emptyList(),
    val activePresetId: String = "inditex"
) {
    companion object {
        const val INDITEX_SAMPLE_CODE =
            "{\"00\":1,\"01\":1,\"02\":\"2/2\",\"03\":1,\"04\":1224,\"05\":490,\"06\":102,\"07\":36,\"08\":\"S2024\",\"09\":3,\"10\":3,\"11\":1,\"12\":835906,\"13\":\"28937-P/2\",\"14\":10079,\"15\":150,\"16\":0,\"17\":317,\"18\":282537599,\"19\":0,\"20\":39} $0A"

        val PRESETS = listOf(
            OcrPreset(
                id = "inditex",
                title = "Inditex Sample",
                subtitle = "Official JSON format from Zeus desktop OCR sender",
                payload = INDITEX_SAMPLE_CODE,
                tag = "JSON Payload"
            ),
            OcrPreset(
                id = "upca",
                title = "UPC-A Barcode",
                subtitle = "Standard 12-digit retail product barcode",
                payload = "012345678905",
                tag = "1D Barcode"
            ),
            OcrPreset(
                id = "gs1_128",
                title = "GS1-128 / Code 128",
                subtitle = "GTIN + Serial application identifier format",
                payload = "(01)00012345678905(21)987654321",
                tag = "GS1 Syntax"
            ),
            OcrPreset(
                id = "ean13",
                title = "EAN-13 European Barcode",
                subtitle = "Global trade item number barcode",
                payload = "8412345678905",
                tag = "EAN-13"
            ),
            OcrPreset(
                id = "qr_gs1",
                title = "GS1 Digital Link QR",
                subtitle = "URI web-enabled product identity QR payload",
                payload = "https://id.gs1.org/01/00012345678905/21/987654321",
                tag = "2D QR Code"
            )
        )
    }
}
