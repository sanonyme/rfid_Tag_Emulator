package com.zeus.rfid.data.model

data class TagData(
    val epc: String,
    val tid: String,
    val uid: String,
    val antenna: Int,
    val rssi: String,
    val userdata: String? = null
) {
    fun formatMessage(driver: String): String {
        val userPart = if (!userdata.isNullOrBlank()) " @userdata=${userdata.trim()}" else ""
        return "driver=$driver epc=$epc @tid=$tid$userPart uid=$uid antenna=$antenna @rssi=$rssi\n"
    }
}
