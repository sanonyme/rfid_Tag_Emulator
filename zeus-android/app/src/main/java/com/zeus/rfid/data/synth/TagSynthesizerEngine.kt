package com.zeus.rfid.data.synth

import android.graphics.Bitmap
import android.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.MultiFormatWriter
import com.google.zxing.common.BitMatrix
import java.math.BigInteger
import java.util.EnumMap

enum class EpcSchemeType(val displayName: String, val description: String) {
    SGTIN_96("SGTIN-96", "Serialized GTIN (96-bit Retail standard)"),
    SGTIN_198("SGTIN-198", "SGTIN with Alphanumeric ASCII Serial (198-bit)"),
    SSCC_96("SSCC-96", "Serial Shipping Container Code (Logistics & Cartons)"),
    SGLN_96("SGLN-96", "Serialized Global Location Number (Locations & Docks)"),
    GRAI_96("GRAI-96", "Global Returnable Asset Identifier (Totes, Bins, Trays)"),
    GIAI_96("GIAI-96", "Global Individual Asset Identifier (Fixed Assets & Equipment)"),
    INDITEX_TEMPE("Inditex / Tempe", "128-bit Footwear & Apparel (Zara, Tempe, Bershka)"),
    CUSTOM_PATTERN("Custom Sequence", "User Prefix + Sequential / Random Hex Pattern")
}

enum class BarcodeFormatType(val label: String, val zxingFormat: BarcodeFormat) {
    QR_CODE("QR Code (2D)", BarcodeFormat.QR_CODE),
    GS1_DIGITAL_LINK("GS1 Digital Link (QR)", BarcodeFormat.QR_CODE),
    CODE_128("Code 128 (1D)", BarcodeFormat.CODE_128),
    EAN_13("EAN-13 (1D)", BarcodeFormat.EAN_13),
    UPC_A("UPC-A (1D)", BarcodeFormat.UPC_A),
    EAN_8("EAN-8 (1D)", BarcodeFormat.EAN_8),
    CODE_39("Code 39 (1D)", BarcodeFormat.CODE_39),
    ITF_14("ITF-14 (1D)", BarcodeFormat.ITF)
}

data class SynthesizedTag(
    val index: Int,
    val epc: String,
    val scheme: EpcSchemeType,
    val details: String,
    val rawValue: String? = null,
    val pureUri: String? = null
)

data class InditexFields(
    val version: Int = 2,
    val brandId: Int = 2, // 1: Inditex, 2: Tempe
    val productType: Int = 1,
    val model: Int = 1253,
    val quality: Int = 640,
    val color: Int = 100,
    val size: Int = 38,
    val inventoryTag: Int = 1,
    val tagSupplierId: Int = 4,
    val tagType: Int = 4,
    val startSerial: Long = 141802403393L
)

object TagSynthesizerEngine {

    private data class PartitionRule(
        val prefixDigits: Int,
        val partition: Int,
        val prefixBits: Int,
        val otherBits: Int,
        val otherDigits: Int
    )

    private val SGTIN_PARTITIONS = listOf(
        PartitionRule(12, 0, 40, 4, 1),
        PartitionRule(11, 1, 37, 7, 2),
        PartitionRule(10, 2, 34, 10, 3),
        PartitionRule(9, 3, 30, 14, 4),
        PartitionRule(8, 4, 27, 17, 5),
        PartitionRule(7, 5, 24, 20, 6),
        PartitionRule(6, 6, 20, 24, 7)
    )

    private val SSCC_PARTITIONS = listOf(
        PartitionRule(12, 0, 40, 18, 5),
        PartitionRule(11, 1, 37, 21, 6),
        PartitionRule(10, 2, 34, 24, 7),
        PartitionRule(9, 3, 30, 28, 8),
        PartitionRule(8, 4, 27, 31, 9),
        PartitionRule(7, 5, 24, 34, 10),
        PartitionRule(6, 6, 20, 38, 11)
    )

    private val SGLN_PARTITIONS = listOf(
        PartitionRule(12, 0, 40, 1, 0),
        PartitionRule(11, 1, 37, 4, 1),
        PartitionRule(10, 2, 34, 7, 2),
        PartitionRule(9, 3, 30, 11, 3),
        PartitionRule(8, 4, 27, 14, 4),
        PartitionRule(7, 5, 24, 17, 5),
        PartitionRule(6, 6, 20, 21, 6)
    )

