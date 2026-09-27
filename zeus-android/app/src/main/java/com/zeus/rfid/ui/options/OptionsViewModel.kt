package com.zeus.rfid.ui.options

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

data class OptionItem(
    val id: String,
    val title: String,
    val description: String,
    val isEnabled: Boolean = false,
    val badge: String? = null
)

data class OptionsUiState(
    val serverName: String,
    val host: String,
    val port: Int,
    val options: List<OptionItem> = listOf(
        OptionItem(
            id = "emulation",
            title = "Emulation",
            description = "Transmit active RFID tag inventory streams and EPC payloads to reader",
            isEnabled = true,
            badge = null
        )
    )
)

sealed interface OptionsUiEvent {
    data class ShowNotice(val message: String) : OptionsUiEvent
    data object DisconnectAndReturn : OptionsUiEvent
    data object NavigateToEmulation : OptionsUiEvent
}

class OptionsViewModel(
    serverName: String,
    host: String,
    port: Int
) : ViewModel() {

    private val _uiState = MutableStateFlow(
        OptionsUiState(
            serverName = serverName,
            host = host,
            port = port
        )
    )
    val uiState: StateFlow<OptionsUiState> = _uiState.asStateFlow()

    private val _events = Channel<OptionsUiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun onOptionSelected(optionId: String) {
        viewModelScope.launch {
            if (optionId == "emulation") {
                _events.send(OptionsUiEvent.NavigateToEmulation)
            }
        }
    }

    fun onDisconnect() {
        viewModelScope.launch {
            _events.send(OptionsUiEvent.DisconnectAndReturn)
        }
    }

    companion object {
        fun provideFactory(
            serverName: String,
            host: String,
            port: Int
        ): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T {
                return OptionsViewModel(serverName, host, port) as T
            }
        }
    }
}
