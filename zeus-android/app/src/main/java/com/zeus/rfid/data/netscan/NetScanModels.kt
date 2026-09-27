package com.zeus.rfid.data.netscan

import androidx.compose.ui.graphics.Color

/**
 * RFID Reader Vendor slugs aligned with desktop Zeus Electron scanner.
 */
enum class ReaderVendor(
    val slug: String,
    val title: String,
    val letters: String,
    val badgeBg: Color,
    val badgeFg: Color,
    val domain: String? = null
) {
    IMPINJ("impinj", "Impinj", "IP", Color(0xFFFF6900), Color(0xFFFFFFFF), "impinj.com"),
    ZEBRA("zebra", "Zebra / Motorola", "ZE", Color(0xFF0F172A), Color(0xFFFFFFFF), "zebra.com"),
    ALIEN("alien", "Alien Technology", "AL", Color(0xFF8BC53F), Color(0xFF0B1A0B), "alientechnology.com"),
    THINGMAGIC("thingmagic", "ThingMagic / JADAK", "TM", Color(0xFF6B46C1), Color(0xFFFFFFFF), "jadaktech.com"),
    CAEN("caen", "CAEN RFID", "CA", Color(0xFFE31837), Color(0xFFFFFFFF), "caenrfid.com"),
    NORDIC_ID("nordicid", "Nordic ID", "NI", Color(0xFF0066CC), Color(0xFFFFFFFF), "nordicid.com"),
    HONEYWELL("honeywell", "Honeywell / Intermec", "HW", Color(0xFFEE3124), Color(0xFFFFFFFF), "honeywell.com"),
    SICK("sick", "SICK", "SK", Color(0xFFF9B000), Color(0xFF0B0B0B), "sick.com"),
    FEIG("feig", "FEIG OBID", "FE", Color(0xFFE40613), Color(0xFFFFFFFF), "feig.de"),
    KATHREIN("kathrein", "Kathrein Solutions", "KA", Color(0xFFC8102E), Color(0xFFFFFFFF), "kathrein-solutions.com"),
    CSL("csl", "CSL / Convergence", "CS", Color(0xFF00A896), Color(0xFFFFFFFF), "convergence.com.hk"),
    INVENGO("invengo", "Invengo", "IV", Color(0xFF1E3A8A), Color(0xFFFFFFFF), "invengo.com"),
    NEDAP("nedap", "Nedap", "ND", Color(0xFFEC008C), Color(0xFFFFFFFF), "nedap.com"),
    TURCK("turck", "Turck", "TU", Color(0xFFFFD100), Color(0xFF0B0B0B), "turck.com"),
    BALLUFF("balluff", "Balluff", "BA", Color(0xFF005CA9), Color(0xFFFFFFFF), "balluff.com"),
    SEUIC("seuic", "SEUIC / AUTOID", "SE", Color(0xFFF39200), Color(0xFFFFFFFF), "seuic.com"),
    SIEMENS("siemens", "Siemens SIMATIC RF", "SI", Color(0xFF009999), Color(0xFFFFFFFF), "siemens.com"),
    CHAINWAY("chainway", "Chainway", "CW", Color(0xFF006633), Color(0xFFFFFFFF), "chainway.net"),
    BLUEBIRD("bluebird", "Bluebird / Pidion", "BB", Color(0xFF0066B3), Color(0xFFFFFFFF), "bluebirdcorp.com"),
    CHAFON("chafon", "Chafon", "CF", Color(0xFF7C3AED), Color(0xFFFFFFFF), "chafon.com"),
    DATALOGIC("datalogic", "Datalogic", "DL", Color(0xFFE4002B), Color(0xFFFFFFFF), "datalogic.com"),
    GENERIC("generic", "Generic RFID Reader", "RF", Color(0xFF10B981), Color(0xFFFFFFFF)),
    UNKNOWN("unknown", "Unknown Device", "?", Color(0xFF6B7280), Color(0xFFFFFFFF));

    companion object {
        fun fromSlug(slug: String): ReaderVendor {
            return entries.find { it.slug.equals(slug, ignoreCase = true) } ?: UNKNOWN
        }
    }
}

enum class ReaderConfidence {
    LOW,
    MEDIUM,
    HIGH
}

data class ReaderCandidate(
    val ip: String,
    val vendor: ReaderVendor,
    val vendorLabel: String = vendor.title,
    val confidence: ReaderConfidence = ReaderConfidence.MEDIUM,
    val openPorts: List<Int> = emptyList(),
    val reason: String = "",
    val title: String? = null,
    val server: String? = null,
    val url: String? = null,
    val pen: Int? = null
)

data class PingScanRow(
    val ip: String,
    val alive: Boolean,
    val hostname: String? = null,
    val responseTimeMs: Long? = null
)

data class NetInterfaceInfo(
    val name: String,
    val address: String,
    val netmask: String,
    val cidr: Int,
    val networkCidr: String,
    val startIp: String,
    val endIp: String,
    val hostCount: Int
)

data class EdgeDiscoveredDevice(
    val ip: String,
    val port: Int = 12352,
    val guid: String = "",
    val mac: String = "",
    val version: String = "",
    val lastPDUpdate: String = "",
    val errors: String = "",
    val name: String = "",
    val raw: String = "",
    val discoveredAt: Long = System.currentTimeMillis()
)

data class RawUdpMessage(
    val data: String,
    val from: String,
    val fromPort: Int,
    val timestamp: Long = System.currentTimeMillis()
)

enum class NetScanTabMode {
    READER_DISCOVERY,
    PING_SCAN,
    UDP_DISCOVERY
}

enum class TargetScope {
    CIDR,
    RANGE,
    ALL_SUBNETS
}
