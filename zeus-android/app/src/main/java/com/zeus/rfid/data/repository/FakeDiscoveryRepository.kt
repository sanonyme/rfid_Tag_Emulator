package com.zeus.rfid.data.repository

import com.zeus.rfid.data.model.DiscoveredServer
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow

/**
 * A fake [DiscoveryRepository] implementation for testing, Compose previews,
 * and testing without live network UDP broadcasts.
 */
class FakeDiscoveryRepository(
    private val simulatedServers: List<DiscoveredServer> = listOf(
        DiscoveredServer(
            id = "edge_mac_001a2b3c4d5e",
            name = "Edge (00:1A:2B:3C:4D:5E)",
            host = "192.168.1.142",
            port = EdgeDiscoveryConfig.DEFAULT_EDGE_TCP_PORT,
            attributes = mapOf(
                "mac" to "00:1A:2B:3C:4D:5E",
                "version" to "10.2.3",
                "protocol" to "UDP",
                "guid" to "c8b35f20-94d1-4a8b-9e20-7f28ab1c3d4e",
                "lastPDUpdate" to "2026-09-24 10:45:12"
            )
        ),
        DiscoveredServer(
            id = "edge_mac_001a2b8899aa",
            name = "Edge (00:1A:2B:88:99:AA)",
            host = "192.168.1.189",
            port = EdgeDiscoveryConfig.DEFAULT_EDGE_TCP_PORT,
            attributes = mapOf(
                "mac" to "00:1A:2B:88:99:AA",
                "version" to "10.2.2",
                "protocol" to "UDP",
                "guid" to "a1e48c12-32b0-4f91-81d3-456789abcdef",
                "lastPDUpdate" to "2026-09-24 10:42:00"
            )
        )
    ),
    private val delayBeforeFirstServerMs: Long = 1800L,
    private val delayBetweenServersMs: Long = 1200L,
    private val simulateEmpty: Boolean = false,
    private val simulateError: Boolean = false
) : DiscoveryRepository {

    override fun discoverServers(serviceType: String): Flow<DiscoveryEvent> = flow {
        emit(DiscoveryEvent.Started)

        if (simulateError) {
            delay(1000)
            emit(DiscoveryEvent.Error("Simulated network interface error."))
            return@flow
        }

        if (simulateEmpty) {
            delay(3500)
            emit(DiscoveryEvent.Completed)
            return@flow
        }

        delay(delayBeforeFirstServerMs)
        for (server in simulatedServers) {
            emit(DiscoveryEvent.ServerFound(server))
            delay(delayBetweenServersMs)
        }

        delay(1500)
        emit(DiscoveryEvent.Completed)
    }
}
