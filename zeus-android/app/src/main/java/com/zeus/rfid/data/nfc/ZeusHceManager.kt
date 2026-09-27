package com.zeus.rfid.data.nfc

import android.nfc.NdefMessage
import android.nfc.NdefRecord
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.ByteArrayOutputStream
import java.nio.charset.StandardCharsets
import java.util.Arrays

object ZeusHceManager {

    private val _isEmulating = MutableStateFlow(false)
    val isEmulating: StateFlow<Boolean> = _isEmulating.asStateFlow()

    private val _activeTag = MutableStateFlow<SavedNfcTag?>(null)
    val activeTag: StateFlow<SavedNfcTag?> = _activeTag.asStateFlow()

    private val _tapCount = MutableStateFlow(0)
    val tapCount: StateFlow<Int> = _tapCount.asStateFlow()

    private val _lastStatus = MutableStateFlow<String?>(null)
    val lastStatus: StateFlow<String?> = _lastStatus.asStateFlow()

    // APDU Status Words
    private val SW_OK = byteArrayOf(0x90.toByte(), 0x00.toByte())
    private val SW_FILE_NOT_FOUND = byteArrayOf(0x6A.toByte(), 0x82.toByte())
    private val SW_INS_NOT_SUPPORTED = byteArrayOf(0x6D.toByte(), 0x00.toByte())

    // AIDs and File IDs
    private val NDEF_AID = byteArrayOf(
        0xD2.toByte(), 0x76.toByte(), 0x00.toByte(), 0x00.toByte(),
        0x85.toByte(), 0x01.toByte(), 0x01.toByte()
    )
    private val CC_FILE_ID = byteArrayOf(0xE1.toByte(), 0x03.toByte())
    private val NDEF_FILE_ID = byteArrayOf(0xE1.toByte(), 0x04.toByte())

    // Type 4 Tag Capability Container (CC) File - 15 bytes
    private val CC_FILE = byteArrayOf(
        0x00, 0x0F, // CCLEN (15 bytes)
        0x20,       // Mapping Version 2.0
        0x00, 0x7F, // MLe (Max R-APDU size: 127 bytes)
        0x00, 0x7F, // MLc (Max C-APDU size: 127 bytes)
        0x04,       // NDEF Management TLV Tag
        0x06,       // Length (6 bytes)
        0xE1.toByte(), 0x04, // NDEF File ID (E104)
        0x08, 0x00, // Max NDEF File Size (2048 bytes)
        0x00,       // Read access condition (open)
        0xFF.toByte() // Write access condition (read-only)
    )

    // Current state of APDU protocol session
    private var isAppSelected = false
    private var isCcSelected = false
    private var isNdefSelected = false
    private var cachedNdefFileBytes: ByteArray = byteArrayOf(0x00, 0x00)

    fun startEmulation(tag: SavedNfcTag) {
        _activeTag.value = tag
        _isEmulating.value = true
        _tapCount.value = 0
        _lastStatus.value = "Emulating: ${tag.name}"
        cachedNdefFileBytes = buildNdefFileForTag(tag)
        resetSession()
    }

    fun stopEmulation() {
        _isEmulating.value = false
        _activeTag.value = null
        _lastStatus.value = "Emulation stopped"
        resetSession()
    }

    private fun resetSession() {
        isAppSelected = false
        isCcSelected = false
        isNdefSelected = false
    }

    /**
     * Process incoming APDU commands from an external NFC reader / smartphone.
     */
    fun processApdu(commandApdu: ByteArray): ByteArray {
        if (!_isEmulating.value || commandApdu.size < 4) {
            return SW_FILE_NOT_FOUND
        }

        val cla = commandApdu[0].toInt() and 0xFF
        val ins = commandApdu[1].toInt() and 0xFF
        val p1 = commandApdu[2].toInt() and 0xFF
        val p2 = commandApdu[3].toInt() and 0xFF

        return when (ins) {
            0xA4 -> handleSelect(commandApdu, p1, p2)
            0xB0 -> handleReadBinary(commandApdu, p1, p2)
            else -> SW_INS_NOT_SUPPORTED
        }
    }