    private val GRAI_PARTITIONS = listOf(
        PartitionRule(12, 0, 40, 4, 0),
        PartitionRule(11, 1, 37, 7, 1),
        PartitionRule(10, 2, 34, 10, 2),
        PartitionRule(9, 3, 30, 14, 3),
        PartitionRule(8, 4, 27, 17, 4),
        PartitionRule(7, 5, 24, 20, 5),
        PartitionRule(6, 6, 20, 24, 6)
    )

    fun calculateGtinCheckDigit(body: String): String {
        val digits = body.filter { it.isDigit() }
        if (digits.isEmpty()) return "0"
        var sum = 0
        val len = digits.length
        for (i in 0 until len) {
            val d = digits[len - 1 - i].digitToInt()
            sum += if (i % 2 == 0) d * 3 else d
        }
        val nextTen = ((sum + 9) / 10) * 10
        val check = nextTen - sum
        return if (check == 10) "0" else check.toString()
    }

    fun validateGtinCheckDigit(fullNumber: String): Boolean {
        val digits = fullNumber.filter { it.isDigit() }
        if (digits.length < 2) return false
        val expected = calculateGtinCheckDigit(digits.dropLast(1))
        return digits.takeLast(1) == expected
    }

    private fun toBits(value: BigInteger, width: Int): String {
        val raw = value.toString(2)
        return if (raw.length >= width) {
            raw.takeLast(width)
        } else {
            raw.padStart(width, '0')
        }
    }

    private fun toBits(value: Long, width: Int): String = toBits(BigInteger.valueOf(value), width)
    private fun toBits(value: Int, width: Int): String = toBits(BigInteger.valueOf(value.toLong()), width)

    private fun bitsToHex(bits: String): String {
        val padded = if (bits.length % 4 != 0) {
            bits.padEnd(bits.length + (4 - bits.length % 4), '0')
        } else bits
        val sb = StringBuilder(padded.length / 4)
        for (i in padded.indices step 4) {
            val nibble = padded.substring(i, i + 4).toInt(2)
            sb.append(nibble.toString(16).uppercase())
        }
        return sb.toString()
    }

    /**
     * Synthesize SGTIN-96 EPCs
     */
    fun synthesizeSgtin96(
        gtinInput: String,
        companyPrefixLength: Int,
        filter: Int,
        quantity: Int,
        startSerial: Long
    ): List<SynthesizedTag> {
        val digits = gtinInput.filter { it.isDigit() }
        if (digits.isEmpty()) return emptyList()

        val gtin14 = digits.padStart(14, '0').takeLast(14)
        val cpl = companyPrefixLength.coerceIn(6, 12)
        val partition = SGTIN_PARTITIONS.find { it.prefixDigits == cpl } ?: SGTIN_PARTITIONS.last()

        val indicator = gtin14[0]
        val companyPrefixStr = gtin14.substring(1, 1 + cpl)
        val itemRefStr = "$indicator${gtin14.substring(1 + cpl, 13)}"

        val cpVal = BigInteger(companyPrefixStr)
        val itemVal = BigInteger(itemRefStr)

        val headerBits = toBits(0x30, 8)
        val filterBits = toBits(filter.coerceIn(0, 7), 3)
        val partitionBits = toBits(partition.partition, 3)
        val cpBits = toBits(cpVal, partition.prefixBits)
        val itemBits = toBits(itemVal, partition.otherBits)

        val prefixSection = headerBits + filterBits + partitionBits + cpBits + itemBits

        val list = ArrayList<SynthesizedTag>(quantity)
        for (i in 0 until quantity.coerceAtLeast(1)) {
            val serial = startSerial + i
            val serialBits = toBits(serial, 38)
            val fullBits = prefixSection + serialBits
            val hex = bitsToHex(fullBits)
            val pureUri = "urn:epc:id:sgtin:$companyPrefixStr.${itemRefStr.drop(1)}.$serial"
            list.add(
                SynthesizedTag(
                    index = i + 1,
                    epc = hex,
                    scheme = EpcSchemeType.SGTIN_96,
                    details = "GTIN: $gtin14 | CPL: $cpl | Serial: $serial",
                    rawValue = gtin14,
                    pureUri = pureUri
                )
            )
        }
        return list
    }

