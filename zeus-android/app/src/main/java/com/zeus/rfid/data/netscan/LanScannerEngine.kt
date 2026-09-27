package com.zeus.rfid.data.netscan

import com.zeus.rfid.data.repository.EdgeHeartbeatParser
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.channelFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.launch
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.isActive
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.atomic.AtomicInteger

sealed interface ReaderScanEvent {
    data class Progress(val done: Int, val total: Int, val found: Int) : ReaderScanEvent
    data class Found(val reader: ReaderCandidate, val done: Int, val total: Int, val found: Int) : ReaderScanEvent
    data class Finished(val total: Int, val found: Int) : ReaderScanEvent
    data class Error(val message: String) : ReaderScanEvent
}

sealed interface PingScanEvent {
    data class HostResult(val row: PingScanRow, val done: Int, val total: Int, val aliveCount: Int) : PingScanEvent
    data class Finished(val total: Int, val aliveCount: Int) : PingScanEvent
    data class Error(val message: String) : PingScanEvent
}

sealed interface UdpDiscoveryEvent {
    data class DeviceFound(val device: EdgeDiscoveredDevice) : UdpDiscoveryEvent
    data class RawMessageReceived(val raw: RawUdpMessage) : UdpDiscoveryEvent
    data class Started(val port: Int) : UdpDiscoveryEvent
    data object Stopped : UdpDiscoveryEvent
    data class Error(val message: String) : UdpDiscoveryEvent
}

object LanScannerEngine {

    /**
     * Probes an IP list for RFID readers with bounded concurrency.
     */
    fun scanReaders(
        ips: List<String>,
        concurrency: Int = 48,
        timeoutMs: Int = 1200
    ): Flow<ReaderScanEvent> = channelFlow {
        if (ips.isEmpty()) {
            send(ReaderScanEvent.Error("No host IP addresses to scan."))
            return@channelFlow
        }

        val total = ips.size
        val doneCounter = AtomicInteger(0)
        val foundCounter = AtomicInteger(0)
        val semaphore = Semaphore(concurrency.coerceIn(1, 80))

        coroutineScope {
            for (ip in ips) {
                launch(Dispatchers.IO) {
                    semaphore.withPermit {
                        try {
                            val candidate = ReaderFingerprinter.probeHostForReader(ip, timeoutMs)
                            val done = doneCounter.incrementAndGet()
                            if (candidate != null) {
                                val found = foundCounter.incrementAndGet()
                                send(ReaderScanEvent.Found(candidate, done, total, found))
                            } else {
                                send(ReaderScanEvent.Progress(done, total, foundCounter.get()))
                            }
                        } catch (e: CancellationException) {
                            throw e
                        } catch (_: Throwable) {
                            val done = doneCounter.incrementAndGet()
                            send(ReaderScanEvent.Progress(done, total, foundCounter.get()))
                        }
                    }
                }
            }
        }

        send(ReaderScanEvent.Finished(total, foundCounter.get()))
    }.flowOn(Dispatchers.IO)

    /**
     * Ping sweep for alive hosts with ICMP + TCP fallback and reverse DNS lookup.
     */
    fun scanPing(
        ips: List<String>,
        concurrency: Int = 40,
        timeoutMs: Int = 1000
    ): Flow<PingScanEvent> = channelFlow {
        if (ips.isEmpty()) {
            send(PingScanEvent.Error("No host IP addresses to scan."))
            return@channelFlow
        }

        val total = ips.size
        val doneCounter = AtomicInteger(0)
        val aliveCounter = AtomicInteger(0)
        val semaphore = Semaphore(concurrency.coerceIn(1, 64))

        coroutineScope {
            for (ip in ips) {
                launch(Dispatchers.IO) {
                    semaphore.withPermit {
                        try {
                            val startNs = System.nanoTime()
                            val isAlive = checkHostAlive(ip, timeoutMs)
                            val elapsedMs = (System.nanoTime() - startNs) / 1_000_000

                            var hostname: String? = null
                            if (isAlive) {
                                try {
                                    val inet = InetAddress.getByName(ip)
                                    val canonical = inet.canonicalHostName
                                    if (canonical != ip) {
                                        hostname = canonical
                                    }
                                } catch (_: Throwable) {}
                            }

                            val done = doneCounter.incrementAndGet()
                            val aliveCount = if (isAlive) aliveCounter.incrementAndGet() else aliveCounter.get()

                            send(
                                PingScanEvent.HostResult(
                                    row = PingScanRow(
                                        ip = ip,
                                        alive = isAlive,
                                        hostname = hostname,
                                        responseTimeMs = if (isAlive) elapsedMs else null
                                    ),
                                    done = done,
                                    total = total,
                                    aliveCount = aliveCount
                                )
                            )
                        } catch (e: CancellationException) {
                            throw e
                        } catch (_: Throwable) {
                            val done = doneCounter.incrementAndGet()
                            send(
                                PingScanEvent.HostResult(
                                    row = PingScanRow(ip = ip, alive = false),
                                    done = done,
                                    total = total,
                                    aliveCount = aliveCounter.get()
                                )
                            )
                        }
                    }
                }
            }
        }

        send(PingScanEvent.Finished(total, aliveCounter.get()))
    }.flowOn(Dispatchers.IO)

