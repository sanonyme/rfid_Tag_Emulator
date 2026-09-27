package com.zeus.rfid.data.files

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID

/**
 * Manages persistent storage of file explorer connection profiles across app sessions.
 */
class SavedConnectionsRepository(context: Context) {

    private val prefs: SharedPreferences =
        context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        prettyPrint = false
    }

    private val _connections = MutableStateFlow<List<SavedFileConnection>>(emptyList())
    val connections: StateFlow<List<SavedFileConnection>> = _connections.asStateFlow()

    init {
        loadConnections()
    }

    private fun loadConnections() {
        val raw = prefs.getString(KEY_CONNECTIONS, null)
        val loaded = if (!raw.isNullOrBlank()) {
            try {
                json.decodeFromString<List<SavedFileConnection>>(raw)
            } catch (_: Exception) {
                defaultPresets()
            }
        } else {
            defaultPresets()
        }
        _connections.value = loaded
    }

    private fun persist(list: List<SavedFileConnection>) {
        _connections.value = list
        try {
            val encoded = json.encodeToString(list)
            prefs.edit().putString(KEY_CONNECTIONS, encoded).apply()
        } catch (_: Exception) {}
    }

    fun saveConnection(connection: SavedFileConnection) {
        val current = _connections.value.toMutableList()
        val index = current.indexOfFirst { it.id == connection.id }
        if (index >= 0) {
            current[index] = connection.copy(updatedAt = System.currentTimeMillis())
        } else {
            current.add(0, connection.copy(updatedAt = System.currentTimeMillis()))
        }
        // Sort pinned first, then by updatedAt descending
        val sorted = current.sortedWith(
            compareByDescending<SavedFileConnection> { it.pinned }
                .thenByDescending { it.updatedAt }
        )
        persist(sorted)
        setLastConnectionId(connection.id)
    }

    fun deleteConnection(id: String) {
        val updated = _connections.value.filter { it.id != id }
        persist(updated)
    }

    fun togglePin(id: String) {
        val updated = _connections.value.map {
            if (it.id == id) it.copy(pinned = !it.pinned) else it
        }.sortedWith(
            compareByDescending<SavedFileConnection> { it.pinned }
                .thenByDescending { it.updatedAt }
        )
        persist(updated)
    }

    fun getLastConnectionId(): String? = prefs.getString(KEY_LAST_ID, null)

    fun setLastConnectionId(id: String) {
        prefs.edit().putString(KEY_LAST_ID, id).apply()
    }

    companion object {
        private const val PREFS_NAME = "zeus_file_saved_connections"
        private const val KEY_CONNECTIONS = "connections_json"
        private const val KEY_LAST_ID = "last_connected_id"

        fun defaultPresets(): List<SavedFileConnection> = emptyList()
    }
}
