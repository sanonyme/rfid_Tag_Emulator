package com.zeus.rfid.data.model

import kotlinx.serialization.Serializable

@Serializable
data class LogicalDevice(
    val uid: String,
    val name: String = "",
    val composite: Boolean = false,
    val vendor: String = "",
    val groupName: String = "",
    val antennas: List<Int> = emptyList()
)
