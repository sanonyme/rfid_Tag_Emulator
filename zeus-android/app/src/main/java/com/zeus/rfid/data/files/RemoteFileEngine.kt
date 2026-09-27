package com.zeus.rfid.data.files

import android.util.Xml
import com.jcraft.jsch.ChannelSftp
import com.jcraft.jsch.JSch
import com.jcraft.jsch.Session
import com.zeus.rfid.ui.files.SftpFileItem
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.apache.commons.net.ftp.FTP
import org.apache.commons.net.ftp.FTPClient
import org.apache.commons.net.ftp.FTPReply
import org.apache.commons.net.ftp.FTPSClient
import org.xmlpull.v1.XmlPullParser
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.Vector
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * 100% Real multi-protocol remote file transfer engine supporting:
 * - SFTP (via JSch ChannelSftp)
 * - FTP / FTPS (via Apache Commons Net FTPClient / FTPSClient)
 * - Amazon AWS S3 (REST API with SigV4)
 * - S3-Compatible object storage (MinIO, R2, Wasabi, LocalStack)
 *
 * NO fake demo data. Every action interacts directly with the remote endpoint.
 */
class RemoteFileEngine {

    private var sftpSession: Session? = null
    private var sftpChannel: ChannelSftp? = null

    private var ftpClient: FTPClient? = null

    var activeConnection: SavedFileConnection? = null
        private set

    var isConnected: Boolean = false
        private set

    /**
     * Connects to the real remote endpoint.
     * Throws an exception if the host is unreachable or credentials fail.
     */
    suspend fun connect(connection: SavedFileConnection): Result<Unit> = withContext(Dispatchers.IO) {
        disconnect()
        activeConnection = connection

        runCatching {
            when (connection.protocol) {
                ExplorerProtocol.SFTP -> connectSftp(connection)
                ExplorerProtocol.FTP -> connectFtp(connection)
                ExplorerProtocol.S3, ExplorerProtocol.S3_COMPATIBLE -> connectS3(connection)
            }
            isConnected = true
        }.onFailure {
            disconnect()
        }
    }

    private fun connectSftp(conn: SavedFileConnection) {
        val host = conn.host.trim()
        if (host.isBlank()) throw IllegalArgumentException("SFTP Host is required")
        val jsch = JSch()
        val user = conn.username.trim().ifBlank { "root" }
        val session = jsch.getSession(user, host, conn.port)
        if (conn.password.isNotBlank()) {
            session.setPassword(conn.password)
        }
        session.setConfig("StrictHostKeyChecking", "no")
        session.setConfig("PreferredAuthentications", "password,keyboard-interactive,publickey")
        session.connect(8000)
        val channel = session.openChannel("sftp") as ChannelSftp
        channel.connect(8000)
        sftpSession = session
        sftpChannel = channel
    }

    private fun connectFtp(conn: SavedFileConnection) {
        val host = conn.host.trim()
        if (host.isBlank()) throw IllegalArgumentException("FTP Host is required")
        val client = if (conn.secureFtpMode != "OFF") {
            FTPSClient(conn.secureFtpMode == "IMPLICIT")
        } else {
            FTPClient()
        }
        client.connectTimeout = 8000
        client.defaultTimeout = 8000
        client.connect(host, conn.port)
        val reply = client.replyCode
        if (!FTPReply.isPositiveCompletion(reply)) {
            client.disconnect()
            throw IllegalStateException("FTP server refused connection (Status $reply)")
        }
        if (conn.username.isNotBlank()) {
            val loggedIn = client.login(conn.username, conn.password)
            if (!loggedIn) {
                client.disconnect()
                throw IllegalStateException("FTP login failed for user ${conn.username}")
            }
        }
        client.enterLocalPassiveMode()
        client.setFileType(FTP.BINARY_FILE_TYPE)
        ftpClient = client
    }

