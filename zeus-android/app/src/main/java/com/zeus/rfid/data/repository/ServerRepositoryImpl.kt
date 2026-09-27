package com.zeus.rfid.data.repository

import com.zeus.rfid.data.model.DiscoveredServer
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class ServerRepositoryImpl(
    private val simulateRandomFailure: Boolean = false
) : ServerRepository {

    private val _activeServer = MutableStateFlow<DiscoveredServer?>(null)
    override val activeServer: StateFlow<DiscoveredServer?> = _activeServer.asStateFlow()

    private var attemptCount = 0

    override suspend fun connect(server: DiscoveredServer): ConnectionResult {
        // Realistic connection latency simulating TCP/TLS handshake & authorization
        delay(1200)

        attemptCount++
        if (simulateRandomFailure && attemptCount % 2 == 1) {
            return ConnectionResult.Failure(
                server = server,
                errorMessage = "Connection timed out at ${server.host}:${server.port}. Host refused handshake."
            )
        }

        _activeServer.value = server
        return ConnectionResult.Success(server)
    }

    override suspend fun disconnect() {
        delay(200)
        _activeServer.value = null
    }
}