    /**
     * Synthesize SGTIN-198 EPCs with ASCII Alphanumeric Serial
     */
    fun synthesizeSgtin198(
        gtinInput: String,
        companyPrefixLength: Int,
        serialPrefix: String,
        filter: Int,
        quantity: Int,
        startSerial: Long
    ): List<SynthesizedTag> {
        val digits = gtinInput.filter { it.isDigit() }
        if (digits.isEmpty()) return emptyList()

        val gtin14 = digits.padStart(14, '0').takeLast(14)
        val cpl = companyPrefixLength.coerceIn(6, 12)
        val partition = SGTIN_PARTITIONS.find { it.prefixDigits == cpl } ?: SGTIN_PARTITIONS.last()

        val indicator = gtin14[0]
        val companyPrefixStr = gtin14.substring(1, 1 + cpl)
        val itemRefStr = "$indicator${gtin14.substring(1 + cpl, 13)}"

        val cpVal = BigInteger(companyPrefixStr)
        val itemVal = BigInteger(itemRefStr)

        val headerBits = toBits(0x36, 8) // SGTIN-198 header 0x36
        val filterBits = toBits(filter.coerceIn(0, 7), 3)
        val partitionBits = toBits(partition.partition, 3)
        val cpBits = toBits(cpVal, partition.prefixBits)
        val itemBits = toBits(itemVal, partition.otherBits)

        val prefixSection = headerBits + filterBits + partitionBits + cpBits + itemBits

        val list = ArrayList<SynthesizedTag>(quantity)
        for (i in 0 until quantity.coerceAtLeast(1)) {
            val serialText = "$serialPrefix${startSerial + i}".take(20)
            val serialBitsSb = StringBuilder()
            for (ch in serialText) {
                val code = ch.code
                serialBitsSb.append(toBits(code, 7))
            }
            if (serialText.length < 20) {
                serialBitsSb.append("0000000") // null terminator
            }
            // 140 bits payload + 2 trailing pad bits for 200 bits total
            val paddedSerial = serialBitsSb.toString().padEnd(142, '0').take(142)
            val fullBits = prefixSection + paddedSerial
            val hex = bitsToHex(fullBits)
            val pureUri = "urn:epc:id:sgtin:$companyPrefixStr.${itemRefStr.drop(1)}.$serialText"
            list.add(
                SynthesizedTag(
                    index = i + 1,
                    epc = hex,
                    scheme = EpcSchemeType.SGTIN_198,
                    details = "GTIN: $gtin14 | Serial: $serialText (198-bit)",
                    rawValue = gtin14,
                    pureUri = pureUri
                )
            )
        }
        return list
    }

    /**
     * Synthesize SSCC-96 (Serial Shipping Container Code)
     */
    fun synthesizeSscc96(
        companyPrefix: String,
        serialRefBase: String,
        filter: Int,
        quantity: Int,
        startSerial: Long
    ): List<SynthesizedTag> {
        val cpDigits = companyPrefix.filter { it.isDigit() }
        if (cpDigits.isEmpty()) return emptyList()

        val cpl = cpDigits.length.coerceIn(6, 12)
        val partition = SSCC_PARTITIONS.find { it.prefixDigits == cpl } ?: SSCC_PARTITIONS.last()

        val baseNum = BigInteger(serialRefBase.filter { it.isDigit() }.ifEmpty { "0" })
        val refDigits = partition.otherDigits + 1

        val headerBits = toBits(0x31, 8)
        val filterBits = toBits(filter.coerceIn(0, 7), 3)
        val partitionBits = toBits(partition.partition, 3)
        val cpBits = toBits(BigInteger(cpDigits), partition.prefixBits)

        val list = ArrayList<SynthesizedTag>(quantity)
        for (i in 0 until quantity.coerceAtLeast(1)) {
            val serial = baseNum + BigInteger.valueOf(startSerial + i)
            val paddedSerial = serial.toString().padStart(refDigits, '0').takeLast(refDigits)
            val refBits = toBits(BigInteger(paddedSerial), partition.otherBits)
            val reservedBits = "0".repeat(24)

            val fullBits = headerBits + filterBits + partitionBits + cpBits + refBits + reservedBits
            val hex = bitsToHex(fullBits)
            val pureUri = "urn:epc:id:sscc:$cpDigits.$paddedSerial"

            list.add(
                SynthesizedTag(
                    index = i + 1,
                    epc = hex,
                    scheme = EpcSchemeType.SSCC_96,
                    details = "SSCC: $cpDigits-$paddedSerial | Filter: $filter",
                    rawValue = "$cpDigits$paddedSerial",
                    pureUri = pureUri
                )
            )
        }
        return list
    }

