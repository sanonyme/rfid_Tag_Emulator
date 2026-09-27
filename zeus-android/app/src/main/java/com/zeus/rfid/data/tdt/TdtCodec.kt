package com.zeus.rfid.data.tdt

import java.math.BigInteger
import java.net.URI
import java.net.URLDecoder
import java.nio.charset.StandardCharsets

enum class TdtOutputLevel(val label: String) {
    PURE_IDENTITY("EPC Pure URI"),
    TAG_ENCODING("EPC Tag URI"),
    GS1_DIGITAL_LINK("GS1 Digital Link URI"),
    GS1_AI_JSON("GS1 AI String (JSON)"),
    BARE_IDENTIFIER("Bare Identifier"),
    TEI("Text Element Identifier"),
    HEX("Hex encoded TDS data"),
    BINARY("Binary encoded TDS data"),
    LEGACY("Legacy")
}

data class TdtAi(
    val ai: String,
    val label: String,
    val value: String
)

data class BitSegment(
    val label: String,
    val bits: Int,
    val value: String,
    val binaryStr: String,
    val colorIndex: Int // 0: Header (blue), 1: Filter (emerald), 2: Partition (amber), 3: Company (violet), 4: Item (rose), 5: Serial (cyan)
)

data class SgtinDetails(
    val gtin: String,
    val checkDigit: String,
    val serial: String,
    val filter: Int,
    val partition: Int,
    val companyPrefix: String,
    val itemReference: String
)

data class TdtDecodeResult(
    val scheme: String,
    val inputLevel: String,
    val detectedGcpLength: Int?,
    val outputs: Map<TdtOutputLevel, String>,
    val ais: List<TdtAi>,
    val binary: String?,
    val hex: String?,
    val sgtinDetails: SgtinDetails?,
    val bitSegments: List<BitSegment>?
)

data class TdtEncodeResult(
    val hex: String,
    val scheme: String,
    val binary: String,
    val pureUri: String?,
    val tagUri: String?,
    val digitalLink: String?,
    val aiJson: String?,
    val bareId: String?
)

data class PartitionEntry(
    val partition: Int,
    val companyBits: Int,
    val itemBits: Int,
    val companyDigits: Int,
    val itemDigits: Int
)

object TdtEngine {

    val SGTIN_PARTITIONS = listOf(
        PartitionEntry(0, 40, 4, 12, 1),
        PartitionEntry(1, 37, 7, 11, 2),
        PartitionEntry(2, 34, 10, 10, 3),
        PartitionEntry(3, 30, 14, 9, 4),
        PartitionEntry(4, 27, 17, 8, 5),
        PartitionEntry(5, 24, 20, 7, 6),
        PartitionEntry(6, 20, 24, 6, 7)
    )

    val SSCC_PARTITIONS = listOf(
        PartitionEntry(0, 40, 18, 12, 5),
        PartitionEntry(1, 37, 21, 11, 6),
        PartitionEntry(2, 34, 24, 10, 7),
        PartitionEntry(3, 30, 28, 9, 8),
        PartitionEntry(4, 27, 31, 8, 9),
        PartitionEntry(5, 24, 34, 7, 10),
        PartitionEntry(6, 20, 38, 6, 11)
    )

    val SGLN_PARTITIONS = listOf(
        PartitionEntry(0, 40, 1, 12, 0),
        PartitionEntry(1, 37, 4, 11, 1),
        PartitionEntry(2, 34, 7, 10, 2),
        PartitionEntry(3, 30, 11, 9, 3),
        PartitionEntry(4, 27, 14, 8, 4),
        PartitionEntry(5, 24, 17, 7, 5),
        PartitionEntry(6, 20, 21, 6, 6)
    )

    val GRAI_PARTITIONS = listOf(
        PartitionEntry(0, 40, 4, 12, 0),
        PartitionEntry(1, 37, 7, 11, 1),
        PartitionEntry(2, 34, 10, 10, 2),
        PartitionEntry(3, 30, 14, 9, 3),
        PartitionEntry(4, 27, 17, 8, 4),
        PartitionEntry(5, 24, 20, 7, 5),
        PartitionEntry(6, 20, 24, 6, 6)
    )

    val GIAI_PARTITIONS = listOf(
        PartitionEntry(0, 40, 42, 12, 0),
        PartitionEntry(1, 37, 45, 11, 0),
        PartitionEntry(2, 34, 48, 10, 0),
        PartitionEntry(3, 30, 52, 9, 0),
        PartitionEntry(4, 27, 55, 8, 0),
        PartitionEntry(5, 24, 58, 7, 0),
        PartitionEntry(6, 20, 62, 6, 0)
    )

    val ALL_SUPPORTED_SCHEMES = listOf(
        "SGTIN-96", "SGTIN-198", "SGTIN+", "SGTIN++",
        "SSCC-96", "SSCC+", "SSCC++",
        "SGLN-96", "SGLN+", "SGLN++",
        "GRAI-96", "GRAI+", "GRAI++",
        "GIAI-96", "GIAI+", "GIAI++",
        "GDTI-96", "GDTI+", "GDTI++",
        "GSRN-96", "GSRN+", "GSRN++",
        "GID-96",
        "USDOD-96",
        "CPI+", "CPI++"
    )

    fun calculateCheckDigit(digits: String): String {
        var sum = 0
        val len = digits.length
        for (i in 0 until len) {
            val digit = digits[len - 1 - i].digitToIntOrNull() ?: 0
            sum += if (i % 2 == 0) digit * 3 else digit
        }
        val nearestTen = ((sum + 9) / 10) * 10
        val check = nearestTen - sum
        return if (check == 10) "0" else check.toString()
    }

    fun verifyCheckDigit(digitsWithCheck: String): Boolean {
        if (digitsWithCheck.length < 2) return false
        val body = digitsWithCheck.dropLast(1)
        val expected = calculateCheckDigit(body)
        return digitsWithCheck.takeLast(1) == expected
    }

