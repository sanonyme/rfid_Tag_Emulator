package com.zeus.rfid.ui.files

import com.zeus.rfid.data.files.ExplorerProtocol
import com.zeus.rfid.data.files.SavedFileConnection

/**
 * Storage backend type: Remote Explorer or Local Device Storage.
 */
enum class StorageSource(val label: String) {
    SFTP("Remote SFTP"),
    FTP("Remote FTP"),
    S3("Amazon S3"),
    S3_COMPAT("S3-Compatible"),
    LOCAL("Local Storage")
}

/**
 * Legacy compatibility alias for SftpConnectionConfig.
 */
data class SftpConnectionConfig(
    val host: String = "192.168.1.100",
    val port: Int = 22,
    val username: String = "root",
    val password: String = "",
    val rootPath: String = "/",
    val serverBanner: String = ""
)

/**
 * Active or recent file transfer task (upload / download across SFTP/FTP/S3).
 */
data class FileTransferTask(
    val id: String,
    val fileName: String,
    val isUpload: Boolean,
    val sizeFormatted: String,
    val progressPercent: Int,
    val speedFormatted: String,
    val isCompleted: Boolean = false
)

/**
 * Represents a remote or local file or directory item.
 */
data class SftpFileItem(
    val name: String,
    val fullPath: String,
    val isDirectory: Boolean,
    val sizeBytes: Long = 0,
    val lastModified: String = "",
    val permissions: String = "",
    val extension: String = "",
    val childCount: Int = 0
)

/**
 * Active file preview modal state with real content.
 */
data class ActiveFilePreview(
    val fileName: String,
    val fullPath: String,
    val content: String,
    val sizeFormatted: String,
    val lineCount: Int,
    val isEditable: Boolean = false,
    val isLocal: Boolean = false
)

/**
 * Sorting criteria for remote files (matches Zeus Electron SftpToolbar).
 */
enum class FileSortOption(val label: String) {
    NAME("Name"),
    SIZE("Size"),
    DATE("Date"),
    TYPE("Type")
}
