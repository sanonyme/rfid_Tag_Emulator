package com.zeus.rfid.data.ocr

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedWriter
import java.io.OutputStreamWriter
import java.net.InetSocketAddress
import java.net.Socket
import java.nio.charset.StandardCharsets

/**
 * Result of an OCR / Barcode transmission over TCP.
 */
sealed interface OcrSendResult {
    data class Success(val host: String, val port: Int, val bytesSent: Int, val payload: String) : OcrSendResult
    data class Error(val message: String, val cause: Throwable? = null) : OcrSendResult
}

/**
 * TCP Socket Client for delivering OCR and Barcode payloads to the reader / Edge host,
 * mirroring the Zeus Desktop and Legacy Java EmulatorUI socket behavior.
 */
object OcrSocketClient {

    private const val TAG = "OcrSocketClient"
    const val DEFAULT_OCR_PORT = 10482
    const val DEFAULT_TIMEOUT_MS = 5000

    /**
     * Connects to [host]:[port] via TCP, sends [payload] (with trailing newline),
     * flushes, and closes the connection.
     */
    suspend fun sendPayload(
        host: String,
        port: Int = DEFAULT_OCR_PORT,
        payload: String,
        timeoutMs: Int = DEFAULT_TIMEOUT_MS
    ): OcrSendResult = withContext(Dispatchers.IO) {
        val trimmedHost = host.trim()
        if (trimmedHost.isBlank()) {
            return@withContext OcrSendResult.Error("Target host is empty. Please specify a valid IP or hostname.")
        }
        if (port !in 1..65535) {
            return@withContext OcrSendResult.Error("Invalid port number: $port. Must be between 1 and 65535.")
        }
        if (payload.isBlank()) {
            return@withContext OcrSendResult.Error("Payload is empty.")
        }

        val socket = Socket()
        try {
            Log.d(TAG, "Connecting to $trimmedHost:$port (timeout: ${timeoutMs}ms)...")
            socket.connect(InetSocketAddress(trimmedHost, port), timeoutMs)
            socket.soTimeout = timeoutMs

            val writer = BufferedWriter(OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8))
            val messageToSend = if (payload.endsWith("\n")) payload else "$payload\n"
            writer.write(messageToSend)
            writer.flush()

            val bytes = messageToSend.toByteArray(StandardCharsets.UTF_8).size
            Log.d(TAG, "Successfully sent $bytes bytes to $trimmedHost:$port")
            OcrSendResult.Success(
                host = trimmedHost,
                port = port,
                bytesSent = bytes,
                payload = payload
            )
        } catch (e: Exception) {
            Log.e(TAG, "Failed to send OCR payload to $trimmedHost:$port: ${e.message}", e)
            OcrSendResult.Error(
                message = e.localizedMessage ?: "Failed to connect or send data to $trimmedHost:$port",
                cause = e
            )
        } finally {
            try {
                socket.close()
            } catch (_: Throwable) {}
        }
    }
}
