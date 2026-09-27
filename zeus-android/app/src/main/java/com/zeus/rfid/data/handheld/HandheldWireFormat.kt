package com.zeus.rfid.data.handheld

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** Matches Electron's formatHandheldBroadcastLine, including the CRLF delimiter. */
object HandheldWireFormat {
    fun format(item: HandheldTagItem, date: String, rssi: Double): String =
        buildJsonObject {
            put("epc", item.epc)
            put("tid", item.tid?.takeIf { it.isNotEmpty() } ?: item.epc)
            put("date", date)
            put("rssi", rssi)
            item.userdata?.trim()?.takeIf { it.isNotEmpty() }?.let { put("userdata", it) }
        }.toString() + "\r\n"
}
