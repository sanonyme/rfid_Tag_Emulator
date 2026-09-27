package com.zeus.rfid.data.files

import kotlinx.serialization.Serializable

/**
 * 4 File Explorer protocols matching Zeus Desktop:
 * - SFTP: SSH to Edge hosts and Linux readers
 * - FTP: Classic FTP and FTPS file drops
 * - S3: Amazon AWS S3 storage buckets
 * - S3_COMPATIBLE: MinIO, Cloudflare R2, Wasabi, LocalStack
 */
@Serializable
enum class ExplorerProtocol(
    val id: String,
    val label: String,
    val shortLabel: String,
    val defaultPort: Int,
    val hint: String
) {
    SFTP("sftp", "SFTP", "SFTP", 22, "SSH file transfer to Edge hosts and Linux servers"),
    FTP("ftp", "FTP", "FTP", 21, "Classic FTP or FTPS file drops"),
    S3("s3", "Amazon S3", "S3", 443, "IAM keys, Amazon AWS S3 storage buckets"),
    S3_COMPATIBLE("s3compat", "S3-compatible", "S3-compat", 9000, "MinIO, Cloudflare R2, Wasabi, LocalStack")
}

/**
 * Persistent saved file explorer connection profile.
 */
@Serializable
data class SavedFileConnection(
    val id: String,
    val name: String,
    val protocol: ExplorerProtocol = ExplorerProtocol.SFTP,
    // SFTP / FTP fields
    val host: String = "192.168.1.100",
    val port: Int = 22,
    val username: String = "root",
    val password: String = "",
    val secureFtpMode: String = "OFF", // "OFF" (plain), "EXPLICIT" (FTPS), "IMPLICIT" (FTPS)
    // S3 & S3-Compatible fields
    val bucket: String = "",
    val region: String = "us-east-1",
    val accessKeyId: String = "",
    val secretAccessKey: String = "",
    val sessionToken: String = "",
    val endpoint: String = "", // e.g. "http://192.168.1.50:9000" for MinIO / S3-compat
    val rootPath: String = "/", // default directory or prefix
    val pinned: Boolean = false,
    val updatedAt: Long = System.currentTimeMillis()
) {
    /**
     * Resolves human-readable label matching Zeus Desktop format.
     */
    fun displayLabel(): String {
        return when (protocol) {
            ExplorerProtocol.SFTP -> {
                val p = if (port != 22) ":$port" else ""
                if (username.isNotBlank()) "$username@$host$p" else "$host$p"
            }
            ExplorerProtocol.FTP -> {
                val p = if (port != 21) ":$port" else ""
                val prefix = if (secureFtpMode != "OFF") "ftps://" else "ftp://"
                "$prefix$host$p"
            }
            ExplorerProtocol.S3 -> {
                val b = bucket.ifBlank { "bucket" }
                val p = rootPath.trim().trim('/')
                if (p.isNotBlank()) "s3://$b/$p" else "s3://$b"
            }
            ExplorerProtocol.S3_COMPATIBLE -> {
                val b = bucket.ifBlank { "bucket" }
                val ep = endpoint.removePrefix("http://").removePrefix("https://").substringBefore('/')
                "s3://$b ($ep)"
            }
        }
    }
}
