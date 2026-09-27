package com.zeus.rfid.data.emulator

import java.math.BigInteger

data class ExpandedUpcTag(
    val epc: String,
    val customTid: String? = null,
    val userdata: String? = null
)

data class ParsedEpcTag(
    val epc: String,
    val tid: String? = null,
    val userdata: String? = null
)

object EpcGenerator {

    /**
     * Generate SGTIN-96 EPC hex strings from a UPC / GTIN-14, matching Zeus desktop implementation.
     * Table 14-2 SGTIN-96 partition table with CompanyPrefixLength = 6 digits, filter = 0, header = 0x30.
     */
    fun generateFromUpc(upc: String, quantity: Int, startSerial: Long = 1L): List<String> {
        val digits = upc.replace(Regex("[^0-9]"), "")
        if (digits.isEmpty()) return emptyList()

        // Pad to GTIN-14 (left pad with zeros, or take right-most 14)
        val gtin = when {
            digits.length < 14 -> "00000000000000".substring(digits.length) + digits
            digits.length > 14 -> digits.substring(digits.length - 14)
            else -> digits
        }

        val companyPrefixLengthDigits = 6
        val filter = 0
        val partition = 6 // for CPL=6

        val indicatorDigit = gtin[0]
        val companyPrefixDigits = gtin.substring(1, 1 + companyPrefixLengthDigits)
        val itemRefDigits = "$indicatorDigit${gtin.substring(1 + companyPrefixLengthDigits, 13)}"

        val companyPrefix = BigInteger(companyPrefixDigits).toLong()
        val itemRef = BigInteger(itemRefDigits).toLong()

        val companyPrefixBits = 20
        val itemRefBits = 24
        val header = 0x30

        val results = ArrayList<String>()
        val qty = quantity.coerceAtLeast(0)
        val firstSerial = startSerial.coerceAtLeast(1L)

        for (i in 0 until qty) {
            val serialValue = firstSerial + i

            val bits = StringBuilder(96)
            bits.append(leftPad(Integer.toBinaryString(header), 8))
            bits.append(leftPad(Integer.toBinaryString(filter), 3))
            bits.append(leftPad(Integer.toBinaryString(partition), 3))
            bits.append(leftPad(java.lang.Long.toBinaryString(companyPrefix), companyPrefixBits))
            bits.append(leftPad(java.lang.Long.toBinaryString(itemRef), itemRefBits))
            bits.append(leftPad(java.lang.Long.toBinaryString(serialValue), 38))

            val bi = BigInteger(bits.toString(), 2)
            var hex = bi.toString(16).uppercase()
            if (hex.length < 24) {
                hex = String.format("%024X", bi)
            }
            results.add(hex)
        }
        return results
    }

    private fun leftPad(s: String, width: Int): String {
        if (s.length >= width) return s
        val sb = StringBuilder(width)
        for (i in s.length until width) sb.append('0')
        sb.append(s)
        return sb.toString()
    }

    /**
     * Expands multi-line UPC text (`UPC,Count,TID[,userdata]`) into individual tags.
     */
    fun expandUpcList(
        upcList: String,
        startSerial: Long,
        continuesAcrossLines: Boolean
    ): List<ExpandedUpcTag> {
        val trimmed = upcList.trim()
        if (trimmed.isEmpty()) return emptyList()

        var currentSerial = startSerial.coerceAtLeast(1L)
        val out = ArrayList<ExpandedUpcTag>()

        for (line in trimmed.lines()) {
            val trimmedLine = line.trim()
            if (trimmedLine.isEmpty()) continue

            val parts = trimmedLine.split(',')
            val upc = parts.getOrNull(0)?.trim().orEmpty()
            val countStr = parts.getOrNull(1)?.trim().orEmpty()
            val count = countStr.toIntOrNull() ?: 0
            val customTid = parts.getOrNull(2)?.trim()?.takeIf { it.isNotEmpty() }
            val userdata = parts.getOrNull(3)?.trim()?.takeIf { it.isNotEmpty() }

            if (count <= 0 || upc.isEmpty()) continue

            val lineStartSerial = if (continuesAcrossLines) currentSerial else startSerial
            val epcs = generateFromUpc(upc, count, lineStartSerial)

            for (epc in epcs) {
                out.add(
                    ExpandedUpcTag(
                        epc = epc,
                        customTid = customTid,
                        userdata = userdata
                    )
                )
            }

            if (continuesAcrossLines) {
                currentSerial += count
            }
        }

        return out
    }

    /**
     * Parses direct EPC lines (`EPC[,TID[,userdata]]`).
     */
    fun parseEpcList(epcList: String): List<ParsedEpcTag> {
        val trimmed = epcList.trim()
        if (trimmed.isEmpty()) return emptyList()

        val out = ArrayList<ParsedEpcTag>()
        for (line in trimmed.lines()) {
            val trimmedLine = line.trim()
            if (trimmedLine.isEmpty()) continue

            val parts = trimmedLine.split(',')
            val epc = parts.getOrNull(0)?.trim().orEmpty()
            if (epc.isEmpty()) continue

            val tid = parts.getOrNull(1)?.trim()?.takeIf { it.isNotEmpty() }
            val userdata = parts.getOrNull(2)?.trim()?.takeIf { it.isNotEmpty() }

            out.add(
                ParsedEpcTag(
                    epc = epc,
                    tid = tid,
                    userdata = userdata
                )
            )
        }
        return out
    }
}
