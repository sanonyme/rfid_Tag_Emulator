package com.zeus.rfid.data.repository

/**
 * Configuration constants for Edge Server discovery over UDP,
 * matching the Zeus Desktop UDP discovery protocol.
 */
object EdgeDiscoveryConfig {
    /**
     * UDP port where Edge servers broadcast CEdgeHeartBeatModel heartbeat packets.
     * Android listens on this port and also sends wake-up probes to it —
     * identical to the Zeus Desktop localPort (7000).
     */
    const val DEFAULT_UDP_PORT = 7000

    /**
     * Default TCP port for the Edge RFID service (used when the heartbeat
     * does not contain a Port property).
     */
    const val DEFAULT_EDGE_TCP_PORT = 12352

    /**
     * Standard IPv4 broadcast address for waking up devices on the local subnet.
     */
    const val BROADCAST_IP = "255.255.255.255"

    /**
     * Milliseconds before the scan times out and shows the "Nothing Found" state.
     */
    const val DISCOVERY_TIMEOUT_MS = 15000L

    /**
     * Milliseconds between consecutive UDP probe bursts while scanning.
     */
    const val PROBE_INTERVAL_MS = 3000L
}