    fun uidToSerial(uid: String): Pair<String, String>? {
        val clean = uid.replace(Regex("[^0-9A-Fa-f]"), "").uppercase()
        if (!clean.startsWith("E016") || clean.length != 16) {
            return null
        }
        val hex12 = clean.substring(4)
        val full48 = BigInteger(hex12, 16)
        val mask38 = BigInteger.ONE.shiftLeft(38).subtract(BigInteger.ONE)
        val serial38 = full48.and(mask38)
        return Pair(serial38.toString(), hex12)
    }

    fun getPartitionFromGcpLength(length: Int): Int {
        return when (length) {
            12 -> 0
            11 -> 1
            10 -> 2
            9 -> 3
            8 -> 4
            7 -> 5
            6 -> 6
            else -> 6
        }
    }

    fun hexToBinary(hex: String): String {
        val sb = StringBuilder(hex.length * 4)
        for (c in hex) {
            val nibble = c.digitToInt(16)
            sb.append(nibble.toString(2).padStart(4, '0'))
        }
        return sb.toString()
    }

    fun binaryToHex(binary: String): String {
        val padded = if (binary.length % 4 != 0) {
            binary.padStart(binary.length + (4 - binary.length % 4), '0')
        } else binary

        val sb = StringBuilder(padded.length / 4)
        for (i in padded.indices step 4) {
            val nibble = padded.substring(i, i + 4).toInt(2)
            sb.append(nibble.toString(16).uppercase())
        }
        return sb.toString()
    }

    fun autodetect(input: String): List<String> {
        val raw = input.trim()
        if (raw.isEmpty()) return emptyList()

        val hexClean = raw.replace(Regex("[^0-9A-Fa-f]"), "").uppercase()
        if (hexClean.length == 24) {
            return when {
                hexClean.startsWith("30") -> listOf("SGTIN-96", "SGTIN+", "SGTIN-198")
                hexClean.startsWith("31") -> listOf("SSCC-96", "SSCC+")
                hexClean.startsWith("32") -> listOf("SGLN-96", "SGLN+")
                hexClean.startsWith("33") -> listOf("GRAI-96", "GRAI+")
                hexClean.startsWith("34") -> listOf("GIAI-96", "GIAI+")
                hexClean.startsWith("35") -> listOf("GID-96")
                hexClean.startsWith("2F") -> listOf("USDOD-96")
                else -> listOf("SGTIN-96")
            }
        }
        if (hexClean.startsWith("F7")) {
            return listOf("SGTIN+", "SGTIN++", "CPI++")
        }

        if (raw.startsWith("urn:epc:tag:sgtin-96:")) return listOf("SGTIN-96")
        if (raw.startsWith("urn:epc:tag:sgtin-198:")) return listOf("SGTIN-198", "SGTIN-96")
        if (raw.startsWith("urn:epc:tag:sscc-96:")) return listOf("SSCC-96")
        if (raw.startsWith("urn:epc:tag:sgln-96:")) return listOf("SGLN-96")
        if (raw.startsWith("urn:epc:tag:grai-96:")) return listOf("GRAI-96")
        if (raw.startsWith("urn:epc:tag:giai-96:")) return listOf("GIAI-96")
        if (raw.startsWith("urn:epc:tag:gid-96:")) return listOf("GID-96")
        if (raw.startsWith("urn:epc:tag:usdod-96:")) return listOf("USDOD-96")

        if (raw.startsWith("urn:epc:id:sgtin:")) return listOf("SGTIN-96", "SGTIN+")
        if (raw.startsWith("urn:epc:id:sscc:")) return listOf("SSCC-96", "SSCC+")
        if (raw.startsWith("urn:epc:id:sgln:")) return listOf("SGLN-96", "SGLN+")
        if (raw.startsWith("urn:epc:id:grai:")) return listOf("GRAI-96", "GRAI+")
        if (raw.startsWith("urn:epc:id:giai:")) return listOf("GIAI-96", "GIAI+")
        if (raw.startsWith("urn:epc:id:gid:")) return listOf("GID-96")
        if (raw.startsWith("urn:epc:id:usdod:")) return listOf("USDOD-96")

        if (raw.startsWith("http://") || raw.startsWith("https://")) {
            return when {
                raw.contains("/01/") -> listOf("SGTIN-96", "SGTIN+", "SGTIN++")
                raw.contains("/00/") -> listOf("SSCC-96", "SSCC+", "SSCC++")
                raw.contains("/414/") -> listOf("SGLN-96", "SGLN+", "SGLN++")
                raw.contains("/8003/") -> listOf("GRAI-96", "GRAI+", "GRAI++")
                raw.contains("/8004/") -> listOf("GIAI-96", "GIAI+", "GIAI++")
                raw.contains("/8010/") -> listOf("CPI+", "CPI++")
                else -> listOf("SGTIN-96")
            }
        }

        if (raw.startsWith("{") && raw.endsWith("}")) {
            return when {
                raw.contains("\"01\"") -> listOf("SGTIN-96", "SGTIN+", "SGTIN++")
                raw.contains("\"00\"") -> listOf("SSCC-96", "SSCC+")
                raw.contains("\"414\"") -> listOf("SGLN-96", "SGLN+")
                raw.contains("\"8003\"") -> listOf("GRAI-96", "GRAI+")
                raw.contains("\"8004\"") -> listOf("GIAI-96", "GIAI+")
                raw.contains("\"8010\"") -> listOf("CPI+", "CPI++")
                else -> listOf("SGTIN-96")
            }
        }

        if (raw.contains("=")) {
            return when {
                raw.contains("gtin=") -> listOf("SGTIN-96", "SGTIN+", "SGTIN++")
                raw.contains("sscc=") -> listOf("SSCC-96", "SSCC+")
                raw.contains("gln=") -> listOf("SGLN-96", "SGLN+")
                raw.contains("cpi=") -> listOf("CPI+", "CPI++")
                raw.contains("generalmanager=") -> listOf("GID-96")
                raw.contains("cage=") || raw.contains("cageordodaac=") -> listOf("USDOD-96")
                else -> listOf("SGTIN-96")
            }
        }

        return listOf("SGTIN-96")
    }

