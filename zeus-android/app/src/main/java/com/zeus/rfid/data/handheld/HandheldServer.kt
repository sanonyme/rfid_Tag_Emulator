package com.zeus.rfid.data.handheld

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.OutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.nio.charset.StandardCharsets
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.UUID
import java.util.concurrent.CopyOnWriteArrayList

data class HandheldTagItem(
    val epc: String,
    val tid: String? = null,
    val userdata: String? = null
)

data class HandheldClient(
    val id: String = UUID.randomUUID().toString(),
    val address: String,
    val connectedAt: Long = System.currentTimeMillis()
)

object HandheldServer {

    private val serverScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var serverJob: Job? = null
    private var serverSocket: ServerSocket? = null

    private val activeClients = CopyOnWriteArrayList<Socket>()

    private val _isRunning = MutableStateFlow(false)
    val isRunning: StateFlow<Boolean> = _isRunning.asStateFlow()

    private val _currentPort = MutableStateFlow(10472)
    val currentPort: StateFlow<Int> = _currentPort.asStateFlow()

    private val _clients = MutableStateFlow<List<HandheldClient>>(emptyList())
    val clients: StateFlow<List<HandheldClient>> = _clients.asStateFlow()

    private val _clientConnectedEvents = MutableSharedFlow<HandheldClient>(extraBufferCapacity = 8)
    val clientConnectedEvents: SharedFlow<HandheldClient> = _clientConnectedEvents.asSharedFlow()

    @Volatile
    private var isSendCancelled = false

    private val dateFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)

    @Synchronized
    fun start(port: Int = 10472): Result<Unit> {
        if (_isRunning.value && serverSocket != null && !serverSocket!!.isClosed) {
            if (_currentPort.value == port) {
                return Result.success(Unit)
            } else {
                stop()
            }
        }

        return try {
            val socket = ServerSocket(port, 50, InetAddress.getByName("0.0.0.0"))
            socket.reuseAddress = true
            serverSocket = socket
            _currentPort.value = port
            _isRunning.value = true

            serverJob?.cancel()
            serverJob = serverScope.launch {
                listenForClients(socket)
            }

            Result.success(Unit)
        } catch (e: Exception) {
            _isRunning.value = false
            Result.failure(e)
        }
    }

    private suspend fun listenForClients(server: ServerSocket) = withContext(Dispatchers.IO) {
        while (_isRunning.value && !server.isClosed) {
            try {
                val client = server.accept()
                val clientAddr = "${client.inetAddress.hostAddress}:${client.port}"
                val clientInfo = HandheldClient(address = clientAddr)

                activeClients.add(client)
                updateClientsList()

                _clientConnectedEvents.emit(clientInfo)

                // Launch monitor coroutine for this client's lifetime
                serverScope.launch {
                    monitorClientConnection(client)
                }
            } catch (e: Exception) {
                if (!_isRunning.value || server.isClosed) break
            }
        }
    }

    private suspend fun monitorClientConnection(client: Socket) = withContext(Dispatchers.IO) {
        try {
            val input = client.getInputStream()
            val buffer = ByteArray(512)
            while (client.isConnected && !client.isClosed) {
                val read = input.read(buffer)
                if (read == -1) break
            }
        } catch (_: Exception) {
        } finally {
            activeClients.remove(client)
            try {
                client.close()
            } catch (_: Exception) {}
            updateClientsList()
        }
    }

    private fun updateClientsList() {
        _clients.value = activeClients.mapNotNull { socket ->
            if (socket.isConnected && !socket.isClosed) {
                HandheldClient(
                    address = "${socket.inetAddress.hostAddress}:${socket.port}"
                )
            } else null
        }
    }

    suspend fun sendTags(
        tags: List<HandheldTagItem>,
        delayMs: Long,
        rssi: Float = 70.0f,
        verboseProgress: Boolean = true,
        onProgress: (String) -> Unit,
        onComplete: (String) -> Unit
    ) = withContext(Dispatchers.IO) {
        if (!_isRunning.value || activeClients.isEmpty()) {
            onComplete("No handheld connected on port ${_currentPort.value}. Connect VSBL app first.")
            return@withContext
        }

        isSendCancelled = false
        val total = tags.size
        var sentCount = 0

        val deadSockets = mutableListOf<Socket>()

        try {
            for ((index, item) in tags.withIndex()) {
                if (isSendCancelled) {
                    onComplete("Stopped: Cancelled by user")
                    return@withContext
                }

                val nowString = synchronized(dateFormat) { dateFormat.format(Date()) }
                val json = HandheldWireFormat.format(item, nowString, rssi.toDouble())

                val bytes = json.toByteArray(StandardCharsets.UTF_8)

                // Broadcast to all active clients
                for (client in activeClients) {
                    try {
                        val out: OutputStream = client.getOutputStream()
                        out.write(bytes)
                        out.flush()
                    } catch (e: Exception) {
                        deadSockets.add(client)
                    }
                }

                // Cleanup dead sockets if any disconnected during send
                if (deadSockets.isNotEmpty()) {
                    activeClients.removeAll(deadSockets)
                    for (dead in deadSockets) {
                        try { dead.close() } catch (_: Exception) {}
                    }
                    deadSockets.clear()
                    updateClientsList()
                }

                if (activeClients.isEmpty()) {
                    onComplete("Send error: All handheld clients disconnected after $sentCount tag(s)")
                    return@withContext
                }
                sentCount++

                if (verboseProgress) {
                    onProgress("Sent ($sentCount/$total): ${item.epc} @rssi=$rssi dBm")
                }

                if (delayMs > 0 && index < total - 1) {
                    delay(delayMs)
                }
            }

            onComplete("Successfully broadcasted $sentCount tag(s) to ${_clients.value.size} handheld device(s)")
        } catch (e: Exception) {
            onComplete("Send error: ${e.message}")
        }
    }

    fun cancelSend() {
        isSendCancelled = true
    }

    @Synchronized
    fun stop() {
        _isRunning.value = false
        isSendCancelled = true

        for (client in activeClients) {
            try {
                client.close()
            } catch (_: Exception) {}
        }
        activeClients.clear()
        updateClientsList()

        try {
            serverSocket?.close()
        } catch (_: Exception) {}
        serverSocket = null

        serverJob?.cancel()
        serverJob = null
    }
}
