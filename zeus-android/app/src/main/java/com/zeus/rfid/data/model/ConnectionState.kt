package com.zeus.rfid.data.model

sealed interface ConnectionState {
    data object Disconnected : ConnectionState
    data class Connecting(val server: DiscoveredServer) : ConnectionState
    data class Connected(val server: DiscoveredServer) : ConnectionState
    data class Failed(val server: DiscoveredServer, val error: String) : ConnectionState
}