    fun decode(input: String, forcedScheme: String? = null): Result<TdtDecodeResult> {
        val raw = input.trim()
        if (raw.isEmpty()) return Result.failure(IllegalArgumentException("Empty input"))

        val detected = autodetect(raw)
        val scheme = (forcedScheme?.takeIf { it.isNotEmpty() } ?: detected.firstOrNull() ?: "SGTIN-96")
            .uppercase()

        // 1. If hex string
        val hexClean = raw.replace(Regex("[^0-9A-Fa-f]"), "").uppercase()
        if (hexClean.length == 24) {
            return decodeHex96(hexClean, scheme)
        }

        // 2. If URN Tag or Pure URI
        if (raw.startsWith("urn:epc:")) {
            return decodeUrn(raw, scheme)
        }

        // 3. If Digital Link URI
        if (raw.startsWith("http://") || raw.startsWith("https://")) {
            return decodeDigitalLink(raw, scheme)
        }

        // 4. If AI JSON
        if (raw.startsWith("{") && raw.endsWith("}")) {
            return decodeAiJson(raw, scheme)
        }

        // 5. If Bare Identifier
        if (raw.contains("=")) {
            return decodeBareIdentifier(raw, scheme)
        }

        return Result.failure(IllegalArgumentException("Unrecognized format. Please provide a 24-character hex EPC, EPC URI, GS1 Digital Link, or AI JSON."))
    }

    private fun decodeHex96(hex: String, preferredScheme: String): Result<TdtDecodeResult> {
        val binary = hexToBinary(hex)
        val header = binary.substring(0, 8).toInt(2)

        return when (header) {
            0x30 -> decodeSgtin96Binary(binary, hex)
            0x31 -> decodeSscc96Binary(binary, hex)
            0x32 -> decodeSgln96Binary(binary, hex)
            0x33 -> decodeGrai96Binary(binary, hex)
            0x34 -> decodeGiai96Binary(binary, hex)
            0x35 -> decodeGid96Binary(binary, hex)
            0x2F -> decodeUsdod96Binary(binary, hex)
            else -> {
                // If header isn't 0x30 but user forced SGTIN-96, decode as SGTIN-96 anyway
                if (preferredScheme.contains("SGTIN")) {
                    decodeSgtin96Binary(binary, hex)
                } else {
                    Result.failure(IllegalArgumentException("Unsupported EPC Header: 0x${header.toString(16).uppercase()}"))
                }
            }
        }
    }

    private fun decodeSgtin96Binary(binary: String, hex: String): Result<TdtDecodeResult> {
        val filter = binary.substring(8, 11).toInt(2)
        val partition = binary.substring(11, 14).toInt(2)
        if (partition >= SGTIN_PARTITIONS.size) {
            return Result.failure(IllegalArgumentException("Invalid partition value: $partition"))
        }

        val rule = SGTIN_PARTITIONS[partition]
        var cursor = 14

        val companyVal = BigInteger(binary.substring(cursor, cursor + rule.companyBits), 2)
        val companyStr = companyVal.toString().padStart(rule.companyDigits, '0')
        cursor += rule.companyBits

        val itemRefVal = BigInteger(binary.substring(cursor, cursor + rule.itemBits), 2)
        val itemRefStr = itemRefVal.toString().padStart(rule.itemDigits, '0')
        cursor += rule.itemBits

        val serialBin = binary.substring(cursor, cursor + 38)
        val serialVal = BigInteger(serialBin, 2).toString()

        val rawGtinBase = itemRefStr[0] + companyStr + itemRefStr.substring(1)
        val checkDigit = calculateCheckDigit(rawGtinBase)
        val gtin14 = rawGtinBase + checkDigit

        val pureUri = "urn:epc:id:sgtin:$companyStr.$itemRefStr.$serialVal"
        val tagUri = "urn:epc:tag:sgtin-96:$filter.$companyStr.$itemRefStr.$serialVal"
        val digitalLink = "https://id.gs1.org/01/$gtin14/21/$serialVal"
        val aiJson = "{\"01\":\"$gtin14\",\"21\":\"$serialVal\"}"
        val bareId = "gtin=$gtin14;serial=$serialVal"
        val tei = "(01)$gtin14(21)$serialVal"

        val outputs = mapOf(
            TdtOutputLevel.PURE_IDENTITY to pureUri,
            TdtOutputLevel.TAG_ENCODING to tagUri,
            TdtOutputLevel.GS1_DIGITAL_LINK to digitalLink,
            TdtOutputLevel.GS1_AI_JSON to aiJson,
            TdtOutputLevel.BARE_IDENTIFIER to bareId,
            TdtOutputLevel.TEI to tei,
            TdtOutputLevel.HEX to hex,
            TdtOutputLevel.BINARY to binary,
            TdtOutputLevel.LEGACY to tei
        )

        val ais = listOf(
            TdtAi("01", "GTIN", gtin14),
            TdtAi("21", "Serial number", serialVal)
        )

        val sgtinDetails = SgtinDetails(
            gtin = gtin14,
            checkDigit = checkDigit,
            serial = serialVal,
            filter = filter,
            partition = partition,
            companyPrefix = companyStr,
            itemReference = itemRefStr
        )

        val bitSegments = listOf(
            BitSegment("Header", 8, "0x30", binary.substring(0, 8), 0),
            BitSegment("Filter", 3, filter.toString(), binary.substring(8, 11), 1),
            BitSegment("Partition", 3, partition.toString(), binary.substring(11, 14), 2),
            BitSegment("Company", rule.companyBits, companyStr, binary.substring(14, 14 + rule.companyBits), 3),
            BitSegment("Item Ref", rule.itemBits, itemRefStr, binary.substring(14 + rule.companyBits, 14 + rule.companyBits + rule.itemBits), 4),
            BitSegment("Serial", 38, serialVal, serialBin, 5)
        )

        return Result.success(
            TdtDecodeResult(
                scheme = "SGTIN-96",
                inputLevel = "HEX",
                detectedGcpLength = rule.companyDigits,
                outputs = outputs,
                ais = ais,
                binary = binary,
                hex = hex,
                sgtinDetails = sgtinDetails,
                bitSegments = bitSegments
            )
        )
    }