    /**
     * Synthesize SGLN-96 (Serialized Global Location Number)
     */
    fun synthesizeSgln96(
        companyPrefix: String,
        locationRef: String,
        filter: Int,
        quantity: Int,
        startExtension: Long
    ): List<SynthesizedTag> {
        val cpDigits = companyPrefix.filter { it.isDigit() }
        if (cpDigits.isEmpty()) return emptyList()

        val cpl = cpDigits.length.coerceIn(6, 12)
        val partition = SGLN_PARTITIONS.find { it.prefixDigits == cpl } ?: SGLN_PARTITIONS.last()

        val locDigits = locationRef.filter { it.isDigit() }.padStart(partition.otherDigits, '0').takeLast(partition.otherDigits)
        val locVal = if (partition.otherDigits == 0 || locDigits.isEmpty()) BigInteger.ZERO else BigInteger(locDigits)

        val headerBits = toBits(0x32, 8)
        val filterBits = toBits(filter.coerceIn(0, 7), 3)
        val partitionBits = toBits(partition.partition, 3)
        val cpBits = toBits(BigInteger(cpDigits), partition.prefixBits)
        val locBits = toBits(locVal, partition.otherBits)

        val prefixSection = headerBits + filterBits + partitionBits + cpBits + locBits

        val list = ArrayList<SynthesizedTag>(quantity)
        for (i in 0 until quantity.coerceAtLeast(1)) {
            val ext = startExtension + i
            val extBits = toBits(ext, 41)
            val fullBits = prefixSection + extBits
            val hex = bitsToHex(fullBits)
            val pureUri = "urn:epc:id:sgln:$cpDigits.$locDigits.$ext"

            list.add(
                SynthesizedTag(
                    index = i + 1,
                    epc = hex,
                    scheme = EpcSchemeType.SGLN_96,
                    details = "GLN: $cpDigits$locDigits | Ext: $ext",
                    rawValue = "$cpDigits$locDigits",
                    pureUri = pureUri
                )
            )
        }
        return list
    }

    /**
     * Synthesize GRAI-96 (Global Returnable Asset Identifier)
     */
    fun synthesizeGrai96(
        companyPrefix: String,
        assetType: String,
        filter: Int,
        quantity: Int,
        startSerial: Long
    ): List<SynthesizedTag> {
        val cpDigits = companyPrefix.filter { it.isDigit() }
        if (cpDigits.isEmpty()) return emptyList()

        val cpl = cpDigits.length.coerceIn(6, 12)
        val partition = GRAI_PARTITIONS.find { it.prefixDigits == cpl } ?: GRAI_PARTITIONS.last()

        val assetDigits = assetType.filter { it.isDigit() }.padStart(partition.otherDigits, '0').takeLast(partition.otherDigits)
        val assetVal = if (partition.otherDigits == 0 || assetDigits.isEmpty()) BigInteger.ZERO else BigInteger(assetDigits)

        val headerBits = toBits(0x33, 8)
        val filterBits = toBits(filter.coerceIn(0, 7), 3)
        val partitionBits = toBits(partition.partition, 3)
        val cpBits = toBits(BigInteger(cpDigits), partition.prefixBits)
        val assetBits = toBits(assetVal, partition.otherBits)

        val prefixSection = headerBits + filterBits + partitionBits + cpBits + assetBits

        val list = ArrayList<SynthesizedTag>(quantity)
        for (i in 0 until quantity.coerceAtLeast(1)) {
            val serial = startSerial + i
            val serialBits = toBits(serial, 38)
            val fullBits = prefixSection + serialBits
            val hex = bitsToHex(fullBits)
            val pureUri = "urn:epc:id:grai:$cpDigits.$assetDigits.$serial"

            list.add(
                SynthesizedTag(
                    index = i + 1,
                    epc = hex,
                    scheme = EpcSchemeType.GRAI_96,
                    details = "GRAI Asset Type: $assetDigits | Serial: $serial",
                    rawValue = "$cpDigits$assetDigits",
                    pureUri = pureUri
                )
            )
        }
        return list
    }

