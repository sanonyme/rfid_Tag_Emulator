package com.zeus.rfid.ui.files

import android.app.Application
import android.os.Environment
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.zeus.rfid.data.files.ExplorerProtocol
import com.zeus.rfid.data.files.RemoteFileEngine
import com.zeus.rfid.data.files.SavedConnectionsRepository
import com.zeus.rfid.data.files.SavedFileConnection
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import java.util.UUID

data class FilesUiState(
    val activeProtocol: ExplorerProtocol = ExplorerProtocol.SFTP,
    val connection: SavedFileConnection = defaultDraft(ExplorerProtocol.SFTP),
    val savedConnections: List<SavedFileConnection> = emptyList(),
    val saveProfileOnConnect: Boolean = true,
    val isConnected: Boolean = false,
    val isConnecting: Boolean = false,
    val connectionError: String? = null,
    val currentPath: String = "/",
    val pathSegments: List<String> = emptyList(),
    val files: List<SftpFileItem> = emptyList(),
    val filteredFiles: List<SftpFileItem> = emptyList(),
    val searchQuery: String = "",
    val activePreview: ActiveFilePreview? = null,
    val activeTransfers: List<FileTransferTask> = emptyList(),
    val showCreateFolderDialog: Boolean = false,
    val showCreateFileDialog: Boolean = false,
    val renameTarget: SftpFileItem? = null,
    val filePropertiesTarget: SftpFileItem? = null,
    val sortBy: FileSortOption = FileSortOption.NAME,
    val sortAscending: Boolean = true,
    val foldersFirst: Boolean = true,
    val notificationMessage: String? = null
) {
    val protocolSavedConnections: List<SavedFileConnection>
        get() = savedConnections.filter { it.protocol == activeProtocol }
}

private fun defaultDraft(protocol: ExplorerProtocol): SavedFileConnection {
    return SavedFileConnection(
        id = UUID.randomUUID().toString(),
        name = "",
        protocol = protocol,
        host = "",
        port = protocol.defaultPort,
        username = "",
        password = "",
        secureFtpMode = "OFF",
        bucket = "",
        region = "us-east-1",
        accessKeyId = "",
        secretAccessKey = "",
        endpoint = if (protocol == ExplorerProtocol.S3_COMPATIBLE) "http://192.168.1.50:9000" else "",
        rootPath = "/"
    )
}

class FilesViewModel(application: Application) : AndroidViewModel(application) {

    private val savedRepo = SavedConnectionsRepository(application)
    private val engine = RemoteFileEngine()

