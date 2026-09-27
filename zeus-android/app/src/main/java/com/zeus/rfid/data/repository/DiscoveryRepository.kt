package com.zeus.rfid.data.repository

import com.zeus.rfid.data.model.DiscoveredServer
import kotlinx.coroutines.flow.Flow

sealed interface DiscoveryEvent {
    data object Started : DiscoveryEvent
    data class ServerFound(val server: DiscoveredServer) : DiscoveryEvent
    data class ServerLost(val serverName: String) : DiscoveryEvent
    data object Completed : DiscoveryEvent
    data class Error(val message: String, val cause: Throwable? = null) : DiscoveryEvent
}

interface DiscoveryRepository {
    /**
     * Begins network discovery of Edge servers or services.
     * Returns a cold flow that initiates discovery on collection and terminates/cleans up on cancellation.
     */
    fun discoverServers(serviceType: String = ""): Flow<DiscoveryEvent>
}
