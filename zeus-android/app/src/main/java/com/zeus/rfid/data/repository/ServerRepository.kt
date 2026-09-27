package com.zeus.rfid.data.repository

import com.zeus.rfid.data.model.DiscoveredServer
import kotlinx.coroutines.flow.StateFlow

sealed interface ConnectionResult {
    data class Success(val server: DiscoveredServer) : ConnectionResult
    data class Failure(val server: DiscoveredServer, val errorMessage: String) : ConnectionResult
}

interface ServerRepository {
    val activeServer: StateFlow<DiscoveredServer?>

    /**
     * Attempts connection to the specified [server].
     */
    suspend fun connect(server: DiscoveredServer): ConnectionResult

    /**
     * Closes the active server session.
     */
    suspend fun disconnect()
}
