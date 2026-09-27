package com.zeus.rfid.data.model

enum class TagMode(val label: String, val description: String) {
    UPC("UPC → EPC", "Generate SGTIN-style EPCs from UPC lines"),
    EPC("Direct EPC", "Direct raw EPC lines with optional TID")
}