    private fun handleSelect(apdu: ByteArray, p1: Int, p2: Int): ByteArray {
        if (apdu.size < 5) return SW_FILE_NOT_FOUND
        val lc = apdu[4].toInt() and 0xFF
        if (apdu.size < 5 + lc) return SW_FILE_NOT_FOUND
        val data = apdu.copyOfRange(5, 5 + lc)

        // Select by DF Name (Application Identifier AID)
        if (p1 == 0x04 && p2 == 0x00) {
            return if (Arrays.equals(data, NDEF_AID)) {
                isAppSelected = true
                isCcSelected = false
                isNdefSelected = false
                SW_OK
            } else {
                SW_FILE_NOT_FOUND
            }
        }

        // Select by File Identifier
        if (p1 == 0x00 && (p2 == 0x0C || p2 == 0x00)) {
            if (!isAppSelected) return SW_FILE_NOT_FOUND
            return when {
                Arrays.equals(data, CC_FILE_ID) -> {
                    isCcSelected = true
                    isNdefSelected = false
                    SW_OK
                }
                Arrays.equals(data, NDEF_FILE_ID) -> {
                    isNdefSelected = true
                    isCcSelected = false
                    SW_OK
                }
                else -> SW_FILE_NOT_FOUND
            }
        }

        return SW_FILE_NOT_FOUND
    }

    private fun handleReadBinary(apdu: ByteArray, p1: Int, p2: Int): ByteArray {
        if (!isAppSelected) return SW_FILE_NOT_FOUND
        val offset = (p1 shl 8) or p2
        val le = if (apdu.size > 4) apdu[4].toInt() and 0xFF else 0

        val targetData = when {
            isCcSelected -> CC_FILE
            isNdefSelected -> cachedNdefFileBytes
            else -> return SW_FILE_NOT_FOUND
        }

        if (offset >= targetData.size) {
            return SW_OK
        }

        val available = targetData.size - offset
        val lengthToRead = if (le == 0) available else minOf(le, available)
        val slice = targetData.copyOfRange(offset, offset + lengthToRead)

        // Increment tap counter when NDEF reading is completed
        if (isNdefSelected && (offset + lengthToRead >= targetData.size || lengthToRead > 0)) {
            _tapCount.value = _tapCount.value + 1
            _lastStatus.value = "Tap #${_tapCount.value} handled (${slice.size}B sent)"
        }

        return concat(slice, SW_OK)
    }

    private fun buildNdefFileForTag(tag: SavedNfcTag): ByteArray {
        val record: NdefRecord = when {
            tag.ndefUri != null && tag.ndefUri.isNotBlank() -> {
                NdefRecord.createUri(tag.ndefUri)
            }
            tag.ndefPayloadText != null && tag.ndefPayloadText.isNotBlank() -> {
                NdefRecord.createTextRecord("en", tag.ndefPayloadText)
            }
            else -> {
                val summary = "Tag: ${tag.name}\nUID: ${tag.uidHex}\nType: ${tag.tagType}"
                NdefRecord.createTextRecord("en", summary)
            }
        }

        val ndefMessage = NdefMessage(arrayOf(record))
        val messageBytes = ndefMessage.toByteArray()
        val totalLength = messageBytes.size

        // NDEF file format: 2-byte big-endian length prefix + message bytes
        val fileBytes = ByteArray(2 + totalLength)
        fileBytes[0] = ((totalLength shr 8) and 0xFF).toByte()
        fileBytes[1] = (totalLength and 0xFF).toByte()
        System.arraycopy(messageBytes, 0, fileBytes, 2, totalLength)
        return fileBytes
    }

    private fun concat(a: ByteArray, b: ByteArray): ByteArray {
        val res = ByteArray(a.size + b.size)
        System.arraycopy(a, 0, res, 0, a.size)
        System.arraycopy(b, 0, res, a.size, b.size)
        return res
    }
}