    private fun decodeSscc96Binary(binary: String, hex: String): Result<TdtDecodeResult> {
        val filter = binary.substring(8, 11).toInt(2)
        val partition = binary.substring(11, 14).toInt(2)
        val rule = SSCC_PARTITIONS.getOrElse(partition) { SSCC_PARTITIONS[0] }
        var cursor = 14

        val companyVal = BigInteger(binary.substring(cursor, cursor + rule.companyBits), 2)
        val companyStr = companyVal.toString().padStart(rule.companyDigits, '0')
        cursor += rule.companyBits

        val serialRefVal = BigInteger(binary.substring(cursor, cursor + rule.itemBits), 2)
        val serialRefStr = serialRefVal.toString().padStart(rule.itemDigits, '0')

        val extensionDigit = serialRefStr[0]
        val rawSscc = extensionDigit + companyStr + serialRefStr.substring(1)
        val checkDigit = calculateCheckDigit(rawSscc)
        val sscc18 = rawSscc + checkDigit

        val pureUri = "urn:epc:id:sscc:$companyStr.$serialRefStr"
        val tagUri = "urn:epc:tag:sscc-96:$filter.$companyStr.$serialRefStr"
        val digitalLink = "https://id.gs1.org/00/$sscc18"
        val aiJson = "{\"00\":\"$sscc18\"}"
        val bareId = "sscc=$sscc18"
        val tei = "(00)$sscc18"

        val outputs = mapOf(
            TdtOutputLevel.PURE_IDENTITY to pureUri,
            TdtOutputLevel.TAG_ENCODING to tagUri,
            TdtOutputLevel.GS1_DIGITAL_LINK to digitalLink,
            TdtOutputLevel.GS1_AI_JSON to aiJson,
            TdtOutputLevel.BARE_IDENTIFIER to bareId,
            TdtOutputLevel.TEI to tei,
            TdtOutputLevel.HEX to hex,
            TdtOutputLevel.BINARY to binary,
            TdtOutputLevel.LEGACY to tei
        )

        return Result.success(
            TdtDecodeResult(
                scheme = "SSCC-96",
                inputLevel = "HEX",
                detectedGcpLength = rule.companyDigits,
                outputs = outputs,
                ais = listOf(TdtAi("00", "SSCC", sscc18)),
                binary = binary,
                hex = hex,
                sgtinDetails = null,
                bitSegments = null
            )
        )
    }

    private fun decodeSgln96Binary(binary: String, hex: String): Result<TdtDecodeResult> {
        val filter = binary.substring(8, 11).toInt(2)
        val partition = binary.substring(11, 14).toInt(2)
        val rule = SGLN_PARTITIONS.getOrElse(partition) { SGLN_PARTITIONS[0] }
        var cursor = 14

        val companyVal = BigInteger(binary.substring(cursor, cursor + rule.companyBits), 2)
        val companyStr = companyVal.toString().padStart(rule.companyDigits, '0')
        cursor += rule.companyBits

        val locRefVal = BigInteger(binary.substring(cursor, cursor + rule.itemBits), 2)
        val locRefStr = locRefVal.toString().padStart(rule.itemDigits, '0')
        cursor += rule.itemBits

        val extVal = BigInteger(binary.substring(cursor, cursor + 41), 2).toString()

        val rawGln = companyStr + locRefStr
        val checkDigit = calculateCheckDigit(rawGln)
        val gln13 = rawGln + checkDigit

        val pureUri = "urn:epc:id:sgln:$companyStr.$locRefStr.$extVal"
        val tagUri = "urn:epc:tag:sgln-96:$filter.$companyStr.$locRefStr.$extVal"
        val digitalLink = "https://id.gs1.org/414/$gln13/254/$extVal"
        val aiJson = "{\"414\":\"$gln13\",\"254\":\"$extVal\"}"
        val bareId = "gln=$gln13;serial=$extVal"
        val tei = "(414)$gln13(254)$extVal"

        val outputs = mapOf(
            TdtOutputLevel.PURE_IDENTITY to pureUri,
            TdtOutputLevel.TAG_ENCODING to tagUri,
            TdtOutputLevel.GS1_DIGITAL_LINK to digitalLink,
            TdtOutputLevel.GS1_AI_JSON to aiJson,
            TdtOutputLevel.BARE_IDENTIFIER to bareId,
            TdtOutputLevel.TEI to tei,
            TdtOutputLevel.HEX to hex,
            TdtOutputLevel.BINARY to binary,
            TdtOutputLevel.LEGACY to tei
        )

        return Result.success(
            TdtDecodeResult(
                scheme = "SGLN-96",
                inputLevel = "HEX",
                detectedGcpLength = rule.companyDigits,
                outputs = outputs,
                ais = listOf(
                    TdtAi("414", "GLN", gln13),
                    TdtAi("254", "GLN extension", extVal)
                ),
                binary = binary,
                hex = hex,
                sgtinDetails = null,
                bitSegments = null
            )
        )
    }

