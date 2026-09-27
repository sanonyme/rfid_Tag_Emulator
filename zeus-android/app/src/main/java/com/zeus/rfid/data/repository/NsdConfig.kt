package com.zeus.rfid.data.repository

object NsdConfig {
    /**
     * The DNS-SD / mDNS service type to search for on the local network.
     * Change this constant to match your server's advertised service type
     * (e.g., "_example._tcp.", "_zeus._tcp.", "_http._tcp.").
     */
    const val SERVICE_TYPE = "_example._tcp."

    /**
     * Timeout in milliseconds for active network discovery search cycle.
     */
    const val DISCOVERY_TIMEOUT_MS = 10000L
}
