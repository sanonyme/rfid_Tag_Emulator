package com.zeus.rfid.data.model

import com.zeus.rfid.data.handheld.HandheldTagItem
import com.zeus.rfid.data.handheld.HandheldWireFormat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.*
import org.junit.Test

class TagWireFormatTest {
    @Test fun fixedPayloadMatchesElectronFieldOrderAndNewline() {
        val tag = TagData("E280", "TID01", "reader-1", 2, "-65", " AABB ")
        assertEquals("driver=impinj epc=E280 @tid=TID01 @userdata=AABB uid=reader-1 antenna=2 @rssi=-65\n",
            tag.formatMessage("impinj"))
        assertFalse(tag.copy(userdata = " ").formatMessage("impinj").contains("@userdata"))
    }

    @Test fun handheldUsesCrLfAndFallsBackFromEmptyTidLikeElectron() {
        val line = HandheldWireFormat.format(HandheldTagItem("E280", "", " AABB "), "2026-09-25 10:00:00.000", 70.0)
        assertTrue(line.endsWith("\r\n"))
        val json = Json.parseToJsonElement(line.trim()).jsonObject
        assertEquals("E280", json.getValue("tid").jsonPrimitive.content)
        assertEquals("AABB", json.getValue("userdata").jsonPrimitive.content)
        assertEquals("2026-09-25 10:00:00.000", json.getValue("date").jsonPrimitive.content)
        assertFalse(Json.parseToJsonElement(HandheldWireFormat.format(HandheldTagItem("E280"), "now", 70.0).trim())
            .jsonObject.containsKey("userdata"))
    }
}
