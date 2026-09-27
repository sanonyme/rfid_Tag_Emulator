package com.zeus.rfid.data.nfc

import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.Tag
import android.nfc.tech.IsoDep
import android.nfc.tech.MifareUltralight
import android.nfc.tech.Ndef
import android.nfc.tech.NfcA
import android.nfc.tech.NfcB
import android.nfc.tech.NfcF
import android.nfc.tech.NfcV
import java.math.BigInteger
import java.nio.charset.Charset
import java.text.SimpleDateFormat
import java.util.Arrays
import java.util.Date
import java.util.Locale

object NfcTagParser {

    private val URI_PREFIX_MAP = mapOf(
        0x00 to "",
        0x01 to "http://www.",
        0x02 to "https://www.",
        0x03 to "http://",
        0x04 to "https://",
        0x05 to "tel:",
        0x06 to "mailto:",
        0x07 to "ftp://anonymous:anonymous@",
        0x08 to "ftp://ftp.",
        0x09 to "ftps://",
        0x0A to "sftp://",
        0x0B to "smb://",
        0x0C to "nfs://",
        0x0D to "ftp://",
        0x0E to "dav://",
        0x0F to "news:",
        0x10 to "telnet://",
        0x11 to "imap:",
        0x12 to "rtsp://",
        0x13 to "urn:",
        0x14 to "pop:",
        0x15 to "sip:",
        0x16 to "sips:",
        0x17 to "tftp:",
        0x18 to "btspp://",
        0x19 to "btl2cap://",
        0x1A to "btgoep://",
        0x1B to "tcpobex://",
        0x1C to "irdaobex://",
        0x1D to "file://",
        0x1E to "urn:epc:id:",
        0x1F to "urn:epc:tag:",
        0x20 to "urn:epc:pat:",
        0x21 to "urn:epc:raw:",
        0x22 to "urn:epc:",
        0x23 to "urn:nfc:"
    )

    private val IC_MANUFACTURERS = mapOf(
        0x01 to "Motorola",
        0x02 to "STMicroelectronics",
        0x03 to "Hitachi",
        0x04 to "NXP Semiconductors (Philips)",
        0x05 to "Infineon Technologies",
        0x06 to "Cylink",
        0x07 to "Texas Instruments",
        0x08 to "Fujitsu",
        0x09 to "Matsushita Electronics (Panasonic)",
        0x0A to "NEC",
        0x0B to "Oki Electric",
        0x0C to "Toshiba",
        0x0D to "Mitsubishi Electric",
        0x0E to "Samsung Electronics",
        0x0F to "Hynix",
        0x10 to "LG Semiconductors",
        0x11 to "Emosyn-EM Microelectronic",
        0x12 to "INSIDE Technology",
        0x13 to "ORGA Kartensysteme",
        0x14 to "SHARP",
        0x15 to "ATMEL",
        0x16 to "Sony Corporation",
        0x19 to "Cypress",
        0x1D to "EM Microelectronic-Marin",
        0x1F to "Melexis",
        0x25 to "NXP Semiconductors",
        0x3F to "Broadcom",
        0x45 to "Samsung Electronics",
        0x59 to "Nordic Semiconductor"
    )

