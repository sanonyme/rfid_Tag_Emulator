package com.zeus.rfid.data.model

import kotlinx.serialization.Serializable

/**
 * Represents a server discovered via mDNS / DNS-SD on the local network.
 */
@Serializable
data class DiscoveredServer(
    val id: String,
    val name: String,
    val host: String,
    val port: Int,
    val attributes: Map<String, String> = emptyMap(),
    val discoveredAtMs: Long = System.currentTimeMillis()
)