    /**
     * Synthesize GIAI-96 (Global Individual Asset Identifier)
     */
    fun synthesizeGiai96(
        companyPrefix: String,
        assetRefBase: String,
        filter: Int,
        quantity: Int,
        startSerial: Long
    ): List<SynthesizedTag> {
        val cpDigits = companyPrefix.filter { it.isDigit() }
        if (cpDigits.isEmpty()) return emptyList()

        val cpl = cpDigits.length.coerceIn(6, 12)
        val partition = SGTIN_PARTITIONS.find { it.prefixDigits == cpl } ?: SGTIN_PARTITIONS.last()
        val refBitsCount = 82 - partition.prefixBits

        val headerBits = toBits(0x34, 8)
        val filterBits = toBits(filter.coerceIn(0, 7), 3)
        val partitionBits = toBits(partition.partition, 3)
        val cpBits = toBits(BigInteger(cpDigits), partition.prefixBits)

        val baseNum = BigInteger(assetRefBase.filter { it.isDigit() }.ifEmpty { "0" })

        val list = ArrayList<SynthesizedTag>(quantity)
        for (i in 0 until quantity.coerceAtLeast(1)) {
            val refVal = baseNum + BigInteger.valueOf(startSerial + i)
            val refBits = toBits(refVal, refBitsCount)
            val fullBits = headerBits + filterBits + partitionBits + cpBits + refBits
            val hex = bitsToHex(fullBits)
            val pureUri = "urn:epc:id:giai:$cpDigits.$refVal"

            list.add(
                SynthesizedTag(
                    index = i + 1,
                    epc = hex,
                    scheme = EpcSchemeType.GIAI_96,
                    details = "GIAI Prefix: $cpDigits | Ref: $refVal",
                    rawValue = "$cpDigits$refVal",
                    pureUri = pureUri
                )
            )
        }
        return list
    }

    /**
     * Synthesize Inditex / Tempe 128-bit EPCs (V1 or V2)
     */
    fun synthesizeInditex(
        fields: InditexFields,
        quantity: Int
    ): List<SynthesizedTag> {
        val list = ArrayList<SynthesizedTag>(quantity)

        val brand = fields.brandId
        val productType = fields.productType
        val model = fields.model
        val quality = fields.quality
        val color = fields.color
        val size = fields.size
        val inventory = fields.inventoryTag
        val supplier = fields.tagSupplierId
        val tagType = fields.tagType

        val upcBody = "$productType" +
                String.format("%04d", model) +
                String.format("%03d", quality) +
                String.format("%03d", color) +
                String.format("%02d", size)
        val checkDigit = calculateGtinCheckDigit(upcBody)
        val fullUpc = "$upcBody$checkDigit"

        for (i in 0 until quantity.coerceAtLeast(1)) {
            val serial = fields.startSerial + i
            val bits = if (fields.version == 1) {
                val mqcStr = String.format("%04d%03d%03d%02d", model, quality, color, size)
                val mqcVal = BigInteger(mqcStr)
                toBits(1, 5) +
                        toBits(brand, 6) +
                        toBits(1, 2) + // bits11to13
                        toBits(productType, 4) +
                        toBits(mqcVal, 40) +
                        toBits(0x401ee2, 23) + // bits57to80
                        toBits(serial, 16) +
                        toBits(0x264801, 22) + // bits96to118
                        toBits(supplier, 5) +
                        toBits(1, 4) + // bits123to127
                        toBits(tagType, 1)
            } else {
                toBits(2, 5) +
                        toBits(brand, 6) +
                        toBits(1, 2) + // bits11to13
                        toBits(productType, 4) +
                        toBits(64, 7) + // bits17to24
                        toBits(inventory, 1) +
                        toBits(supplier, 6) +
                        toBits(0, 9) + // bits31to40
                        toBits(size, 7) +
                        toBits(color, 10) +
                        toBits(quality, 10) +
                        toBits(model, 14) +
                        toBits(0, 3) + // bits81to84
                        toBits(tagType, 5) +
                        toBits(serial, 39)
            }

            val hex = bitsToHex(bits)
            val brandName = if (brand == 1) "Inditex" else "Tempe"
            list.add(
                SynthesizedTag(
                    index = i + 1,
                    epc = hex,
                    scheme = EpcSchemeType.INDITEX_TEMPE,
                    details = "$brandName V${fields.version} | Mod:$model Col:$color Sz:$size | Serial:$serial",
                    rawValue = fullUpc,
                    pureUri = "urn:epc:id:inditex:$brandName.$fullUpc.$serial"
                )
            )
        }
        return list
    }