    fun parse(tag: Tag): NfcTagData {
        val uidBytes = tag.id ?: byteArrayOf()
        val uidHex = uidBytes.joinToString(":") { "%02X".format(it) }
        val uidHexPlain = uidBytes.joinToString("") { "%02X".format(it) }
        val uidReversedHex = uidBytes.reversedArray().joinToString("") { "%02X".format(it) }
        val uidDecimal = if (uidBytes.isNotEmpty()) BigInteger(1, uidBytes).toString(10) else "0"

        // IC Vendor Lookup
        val vendor = if (uidBytes.isNotEmpty()) {
            val vendorId = uidBytes[0].toInt() and 0xFF
            IC_MANUFACTURERS[vendorId] ?: "Standard / Proprietary IC (0x%02X)".format(vendorId)
        } else {
            "Unknown IC"
        }

        val techList = tag.techList.map { it.substringAfterLast('.') }

        // Technology-specific queries
        var atqaHex: String? = null
        var sakHex: String? = null
        var maxTransceiveLength: Int? = null
        var historicalBytesHex: String? = null
        var standard = "ISO/IEC 14443-3A"
        var tagType = "NFC Tag"

        val nfcA = NfcA.get(tag)
        if (nfcA != null) {
            standard = "ISO/IEC 14443-3A"
            val atqaBytes = nfcA.atqa
            if (atqaBytes != null && atqaBytes.isNotEmpty()) {
                atqaHex = "0x" + atqaBytes.reversedArray().joinToString("") { "%02X".format(it) }
            }
            val sak = nfcA.sak.toInt()
            sakHex = "0x%02X".format(sak)
            maxTransceiveLength = nfcA.maxTransceiveLength

            // Infer Tag Type from SAK and UID length
            tagType = inferTagTypeFromSak(sak, uidBytes.size, vendor)
        }

        val nfcB = NfcB.get(tag)
        if (nfcB != null) {
            standard = "ISO/IEC 14443-3B"
            tagType = "ISO/IEC 14443-3B Tag"
            maxTransceiveLength = nfcB.maxTransceiveLength
        }

        val nfcF = NfcF.get(tag)
        if (nfcF != null) {
            standard = "JIS 6319-4 (FeliCa)"
            tagType = "Sony FeliCa Tag"
            maxTransceiveLength = nfcF.maxTransceiveLength
        }

        val nfcV = NfcV.get(tag)
        if (nfcV != null) {
            standard = "ISO/IEC 15693 (Vicinity)"
            tagType = "ISO 15693 Vicinity Tag (ICODE / SLIX)"
            maxTransceiveLength = nfcV.maxTransceiveLength
        }

        val isoDep = IsoDep.get(tag)
        if (isoDep != null) {
            standard = "ISO/IEC 14443-4"
            if (tagType == "NFC Tag") tagType = "ISO-DEP Smartcard / DESFire"
            val hist = isoDep.historicalBytes
            if (hist != null && hist.isNotEmpty()) {
                historicalBytesHex = hist.joinToString(" ") { "%02X".format(it) }
            }
        }

        // NDEF Analysis
        var isNdef = false
        var isWritable = false
        var canMakeReadOnly = false
        var ndefTypeStr: String? = null
        var ndefMaxSize = 0
        var ndefCurrentSize = 0
        val parsedRecords = mutableListOf<NdefRecordData>()

        val ndef = Ndef.get(tag)
        if (ndef != null) {
            isNdef = true
            isWritable = ndef.isWritable
            canMakeReadOnly = ndef.canMakeReadOnly()
            ndefTypeStr = ndef.type
            ndefMaxSize = ndef.maxSize

            var message: NdefMessage? = ndef.cachedNdefMessage
            if (message == null) {
                try {
                    ndef.connect()
                    message = ndef.ndefMessage
                } catch (_: Exception) {
                    // Ignore connection drop, use cached
                } finally {
                    try { ndef.close() } catch (_: Exception) {}
                }
            }

            if (message != null) {
                ndefCurrentSize = message.byteArrayLength
                message.records?.forEachIndexed { index, record ->
                    parsedRecords.add(parseNdefRecord(index, record))
                }
            }
        }

        // Memory Pages Dump (for Mifare Ultralight / NTAG21x)
        val memoryPages = mutableListOf<NfcMemoryPage>()
        val mfu = MifareUltralight.get(tag)
        if (mfu != null) {
            try {
                mfu.connect()
                // Read first 16 pages (64 bytes: Header, Lock, CC, and initial user memory)
                for (startPage in 0 until 16 step 4) {
                    try {
                        val buffer = mfu.readPages(startPage)
                        for (i in 0 until 4) {
                            val pageNum = startPage + i
                            if (pageNum >= 16) break
                            val pageBytes = buffer.sliceArray(i * 4 until (i + 1) * 4)
                            val hex = pageBytes.joinToString(" ") { "%02X".format(it) }
                            val ascii = pageBytes.map { b ->
                                val c = b.toInt() and 0xFF
                                if (c in 32..126) c.toChar() else '.'
                            }.joinToString("")
                            val desc = when (pageNum) {
                                0 -> "UID 0-2 / Manufacturer"
                                1 -> "UID 3-6 (Serial Number)"
                                2 -> "BCC1 / Internal / Lock Bytes"
                                3 -> "Capability Container (CC)"
                                else -> "User Memory [Page $pageNum]"
                            }
                            memoryPages.add(
                                NfcMemoryPage(
                                    pageNumber = pageNum,
                                    byteOffset = pageNum * 4,
                                    hexBytes = hex,
                                    ascii = ascii,
                                    description = desc
                                )
                            )
                        }
                    } catch (_: Exception) {
                        break
                    }
                }
            } catch (_: Exception) {
                // Device removed too fast or read-protected
            } finally {
                try { mfu.close() } catch (_: Exception) {}
            }
        }

        val timestamp = System.currentTimeMillis()
        val formattedTime = SimpleDateFormat("HH:mm:ss.SSS", Locale.getDefault()).format(Date(timestamp))

        return NfcTagData(
            uidHex = uidHex,
            uidHexPlain = uidHexPlain,
            uidReversedHex = uidReversedHex,
            uidDecimal = uidDecimal,
            standard = standard,
            tagType = tagType,
            vendor = vendor,
            atqa = atqaHex,
            sak = sakHex,
            techList = techList,
            maxTransceiveLength = maxTransceiveLength,
            historicalBytesHex = historicalBytesHex,
            isNdef = isNdef,
            isWritable = isWritable,
            canMakeReadOnly = canMakeReadOnly,
            ndefType = ndefTypeStr,
            ndefMaxSize = ndefMaxSize,
            ndefCurrentSize = ndefCurrentSize,
            records = parsedRecords,
            memoryPages = memoryPages,
            timestampMs = timestamp,
            formattedTimestamp = formattedTime
        )
    }