    private fun connectS3(conn: SavedFileConnection) {
        val bucket = conn.bucket.trim()
        if (bucket.isBlank()) {
            throw IllegalArgumentException("Bucket name is required")
        }
        // Test connectivity to bucket
        val baseUrl = getS3BaseUrl(conn)
        val testUrl = "$baseUrl?list-type=2&max-keys=1"
        val request = URL(testUrl).openConnection() as HttpURLConnection
        request.connectTimeout = 5000
        request.readTimeout = 5000
        request.requestMethod = "GET"

        if (conn.accessKeyId.isNotBlank() && conn.secretAccessKey.isNotBlank()) {
            signS3Request(request, "GET", conn)
        }

        try {
            val responseCode = request.responseCode
            if (responseCode !in 200..299) {
                val errorMsg = request.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                throw IllegalStateException("S3 Error (HTTP $responseCode): ${errorMsg.take(200)}")
            }
        } finally {
            request.disconnect()
        }
    }

    fun disconnect() {
        try {
            sftpChannel?.disconnect()
            sftpSession?.disconnect()
        } catch (_: Throwable) {}
        sftpChannel = null
        sftpSession = null

        try {
            ftpClient?.logout()
            ftpClient?.disconnect()
        } catch (_: Throwable) {}
        ftpClient = null

        activeConnection = null
        isConnected = false
    }

    /**
     * Lists real files and folders at the given path or S3 prefix.
     */
    suspend fun listFiles(pathOrPrefix: String): Result<List<SftpFileItem>> = withContext(Dispatchers.IO) {
        val conn = activeConnection ?: return@withContext Result.failure(IllegalStateException("Not connected"))

        runCatching {
            when (conn.protocol) {
                ExplorerProtocol.SFTP -> listFilesSftp(pathOrPrefix)
                ExplorerProtocol.FTP -> listFilesFtp(pathOrPrefix)
                ExplorerProtocol.S3, ExplorerProtocol.S3_COMPATIBLE -> listFilesS3(conn, pathOrPrefix)
            }
        }
    }

    private fun listFilesSftp(path: String): List<SftpFileItem> {
        val channel = sftpChannel ?: throw IllegalStateException("SFTP channel is closed")
        val cleanPath = if (path.isBlank()) "/" else path
        val items = mutableListOf<SftpFileItem>()
        @Suppress("UNCHECKED_CAST")
        val entries = channel.ls(cleanPath) as Vector<ChannelSftp.LsEntry>
        val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US)