    private fun decodeGrai96Binary(binary: String, hex: String): Result<TdtDecodeResult> {
        val filter = binary.substring(8, 11).toInt(2)
        val partition = binary.substring(11, 14).toInt(2)
        val rule = GRAI_PARTITIONS.getOrElse(partition) { GRAI_PARTITIONS[0] }
        var cursor = 14

        val companyVal = BigInteger(binary.substring(cursor, cursor + rule.companyBits), 2)
        val companyStr = companyVal.toString().padStart(rule.companyDigits, '0')
        cursor += rule.companyBits

        val assetTypeVal = BigInteger(binary.substring(cursor, cursor + rule.itemBits), 2)
        val assetTypeStr = assetTypeVal.toString().padStart(rule.itemDigits, '0')
        cursor += rule.itemBits

        val serialVal = BigInteger(binary.substring(cursor, cursor + 38), 2).toString()

        val rawGrai = "0$companyStr$assetTypeStr"
        val checkDigit = calculateCheckDigit(rawGrai)
        val graiFull = "$rawGrai$checkDigit$serialVal"

        val pureUri = "urn:epc:id:grai:$companyStr.$assetTypeStr.$serialVal"
        val tagUri = "urn:epc:tag:grai-96:$filter.$companyStr.$assetTypeStr.$serialVal"
        val digitalLink = "https://id.gs1.org/8003/$graiFull"
        val aiJson = "{\"8003\":\"$graiFull\"}"
        val bareId = "grai=$rawGrai$checkDigit;serial=$serialVal"

        val outputs = mapOf(
            TdtOutputLevel.PURE_IDENTITY to pureUri,
            TdtOutputLevel.TAG_ENCODING to tagUri,
            TdtOutputLevel.GS1_DIGITAL_LINK to digitalLink,
            TdtOutputLevel.GS1_AI_JSON to aiJson,
            TdtOutputLevel.BARE_IDENTIFIER to bareId,
            TdtOutputLevel.HEX to hex,
            TdtOutputLevel.BINARY to binary
        )

        return Result.success(
            TdtDecodeResult(
                scheme = "GRAI-96",
                inputLevel = "HEX",
                detectedGcpLength = rule.companyDigits,
                outputs = outputs,
                ais = listOf(TdtAi("8003", "GRAI", graiFull)),
                binary = binary,
                hex = hex,
                sgtinDetails = null,
                bitSegments = null
            )
        )
    }

    private fun decodeGiai96Binary(binary: String, hex: String): Result<TdtDecodeResult> {
        val filter = binary.substring(8, 11).toInt(2)
        val partition = binary.substring(11, 14).toInt(2)
        val rule = GIAI_PARTITIONS.getOrElse(partition) { GIAI_PARTITIONS[0] }
        var cursor = 14

        val companyVal = BigInteger(binary.substring(cursor, cursor + rule.companyBits), 2)
        val companyStr = companyVal.toString().padStart(rule.companyDigits, '0')
        cursor += rule.companyBits

        val assetRefVal = BigInteger(binary.substring(cursor, cursor + rule.itemBits), 2).toString()
        val giaiFull = "$companyStr$assetRefVal"

        val pureUri = "urn:epc:id:giai:$companyStr.$assetRefVal"
        val tagUri = "urn:epc:tag:giai-96:$filter.$companyStr.$assetRefVal"
        val digitalLink = "https://id.gs1.org/8004/$giaiFull"
        val aiJson = "{\"8004\":\"$giaiFull\"}"
        val bareId = "giai=$giaiFull"

        val outputs = mapOf(
            TdtOutputLevel.PURE_IDENTITY to pureUri,
            TdtOutputLevel.TAG_ENCODING to tagUri,
            TdtOutputLevel.GS1_DIGITAL_LINK to digitalLink,
            TdtOutputLevel.GS1_AI_JSON to aiJson,
            TdtOutputLevel.BARE_IDENTIFIER to bareId,
            TdtOutputLevel.HEX to hex,
            TdtOutputLevel.BINARY to binary
        )

        return Result.success(
            TdtDecodeResult(
                scheme = "GIAI-96",
                inputLevel = "HEX",
                detectedGcpLength = rule.companyDigits,
                outputs = outputs,
                ais = listOf(TdtAi("8004", "GIAI", giaiFull)),
                binary = binary,
                hex = hex,
                sgtinDetails = null,
                bitSegments = null
            )
        )
    }

    private fun decodeGid96Binary(binary: String, hex: String): Result<TdtDecodeResult> {
        val gm = BigInteger(binary.substring(8, 36), 2).toString()
        val oc = BigInteger(binary.substring(36, 60), 2).toString()
        val sn = BigInteger(binary.substring(60, 96), 2).toString()

        val pureUri = "urn:epc:id:gid:$gm.$oc.$sn"
        val tagUri = "urn:epc:tag:gid-96:$gm.$oc.$sn"
        val bareId = "generalmanager=$gm;objectclass=$oc;serial=$sn"

        val outputs = mapOf(
            TdtOutputLevel.PURE_IDENTITY to pureUri,
            TdtOutputLevel.TAG_ENCODING to tagUri,
            TdtOutputLevel.BARE_IDENTIFIER to bareId,
            TdtOutputLevel.HEX to hex,
            TdtOutputLevel.BINARY to binary
        )

        return Result.success(
            TdtDecodeResult(
                scheme = "GID-96",
                inputLevel = "HEX",
                detectedGcpLength = null,
                outputs = outputs,
                ais = emptyList(),
                binary = binary,
                hex = hex,
                sgtinDetails = null,
                bitSegments = null
            )
        )
    }

