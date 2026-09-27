package com.zeus.rfid.data.ocr

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.BufferedReader
import java.io.InputStreamReader
import java.net.ServerSocket

class OcrSocketClientTest {

    @Test
    fun sendPayload_deliversPayloadWithNewline_toLocalServerSocket() = runBlocking {
        val serverSocket = ServerSocket(0)
        val port = serverSocket.localPort

        var receivedMessage: String? = null

        val serverJob = launch(Dispatchers.IO) {
            val socket = serverSocket.accept()
            val reader = BufferedReader(InputStreamReader(socket.getInputStream(), Charsets.UTF_8))
            receivedMessage = reader.readLine()
            socket.close()
            serverSocket.close()
        }

        val testPayload = """{"00":1,"01":1,"02":"2/2","03":"02026040800057"}"""
        val result = OcrSocketClient.sendPayload(
            host = "127.0.0.1",
            port = port,
            payload = testPayload,
            timeoutMs = 3000
        )

        serverJob.join()

        assertTrue("Expected socket send to succeed, got: $result", result is OcrSendResult.Success)
        val success = result as OcrSendResult.Success
        assertEquals("127.0.0.1", success.host)
        assertEquals(port, success.port)
        assertEquals("Server should receive exact payload", testPayload, receivedMessage)
    }

    @Test
    fun sendPayload_toClosedPort_returnsError() = runBlocking {
        val tempSocket = ServerSocket(0)
        val unusedPort = tempSocket.localPort
        tempSocket.close()

        val result = OcrSocketClient.sendPayload(
            host = "127.0.0.1",
            port = unusedPort,
            payload = "sample_barcode",
            timeoutMs = 500
        )

        assertTrue("Expected error on closed port, got: $result", result is OcrSendResult.Error)
    }

    @Test
    fun sendPayload_withEmptyHostOrPayload_validatesLocallyWithoutConnecting() = runBlocking {
        val resultEmptyHost = OcrSocketClient.sendPayload(
            host = "",
            port = 10482,
            payload = "12345"
        )
        assertTrue(resultEmptyHost is OcrSendResult.Error)

        val resultEmptyPayload = OcrSocketClient.sendPayload(
            host = "127.0.0.1",
            port = 10482,
            payload = ""
        )
        assertTrue(resultEmptyPayload is OcrSendResult.Error)
    }
}
