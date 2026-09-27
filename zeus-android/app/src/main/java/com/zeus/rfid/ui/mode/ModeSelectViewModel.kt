package com.zeus.rfid.ui.mode

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.launch

sealed interface ModeSelectUiEvent {
    data object NavigateToFixedDiscovery : ModeSelectUiEvent
    data object NavigateToHandheldConnect : ModeSelectUiEvent
    data object NavigateToDecodeEncode : ModeSelectUiEvent
    data object NavigateToDatabase : ModeSelectUiEvent
    data object NavigateToFiles : ModeSelectUiEvent
    data object NavigateToOcr : ModeSelectUiEvent
    data object NavigateToLanScanner : ModeSelectUiEvent
    data class NavigateToOther(val initialTab: String = "decode") : ModeSelectUiEvent
    data class NavigateToComingSoon(val title: String) : ModeSelectUiEvent
}

data class ModeSelectUiState(
    val title: String = "Select Operation Mode",
    val subtitle: String = "Choose how Zeus connects and interacts with your RFID environment"
)

class ModeSelectViewModel : ViewModel() {
    private val _uiState = MutableStateFlow(ModeSelectUiState())
    val uiState: StateFlow<ModeSelectUiState> = _uiState.asStateFlow()

    private val _events = Channel<ModeSelectUiEvent>(Channel.BUFFERED)
    val events = _events.receiveAsFlow()

    fun onFixedSelected() {
        viewModelScope.launch {
            _events.send(ModeSelectUiEvent.NavigateToFixedDiscovery)
        }
    }

    fun onHandheldSelected() {
        viewModelScope.launch {
            _events.send(ModeSelectUiEvent.NavigateToHandheldConnect)
        }
    }

    fun onDecodeSelected() {
        viewModelScope.launch {
            _events.send(ModeSelectUiEvent.NavigateToDecodeEncode)
        }
    }

    fun onDatabaseSelected() {
        viewModelScope.launch {
            _events.send(ModeSelectUiEvent.NavigateToDatabase)
        }
    }

    fun onFilesSelected() {
        viewModelScope.launch {
            _events.send(ModeSelectUiEvent.NavigateToFiles)
        }
    }

    fun onOtherSelected(initialTab: String = "decode") {
        viewModelScope.launch {
            _events.send(ModeSelectUiEvent.NavigateToOther(initialTab))
        }
    }

    fun onDecodeEncodeSelected() {
        viewModelScope.launch {
            _events.send(ModeSelectUiEvent.NavigateToDecodeEncode)
        }
    }

    fun onOcrSelected() {
        viewModelScope.launch {
            _events.send(ModeSelectUiEvent.NavigateToOcr)
        }
    }

    fun onLanScannerSelected() {
        viewModelScope.launch {
            _events.send(ModeSelectUiEvent.NavigateToLanScanner)
        }
    }
}