    private fun decodeUsdod96Binary(binary: String, hex: String): Result<TdtDecodeResult> {
        val filter = binary.substring(8, 12).toInt(2)
        // 48 bits CAGE / DoDAAC (6 chars, 8 bits or 6 bits)
        val cageRaw = binary.substring(12, 60)
        val cageSb = StringBuilder(6)
        for (i in 0 until 48 step 8) {
            val byteVal = cageRaw.substring(i, i + 8).toInt(2)
            if (byteVal in 32..126) cageSb.append(byteVal.toChar())
        }
        val cage = cageSb.toString().trim()
        val serial = BigInteger(binary.substring(60, 96), 2).toString()

        val pureUri = "urn:epc:id:usdod:$cage.$serial"
        val tagUri = "urn:epc:tag:usdod-96:$filter.$cage.$serial"
        val bareId = "cageordodaac=$cage;serial=$serial"

        val outputs = mapOf(
            TdtOutputLevel.PURE_IDENTITY to pureUri,
            TdtOutputLevel.TAG_ENCODING to tagUri,
            TdtOutputLevel.BARE_IDENTIFIER to bareId,
            TdtOutputLevel.HEX to hex,
            TdtOutputLevel.BINARY to binary
        )

        return Result.success(
            TdtDecodeResult(
                scheme = "USDOD-96",
                inputLevel = "HEX",
                detectedGcpLength = null,
                outputs = outputs,
                ais = emptyList(),
                binary = binary,
                hex = hex,
                sgtinDetails = null,
                bitSegments = null
            )
        )
    }

    private fun decodeUrn(urn: String, preferredScheme: String): Result<TdtDecodeResult> {
        // e.g. urn:epc:tag:sgtin-96:0.9521234.012345.32a/b
        // or urn:epc:id:sgtin:9521234.012345.32a/b
        val clean = urn.trim()
        if (clean.contains("sgtin")) {
            val parts = clean.split(":")
            val lastPart = parts.last()
            val tokens = lastPart.split(".")
            val filter = if (clean.contains(":tag:")) tokens.getOrNull(0)?.toIntOrNull() ?: 0 else 0
            val company = if (clean.contains(":tag:")) tokens.getOrNull(1).orEmpty() else tokens.getOrNull(0).orEmpty()
            val item = if (clean.contains(":tag:")) tokens.getOrNull(2).orEmpty() else tokens.getOrNull(1).orEmpty()
            val serial = if (clean.contains(":tag:")) tokens.drop(3).joinToString(".") else tokens.drop(2).joinToString(".")

            val indicator = item.take(1)
            val rawGtin = indicator + company + item.drop(1)
            val checkDigit = calculateCheckDigit(rawGtin)
            val gtin14 = rawGtin + checkDigit

            val enc = encodeSgtin96(gtin14, serial, company.length, filter)
            if (enc.isSuccess) {
                return decodeHex96(enc.getOrThrow().hex, "SGTIN-96")
            }
        } else if (clean.contains("sscc")) {
            val tokens = clean.split(":").last().split(".")
            val filter = if (clean.contains(":tag:")) tokens.getOrNull(0)?.toIntOrNull() ?: 0 else 0
            val company = if (clean.contains(":tag:")) tokens.getOrNull(1).orEmpty() else tokens.getOrNull(0).orEmpty()
            val serialRef = if (clean.contains(":tag:")) tokens.getOrNull(2).orEmpty() else tokens.getOrNull(1).orEmpty()

            val rawSscc = serialRef.take(1) + company + serialRef.drop(1)
            val checkDigit = calculateCheckDigit(rawSscc)
            val sscc18 = rawSscc + checkDigit

            val enc = encodeSscc96(sscc18, company.length, filter)
            if (enc.isSuccess) {
                return decodeHex96(enc.getOrThrow().hex, "SSCC-96")
            }
        }

        return Result.failure(IllegalArgumentException("Could not fully parse URN: $urn"))
    }

    private fun decodeDigitalLink(url: String, preferredScheme: String): Result<TdtDecodeResult> {
        try {
            val decoded = URLDecoder.decode(url, StandardCharsets.UTF_8.name())
            val uri = URI(decoded)
            val path = uri.path.orEmpty()

            if (path.contains("/01/")) {
                val match = Regex("/01/(\\d{13,14})(?:/21/([^/]+))?").find(path)
                if (match != null) {
                    val gtin = match.groupValues[1]
                    val serial = match.groupValues.getOrNull(2).orEmpty().ifEmpty { "1" }
                    val gcpLen = 7
                    val enc = encodeSgtin96(gtin, serial, gcpLen, 0)
                    if (enc.isSuccess) {
                        return decodeHex96(enc.getOrThrow().hex, "SGTIN-96")
                    }
                }
            } else if (path.contains("/00/")) {
                val match = Regex("/00/(\\d{17,18})").find(path)
                if (match != null) {
                    val sscc = match.groupValues[1]
                    val enc = encodeSscc96(sscc, 7, 0)
                    if (enc.isSuccess) {
                        return decodeHex96(enc.getOrThrow().hex, "SSCC-96")
                    }
                }
            }
        } catch (_: Exception) {}

        return Result.failure(IllegalArgumentException("Unable to decode Digital Link URI: $url"))
    }

    private fun decodeAiJson(json: String, preferredScheme: String): Result<TdtDecodeResult> {
        val gtinMatch = Regex("\"01\"\\s*:\\s*\"(\\d+)\"").find(json)
        val serialMatch = Regex("\"21\"\\s*:\\s*\"([^\"]+)\"").find(json)
        if (gtinMatch != null) {
            val gtin = gtinMatch.groupValues[1]
            val serial = serialMatch?.groupValues?.get(1) ?: "1"
            val enc = encodeSgtin96(gtin, serial, 7, 0)
            if (enc.isSuccess) {
                return decodeHex96(enc.getOrThrow().hex, "SGTIN-96")
            }
        }

        val ssccMatch = Regex("\"00\"\\s*:\\s*\"(\\d+)\"").find(json)
        if (ssccMatch != null) {
            val sscc = ssccMatch.groupValues[1]
            val enc = encodeSscc96(sscc, 7, 0)
            if (enc.isSuccess) {
                return decodeHex96(enc.getOrThrow().hex, "SSCC-96")
            }
        }

        return Result.failure(IllegalArgumentException("Unsupported AI JSON payload: $json"))
    }

