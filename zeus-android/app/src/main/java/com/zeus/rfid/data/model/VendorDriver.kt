package com.zeus.rfid.data.model

enum class VendorDriver(val displayName: String, val code: String) {
    ALL("All", "llrp"),
    ALIEN("Alien", "arp"),
    IMPINJ_R700("Impinj R700", "impinjetk"),
    IMPINJ_OTHERS("Impinj Others", "octane"),
    SEUIC("SEUIC", "seuic");

    override fun toString(): String = "$code ($displayName)"

    companion object {
        fun fromCode(code: String): VendorDriver =
            entries.find { it.code.equals(code, ignoreCase = true) } ?: ALL
    }
}
