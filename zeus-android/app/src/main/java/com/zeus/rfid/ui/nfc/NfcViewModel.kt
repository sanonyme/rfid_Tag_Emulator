package com.zeus.rfid.ui.nfc

import android.app.Application
import android.nfc.Tag
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.zeus.rfid.data.nfc.NfcHardwareStatus
import com.zeus.rfid.data.nfc.NfcTagData
import com.zeus.rfid.data.nfc.NfcTagParser
import com.zeus.rfid.data.nfc.NfcUiState
import com.zeus.rfid.data.nfc.NfcVaultRepository
import com.zeus.rfid.data.nfc.SavedNfcTag
import com.zeus.rfid.data.nfc.ZeusHceManager
import com.zeus.rfid.ui.components.ZeusExperienceSettings
import com.zeus.rfid.ui.util.DiscoverySounds
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class NfcViewModel(application: Application) : AndroidViewModel(application) {

    private val vaultRepository = NfcVaultRepository.getInstance(application)

    private val _uiState = MutableStateFlow(NfcUiState())
    val uiState: StateFlow<NfcUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            vaultRepository.initialize()
            launch {
                vaultRepository.tagsFlow.collect { tags ->
                    _uiState.update { it.copy(vaultTags = tags) }
                }
            }
            launch {
                ZeusHceManager.isEmulating.collect { isEmulating ->
                    _uiState.update { it.copy(isEmulating = isEmulating) }
                }
            }
            launch {
                ZeusHceManager.activeTag.collect { activeTag ->
                    _uiState.update { it.copy(emulatingTag = activeTag) }
                }
            }
            launch {
                ZeusHceManager.tapCount.collect { tapCount ->
                    _uiState.update { it.copy(emulationTapCount = tapCount) }
                }
            }
            launch {
                ZeusHceManager.lastStatus.collect { status ->
                    _uiState.update { it.copy(lastEmulationStatus = status) }
                }
            }
        }
    }

    fun updateHardwareStatus(status: NfcHardwareStatus) {
        _uiState.update { it.copy(hardwareStatus = status) }
    }

    fun onTagDiscovered(tag: Tag) {
        viewModelScope.launch {
            _uiState.update { it.copy(hardwareStatus = NfcHardwareStatus.Reading) }
            val parsedTag = withContext(Dispatchers.IO) {
                try {
                    NfcTagParser.parse(tag)
                } catch (e: Exception) {
                    null
                }
            }

            if (parsedTag != null) {
                DiscoverySounds.found(ZeusExperienceSettings.soundEnabled)
                _uiState.update { state ->
                    val updatedHistory = listOf(parsedTag) + state.scanHistory.filterNot { it.uidHex == parsedTag.uidHex }
                    state.copy(
                        hardwareStatus = NfcHardwareStatus.Ready,
                        currentTag = parsedTag,
                        scanHistory = updatedHistory.take(100),
                        errorMessage = null
                    )
                }
            } else {
                DiscoverySounds.empty(ZeusExperienceSettings.soundEnabled)
                _uiState.update {
                    it.copy(
                        hardwareStatus = NfcHardwareStatus.Ready,
                        errorMessage = "Tag read interrupted or unsupported transceive format."
                    )
                }
            }
        }
    }

    fun selectTab(tab: Int) {
        _uiState.update { it.copy(selectedTab = tab) }
    }

    fun selectTagFromHistory(tag: NfcTagData) {
        _uiState.update { it.copy(currentTag = tag, selectedTab = 0) }
    }

    fun clearCurrentTag() {
        _uiState.update { it.copy(currentTag = null) }
    }

    fun clearHistory() {
        _uiState.update { it.copy(scanHistory = emptyList()) }
    }

    fun setHistorySearchQuery(query: String) {
        _uiState.update { it.copy(historySearchQuery = query) }
    }

    fun showCopyFeedback(message: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(copyFeedback = message) }
            delay(2200)
            _uiState.update { it.copy(copyFeedback = null) }
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    // --- Tag Vault & Emulation Operations ---

    fun openSaveDialog() {
        _uiState.update { it.copy(showSaveDialog = true) }
    }

    fun dismissSaveDialog() {
        _uiState.update { it.copy(showSaveDialog = false) }
    }

    fun saveCurrentTagToVault(name: String, category: String, notes: String) {
        val current = _uiState.value.currentTag ?: return
        val primaryRecord = current.records.firstOrNull()
        val saved = SavedNfcTag(
            name = name.ifBlank { "NFC Tag ${current.uidHex.take(8)}" },
            category = category.ifBlank { "General" },
            uidHex = current.uidHex,
            uidDecimal = current.uidDecimal,
            standard = current.standard,
            tagType = current.tagType,
            vendor = current.vendor,
            atqa = current.atqa,
            sak = current.sak,
            isNdef = current.isNdef,
            ndefType = current.ndefType,
            ndefPayloadText = primaryRecord?.payloadText,
            ndefUri = primaryRecord?.uriString,
            notes = notes
        )
        viewModelScope.launch {
            vaultRepository.saveTag(saved)
            _uiState.update { it.copy(showSaveDialog = false) }
            showCopyFeedback("Saved to Tag Vault!")
        }
    }

    fun deleteTagFromVault(id: String) {
        viewModelScope.launch {
            if (_uiState.value.emulatingTag?.id == id) {
                stopEmulation()
            }
            vaultRepository.deleteTag(id)
            if (_uiState.value.selectedSavedTagForDetail?.id == id) {
                _uiState.update { it.copy(selectedSavedTagForDetail = null) }
            }
            showCopyFeedback("Tag removed from Vault")
        }
    }

    fun openTagDetail(tag: SavedNfcTag?) {
        _uiState.update { it.copy(selectedSavedTagForDetail = tag) }
    }

    fun startEmulation(tag: SavedNfcTag) {
        ZeusHceManager.startEmulation(tag)
        showCopyFeedback("Phone HCE Emulation started: ${tag.name}")
    }

    fun stopEmulation() {
        ZeusHceManager.stopEmulation()
        showCopyFeedback("Emulation stopped")
    }

    fun setVaultCategory(category: String) {
        _uiState.update { it.copy(selectedVaultCategory = category) }
    }

    fun setVaultSearchQuery(query: String) {
        _uiState.update { it.copy(vaultSearchQuery = query) }
    }
}
