package com.zeus.rfid.ui.discover

import com.zeus.rfid.data.model.DiscoveredServer

sealed interface DiscoverUiEvent {
    data class NavigateToOptions(val server: DiscoveredServer) : DiscoverUiEvent
    data class ShowMessage(val message: String) : DiscoverUiEvent
}