    /**
     * Multi-stage alive check: ICMP reachable test + TCP connect probe to popular ports.
     */
    private fun checkHostAlive(ip: String, timeoutMs: Int): Boolean {
        // 1. Try InetAddress.isReachable
        try {
            val addr = InetAddress.getByName(ip)
            if (addr.isReachable(timeoutMs)) {
                return true
            }
        } catch (_: Throwable) {}

        // 2. Fallback to common alive ports (many devices block ICMP on LAN)
        val testPorts = intArrayOf(80, 443, 22, 5084, 8080, 23, 10001, 12352)
        val singlePortTimeout = (timeoutMs / 2).coerceIn(120, 400)
        for (port in testPorts) {
            try {
                Socket().use { socket ->
                    socket.connect(InetSocketAddress(ip, port), singlePortTimeout)
                    return true
                }
            } catch (_: Throwable) {}
        }

        return false
    }

    /**
     * Listens for UDP broadcasts on [port] (default 7000).
     * Emits discovered devices and raw packets.
     * Uses fallback socket binding to avoid dying on port collisions.
     */
    fun startUdpListener(port: Int): Flow<UdpDiscoveryEvent> = callbackFlow {
        var socket: java.net.DatagramSocket? = null
        try {
            // 1. Try MulticastSocket with reuseAddress
            socket = try {
                java.net.MulticastSocket(null).apply {
                    reuseAddress = true
                    broadcast = true
                    soTimeout = 1000
                    bind(InetSocketAddress(port))
                }
            } catch (_: Throwable) {
                // 2. Fallback to standard DatagramSocket with reuseAddress
                try {
                    java.net.DatagramSocket(null).apply {
                        reuseAddress = true
                        broadcast = true
                        soTimeout = 1000
                        bind(InetSocketAddress(port))
                    }
                } catch (_: Throwable) {
                    // 3. Fallback to any available ephemeral port so listener stays alive
                    java.net.DatagramSocket().apply {
                        broadcast = true
                        soTimeout = 1000
                    }
                }
            }

            trySend(UdpDiscoveryEvent.Started(port))

            // Periodic discovery probe: broadcast probe packet every 3s to wake up Edge servers
            val probeJob = launch(Dispatchers.IO) {
                val probeData = "HELLO ZEUS EDGE".toByteArray(Charsets.UTF_8)
                val broadcastAddr = InetAddress.getByName("255.255.255.255")
                val probePacket = DatagramPacket(probeData, probeData.size, broadcastAddr, port)
                while (isActive) {
                    try {
                        socket?.send(probePacket)
                    } catch (_: Throwable) {}
                    delay(3000)
                }
            }

            val buffer = ByteArray(8192)
            while (currentCoroutineContext().isActive) {
                val packet = DatagramPacket(buffer, buffer.size)
                try {
                    socket?.receive(packet) ?: break
                } catch (_: java.net.SocketTimeoutException) {
                    continue
                } catch (e: java.net.SocketException) {
                    if (!currentCoroutineContext().isActive) break
                    break
                }

                val payload = String(packet.data, 0, packet.length, Charsets.UTF_8)
                val senderIp = packet.address.hostAddress ?: ""
                val senderPort = packet.port

                trySend(
                    UdpDiscoveryEvent.RawMessageReceived(
                        RawUdpMessage(
                            data = payload,
                            from = senderIp,
                            fromPort = senderPort
                        )
                    )
                )

                // Try parsing Edge Heartbeat
                val server = EdgeHeartbeatParser.parseHeartbeat(payload, senderIp)
                if (server != null) {
                    val device = EdgeDiscoveredDevice(
                        ip = server.host,
                        port = server.port,
                        guid = server.attributes["guid"] ?: server.id,
                        mac = server.attributes["mac"] ?: "",
                        version = server.attributes["version"] ?: "",
                        lastPDUpdate = server.attributes["lastPDUpdate"] ?: "",
                        errors = server.attributes["errors"] ?: "",
                        name = server.name,
                        raw = payload
                    )
                    trySend(UdpDiscoveryEvent.DeviceFound(device))
                }
            }
            probeJob.cancel()
        } catch (_: CancellationException) {
            // Normal coroutine cancellation
        } catch (e: Throwable) {
            if (currentCoroutineContext().isActive) {
                trySend(UdpDiscoveryEvent.Error(e.message ?: "UDP socket error"))
            }
        } finally {
            try { socket?.close() } catch (_: Throwable) {}
            trySend(UdpDiscoveryEvent.Stopped)
        }

        awaitClose {
            try { socket?.close() } catch (_: Throwable) {}
        }
    }.flowOn(Dispatchers.IO)

    /**
     * Sends a UDP probe packet to target IP and port.
     */
    suspend fun sendUdpProbe(targetIp: String, port: Int, message: String): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            DatagramSocket().use { socket ->
                socket.broadcast = true
                val data = message.toByteArray(Charsets.UTF_8)
                val packet = DatagramPacket(data, data.size, InetAddress.getByName(targetIp.trim()), port)
                socket.send(packet)
            }
        }
    }
}
