package com.zeus.rfid.data.nfc

import kotlinx.serialization.Serializable

/**
 * Hardware availability and readiness status of the device NFC controller.
 */
sealed interface NfcHardwareStatus {
    data object Ready : NfcHardwareStatus
    data object Disabled : NfcHardwareStatus
    data object Unsupported : NfcHardwareStatus
    data object Reading : NfcHardwareStatus
}

/**
 * Representation of an individual NDEF record parsed from an NFC tag.
 */
data class NdefRecordData(
    val recordIndex: Int,
    val type: String, // "URI", "Text", "MIME", "Smart Poster", "AAR", "External", "Unknown"
    val tnfDescription: String,
    val payloadText: String,
    val uriString: String? = null,
    val mimeType: String? = null,
    val languageCode: String? = null,
    val encoding: String? = null,
    val rawPayloadHex: String
)

/**
 * Memory page representation for Mifare Ultralight, NTAG21x, and type-2 memory architectures.
 */
data class NfcMemoryPage(
    val pageNumber: Int,
    val byteOffset: Int,
    val hexBytes: String,
    val ascii: String,
    val description: String? = null
)

/**
 * Comprehensive NFC tag model parsed from low-level Android Tag hardware objects.
 */
data class NfcTagData(
    val uidHex: String,
    val uidHexPlain: String,
    val uidReversedHex: String,
    val uidDecimal: String,
    val standard: String,
    val tagType: String,
    val vendor: String,
    val atqa: String? = null,
    val sak: String? = null,
    val techList: List<String> = emptyList(),
    val maxTransceiveLength: Int? = null,
    val historicalBytesHex: String? = null,
    val isNdef: Boolean = false,
    val isWritable: Boolean = false,
    val canMakeReadOnly: Boolean = false,
    val ndefType: String? = null,
    val ndefMaxSize: Int = 0,
    val ndefCurrentSize: Int = 0,
    val records: List<NdefRecordData> = emptyList(),
    val memoryPages: List<NfcMemoryPage> = emptyList(),
    val timestampMs: Long = System.currentTimeMillis(),
    val formattedTimestamp: String = ""
)

/**
 * Persisted NFC tag stored in the Zeus Tag Vault.
 */
@Serializable
data class SavedNfcTag(
    val id: String = java.util.UUID.randomUUID().toString(),
    val name: String,
    val category: String = "General",
    val uidHex: String,
    val uidDecimal: String = "",
    val standard: String = "ISO/IEC 14443-3A",
    val tagType: String = "NFC Tag",
    val vendor: String = "Unknown",
    val atqa: String? = null,
    val sak: String? = null,
    val isNdef: Boolean = false,
    val ndefType: String? = null,
    val ndefPayloadText: String? = null,
    val ndefUri: String? = null,
    val notes: String = "",
    val createdAtMs: Long = System.currentTimeMillis()
)

/**
 * UI State for the NFC Tag Reader screen.
 */
data class NfcUiState(
    val hardwareStatus: NfcHardwareStatus = NfcHardwareStatus.Ready,
    val currentTag: NfcTagData? = null,
    val scanHistory: List<NfcTagData> = emptyList(),
    val isListening: Boolean = true,
    val selectedTab: Int = 0, // 0: Specs, 1: NDEF, 2: Memory, 3: History, 4: Vault
    val copyFeedback: String? = null,
    val historySearchQuery: String = "",
    val errorMessage: String? = null,
    // Tag Vault & Emulation state
    val vaultTags: List<SavedNfcTag> = emptyList(),
    val selectedVaultCategory: String = "All",
    val vaultSearchQuery: String = "",
    val isEmulating: Boolean = false,
    val emulatingTag: SavedNfcTag? = null,
    val emulationTapCount: Int = 0,
    val lastEmulationStatus: String? = null,
    val showSaveDialog: Boolean = false,
    val selectedSavedTagForDetail: SavedNfcTag? = null
)
