package com.zeus.rfid.data.repository

import android.content.Context
import android.net.wifi.WifiManager
import android.util.Log
import com.zeus.rfid.data.model.DiscoveredServer
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.MulticastSocket
import java.net.NetworkInterface
import java.net.SocketException
import java.net.SocketTimeoutException

/**
 * Discovers Zeus Edge Servers by listening for UDP heartbeat broadcasts (CEdgeHeartBeatModel)
 * on port 7000 and sending UDP wake-up probes, matching the Zeus Desktop implementation.
 *
 * Uses [MulticastSocket] instead of [java.net.DatagramSocket] because it correctly
 * honours SO_REUSEADDR *before* bind on all Android versions, allowing the socket to
 * share port 7000 even if another app holds it, and enabling proper broadcast reception
 * on Android's Wi-Fi stack.
 */
class UdpEdgeDiscoveryRepository(
    private val context: Context,
    private val udpPort: Int = EdgeDiscoveryConfig.DEFAULT_UDP_PORT
) : DiscoveryRepository {

    companion object {
        private const val TAG = "UdpEdgeDiscovery"
        private const val BUFFER_SIZE = 8192
    }

    private val wifiManager =
        context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager

    override fun discoverServers(serviceType: String): Flow<DiscoveryEvent> = callbackFlow {
        Log.d(TAG, "Starting Edge Server UDP discovery on port $udpPort...")

        // Acquire MulticastLock — without this Android's Wi-Fi chipset silently drops
        // broadcast UDP packets at the firmware level on most devices.
        val multicastLock = wifiManager
            ?.createMulticastLock("ZeusUdpEdgeDiscovery")
            ?.apply { setReferenceCounted(false) }

        try {
            multicastLock?.acquire()
            Log.d(TAG, "MulticastLock acquired: ${multicastLock?.isHeld}")
        } catch (e: Exception) {
            Log.w(TAG, "Could not acquire MulticastLock: ${e.message}")
        }

        // MulticastSocket sets SO_REUSEADDR before bind automatically, which is required
        // for reliable port sharing on Android. Plain DatagramSocket(null) does NOT
        // guarantee this on all API levels.
        val socket = try {
            MulticastSocket(null).apply {
                reuseAddress = true           // must be set BEFORE bind()
                broadcast = true
                soTimeout = 1000             // 1-second read timeout keeps coroutines responsive
                bind(InetSocketAddress(udpPort))
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to bind UDP socket on port $udpPort", e)
            trySend(
                DiscoveryEvent.Error(
                    "Cannot open UDP port $udpPort for Edge discovery. " +
                        "Another app may be using it: ${e.localizedMessage}",
                    e
                )
            )
            multicastLock?.release()
            close()
            return@callbackFlow
        }

        trySend(DiscoveryEvent.Started)

        // Periodic probe: send a broadcast to port 7000 to prompt Edge devices that may
        // not be actively broadcasting to send a heartbeat reply.
        // The desktop does the same — it sends an empty payload to 255.255.255.255:localPort.
        val probeJob = launch(Dispatchers.IO) {
            val targets = getBroadcastAddresses()
            Log.d(TAG, "Probe targets: ${targets.map { it.hostAddress }}")
            while (isActive) {
                for (target in targets) {
                    sendProbe(socket, target, udpPort)
                }
                delay(EdgeDiscoveryConfig.PROBE_INTERVAL_MS)
            }
        }

        // Receive loop: block-read on background IO thread; 1-second timeout allows
        // cooperative cancellation via isActive check.
        val receiveJob = launch(Dispatchers.IO) {
            val buf = ByteArray(BUFFER_SIZE)
            val packet = DatagramPacket(buf, buf.size)

            while (isActive) {
                try {
                    socket.receive(packet)
                    val raw = String(packet.data, packet.offset, packet.length, Charsets.UTF_8)
                    val remoteIp = packet.address?.hostAddress ?: ""

                    Log.v(TAG, "Received ${packet.length} bytes from $remoteIp:${packet.port}")

                    val server = EdgeHeartbeatParser.parseHeartbeat(raw, remoteIp)
                    if (server != null) {
                        Log.i(TAG, "Edge Server found: ${server.name} @ ${server.host}:${server.port}")
                        trySend(DiscoveryEvent.ServerFound(server))
                    }
                } catch (_: SocketTimeoutException) {
                    // Expected — allows the while(isActive) check to run
                } catch (e: SocketException) {
                    if (!isActive || socket.isClosed) break
                    Log.w(TAG, "SocketException during receive: ${e.message}")
                } catch (e: CancellationException) {
                    break
                } catch (e: Exception) {
                    if (!isActive) break
                    Log.e(TAG, "Unexpected error processing UDP packet", e)
                }
            }
        }

        awaitClose {
            Log.d(TAG, "Stopping Edge Server UDP discovery")
            probeJob.cancel()
            receiveJob.cancel()

            try {
                if (!socket.isClosed) socket.close()
            } catch (e: Exception) {
                Log.w(TAG, "Error closing UDP socket: ${e.message}")
            }

            try {
                if (multicastLock?.isHeld == true) {
                    multicastLock.release()
                    Log.d(TAG, "MulticastLock released")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Error releasing MulticastLock: ${e.message}")
            }

            trySend(DiscoveryEvent.Completed)
        }
    }

    /**
     * Sends a short probe packet to [target]:[port] using the already-open [socket].
     * Edge devices that receive a probe on their heartbeat port will typically
     * immediately send a CEdgeHeartBeatModel reply.
     */
    private fun sendProbe(socket: MulticastSocket, target: InetAddress, port: Int) {
        try {
            // Single space — same minimal payload the desktop sends.
            val bytes = " ".toByteArray(Charsets.UTF_8)
            socket.send(DatagramPacket(bytes, bytes.size, target, port))
            Log.v(TAG, "Probe sent → ${target.hostAddress}:$port")
        } catch (e: Exception) {
            Log.v(TAG, "Probe failed → ${target.hostAddress}:$port — ${e.message}")
        }
    }

    /**
     * Returns the IPv4 broadcast address for every up, non-loopback network interface,
     * plus the generic 255.255.255.255 fallback.
     */
    private fun getBroadcastAddresses(): List<InetAddress> {
        val list = mutableListOf<InetAddress>()
        try {
            list.add(InetAddress.getByName(EdgeDiscoveryConfig.BROADCAST_IP))
            val ifaces = NetworkInterface.getNetworkInterfaces() ?: return list
            while (ifaces.hasMoreElements()) {
                val iface = ifaces.nextElement()
                if (iface.isLoopback || !iface.isUp) continue
                for (addr in iface.interfaceAddresses) {
                    val bc = addr.broadcast ?: continue
                    if (!list.contains(bc)) list.add(bc)
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Error enumerating broadcast addresses: ${e.message}")
        }
        return list
    }
}