        for (entry in entries) {
            val name = entry.filename
            if (name == "." || name == "..") continue
            val isDir = entry.attrs.isDir
            val fullPath = if (cleanPath == "/") "/$name" else "${cleanPath.trimEnd('/')}/$name"
            val ext = if (isDir) "" else name.substringAfterLast('.', "")
            val mTime = dateFormat.format(Date(entry.attrs.mTime * 1000L))

            items.add(
                SftpFileItem(
                    name = name,
                    fullPath = fullPath,
                    isDirectory = isDir,
                    sizeBytes = entry.attrs.size,
                    lastModified = mTime,
                    permissions = entry.attrs.permissionsString,
                    extension = ext
                )
            )
        }
        return items.sortedWith(compareByDescending<SftpFileItem> { it.isDirectory }.thenBy { it.name.lowercase() })
    }

    private fun listFilesFtp(path: String): List<SftpFileItem> {
        val client = ftpClient ?: throw IllegalStateException("FTP client is closed")
        val cleanPath = if (path.isBlank()) "/" else path
        val files = client.listFiles(cleanPath)
        val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US)

        val items = files.mapNotNull { file ->
            val name = file.name
            if (name == "." || name == "..") return@mapNotNull null
            val isDir = file.isDirectory
            val fullPath = if (cleanPath == "/") "/$name" else "${cleanPath.trimEnd('/')}/$name"
            val ext = if (isDir) "" else name.substringAfterLast('.', "")
            val mTime = file.timestamp?.let { dateFormat.format(it.time) } ?: ""

            SftpFileItem(
                name = name,
                fullPath = fullPath,
                isDirectory = isDir,
                sizeBytes = file.size,
                lastModified = mTime,
                permissions = if (isDir) "drwxr-xr-x" else "-rw-r--r--",
                extension = ext
            )
        }
        return items.sortedWith(compareByDescending<SftpFileItem> { it.isDirectory }.thenBy { it.name.lowercase() })
    }

    private fun listFilesS3(conn: SavedFileConnection, prefix: String): List<SftpFileItem> {
        val cleanPrefix = prefix.trim().removePrefix("/").let { if (it.isNotBlank() && !it.endsWith("/")) "$it/" else it }
        val baseUrl = getS3BaseUrl(conn)
        val encodedPrefix = URLEncoder.encode(cleanPrefix, "UTF-8")
        val requestUrl = "$baseUrl?list-type=2&delimiter=/&prefix=$encodedPrefix"

        val connection = URL(requestUrl).openConnection() as HttpURLConnection
        connection.connectTimeout = 6000
        connection.readTimeout = 6000
        connection.requestMethod = "GET"

        if (conn.accessKeyId.isNotBlank() && conn.secretAccessKey.isNotBlank()) {
            signS3Request(connection, "GET", conn)
        }

        try {
            val code = connection.responseCode
            if (code !in 200..299) {
                val err = connection.errorStream?.bufferedReader()?.use { it.readText() } ?: ""
                throw IllegalStateException("S3 List Failed (HTTP $code): ${err.take(200)}")
            }

            return parseS3ListXml(connection.inputStream, cleanPrefix)
        } finally {
            connection.disconnect()
        }
    }

    private fun parseS3ListXml(input: InputStream, currentPrefix: String): List<SftpFileItem> {
        val items = mutableListOf<SftpFileItem>()
        val parser = Xml.newPullParser()
        parser.setInput(input, "UTF-8")

        var eventType = parser.eventType
        var currentTag = ""
        var insideCommonPrefixes = false
        var insideContents = false

        var key = ""
        var size: Long = 0
        var lastModified = ""

        while (eventType != XmlPullParser.END_DOCUMENT) {
            when (eventType) {
                XmlPullParser.START_TAG -> {
                    currentTag = parser.name
                    when (currentTag) {
                        "CommonPrefixes" -> insideCommonPrefixes = true
                        "Contents" -> {
                            insideContents = true
                            key = ""
                            size = 0
                            lastModified = ""
                        }
                    }
                }
                XmlPullParser.TEXT -> {
                    val text = parser.text.trim()
                    if (insideCommonPrefixes && currentTag == "Prefix" && text.isNotBlank()) {
                        val subfolder = text.removePrefix(currentPrefix).trimEnd('/')
                        if (subfolder.isNotBlank()) {
                            items.add(
                                SftpFileItem(
                                    name = subfolder,
                                    fullPath = text,
                                    isDirectory = true,
                                    childCount = 0
                                )
                            )
                        }
                    } else if (insideContents) {
                        when (currentTag) {
                            "Key" -> key = text
                            "Size" -> size = text.toLongOrNull() ?: 0L
                            "LastModified" -> lastModified = text.take(16).replace("T", " ")
                        }
                    }
                }
                XmlPullParser.END_TAG -> {
                    when (parser.name) {
                        "CommonPrefixes" -> insideCommonPrefixes = false
                        "Contents" -> {
                            insideContents = false
                            if (key.isNotBlank() && key != currentPrefix) {
                                val fileName = key.removePrefix(currentPrefix)
                                if (fileName.isNotBlank() && !fileName.contains('/')) {
                                    items.add(
                                        SftpFileItem(
                                            name = fileName,
                                            fullPath = key,
                                            isDirectory = false,
                                            sizeBytes = size,
                                            lastModified = lastModified,
                                            permissions = "STANDARD",
                                            extension = fileName.substringAfterLast('.', "")
                                        )
                                    )
                                }
                            }
                        }
                    }
                    currentTag = ""
                }
            }
            eventType = parser.next()
        }
        return items.sortedWith(compareByDescending<SftpFileItem> { it.isDirectory }.thenBy { it.name.lowercase() })
    }

    /**
     * Reads the real remote file content as UTF-8 string.
     */
    suspend fun readFileContent(file: SftpFileItem): Result<String> = withContext(Dispatchers.IO) {
        val conn = activeConnection ?: return@withContext Result.failure(IllegalStateException("Not connected"))

        runCatching {
            when (conn.protocol) {
                ExplorerProtocol.SFTP -> {
                    val channel = sftpChannel ?: throw IllegalStateException("SFTP not connected")
                    val out = ByteArrayOutputStream()
                    channel.get(file.fullPath, out)
                    out.toString(Charsets.UTF_8.name())
                }
                ExplorerProtocol.FTP -> {
                    val client = ftpClient ?: throw IllegalStateException("FTP not connected")
                    val out = ByteArrayOutputStream()
                    val ok = client.retrieveFile(file.fullPath, out)
                    if (!ok) throw IllegalStateException("Failed to read FTP file: ${file.name}")
                    out.toString(Charsets.UTF_8.name())
                }
                ExplorerProtocol.S3, ExplorerProtocol.S3_COMPATIBLE -> {
                    val baseUrl = getS3BaseUrl(conn)
                    val url = "$baseUrl/${file.fullPath.trimStart('/')}"
                    val connection = URL(url).openConnection() as HttpURLConnection
                    connection.connectTimeout = 6000
                    connection.readTimeout = 6000
                    connection.requestMethod = "GET"

                    if (conn.accessKeyId.isNotBlank() && conn.secretAccessKey.isNotBlank()) {
                        signS3Request(connection, "GET", conn)
                    }

                    try {
                        val code = connection.responseCode
                        if (code !in 200..299) {
                            throw IllegalStateException("S3 Read Error HTTP $code")
                        }
                        connection.inputStream.bufferedReader().use { it.readText() }
                    } finally {
                        connection.disconnect()
                    }
                }
            }
        }
    }

    /**
     * Uploads bytes to real remote path.
     */
    suspend fun uploadFile(fileName: String, content: ByteArray, targetDir: String): Result<Unit> = withContext(Dispatchers.IO) {
        val conn = activeConnection ?: return@withContext Result.failure(IllegalStateException("Not connected"))

        runCatching {
            when (conn.protocol) {
                ExplorerProtocol.SFTP -> {
                    val channel = sftpChannel ?: throw IllegalStateException("SFTP not connected")
                    val fullPath = if (targetDir == "/") "/$fileName" else "${targetDir.trimEnd('/')}/$fileName"
                    channel.put(ByteArrayInputStream(content), fullPath)
                }
                ExplorerProtocol.FTP -> {
                    val client = ftpClient ?: throw IllegalStateException("FTP not connected")
                    val fullPath = if (targetDir == "/") "/$fileName" else "${targetDir.trimEnd('/')}/$fileName"
                    val ok = client.storeFile(fullPath, ByteArrayInputStream(content))
                    if (!ok) throw IllegalStateException("Failed to upload file to FTP")
                }
                ExplorerProtocol.S3, ExplorerProtocol.S3_COMPATIBLE -> {
                    val cleanPrefix = targetDir.trim().removePrefix("/").let { if (it.isNotBlank() && !it.endsWith("/")) "$it/" else it }
                    val key = "$cleanPrefix$fileName"
                    val baseUrl = getS3BaseUrl(conn)
                    val url = "$baseUrl/$key"
                    val connection = URL(url).openConnection() as HttpURLConnection
                    connection.connectTimeout = 6000
                    connection.readTimeout = 6000
                    connection.requestMethod = "PUT"
                    connection.doOutput = true
                    connection.setFixedLengthStreamingMode(content.size)

                    if (conn.accessKeyId.isNotBlank() && conn.secretAccessKey.isNotBlank()) {
                        signS3Request(connection, "PUT", conn)
                    }

                    try {
                        connection.outputStream.use { it.write(content) }
                        val code = connection.responseCode
                        if (code !in 200..299) {
                            throw IllegalStateException("S3 Upload Failed HTTP $code")
                        }
                    } finally {
                        connection.disconnect()
                    }
                }
            }
        }
    }

    /**
     * Deletes a real remote file or directory.
     */
    suspend fun deleteFile(fullPath: String, isDirectory: Boolean): Result<Unit> = withContext(Dispatchers.IO) {
        val conn = activeConnection ?: return@withContext Result.failure(IllegalStateException("Not connected"))

        runCatching {
            when (conn.protocol) {
                ExplorerProtocol.SFTP -> {
                    val channel = sftpChannel ?: throw IllegalStateException("SFTP not connected")
                    if (isDirectory) channel.rmdir(fullPath) else channel.rm(fullPath)
                }
                ExplorerProtocol.FTP -> {
                    val client = ftpClient ?: throw IllegalStateException("FTP not connected")
                    val ok = if (isDirectory) client.removeDirectory(fullPath) else client.deleteFile(fullPath)
                    if (!ok) throw IllegalStateException("Failed to delete FTP ${if (isDirectory) "directory" else "file"}")
                }
                ExplorerProtocol.S3, ExplorerProtocol.S3_COMPATIBLE -> {
                    val baseUrl = getS3BaseUrl(conn)
                    val url = "$baseUrl/${fullPath.trimStart('/')}"
                    val connection = URL(url).openConnection() as HttpURLConnection
                    connection.connectTimeout = 6000
                    connection.readTimeout = 6000
                    connection.requestMethod = "DELETE"

                    if (conn.accessKeyId.isNotBlank() && conn.secretAccessKey.isNotBlank()) {
                        signS3Request(connection, "DELETE", conn)
                    }

                    try {
                        val code = connection.responseCode
                        if (code !in 200..299 && code != 204) {
                            throw IllegalStateException("S3 Delete Failed HTTP $code")
                        }
                    } finally {
                        connection.disconnect()
                    }
                }
            }
        }
    }

    /**
     * Creates a real directory or S3 folder marker.
     */
    suspend fun createDirectory(fullPath: String): Result<Unit> = withContext(Dispatchers.IO) {
        val conn = activeConnection ?: return@withContext Result.failure(IllegalStateException("Not connected"))

        runCatching {
            when (conn.protocol) {
                ExplorerProtocol.SFTP -> {
                    val channel = sftpChannel ?: throw IllegalStateException("SFTP not connected")
                    channel.mkdir(fullPath)
                }
                ExplorerProtocol.FTP -> {
                    val client = ftpClient ?: throw IllegalStateException("FTP not connected")
                    val ok = client.makeDirectory(fullPath)
                    if (!ok) throw IllegalStateException("Failed to create FTP directory")
                }
                ExplorerProtocol.S3, ExplorerProtocol.S3_COMPATIBLE -> {
                    // Create empty folder marker ending with /
                    val key = "${fullPath.trim().removePrefix("/").trimEnd('/')}/"
                    val baseUrl = getS3BaseUrl(conn)
                    val url = "$baseUrl/$key"
                    val connection = URL(url).openConnection() as HttpURLConnection
                    connection.connectTimeout = 6000
                    connection.readTimeout = 6000
                    connection.requestMethod = "PUT"
                    connection.doOutput = true
                    connection.setFixedLengthStreamingMode(0)

                    if (conn.accessKeyId.isNotBlank() && conn.secretAccessKey.isNotBlank()) {
                        signS3Request(connection, "PUT", conn)
                    }

                    try {
                        connection.outputStream.close()
                        val code = connection.responseCode
                        if (code !in 200..299) {
                            throw IllegalStateException("S3 Folder Creation Failed HTTP $code")
                        }
                    } finally {
                        connection.disconnect()
                    }
                }
            }
        }
    }

    /**
     * Downloads real remote file content as binary bytes.
     */
    suspend fun downloadFileBytes(file: SftpFileItem): Result<ByteArray> = withContext(Dispatchers.IO) {
        val conn = activeConnection ?: return@withContext Result.failure(IllegalStateException("Not connected"))

        runCatching {
            when (conn.protocol) {
                ExplorerProtocol.SFTP -> {
                    val channel = sftpChannel ?: throw IllegalStateException("SFTP not connected")
                    val out = ByteArrayOutputStream()
                    channel.get(file.fullPath, out)
                    out.toByteArray()
                }
                ExplorerProtocol.FTP -> {
                    val client = ftpClient ?: throw IllegalStateException("FTP not connected")
                    val out = ByteArrayOutputStream()
                    val ok = client.retrieveFile(file.fullPath, out)
                    if (!ok) throw IllegalStateException("Failed to download FTP file: ${file.name}")
                    out.toByteArray()
                }
                ExplorerProtocol.S3, ExplorerProtocol.S3_COMPATIBLE -> {
                    val baseUrl = getS3BaseUrl(conn)
                    val url = "$baseUrl/${file.fullPath.trimStart('/')}"
                    val connection = URL(url).openConnection() as HttpURLConnection
                    connection.connectTimeout = 10000
                    connection.readTimeout = 10000
                    connection.requestMethod = "GET"

                    if (conn.accessKeyId.isNotBlank() && conn.secretAccessKey.isNotBlank()) {
                        signS3Request(connection, "GET", conn)
                    }

                    try {
                        val code = connection.responseCode
                        if (code !in 200..299) {
                            throw IllegalStateException("S3 Download Error HTTP $code")
                        }
                        val out = ByteArrayOutputStream()
                        connection.inputStream.use { it.copyTo(out) }
                        out.toByteArray()
                    } finally {
                        connection.disconnect()
                    }
                }
            }
        }
    }

    /**
     * Renames a real remote file or directory.
     */
    suspend fun renameFile(oldPath: String, newPath: String): Result<Unit> = withContext(Dispatchers.IO) {
        val conn = activeConnection ?: return@withContext Result.failure(IllegalStateException("Not connected"))

        runCatching {
            when (conn.protocol) {
                ExplorerProtocol.SFTP -> {
                    val channel = sftpChannel ?: throw IllegalStateException("SFTP not connected")
                    channel.rename(oldPath, newPath)
                }
                ExplorerProtocol.FTP -> {
                    val client = ftpClient ?: throw IllegalStateException("FTP not connected")
                    val ok = client.rename(oldPath, newPath)
                    if (!ok) throw IllegalStateException("Failed to rename FTP file")
                }
                ExplorerProtocol.S3, ExplorerProtocol.S3_COMPATIBLE -> {
                    val baseUrl = getS3BaseUrl(conn)
                    val oldKey = oldPath.trim().removePrefix("/")
                    val newKey = newPath.trim().removePrefix("/")
                    val copyUrl = "$baseUrl/$newKey"
                    val copyConn = URL(copyUrl).openConnection() as HttpURLConnection
                    copyConn.connectTimeout = 8000
                    copyConn.readTimeout = 8000
                    copyConn.requestMethod = "PUT"
                    copyConn.setRequestProperty("x-amz-copy-source", "/${conn.bucket.trim()}/$oldKey")

                    if (conn.accessKeyId.isNotBlank() && conn.secretAccessKey.isNotBlank()) {
                        signS3Request(copyConn, "PUT", conn)
                    }

                    try {
                        val code = copyConn.responseCode
                        if (code !in 200..299) {
                            throw IllegalStateException("S3 Rename Failed HTTP $code")
                        }
                    } finally {
                        copyConn.disconnect()
                    }

                    // Delete old key
                    deleteFile(oldPath, false).getOrThrow()
                }
            }
        }
    }

    private fun getS3BaseUrl(conn: SavedFileConnection): String {
        return if (conn.protocol == ExplorerProtocol.S3_COMPATIBLE) {
            val endpoint = conn.endpoint.trim().trimEnd('/')
            "$endpoint/${conn.bucket.trim()}"
        } else {
            val region = conn.region.trim().ifBlank { "us-east-1" }
            "https://${conn.bucket.trim()}.s3.$region.amazonaws.com"
        }
    }

    /**
     * Signs HTTP request with standard AWS SigV4 authorization headers.
     */
    private fun signS3Request(conn: HttpURLConnection, method: String, config: SavedFileConnection, payloadSha256: String = "UNSIGNED-PAYLOAD") {
        val now = Date()
        val isoFormat = SimpleDateFormat("yyyyMMdd'T'HHmmss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val dateStampFormat = SimpleDateFormat("yyyyMMdd", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val amzDate = isoFormat.format(now)
        val dateStamp = dateStampFormat.format(now)
        val region = config.region.ifBlank { "us-east-1" }
        val service = "s3"

        val host = conn.url.host + if (conn.url.port != -1 && conn.url.port != 80 && conn.url.port != 443) ":${conn.url.port}" else ""
        conn.setRequestProperty("Host", host)
        conn.setRequestProperty("x-amz-date", amzDate)
        conn.setRequestProperty("x-amz-content-sha256", payloadSha256)
        if (config.sessionToken.isNotBlank()) {
            conn.setRequestProperty("x-amz-security-token", config.sessionToken)
        }

        val credentialScope = "$dateStamp/$region/$service/aws4_request"

        // Canonical Request
        val canonicalUri = conn.url.path.ifBlank { "/" }
        val canonicalQuery = (conn.url.query ?: "").split("&")
            .filter { it.isNotBlank() }
            .sorted()
            .joinToString("&")

        val signedHeaders = if (config.sessionToken.isNotBlank()) {
            "host;x-amz-content-sha256;x-amz-date;x-amz-security-token"
        } else {
            "host;x-amz-content-sha256;x-amz-date"
        }

        val canonicalHeaders = buildString {
            append("host:").append(host.trim()).append("\n")
            append("x-amz-content-sha256:").append(payloadSha256).append("\n")
            append("x-amz-date:").append(amzDate).append("\n")
            if (config.sessionToken.isNotBlank()) {
                append("x-amz-security-token:").append(config.sessionToken).append("\n")
            }
        }

        val canonicalRequest = "$method\n$canonicalUri\n$canonicalQuery\n$canonicalHeaders\n$signedHeaders\n$payloadSha256"
        val canonicalRequestHash = sha256Hex(canonicalRequest)

        val stringToSign = "AWS4-HMAC-SHA256\n$amzDate\n$credentialScope\n$canonicalRequestHash"

        // Calculate HMAC-SHA256 signature key
        val kSecret = ("AWS4" + config.secretAccessKey).toByteArray(Charsets.UTF_8)
        val kDate = hmacSha256(kSecret, dateStamp)
        val kRegion = hmacSha256(kDate, region)
        val kService = hmacSha256(kRegion, service)
        val kSigning = hmacSha256(kService, "aws4_request")

        val signature = hmacSha256(kSigning, stringToSign).joinToString("") { "%02x".format(it) }

        val authHeader = "AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/$credentialScope, SignedHeaders=$signedHeaders, Signature=$signature"
        conn.setRequestProperty("Authorization", authHeader)
    }

    private fun hmacSha256(key: ByteArray, data: String): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(data.toByteArray(Charsets.UTF_8))
    }

    private fun sha256Hex(data: String): String {
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(data.toByteArray(Charsets.UTF_8))
        return hash.joinToString("") { "%02x".format(it) }
    }
}
