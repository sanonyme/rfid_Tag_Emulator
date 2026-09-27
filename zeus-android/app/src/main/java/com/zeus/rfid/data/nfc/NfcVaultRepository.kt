package com.zeus.rfid.data.nfc

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File

class NfcVaultRepository(private val context: Context) {

    private val json = Json {
        ignoreUnknownKeys = true
        prettyPrint = true
    }

    private val vaultFile: File by lazy {
        File(context.filesDir, "nfc_vault.json")
    }

    private val _tagsFlow = MutableStateFlow<List<SavedNfcTag>>(emptyList())
    val tagsFlow: StateFlow<List<SavedNfcTag>> = _tagsFlow.asStateFlow()

    suspend fun initialize() = withContext(Dispatchers.IO) {
        val loaded = loadTagsFromFile()
        if (loaded.isEmpty()) {
            val defaults = getInitialSampleTags()
            saveTagsToFile(defaults)
            _tagsFlow.value = defaults
        } else {
            _tagsFlow.value = loaded
        }
    }

    suspend fun saveTag(tag: SavedNfcTag) = withContext(Dispatchers.IO) {
        val current = _tagsFlow.value.toMutableList()
        val index = current.indexOfFirst { it.id == tag.id }
        if (index >= 0) {
            current[index] = tag
        } else {
            current.add(0, tag)
        }
        saveTagsToFile(current)
        _tagsFlow.value = current
    }

    suspend fun deleteTag(id: String) = withContext(Dispatchers.IO) {
        val current = _tagsFlow.value.filterNot { it.id == id }
        saveTagsToFile(current)
        _tagsFlow.value = current
    }

    suspend fun updateTag(tag: SavedNfcTag) = withContext(Dispatchers.IO) {
        saveTag(tag)
    }

    private fun loadTagsFromFile(): List<SavedNfcTag> {
        return try {
            if (!vaultFile.exists()) return emptyList()
            val content = vaultFile.readText()
            if (content.isBlank()) emptyList() else json.decodeFromString(content)
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun saveTagsToFile(tags: List<SavedNfcTag>) {
        try {
            val tempFile = File(context.filesDir, "nfc_vault.tmp")
            tempFile.writeText(json.encodeToString(tags))
            if (tempFile.exists()) {
                tempFile.renameTo(vaultFile)
            }
        } catch (_: Exception) {
            // Best effort write
        }
    }

    private fun getInitialSampleTags(): List<SavedNfcTag> {
        return listOf(
            SavedNfcTag(
                id = "sample-1",
                name = "Zeus RFID Portal",
                category = "Web / Smart Poster",
                uidHex = "04:6B:A1:22:9E:5F:80",
                uidDecimal = "1244301548879",
                standard = "ISO/IEC 14443-3A",
                tagType = "NTAG215 (NFC Forum Type 2)",
                vendor = "NXP Semiconductors",
                isNdef = true,
                ndefType = "URI",
                ndefPayloadText = "https://github.com/sanonyme/rfid_Tag_Emulator",
                ndefUri = "https://github.com/sanonyme/rfid_Tag_Emulator",
                notes = "Default web portal demo tag for testing tap-to-phone emulation."
            ),
            SavedNfcTag(
                id = "sample-2",
                name = "Retail Pallet Tag #42",
                category = "Inventory / EPC",
                uidHex = "E2:80:11:30:30:00:02:07:86:CA:9E:61",
                uidDecimal = "30089240582910385",
                standard = "ISO/IEC 14443-3A",
                tagType = "MIFARE Ultralight EV1",
                vendor = "NXP Semiconductors",
                isNdef = true,
                ndefType = "Text",
                ndefPayloadText = "EPC: E28011303000020786CA9E61 [UPC: 00000000000000]",
                notes = "Pre-synthesized retail inventory tag ready for Zeus Edge streaming."
            ),
            SavedNfcTag(
                id = "sample-3",
                name = "HQ Lab Access Fob",
                category = "Access Control",
                uidHex = "84:F1:C9:3A",
                uidDecimal = "2230438202",
                standard = "ISO/IEC 14443-3A",
                tagType = "MIFARE Classic 1K",
                vendor = "NXP Semiconductors (Philips)",
                isNdef = false,
                notes = "Simulated security turnstile badge."
            )
        )
    }

    companion object {
        @Volatile
        private var instance: NfcVaultRepository? = null

        fun getInstance(context: Context): NfcVaultRepository {
            return instance ?: synchronized(this) {
                instance ?: NfcVaultRepository(context.applicationContext).also { instance = it }
            }
        }
    }
}
