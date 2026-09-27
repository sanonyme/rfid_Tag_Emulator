package com.zeus.rfid.data.repository

import com.zeus.rfid.data.model.DiscoveredServer

/**
 * Parser for Zeus Edge Server heartbeat UDP broadcast packets containing
 * `<CEdgeHeartBeatModel>` XML payloads, mirroring the Zeus Desktop discovery handler.
 */
object EdgeHeartbeatParser {

    /**
     * Parses the incoming raw UDP packet payload.
     * Returns a [DiscoveredServer] if the payload represents a valid Edge heartbeat, or null otherwise.
     */
    fun parseHeartbeat(rawPayload: String, remoteAddress: String): DiscoveredServer? {
        if (!rawPayload.contains("CEdgeHeartBeatModel")) {
            return null
        }

        val ipFromPayload = extractPropertyValue(rawPayload, "IPAddress")
        val ip = when {
            ipFromPayload.isNotBlank() && ipFromPayload != "0.0.0.0" -> ipFromPayload
            remoteAddress.isNotBlank() -> remoteAddress
            else -> "127.0.0.1"
        }

        val portStr = extractPropertyValue(rawPayload, "Port")
        val rawPort = portStr.toIntOrNull() ?: 0
        val port = if (rawPort > 0) rawPort else EdgeDiscoveryConfig.DEFAULT_EDGE_TCP_PORT

        val guid = extractXmlValue(rawPayload, "Guid")
        val mac = extractXmlValue(rawPayload, "MACAddress")
        val version = extractXmlValue(rawPayload, "Version")
        val lastPdUpdate = extractXmlValue(rawPayload, "LastPDUpdate")
        val errors = extractXmlValue(rawPayload, "Errors")
        val showDashboardInfo = extractPropertyValue(rawPayload, "showDashBoardInfo")
        val deviceType = extractPropertyValue(rawPayload, "Type")

        val name = when {
            showDashboardInfo.isNotEmpty() -> "Edge (${mac.ifEmpty { ip }})"
            mac.isNotEmpty() -> "Edge ($mac)"
            else -> "Edge Device ($ip)"
        }

        val attributes = buildMap {
            if (mac.isNotEmpty()) put("mac", mac)
            if (guid.isNotEmpty()) put("guid", guid)
            if (version.isNotEmpty()) put("version", version)
            if (lastPdUpdate.isNotEmpty()) put("lastPDUpdate", lastPdUpdate)
            if (errors.isNotEmpty()) put("errors", errors)
            if (deviceType.isNotEmpty()) put("type", deviceType)
            put("protocol", "UDP")
        }

        val id = when {
            guid.isNotEmpty() -> guid
            mac.isNotEmpty() -> mac
            else -> "${ip}_$port"
        }

        return DiscoveredServer(
            id = id,
            name = name,
            host = ip,
            port = port,
            attributes = attributes,
            discoveredAtMs = System.currentTimeMillis()
        )
    }

    private fun extractXmlValue(xml: String, tag: String): String {
        val openTag = "<$tag>"
        val closeTag = "</$tag>"
        val start = xml.indexOf(openTag)
        val end = xml.indexOf(closeTag)
        if (start == -1 || end == -1 || start + openTag.length > end) {
            return ""
        }
        return xml.substring(start + openTag.length, end).trim()
    }

    private fun extractPropertyValue(xml: String, propName: String): String {
        val pattern = Regex(
            """<CProperty>\s*<Name>$propName</Name>\s*<Value>([^<]*)</Value>\s*</CProperty>""",
            RegexOption.DOT_MATCHES_ALL
        )
        val match = pattern.find(xml)
        return match?.groupValues?.get(1)?.trim() ?: ""
    }
}
