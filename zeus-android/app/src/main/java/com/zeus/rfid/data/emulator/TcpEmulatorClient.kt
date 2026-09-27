package com.zeus.rfid.data.emulator

import com.zeus.rfid.data.model.TagData
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.charset.StandardCharsets

class TcpEmulatorClient {

    private var socket: Socket? = null
    private var outputStream: OutputStream? = null

    @Volatile
    private var isConnected: Boolean = false

    @Volatile
    private var isCancelled: Boolean = false

    suspend fun connect(host: String, port: Int, timeoutMs: Int = 5000): Result<Unit> = withContext(Dispatchers.IO) {
        try {
            disconnect()
            val sock = Socket()
            sock.connect(InetSocketAddress(host, port), timeoutMs.coerceAtLeast(1000))
            socket = sock
            outputStream = sock.getOutputStream()
            isConnected = true
            isCancelled = false
            Result.success(Unit)
        } catch (e: Exception) {
            isConnected = false
            Result.failure(e)
        }
    }

    suspend fun disconnect() = withContext(Dispatchers.IO) {
        isConnected = false
        isCancelled = true
        try {
            outputStream?.close()
        } catch (_: Exception) {}
        try {
            socket?.close()
        } catch (_: Exception) {}
        outputStream = null
        socket = null
    }

    suspend fun sendTags(
        host: String,
        port: Int,
        tags: List<TagData>,
        driverCode: String,
        delayMs: Long,
        timeoutMs: Int = 5000,
        onProgress: (message: String) -> Unit,
        onComplete: (message: String) -> Unit
    ) = withContext(Dispatchers.IO) {
        isCancelled = false

        // Ensure connected
        if (socket == null || socket?.isConnected != true || socket?.isClosed == true) {
            val connectResult = connect(host, port, timeoutMs)
            if (connectResult.isFailure) {
                val err = connectResult.exceptionOrNull()?.message ?: "Unknown error"
                onComplete("Connection to $host:$port failed: $err")
                return@withContext
            }
        }

        val out = outputStream
        if (out == null) {
            onComplete("Error: Socket stream not available")
            return@withContext
        }

        val total = tags.size
        var sentCount = 0

        try {
            for (tag in tags) {
                if (isCancelled) {
                    onComplete("Stopped: Cancelled by user")
                    return@withContext
                }

                val message = tag.formatMessage(driverCode)
                out.write(message.toByteArray(StandardCharsets.UTF_8))
                out.flush()
                sentCount++

                onProgress("Sent ($sentCount/$total): ${tag.epc} @rssi=${tag.rssi}")

                if (delayMs > 0 && sentCount < total) {
                    delay(delayMs)
                }
            }
            onComplete("Successfully sent $sentCount tag(s)")
        } catch (e: Exception) {
            isConnected = false
            onComplete("Send error: ${e.message}")
        }
    }

    fun cancelSend() {
        isCancelled = true
    }

    fun isConnected(): Boolean {
        return isConnected && socket?.isConnected == true && socket?.isClosed == false
    }
}
