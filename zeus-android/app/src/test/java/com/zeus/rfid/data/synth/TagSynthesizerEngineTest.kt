package com.zeus.rfid.data.synth

import com.google.zxing.BarcodeFormat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class TagSynthesizerEngineTest {

    @Test
    fun testGtinCheckDigitCalculation() {
        // GTIN: 0001234567890 -> check digit is 5
        val check = TagSynthesizerEngine.calculateGtinCheckDigit("0001234567890")
        assertEquals("5", check)

        assertTrue(TagSynthesizerEngine.validateGtinCheckDigit("00012345678905"))
        assertFalse(TagSynthesizerEngine.validateGtinCheckDigit("00012345678904"))
    }

    @Test
    fun testSynthesizeSgtin96() {
        val tags = TagSynthesizerEngine.synthesizeSgtin96(
            gtinInput = "00012345678905",
            companyPrefixLength = 6,
            filter = 0,
            quantity = 5,
            startSerial = 1L
        )

        assertEquals(5, tags.size)
        for (i in tags.indices) {
            val tag = tags[i]
            assertEquals(i + 1, tag.index)
            assertEquals(24, tag.epc.length) // 96 bits = 24 hex characters
            assertTrue(tag.epc.startsWith("30")) // Header 0x30 for SGTIN-96
            assertEquals(EpcSchemeType.SGTIN_96, tag.scheme)
            assertTrue(tag.details.contains("Serial: ${i + 1}"))
        }
    }

    @Test
    fun testSynthesizeSgtin198() {
        val tags = TagSynthesizerEngine.synthesizeSgtin198(
            gtinInput = "00012345678905",
            companyPrefixLength = 6,
            serialPrefix = "ABC-",
            filter = 0,
            quantity = 3,
            startSerial = 10L
        )

        assertEquals(3, tags.size)
        for (i in tags.indices) {
            val tag = tags[i]
            assertEquals(50, tag.epc.length) // 200 bits = 50 hex chars
            assertTrue(tag.epc.startsWith("36")) // Header 0x36 for SGTIN-198
            assertEquals(EpcSchemeType.SGTIN_198, tag.scheme)
            assertTrue(tag.details.contains("ABC-${10 + i}"))
        }
    }

    @Test
    fun testSynthesizeSscc96() {
        val tags = TagSynthesizerEngine.synthesizeSscc96(
            companyPrefix = "012345",
            serialRefBase = "0001",
            filter = 0,
            quantity = 4,
            startSerial = 1L
        )

        assertEquals(4, tags.size)
        for (tag in tags) {
            assertEquals(24, tag.epc.length)
            assertTrue(tag.epc.startsWith("31")) // Header 0x31 for SSCC-96
            assertEquals(EpcSchemeType.SSCC_96, tag.scheme)
        }
    }

    @Test
    fun testSynthesizeSgln96() {
        val tags = TagSynthesizerEngine.synthesizeSgln96(
            companyPrefix = "012345",
            locationRef = "001",
            filter = 0,
            quantity = 3,
            startExtension = 100L
        )

        assertEquals(3, tags.size)
        for (tag in tags) {
            assertEquals(24, tag.epc.length)
            assertTrue(tag.epc.startsWith("32")) // Header 0x32 for SGLN-96
            assertEquals(EpcSchemeType.SGLN_96, tag.scheme)
        }
    }

    @Test
    fun testSynthesizeGrai96() {
        val tags = TagSynthesizerEngine.synthesizeGrai96(
            companyPrefix = "012345",
            assetType = "1001",
            filter = 0,
            quantity = 2,
            startSerial = 50L
        )

        assertEquals(2, tags.size)
        for (tag in tags) {
            assertEquals(24, tag.epc.length)
            assertTrue(tag.epc.startsWith("33")) // Header 0x33 for GRAI-96
            assertEquals(EpcSchemeType.GRAI_96, tag.scheme)
        }
    }

    @Test
    fun testSynthesizeGiai96() {
        val tags = TagSynthesizerEngine.synthesizeGiai96(
            companyPrefix = "012345",
            assetRefBase = "9000",
            filter = 0,
            quantity = 2,
            startSerial = 1L
        )

        assertEquals(2, tags.size)
        for (tag in tags) {
            assertEquals(24, tag.epc.length)
            assertTrue(tag.epc.startsWith("34")) // Header 0x34 for GIAI-96
            assertEquals(EpcSchemeType.GIAI_96, tag.scheme)
        }
    }

    @Test
    fun testSynthesizeInditexTempe() {
        val fields = InditexFields(
            version = 2,
            brandId = 2, // Tempe
            model = 1253,
            quality = 640,
            color = 100,
            size = 38,
            startSerial = 141802403393L
        )

        val tags = TagSynthesizerEngine.synthesizeInditex(fields, quantity = 3)
        assertEquals(3, tags.size)
        for (tag in tags) {
            assertEquals(32, tag.epc.length) // 128 bits = 32 hex chars
            assertEquals(EpcSchemeType.INDITEX_TEMPE, tag.scheme)
            assertTrue(tag.details.contains("Tempe V2"))
        }
    }

    @Test
    fun testSynthesizeCustomPattern() {
        val tags = TagSynthesizerEngine.synthesizeCustomPattern(
            hexPrefix = "E2801130",
            targetLength = 24,
            startSerial = 100L,
            isRandom = false,
            quantity = 5
        )

        assertEquals(5, tags.size)
        for (tag in tags) {
            assertEquals(24, tag.epc.length)
            assertTrue(tag.epc.startsWith("E2801130"))
            assertEquals(EpcSchemeType.CUSTOM_PATTERN, tag.scheme)
        }
    }

    @Test
    fun testBarcodeGeneration() {
        val result = TagSynthesizerEngine.generateBitMatrix(
            content = "https://id.gs1.org/01/00012345678905/21/10001",
            format = BarcodeFormat.QR_CODE,
            widthPx = 200,
            heightPx = 200
        )
        assertTrue(result.isSuccess)
        val matrix = result.getOrNull()
        assertNotNull(matrix)
        assertEquals(200, matrix?.width)
        assertEquals(200, matrix?.height)
    }
}