    private val _uiState = MutableStateFlow(
        FilesUiState(
            connection = defaultDraft(ExplorerProtocol.SFTP),
            savedConnections = savedRepo.connections.value
        )
    )
    val uiState: StateFlow<FilesUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            savedRepo.connections.collect { list ->
                _uiState.update { state ->
                    val matchingDraft = if (!state.isConnected && state.connection.host.isBlank() && state.connection.bucket.isBlank()) {
                        list.firstOrNull { it.protocol == state.activeProtocol } ?: state.connection
                    } else {
                        state.connection
                    }
                    state.copy(savedConnections = list, connection = matchingDraft)
                }
            }
        }
    }

    fun setProtocol(protocol: ExplorerProtocol) {
        if (_uiState.value.activeProtocol == protocol) return
        disconnect()

        val savedForProto = _uiState.value.savedConnections.firstOrNull { it.protocol == protocol }
        val draft = savedForProto ?: defaultDraft(protocol)

        _uiState.update {
            it.copy(
                activeProtocol = protocol,
                connection = draft,
                connectionError = null
            )
        }
    }

    fun updateDraft(connection: SavedFileConnection) {
        _uiState.update { it.copy(connection = connection, connectionError = null) }
    }

    fun setSaveProfileOnConnect(save: Boolean) {
        _uiState.update { it.copy(saveProfileOnConnect = save) }
    }

    fun selectSavedConnection(connection: SavedFileConnection) {
        _uiState.update {
            it.copy(
                activeProtocol = connection.protocol,
                connection = connection,
                connectionError = null
            )
        }
        connect(connection, saveProfile = false)
    }

    fun connect(connection: SavedFileConnection, saveProfile: Boolean = _uiState.value.saveProfileOnConnect) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isConnecting = true,
                    activeProtocol = connection.protocol,
                    connectionError = null,
                    connection = connection
                )
            }

            try {
                // Save to connection profiles if requested
                if (saveProfile && (connection.host.isNotBlank() || connection.bucket.isNotBlank())) {
                    val profileName = connection.name.ifBlank {
                        when (connection.protocol) {
                            ExplorerProtocol.SFTP -> "SFTP: ${connection.host}"
                            ExplorerProtocol.FTP -> "FTP: ${connection.host}"
                            ExplorerProtocol.S3 -> "S3: ${connection.bucket}"
                            ExplorerProtocol.S3_COMPATIBLE -> "S3-Compat: ${connection.bucket}"
                        }
                    }
                    savedRepo.saveConnection(connection.copy(name = profileName))
                }

                val result = engine.connect(connection)
                result.onSuccess {
                    _uiState.update {
                        it.copy(
                            isConnected = true,
                            isConnecting = false,
                            connectionError = null
                        )
                    }
                    navigateToPath(connection.rootPath.ifBlank { "/" })
                }.onFailure { error ->
                    val cleanError = error.localizedMessage ?: error.message ?: "Failed to connect to ${connection.protocol.label}"
                    _uiState.update {
                        it.copy(
                            isConnected = false,
                            isConnecting = false,
                            connectionError = cleanError
                        )
                    }
                }
            } catch (t: Throwable) {
                val cleanError = t.localizedMessage ?: t.message ?: "Connection error (${t.javaClass.simpleName})"
                _uiState.update {
                    it.copy(
                        isConnected = false,
                        isConnecting = false,
                        connectionError = cleanError
                    )
                }
            }
        }
    }

    fun disconnect() {
        engine.disconnect()
        _uiState.update {
            it.copy(
                isConnected = false,
                isConnecting = false,
                connectionError = null,
                files = emptyList(),
                filteredFiles = emptyList(),
                currentPath = "/",
                pathSegments = emptyList(),
                activePreview = null
            )
        }
    }

    fun deleteSavedConnection(id: String) {
        savedRepo.deleteConnection(id)
    }

    fun togglePinConnection(id: String) {
        savedRepo.togglePin(id)
    }

    fun navigateToPath(path: String) {
        val clean = if (path.isEmpty()) "/" else path
        val segments = clean.split("/").filter { it.isNotBlank() }
        _uiState.update {
            it.copy(
                currentPath = clean,
                pathSegments = segments,
                searchQuery = ""
            )
        }
        loadDirectory(clean)
    }

    fun navigateUp() {
        val curr = _uiState.value.currentPath
        val parent = if (curr == "/" || curr.isEmpty()) "/" else curr.substringBeforeLast('/', "/")
        navigateToPath(if (parent.isEmpty()) "/" else parent)
    }

    fun setSearchQuery(query: String) {
        _uiState.update { state ->
            val matching = if (query.isBlank()) {
                state.files
            } else {
                state.files.filter { it.name.contains(query, ignoreCase = true) }
            }
            val sorted = sortFiles(matching, state.sortBy, state.sortAscending, state.foldersFirst)
            state.copy(searchQuery = query, filteredFiles = sorted)
        }
    }

    fun setSortOption(sortBy: FileSortOption) {
        _uiState.update { state ->
            val ascending = if (state.sortBy == sortBy) !state.sortAscending else true
            val sortedFiles = sortFiles(state.files, sortBy, ascending, state.foldersFirst)
            val sortedFiltered = sortFiles(state.filteredFiles, sortBy, ascending, state.foldersFirst)
            state.copy(
                sortBy = sortBy,
                sortAscending = ascending,
                files = sortedFiles,
                filteredFiles = sortedFiltered
            )
        }
    }

    fun setFoldersFirst(foldersFirst: Boolean) {
        _uiState.update { state ->
            val sortedFiles = sortFiles(state.files, state.sortBy, state.sortAscending, foldersFirst)
            val sortedFiltered = sortFiles(state.filteredFiles, state.sortBy, state.sortAscending, foldersFirst)
            state.copy(
                foldersFirst = foldersFirst,
                files = sortedFiles,
                filteredFiles = sortedFiltered
            )
        }
    }

    fun setCreateFolderDialogVisible(visible: Boolean) {
        _uiState.update { it.copy(showCreateFolderDialog = visible) }
    }

    fun setCreateFileDialogVisible(visible: Boolean) {
        _uiState.update { it.copy(showCreateFileDialog = visible) }
    }

    fun setRenameTarget(file: SftpFileItem?) {
        _uiState.update { it.copy(renameTarget = file) }
    }

    fun setFilePropertiesTarget(file: SftpFileItem?) {
        _uiState.update { it.copy(filePropertiesTarget = file) }
    }

    fun clearNotification() {
        _uiState.update { it.copy(notificationMessage = null) }
    }

    fun setPreview(preview: ActiveFilePreview?) {
        _uiState.update { it.copy(activePreview = preview) }
    }

    fun openFile(file: SftpFileItem) {
        if (file.isDirectory) {
            navigateToPath(file.fullPath)
            return
        }

        viewModelScope.launch {
            try {
                val result = engine.readFileContent(file)
                result.onSuccess { content ->
                    val lineCount = content.lines().size
                    val sizeFormatted = formatFileSize(file.sizeBytes)

                    _uiState.update {
                        it.copy(
                            activePreview = ActiveFilePreview(
                                fileName = file.name,
                                fullPath = file.fullPath,
                                content = content,
                                sizeFormatted = sizeFormatted,
                                lineCount = lineCount
                            )
                        )
                    }
                }.onFailure { error ->
                    _uiState.update {
                        it.copy(
                            activePreview = ActiveFilePreview(
                                fileName = file.name,
                                fullPath = file.fullPath,
                                content = "Error reading file: ${error.localizedMessage ?: error.message}",
                                sizeFormatted = formatFileSize(file.sizeBytes),
                                lineCount = 1
                            )
                        )
                    }
                }
            } catch (t: Throwable) {
                _uiState.update {
                    it.copy(
                        activePreview = ActiveFilePreview(
                            fileName = file.name,
                            fullPath = file.fullPath,
                            content = "Error reading file: ${t.localizedMessage ?: t.message}",
                            sizeFormatted = formatFileSize(file.sizeBytes),
                            lineCount = 1
                        )
                    )
                }
            }
        }
    }

    fun uploadFile(fileName: String, content: ByteArray) {
        viewModelScope.launch {
            val task = FileTransferTask(
                id = System.currentTimeMillis().toString(),
                fileName = fileName,
                isUpload = true,
                sizeFormatted = formatFileSize(content.size.toLong()),
                progressPercent = 50,
                speedFormatted = "Transmitting...",
                isCompleted = false
            )
            _uiState.update { it.copy(activeTransfers = listOf(task) + it.activeTransfers) }

            try {
                val res = engine.uploadFile(fileName, content, _uiState.value.currentPath)
                res.onSuccess {
                    _uiState.update { state ->
                        state.copy(
                            notificationMessage = "Uploaded $fileName",
                            activeTransfers = state.activeTransfers.map {
                                if (it.id == task.id) it.copy(progressPercent = 100, speedFormatted = "Uploaded", isCompleted = true) else it
                            }
                        )
                    }
                    loadDirectory(_uiState.value.currentPath)
                }.onFailure { error ->
                    _uiState.update { state ->
                        state.copy(
                            connectionError = "Upload failed: ${error.message}",
                            activeTransfers = state.activeTransfers.map {
                                if (it.id == task.id) it.copy(speedFormatted = "Failed: ${error.message}", isCompleted = true) else it
                            }
                        )
                    }
                }
            } catch (t: Throwable) {
                _uiState.update { state ->
                    state.copy(
                        connectionError = "Upload error: ${t.message}",
                        activeTransfers = state.activeTransfers.map {
                            if (it.id == task.id) it.copy(speedFormatted = "Failed: ${t.message}", isCompleted = true) else it
                        }
                    )
                }
            }
        }
    }

    fun downloadFile(file: SftpFileItem) {
        if (file.isDirectory) return
        viewModelScope.launch {
            val task = FileTransferTask(
                id = System.currentTimeMillis().toString(),
                fileName = file.name,
                isUpload = false,
                sizeFormatted = formatFileSize(file.sizeBytes),
                progressPercent = 40,
                speedFormatted = "Downloading...",
                isCompleted = false
            )
            _uiState.update { it.copy(activeTransfers = listOf(task) + it.activeTransfers) }

            try {
                val res = engine.downloadFileBytes(file)
                res.onSuccess { bytes ->
                    val downloadsDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
                    if (!downloadsDir.exists()) downloadsDir.mkdirs()
                    val targetFile = File(downloadsDir, file.name)
                    targetFile.writeBytes(bytes)

                    _uiState.update { state ->
                        state.copy(
                            notificationMessage = "Downloaded ${file.name} to Downloads",
                            activeTransfers = state.activeTransfers.map {
                                if (it.id == task.id) it.copy(
                                    progressPercent = 100,
                                    speedFormatted = "Saved (${formatFileSize(bytes.size.toLong())})",
                                    isCompleted = true
                                ) else it
                            }
                        )
                    }
                }.onFailure { err ->
                    _uiState.update { state ->
                        state.copy(
                            connectionError = "Download failed: ${err.message}",
                            activeTransfers = state.activeTransfers.map {
                                if (it.id == task.id) it.copy(speedFormatted = "Failed: ${err.message}", isCompleted = true) else it
                            }
                        )
                    }
                }
            } catch (t: Throwable) {
                _uiState.update { state ->
                    state.copy(
                        connectionError = "Download failed: ${t.message}",
                        activeTransfers = state.activeTransfers.map {
                            if (it.id == task.id) it.copy(speedFormatted = "Failed: ${t.message}", isCompleted = true) else it
                        }
                    )
                }
            }
        }
    }

    fun renameFile(file: SftpFileItem, newName: String) {
        val trimmed = newName.trim()
        if (trimmed.isEmpty() || trimmed == file.name) {
            _uiState.update { it.copy(renameTarget = null) }
            return
        }

        val parentPath = if (file.fullPath.contains('/')) file.fullPath.substringBeforeLast('/') else ""
        val newPath = if (parentPath.isEmpty() || parentPath == "/") "/$trimmed" else "$parentPath/$trimmed"

        viewModelScope.launch {
            try {
                val res = engine.renameFile(file.fullPath, newPath)
                res.onSuccess {
                    _uiState.update { it.copy(renameTarget = null, notificationMessage = "Renamed to $trimmed") }
                    loadDirectory(_uiState.value.currentPath)
                }.onFailure { err ->
                    _uiState.update { it.copy(connectionError = "Rename failed: ${err.message}") }
                }
            } catch (t: Throwable) {
                _uiState.update { it.copy(connectionError = "Rename failed: ${t.message}") }
            }
        }
    }

    fun createNewFile(fileName: String, content: String = "") {
        val trimmed = fileName.trim()
        if (trimmed.isEmpty()) return
        _uiState.update { it.copy(showCreateFileDialog = false) }
        uploadFile(trimmed, content.toByteArray(Charsets.UTF_8))
    }

    fun deleteFile(file: SftpFileItem) {
        viewModelScope.launch {
            try {
                val res = engine.deleteFile(file.fullPath, file.isDirectory)
                res.onSuccess {
                    _uiState.update { it.copy(notificationMessage = "Deleted ${file.name}") }
                    loadDirectory(_uiState.value.currentPath)
                }.onFailure { err ->
                    _uiState.update { it.copy(connectionError = "Delete failed: ${err.message}") }
                }
            } catch (t: Throwable) {
                _uiState.update { it.copy(connectionError = "Delete failed: ${t.message}") }
            }
        }
    }

    fun createFolder(folderName: String) {
        val trimmed = folderName.trim()
        if (trimmed.isEmpty()) return
        val current = _uiState.value.currentPath
        val newPath = if (current == "/") "/$trimmed" else "${current.trimEnd('/')}/$trimmed"

        viewModelScope.launch {
            try {
                val res = engine.createDirectory(newPath)
                res.onSuccess {
                    _uiState.update { it.copy(showCreateFolderDialog = false, notificationMessage = "Created folder $trimmed") }
                    loadDirectory(_uiState.value.currentPath)
                }.onFailure { err ->
                    _uiState.update { it.copy(connectionError = "Folder creation failed: ${err.message}") }
                }
            } catch (t: Throwable) {
                _uiState.update { it.copy(connectionError = "Folder creation failed: ${t.message}") }
            }
        }
    }

    fun refreshDirectory() {
        loadDirectory(_uiState.value.currentPath)
    }

    private fun loadDirectory(path: String) {
        viewModelScope.launch {
            try {
                val result = engine.listFiles(path)
                result.onSuccess { items ->
                    _uiState.update { state ->
                        val sortedItems = sortFiles(items, state.sortBy, state.sortAscending, state.foldersFirst)
                        val filtered = if (state.searchQuery.isBlank()) {
                            sortedItems
                        } else {
                            sortedItems.filter { f -> f.name.contains(state.searchQuery, ignoreCase = true) }
                        }
                        state.copy(
                            files = sortedItems,
                            filteredFiles = filtered
                        )
                    }
                }.onFailure { error ->
                    _uiState.update {
                        it.copy(
                            files = emptyList(),
                            filteredFiles = emptyList(),
                            connectionError = "Failed to list folder: ${error.localizedMessage ?: error.message}"
                        )
                    }
                }
            } catch (t: Throwable) {
                _uiState.update {
                    it.copy(
                        files = emptyList(),
                        filteredFiles = emptyList(),
                        connectionError = "Failed to list folder: ${t.localizedMessage ?: t.message}"
                    )
                }
            }
        }
    }

    private fun sortFiles(
        files: List<SftpFileItem>,
        sortBy: FileSortOption,
        ascending: Boolean,
        foldersFirst: Boolean
    ): List<SftpFileItem> {
        val comparator = Comparator<SftpFileItem> { a, b ->
            val res = when (sortBy) {
                FileSortOption.NAME -> a.name.compareTo(b.name, ignoreCase = true)
                FileSortOption.SIZE -> a.sizeBytes.compareTo(b.sizeBytes)
                FileSortOption.DATE -> a.lastModified.compareTo(b.lastModified)
                FileSortOption.TYPE -> a.extension.compareTo(b.extension, ignoreCase = true)
            }
            if (ascending) res else -res
        }

        return if (foldersFirst) {
            val dirs = files.filter { it.isDirectory }.sortedWith(comparator)
            val regular = files.filter { !it.isDirectory }.sortedWith(comparator)
            dirs + regular
        } else {
            files.sortedWith(comparator)
        }
    }

    private fun formatFileSize(bytes: Long): String {
        return when {
            bytes >= 1_048_576 -> String.format(java.util.Locale.US, "%.1f MB", bytes / 1_048_576.0)
            bytes >= 1024 -> String.format(java.util.Locale.US, "%.1f KB", bytes / 1024.0)
            else -> "$bytes B"
        }
    }

    override fun onCleared() {
        super.onCleared()
        engine.disconnect()
    }
}
