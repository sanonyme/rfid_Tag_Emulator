package com.zeus.rfid.ui.discover

import com.zeus.rfid.data.model.ConnectionState
import com.zeus.rfid.data.model.DiscoveredServer
import com.zeus.rfid.data.repository.EdgeDiscoveryConfig

sealed interface DiscoverStep {
    data object Idle : DiscoverStep
    data object Scanning : DiscoverStep
    data class Found(val servers: List<DiscoveredServer>) : DiscoverStep
    data object Empty : DiscoverStep
    data class Error(val message: String, val isPermissionError: Boolean = false) : DiscoverStep
}

data class DiscoverUiState(
    val step: DiscoverStep = DiscoverStep.Idle,
    val servers: List<DiscoveredServer> = emptyList(),
    val connectionState: ConnectionState = ConnectionState.Disconnected,
    val isBottomSheetOpen: Boolean = false,
    val isManualSheetOpen: Boolean = false,
    val isDiscoveryActive: Boolean = false,
    val udpPort: Int = EdgeDiscoveryConfig.DEFAULT_UDP_PORT
) {
    val isScanning: Boolean
        get() = isDiscoveryActive
}
