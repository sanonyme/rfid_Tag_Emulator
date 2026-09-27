package com.zeus.rfid.ui.discover

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.zeus.rfid.data.model.ConnectionState
import com.zeus.rfid.data.model.DiscoveredServer
import com.zeus.rfid.data.repository.ConnectionResult
import com.zeus.rfid.data.repository.DiscoveryEvent
import com.zeus.rfid.data.repository.DiscoveryRepository
import com.zeus.rfid.data.repository.EdgeDiscoveryConfig
import com.zeus.rfid.data.repository.ServerRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class DiscoverViewModel(
    private val discoveryRepository: DiscoveryRepository,
    private val serverRepository: ServerRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(DiscoverUiState())
    val uiState: StateFlow<DiscoverUiState> = _uiState.asStateFlow()

    private val _events = Channel<DiscoverUiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    private var discoveryJob: Job? = null
    private var timeoutJob: Job? = null

    fun startDiscovery() {
        discoveryJob?.cancel()
        timeoutJob?.cancel()

        _uiState.update {
            it.copy(
                step = DiscoverStep.Scanning,
                isDiscoveryActive = true,
                servers = emptyList(),
                connectionState = ConnectionState.Disconnected
            )
        }

        // Set a timeout so user is not stuck scanning forever if no device is broadcasting
        timeoutJob = viewModelScope.launch {
            delay(EdgeDiscoveryConfig.DISCOVERY_TIMEOUT_MS)
            if (_uiState.value.step is DiscoverStep.Scanning && _uiState.value.servers.isEmpty()) {
                stopDiscovery()
                _uiState.update { it.copy(step = DiscoverStep.Empty) }
            }
        }

        discoveryJob = viewModelScope.launch {
            try {
                discoveryRepository.discoverServers()
                    .collect { event ->
                        when (event) {
                            is DiscoveryEvent.Started -> {
                                _uiState.update { it.copy(step = DiscoverStep.Scanning, isDiscoveryActive = true) }
                            }

                            is DiscoveryEvent.ServerFound -> {
                                val currentServers = _uiState.value.servers.toMutableList()
                                val existingIndex = currentServers.indexOfFirst { it.id == event.server.id || it.name == event.server.name }
                                if (existingIndex >= 0) {
                                    currentServers[existingIndex] = event.server
                                } else {
                                    currentServers.add(event.server)
                                }
                                _uiState.update {
                                    it.copy(
                                        servers = currentServers,
                                        step = DiscoverStep.Found(currentServers)
                                    )
                                }
                            }

                            is DiscoveryEvent.ServerLost -> {
                                val updatedServers = _uiState.value.servers.filterNot { it.name == event.serverName }
                                _uiState.update {
                                    it.copy(
                                        servers = updatedServers,
                                        step = if (updatedServers.isEmpty()) DiscoverStep.Scanning else DiscoverStep.Found(updatedServers)
                                    )
                                }
                            }

                            is DiscoveryEvent.Completed -> {
                                _uiState.update { it.copy(isDiscoveryActive = false) }
                                if (_uiState.value.servers.isEmpty()) {
                                    _uiState.update { it.copy(step = DiscoverStep.Empty) }
                                }
                            }

                            is DiscoveryEvent.Error -> {
                                _uiState.update {
                                    it.copy(step = DiscoverStep.Error(event.message), isDiscoveryActive = false)
                                }
                            }
                        }
                    }
            } catch (e: kotlinx.coroutines.CancellationException) {
                // Normal coroutine cancellation (user stopped scan, screen left, etc.)
                // — do nothing, don't show an error state.
                throw e // re-throw so the coroutine machinery cleans up properly
            } catch (e: Exception) {
                // Only show the error state for genuine failures (socket bind, etc.),
                // not for routine lifecycle cancellations.
                _uiState.update {
                    it.copy(step = DiscoverStep.Error("Discovery interrupted: ${e.localizedMessage}"), isDiscoveryActive = false)
                }
            }
        }
    }

    fun stopDiscovery() {
        discoveryJob?.cancel()
        discoveryJob = null
        timeoutJob?.cancel()
        timeoutJob = null
        _uiState.update { it.copy(isDiscoveryActive = false) }

        if (_uiState.value.step is DiscoverStep.Scanning && _uiState.value.servers.isEmpty()) {
            _uiState.update { it.copy(step = DiscoverStep.Idle) }
        }
    }

    fun connectToServer(server: DiscoveredServer) {
        val current = _uiState.value.connectionState
        if (current is ConnectionState.Connected && current.server.id == server.id) {
            viewModelScope.launch {
                _uiState.update { it.copy(isBottomSheetOpen = false) }
                _events.send(DiscoverUiEvent.NavigateToOptions(server))
            }
            return
        }

        viewModelScope.launch {
            _uiState.update {
                it.copy(connectionState = ConnectionState.Connecting(server))
            }

            when (val result = serverRepository.connect(server)) {
                is ConnectionResult.Success -> {
                    _uiState.update {
                        it.copy(
                            connectionState = ConnectionState.Connected(result.server),
                            isBottomSheetOpen = false
                        )
                    }
                    _events.send(DiscoverUiEvent.NavigateToOptions(result.server))
                }

                is ConnectionResult.Failure -> {
                    _uiState.update {
                        it.copy(
                            connectionState = ConnectionState.Failed(result.server, result.errorMessage)
                        )
                    }
                }
            }
        }
    }

    fun setBottomSheetVisible(visible: Boolean) {
        _uiState.update { it.copy(isBottomSheetOpen = visible) }
    }

    fun setManualSheetVisible(visible: Boolean) {
        _uiState.update { it.copy(isManualSheetOpen = visible) }
    }

    fun connectManually(host: String, port: Int) {
        // Build a synthetic DiscoveredServer so manual connections flow through
        // exactly the same connect/navigate path as UDP-discovered servers.
        val server = com.zeus.rfid.data.model.DiscoveredServer(
            id = "manual_${host}_$port",
            name = "$host:$port",
            host = host,
            port = port,
            attributes = mapOf("source" to "manual")
        )
        _uiState.update { it.copy(isManualSheetOpen = false) }
        connectToServer(server)
    }

    fun onManualAddressRequested() {
        setManualSheetVisible(true)
    }

    override fun onCleared() {
        super.onCleared()
        stopDiscovery()
    }

    companion object {
        fun provideFactory(
            discoveryRepository: DiscoveryRepository,
            serverRepository: ServerRepository
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return DiscoverViewModel(discoveryRepository, serverRepository) as T
            }
        }
    }
}