    private fun decodeBareIdentifier(bare: String, preferredScheme: String): Result<TdtDecodeResult> {
        val pairs = bare.split(";").mapNotNull {
            val kv = it.split("=")
            if (kv.size == 2) kv[0].trim() to kv[1].trim() else null
        }.toMap()

        if (pairs.containsKey("gtin")) {
            val gtin = pairs["gtin"] ?: ""
            val serial = pairs["serial"] ?: "1"
            val enc = encodeSgtin96(gtin, serial, 7, 0)
            if (enc.isSuccess) {
                return decodeHex96(enc.getOrThrow().hex, "SGTIN-96")
            }
        }

        if (pairs.containsKey("sscc")) {
            val sscc = pairs["sscc"] ?: ""
            val enc = encodeSscc96(sscc, 7, 0)
            if (enc.isSuccess) {
                return decodeHex96(enc.getOrThrow().hex, "SSCC-96")
            }
        }

        return Result.failure(IllegalArgumentException("Unsupported bare identifier format: $bare"))
    }

    // -------------------------------------------------------------------------
    // ENCODING
    // -------------------------------------------------------------------------

    fun encodeSgtin96(
        gtinInput: String,
        serialInput: String,
        companyPrefixLength: Int = 6,
        filterValue: Int = 0
    ): Result<TdtEncodeResult> {
        var gtinDigits = gtinInput.replace(Regex("[^0-9]"), "")
        if (gtinDigits.isEmpty()) return Result.failure(IllegalArgumentException("Missing GTIN / UPC"))

        if (gtinDigits.length == 12 || gtinDigits.length == 13) {
            gtinDigits += calculateCheckDigit(gtinDigits)
        }
        if (gtinDigits.length < 14) gtinDigits = gtinDigits.padStart(14, '0')
        if (gtinDigits.length > 14) gtinDigits = gtinDigits.takeLast(14)

        val serial = serialInput.trim().ifEmpty { "1" }
        val serialVal = try {
            BigInteger(serial)
        } catch (_: Exception) {
            return Result.failure(IllegalArgumentException("Serial must be numeric for SGTIN-96"))
        }

        if (serialVal >= BigInteger.ONE.shiftLeft(38)) {
            return Result.failure(IllegalArgumentException("Serial number exceeds 38 bits maximum (274,877,906,943)"))
        }

        val cpl = companyPrefixLength.coerceIn(6, 12)
        val partition = getPartitionFromGcpLength(cpl)
        val rule = SGTIN_PARTITIONS[partition]

        val indicator = gtinDigits[0]
        val companyPrefixStr = gtinDigits.substring(1, 1 + cpl)
        val itemRefPart = gtinDigits.substring(1 + cpl, 13)
        val itemRefStr = "$indicator$itemRefPart"

        val companyPrefix = BigInteger(companyPrefixStr)
        val itemRef = BigInteger(itemRefStr)

        val header = 0x30
        val bits = StringBuilder(96)
        bits.append(header.toString(2).padStart(8, '0'))
        bits.append((filterValue and 7).toString(2).padStart(3, '0'))
        bits.append(partition.toString(2).padStart(3, '0'))
        bits.append(companyPrefix.toString(2).padStart(rule.companyBits, '0'))
        bits.append(itemRef.toString(2).padStart(rule.itemBits, '0'))
        bits.append(serialVal.toString(2).padStart(38, '0'))

        val hex = binaryToHex(bits.toString())
        val pureUri = "urn:epc:id:sgtin:$companyPrefixStr.$itemRefStr.$serial"
        val tagUri = "urn:epc:tag:sgtin-96:$filterValue.$companyPrefixStr.$itemRefStr.$serial"
        val digitalLink = "https://id.gs1.org/01/$gtinDigits/21/$serial"
        val aiJson = "{\"01\":\"$gtinDigits\",\"21\":\"$serial\"}"
        val bareId = "gtin=$gtinDigits;serial=$serial"

        return Result.success(
            TdtEncodeResult(
                hex = hex,
                scheme = "SGTIN-96",
                binary = bits.toString(),
                pureUri = pureUri,
                tagUri = tagUri,
                digitalLink = digitalLink,
                aiJson = aiJson,
                bareId = bareId
            )
        )
    }

    fun encodeSscc96(
        ssccInput: String,
        companyPrefixLength: Int = 6,
        filterValue: Int = 0
    ): Result<TdtEncodeResult> {
        var digits = ssccInput.replace(Regex("[^0-9]"), "")
        if (digits.length == 17) {
            digits += calculateCheckDigit(digits)
        }
        if (digits.length < 18) digits = digits.padStart(18, '0')
        if (digits.length > 18) digits = digits.takeLast(18)

        val cpl = companyPrefixLength.coerceIn(6, 12)
        val partition = getPartitionFromGcpLength(cpl)
        val rule = SSCC_PARTITIONS[partition]

        val extensionDigit = digits[0]
        val companyPrefixStr = digits.substring(1, 1 + cpl)
        val serialRefPart = digits.substring(1 + cpl, 17)
        val serialRefStr = "$extensionDigit$serialRefPart"

        val companyPrefix = BigInteger(companyPrefixStr)
        val serialRef = BigInteger(serialRefStr)

        val header = 0x31
        val bits = StringBuilder(96)
        bits.append(header.toString(2).padStart(8, '0'))
        bits.append((filterValue and 7).toString(2).padStart(3, '0'))
        bits.append(partition.toString(2).padStart(3, '0'))
        bits.append(companyPrefix.toString(2).padStart(rule.companyBits, '0'))
        bits.append(serialRef.toString(2).padStart(rule.itemBits, '0'))

        val hex = binaryToHex(bits.toString())
        val pureUri = "urn:epc:id:sscc:$companyPrefixStr.$serialRefStr"
        val tagUri = "urn:epc:tag:sscc-96:$filterValue.$companyPrefixStr.$serialRefStr"
        val digitalLink = "https://id.gs1.org/00/$digits"

        return Result.success(
            TdtEncodeResult(
                hex = hex,
                scheme = "SSCC-96",
                binary = bits.toString(),
                pureUri = pureUri,
                tagUri = tagUri,
                digitalLink = digitalLink,
                aiJson = "{\"00\":\"$digits\"}",
                bareId = "sscc=$digits"
            )
        )
    }

