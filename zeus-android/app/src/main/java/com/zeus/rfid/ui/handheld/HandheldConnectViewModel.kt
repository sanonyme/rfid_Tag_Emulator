package com.zeus.rfid.ui.handheld

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zeus.rfid.data.handheld.HandheldClient
import com.zeus.rfid.data.handheld.HandheldServer
import com.zeus.rfid.util.NetworkUtils
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class HandheldConnectUiState(
    val phoneIp: String = "127.0.0.1",
    val port: Int = 10472,
    val isServerRunning: Boolean = false,
    val connectedClients: List<HandheldClient> = emptyList(),
    val errorMessage: String? = null
)

sealed interface HandheldConnectEvent {
    data class NavigateToEmulation(val clientIp: String) : HandheldConnectEvent
}

class HandheldConnectViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(HandheldConnectUiState())
    val uiState: StateFlow<HandheldConnectUiState> = _uiState.asStateFlow()

    private val _events = Channel<HandheldConnectEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    init {
        refreshNetworkInfo()
        startHandheldServer()
        observeClients()
    }

    fun refreshNetworkInfo() {
        val ip = NetworkUtils.getLocalIpAddress()
        _uiState.update { it.copy(phoneIp = ip) }
    }

    private fun startHandheldServer() {
        val port = _uiState.value.port
        val result = HandheldServer.start(port)
        if (result.isSuccess) {
            _uiState.update { it.copy(isServerRunning = true, errorMessage = null) }
        } else {
            val err = result.exceptionOrNull()?.message ?: "Could not start server on port $port"
            _uiState.update { it.copy(isServerRunning = false, errorMessage = err) }
        }
    }

    private fun observeClients() {
        viewModelScope.launch {
            HandheldServer.clients.collect { list ->
                _uiState.update { it.copy(connectedClients = list) }
            }
        }

        viewModelScope.launch {
            HandheldServer.clientConnectedEvents.collect { client ->
                // Automatically open handheld emulation screen on incoming connection
                _events.send(HandheldConnectEvent.NavigateToEmulation(client.address))
            }
        }
    }

    fun proceedToEmulationManually() {
        viewModelScope.launch {
            val firstClient = _uiState.value.connectedClients.firstOrNull()?.address ?: ""
            _events.send(HandheldConnectEvent.NavigateToEmulation(firstClient))
        }
    }
}