    private fun inferTagTypeFromSak(sak: Int, uidLength: Int, vendor: String): String {
        return when (sak) {
            0x00 -> {
                if (uidLength == 7) "MIFARE Ultralight / NTAG213/215/216"
                else "NFC Forum Type 2 Tag"
            }
            0x08 -> "MIFARE Classic 1K"
            0x09 -> "MIFARE Classic Mini"
            0x10 -> "MIFARE Plus 2K (SL2)"
            0x11 -> "MIFARE Plus 4K (SL2)"
            0x18 -> "MIFARE Classic 4K"
            0x20 -> "MIFARE DESFire / ISO 14443-4"
            0x28 -> "MIFARE Classic 1K Emulated / JCOP"
            0x38 -> "MIFARE Classic 4K Emulated"
            0x88 -> "MIFARE Classic 1K (Infineon)"
            0x98 -> "Gemplus MPCOS"
            else -> "ISO 14443-A Tag (SAK: 0x%02X)".format(sak)
        }
    }

    private fun parseNdefRecord(index: Int, record: NdefRecord): NdefRecordData {
        val tnf = record.tnf
        val typeBytes = record.type ?: byteArrayOf()
        val payload = record.payload ?: byteArrayOf()
        val rawHex = payload.joinToString(" ") { "%02X".format(it) }

        var recordType = "NDEF Payload"
        var parsedText = ""
        var uriString: String? = null
        var mimeType: String? = null
        var langCode: String? = null
        var encodingStr: String? = null

        val tnfDescription = when (tnf) {
            NdefRecord.TNF_WELL_KNOWN -> "TNF_WELL_KNOWN (NFC Forum RTD)"
            NdefRecord.TNF_MIME_MEDIA -> "TNF_MIME_MEDIA (RFC 2046)"
            NdefRecord.TNF_ABSOLUTE_URI -> "TNF_ABSOLUTE_URI (RFC 3986)"
            NdefRecord.TNF_EXTERNAL_TYPE -> "TNF_EXTERNAL_TYPE"
            NdefRecord.TNF_EMPTY -> "TNF_EMPTY"
            NdefRecord.TNF_UNCHANGED -> "TNF_UNCHANGED"
            else -> "TNF_UNKNOWN ($tnf)"
        }

        when (tnf) {
            NdefRecord.TNF_WELL_KNOWN -> {
                if (Arrays.equals(typeBytes, NdefRecord.RTD_TEXT)) {
                    recordType = "Text"
                    if (payload.isNotEmpty()) {
                        val status = payload[0].toInt()
                        val isUtf16 = (status and 0x80) != 0
                        val langLength = status and 0x3F
                        encodingStr = if (isUtf16) "UTF-16" else "UTF-8"
                        if (payload.size > 1 + langLength) {
                            langCode = String(payload, 1, langLength, Charsets.US_ASCII)
                            val charset = if (isUtf16) Charsets.UTF_16 else Charsets.UTF_8
                            parsedText = String(payload, 1 + langLength, payload.size - 1 - langLength, charset)
                        } else {
                            parsedText = rawHex
                        }
                    }
                } else if (Arrays.equals(typeBytes, NdefRecord.RTD_URI)) {
                    recordType = "URI"
                    if (payload.isNotEmpty()) {
                        val prefixCode = payload[0].toInt() and 0xFF
                        val prefix = URI_PREFIX_MAP[prefixCode] ?: ""
                        val remainder = String(payload, 1, payload.size - 1, Charsets.UTF_8)
                        val fullUri = prefix + remainder
                        uriString = fullUri
                        parsedText = fullUri
                    }
                } else if (Arrays.equals(typeBytes, NdefRecord.RTD_SMART_POSTER)) {
                    recordType = "Smart Poster"
                    parsedText = "NFC SmartPoster Container (${payload.size} bytes)"
                } else {
                    val rtd = String(typeBytes, Charsets.US_ASCII)
                    recordType = "RTD: $rtd"
                    parsedText = String(payload, Charsets.UTF_8)
                }
            }
            NdefRecord.TNF_MIME_MEDIA -> {
                recordType = "MIME Media"
                mimeType = String(typeBytes, Charsets.US_ASCII)
                parsedText = try {
                    String(payload, Charsets.UTF_8)
                } catch (_: Exception) {
                    rawHex
                }
            }
            NdefRecord.TNF_ABSOLUTE_URI -> {
                recordType = "Absolute URI"
                val uri = String(typeBytes, Charsets.UTF_8)
                uriString = uri
                parsedText = uri
            }
            NdefRecord.TNF_EXTERNAL_TYPE -> {
                val extType = String(typeBytes, Charsets.US_ASCII)
                if (extType.equals("android.com:pkg", ignoreCase = true)) {
                    recordType = "Android App Record (AAR)"
                    parsedText = String(payload, Charsets.UTF_8)
                } else {
                    recordType = "External: $extType"
                    parsedText = String(payload, Charsets.UTF_8)
                }
            }
            else -> {
                recordType = "Raw Data"
                parsedText = rawHex
            }
        }

        return NdefRecordData(
            recordIndex = index + 1,
            type = recordType,
            tnfDescription = tnfDescription,
            payloadText = parsedText,
            uriString = uriString,
            mimeType = mimeType,
            languageCode = langCode,
            encoding = encodingStr,
            rawPayloadHex = rawHex
        )
    }
}
