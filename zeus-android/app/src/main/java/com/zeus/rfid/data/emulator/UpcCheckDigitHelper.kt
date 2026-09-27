package com.zeus.rfid.data.emulator

sealed class UpcCheckDigitStatus {
    data object None : UpcCheckDigitStatus()
    data class Hint(val calculatedCheck: String, val neededDigits: Int) : UpcCheckDigitStatus()
    data object Valid : UpcCheckDigitStatus()
    data class Invalid(val expected: String, val provided: String) : UpcCheckDigitStatus()
    data class TooLong(val count: Int) : UpcCheckDigitStatus()
}

object UpcCheckDigitHelper {

    /**
     * Standard GS1 modulo 10 check digit calculation.
     */
    fun calculateCheckDigit(digits: String): String {
        if (digits.isEmpty()) return "0"
        var sum = 0
        for (i in digits.indices) {
            val char = digits[digits.length - 1 - i]
            val digit = if (char in '0'..'9') char - '0' else 0
            sum += if (i % 2 == 0) digit * 3 else digit
        }
        val nearestTen = (sum + 9) / 10 * 10
        return ((nearestTen - sum) % 10).toString()
    }

    /**
     * Analyzes first line of UPC input (or primary entry).
     */
    fun analyzeUpcInput(text: String): UpcCheckDigitStatus {
        val firstLine = text.lineSequence().firstOrNull { it.trim().isNotEmpty() } ?: return UpcCheckDigitStatus.None
        val upcPart = firstLine.split(',').firstOrNull()?.trim() ?: return UpcCheckDigitStatus.None
        val digits = upcPart.filter { it.isDigit() }

        return when {
            digits.isEmpty() -> UpcCheckDigitStatus.None
            digits.length < 11 -> UpcCheckDigitStatus.None
            digits.length == 11 -> {
                // 11 digits entered -> suggest 12th check digit for UPC-A
                val check = calculateCheckDigit(digits)
                UpcCheckDigitStatus.Hint(check, 12)
            }
            digits.length == 12 -> {
                val payload = digits.substring(0, 11)
                val provided = digits.last().toString()
                val expected = calculateCheckDigit(payload)
                if (provided == expected) UpcCheckDigitStatus.Valid
                else UpcCheckDigitStatus.Invalid(expected = expected, provided = provided)
            }
            digits.length == 13 -> {
                // 13 digits entered -> suggest 14th check digit for GTIN-14
                val check = calculateCheckDigit(digits)
                UpcCheckDigitStatus.Hint(check, 14)
            }
            digits.length == 14 -> {
                val payload = digits.substring(0, 13)
                val provided = digits.last().toString()
                val expected = calculateCheckDigit(payload)
                if (provided == expected) UpcCheckDigitStatus.Valid
                else UpcCheckDigitStatus.Invalid(expected = expected, provided = provided)
            }
            else -> UpcCheckDigitStatus.TooLong(digits.length)
        }
    }
}