    fun encodeSgln96(
        glnInput: String,
        serialInput: String,
        companyPrefixLength: Int = 6,
        filterValue: Int = 0
    ): Result<TdtEncodeResult> {
        var digits = glnInput.replace(Regex("[^0-9]"), "")
        if (digits.length == 12) {
            digits += calculateCheckDigit(digits)
        }
        if (digits.length < 13) digits = digits.padStart(13, '0')
        if (digits.length > 13) digits = digits.takeLast(13)

        val ext = serialInput.trim().ifEmpty { "0" }
        val extVal = BigInteger(ext)

        val cpl = companyPrefixLength.coerceIn(6, 12)
        val partition = getPartitionFromGcpLength(cpl)
        val rule = SGLN_PARTITIONS[partition]

        val companyPrefixStr = digits.substring(0, cpl)
        val locRefStr = digits.substring(cpl, 12)

        val companyPrefix = BigInteger(companyPrefixStr)
        val locRef = BigInteger(locRefStr.ifEmpty { "0" })

        val header = 0x32
        val bits = StringBuilder(96)
        bits.append(header.toString(2).padStart(8, '0'))
        bits.append((filterValue and 7).toString(2).padStart(3, '0'))
        bits.append(partition.toString(2).padStart(3, '0'))
        bits.append(companyPrefix.toString(2).padStart(rule.companyBits, '0'))
        bits.append(locRef.toString(2).padStart(rule.itemBits, '0'))
        bits.append(extVal.toString(2).padStart(41, '0'))

        val hex = binaryToHex(bits.toString())
        val pureUri = "urn:epc:id:sgln:$companyPrefixStr.$locRefStr.$ext"
        val tagUri = "urn:epc:tag:sgln-96:$filterValue.$companyPrefixStr.$locRefStr.$ext"
        val digitalLink = "https://id.gs1.org/414/$digits/254/$ext"

        return Result.success(
            TdtEncodeResult(
                hex = hex,
                scheme = "SGLN-96",
                binary = bits.toString(),
                pureUri = pureUri,
                tagUri = tagUri,
                digitalLink = digitalLink,
                aiJson = "{\"414\":\"$digits\",\"254\":\"$ext\"}",
                bareId = "gln=$digits;serial=$ext"
            )
        )
    }

    fun encodeGid96(
        generalManager: String,
        objectClass: String,
        serial: String
    ): Result<TdtEncodeResult> {
        val gm = BigInteger(generalManager.replace(Regex("[^0-9]"), "").ifEmpty { "0" })
        val oc = BigInteger(objectClass.replace(Regex("[^0-9]"), "").ifEmpty { "0" })
        val sn = BigInteger(serial.replace(Regex("[^0-9]"), "").ifEmpty { "0" })

        val header = 0x35
        val bits = StringBuilder(96)
        bits.append(header.toString(2).padStart(8, '0'))
        bits.append(gm.toString(2).padStart(28, '0'))
        bits.append(oc.toString(2).padStart(24, '0'))
        bits.append(sn.toString(2).padStart(36, '0'))

        val hex = binaryToHex(bits.toString())
        val pureUri = "urn:epc:id:gid:$gm.$oc.$sn"
        val tagUri = "urn:epc:tag:gid-96:$gm.$oc.$sn"

        return Result.success(
            TdtEncodeResult(
                hex = hex,
                scheme = "GID-96",
                binary = bits.toString(),
                pureUri = pureUri,
                tagUri = tagUri,
                digitalLink = null,
                aiJson = null,
                bareId = "generalmanager=$gm;objectclass=$oc;serial=$sn"
            )
        )
    }

    fun encodeUsdod96(
        cageOrDodaac: String,
        serial: String,
        filterValue: Int = 0
    ): Result<TdtEncodeResult> {
        val cleanCage = cageOrDodaac.trim().uppercase().take(6).padEnd(6, ' ')
        val sn = BigInteger(serial.replace(Regex("[^0-9]"), "").ifEmpty { "0" })

        val header = 0x2F
        val bits = StringBuilder(96)
        bits.append(header.toString(2).padStart(8, '0'))
        bits.append((filterValue and 15).toString(2).padStart(4, '0'))

        for (c in cleanCage) {
            val ascii = c.code and 0xFF
            bits.append(ascii.toString(2).padStart(8, '0'))
        }
        bits.append(sn.toString(2).padStart(36, '0'))

        val hex = binaryToHex(bits.toString())
        val pureUri = "urn:epc:id:usdod:$cleanCage.$sn"
        val tagUri = "urn:epc:tag:usdod-96:$filterValue.$cleanCage.$sn"

        return Result.success(
            TdtEncodeResult(
                hex = hex,
                scheme = "USDOD-96",
                binary = bits.toString(),
                pureUri = pureUri,
                tagUri = tagUri,
                digitalLink = null,
                aiJson = null,
                bareId = "cageordodaac=$cleanCage;serial=$sn"
            )
        )
    }
}