    /**
     * Synthesize Custom Sequential / Random Hex Pattern (e.g. E28011303000... or 3000...)
     */
    fun synthesizeCustomPattern(
        hexPrefix: String,
        targetLength: Int = 24,
        startSerial: Long = 1L,
        isRandom: Boolean = false,
        quantity: Int = 10
    ): List<SynthesizedTag> {
        val cleanPrefix = hexPrefix.filter { it.isDigit() || (it in 'a'..'f') || (it in 'A'..'F') }.uppercase()
        val list = ArrayList<SynthesizedTag>(quantity)
        val len = targetLength.coerceIn(8, 64)

        for (i in 0 until quantity.coerceAtLeast(1)) {
            val hex = if (isRandom) {
                val randPartLength = (len - cleanPrefix.length).coerceAtLeast(0)
                val randBytes = ByteArray((randPartLength + 1) / 2)
                kotlin.random.Random.nextBytes(randBytes)
                val randHex = randBytes.joinToString("") { String.format("%02X", it) }.take(randPartLength)
                (cleanPrefix + randHex).take(len).padEnd(len, '0')
            } else {
                val serial = startSerial + i
                val serialHex = java.lang.Long.toHexString(serial).uppercase()
                val padLength = (len - cleanPrefix.length).coerceAtLeast(0)
                val paddedSerial = serialHex.padStart(padLength, '0').takeLast(padLength)
                (cleanPrefix + paddedSerial).take(len)
            }

            list.add(
                SynthesizedTag(
                    index = i + 1,
                    epc = hex,
                    scheme = EpcSchemeType.CUSTOM_PATTERN,
                    details = "Custom ${len * 4}-bit Pattern | Serial: ${startSerial + i}",
                    rawValue = hex,
                    pureUri = "urn:epc:raw:$hex"
                )
            )
        }
        return list
    }

    /**
     * Generates a ZXing BitMatrix for barcode or QR code.
     */
    fun generateBitMatrix(
        content: String,
        format: BarcodeFormat,
        widthPx: Int = 600,
        heightPx: Int = 300
    ): Result<BitMatrix> {
        return try {
            val trimmed = content.trim()
            if (trimmed.isEmpty()) {
                return Result.failure(IllegalArgumentException("Content cannot be empty."))
            }

            val hints = EnumMap<EncodeHintType, Any>(EncodeHintType::class.java).apply {
                put(EncodeHintType.CHARACTER_SET, "UTF-8")
                put(EncodeHintType.MARGIN, if (format == BarcodeFormat.QR_CODE) 2 else 10)
            }

            val writer = MultiFormatWriter()
            val bitMatrix: BitMatrix = writer.encode(trimmed, format, widthPx, heightPx, hints)
            Result.success(bitMatrix)
        } catch (e: Throwable) {
            Result.failure(e)
        }
    }

    /**
     * Generates a high-quality monochrome Bitmap barcode or QR code using ZXing.
     */
    fun generateBarcodeBitmap(
        content: String,
        format: BarcodeFormat,
        widthPx: Int = 600,
        heightPx: Int = 300
    ): Result<Bitmap> {
        return try {
            val matrixResult = generateBitMatrix(content, format, widthPx, heightPx)
            if (matrixResult.isFailure) {
                return Result.failure(matrixResult.exceptionOrNull() ?: Exception("Failed to encode matrix"))
            }
            val bitMatrix = matrixResult.getOrThrow()

            val width = bitMatrix.width
            val height = bitMatrix.height
            val pixels = IntArray(width * height)

            for (y in 0 until height) {
                val offset = y * width
                for (x in 0 until width) {
                    pixels[offset + x] = if (bitMatrix.get(x, y)) Color.BLACK else Color.WHITE
                }
            }

            val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            bitmap.setPixels(pixels, 0, width, 0, 0, width, height)
            Result.success(bitmap)
        } catch (e: Throwable) {
            Result.failure(e)
        }
    }
}
