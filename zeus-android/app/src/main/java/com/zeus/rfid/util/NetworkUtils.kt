package com.zeus.rfid.util

import java.net.Inet4Address
import java.net.NetworkInterface
import java.util.Collections

object NetworkUtils {

    /**
     * Finds the device's local Wi-Fi / LAN IPv4 address.
     * Prioritizes active wireless interfaces (wlan, ap, eth) and filters out loopback.
     */
    fun getLocalIpAddress(): String {
        try {
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())

            // Pass 1: Look for wireless or ethernet interfaces (wlan0, eth0, etc.)
            for (intf in interfaces) {
                if (!intf.isUp || intf.isLoopback) continue
                val name = intf.name.lowercase()
                if (name.contains("wlan") || name.contains("ap") || name.contains("eth") || name.contains("en")) {
                    for (addr in Collections.list(intf.inetAddresses)) {
                        if (!addr.isLoopbackAddress && addr is Inet4Address) {
                            val ip = addr.hostAddress
                            if (!ip.isNullOrBlank() && !ip.startsWith("127.")) {
                                return ip
                            }
                        }
                    }
                }
            }

            // Pass 2: Fallback to any active non-loopback IPv4 interface
            for (intf in interfaces) {
                if (!intf.isUp || intf.isLoopback) continue
                for (addr in Collections.list(intf.inetAddresses)) {
                    if (!addr.isLoopbackAddress && addr is Inet4Address) {
                        val ip = addr.hostAddress
                        if (!ip.isNullOrBlank() && !ip.startsWith("127.")) {
                            return ip
                        }
                    }
                }
            }
        } catch (_: Exception) {}

        return "127.0.0.1"
    }
}
