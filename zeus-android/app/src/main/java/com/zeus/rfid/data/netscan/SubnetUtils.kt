package com.zeus.rfid.data.netscan

import java.net.Inet4Address
import java.net.NetworkInterface
import kotlin.math.max
import kotlin.math.min

object SubnetUtils {

    const val MAX_HOSTS = 4094

    fun ipv4ToLong(ip: String): Long? {
        val parts = ip.trim().split(".")
        if (parts.size != 4) return null
        var result = 0L
        for (part in parts) {
            val octet = part.toIntOrNull() ?: return null
            if (octet !in 0..255) return null
            result = (result shl 8) or octet.toLong()
        }
        return result and 0xFFFFFFFFL
    }

    fun longToIpv4(value: Long): String {
        return "${(value shr 24) and 0xFF}.${(value shr 16) and 0xFF}.${(value shr 8) and 0xFF}.${value and 0xFF}"
    }

    /**
     * Parse CIDR notation (e.g. "192.168.1.0/24") and return all usable host IPs.
     */
    fun enumerateCidr(cidrInput: String): List<String>? {
        val match = Regex("""^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/(\d{1,2})$""").find(cidrInput.trim()) ?: return null
        val ipStr = match.groupValues[1]
        val prefix = match.groupValues[2].toIntOrNull() ?: return null

        if (prefix !in 8..30) return null
        val ipLong = ipv4ToLong(ipStr) ?: return null

        val mask = (0xFFFFFFFFL shl (32 - prefix)) and 0xFFFFFFFFL
        val networkLong = ipLong and mask
        val hostBits = 32 - prefix
        val hostCount = (1L shl hostBits) - 2

        if (hostCount < 1 || hostCount > MAX_HOSTS) return null

        val ips = ArrayList<String>(hostCount.toInt())
        for (i in 1..hostCount) {
            ips.add(longToIpv4(networkLong + i))
        }
        return ips
    }

    /**
     * Compute usable host start and end bounds from a network CIDR.
     */
    fun cidrHostBounds(networkCidr: String): Pair<String, String>? {
        val match = Regex("""^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/(\d{1,2})$""").find(networkCidr.trim()) ?: return null
        val ipStr = match.groupValues[1]
        val prefix = match.groupValues[2].toIntOrNull() ?: return null
        if (prefix !in 8..30) return null
        val ipLong = ipv4ToLong(ipStr) ?: return null

        val mask = (0xFFFFFFFFL shl (32 - prefix)) and 0xFFFFFFFFL
        val networkLong = ipLong and mask
        val hostBits = 32 - prefix
        val hostCount = (1L shl hostBits) - 2
        if (hostCount < 1) return null

        return Pair(longToIpv4(networkLong + 1), longToIpv4(networkLong + hostCount))
    }

    /**
     * Inclusive IPv4 range (order of start and end does not matter).
     */
    fun enumerateIpRange(startIp: String, endIp: String): List<String>? {
        val startLong = ipv4ToLong(startIp) ?: return null
        val endLong = ipv4ToLong(endIp) ?: return null

        val lo = min(startLong, endLong)
        val hi = max(startLong, endLong)
        val count = hi - lo + 1

        if (count < 1 || count > MAX_HOSTS) return null

        val ips = ArrayList<String>(count.toInt())
        for (current in lo..hi) {
            ips.add(longToIpv4(current))
        }
        return ips
    }

    /**
     * Enumerate all non-loopback active IPv4 network interfaces on the device.
     */
    fun getIpv4Interfaces(): List<NetInterfaceInfo> {
        val result = mutableListOf<NetInterfaceInfo>()
        try {
            val interfaces = NetworkInterface.getNetworkInterfaces() ?: return emptyList()
            for (iface in interfaces) {
                if (iface.isLoopback || !iface.isUp) continue

                for (addr in iface.interfaceAddresses) {
                    val ip = addr.address
                    if (ip is Inet4Address && !ip.isLoopbackAddress) {
                        val prefix = addr.networkPrefixLength.toInt()
                        if (prefix in 8..30) {
                            val ipLong = ipv4ToLong(ip.hostAddress ?: "") ?: continue
                            val mask = (0xFFFFFFFFL shl (32 - prefix)) and 0xFFFFFFFFL
                            val networkLong = ipLong and mask
                            val hostBits = 32 - prefix
                            val hostCount = ((1L shl hostBits) - 2).coerceAtLeast(0)

                            val networkCidr = "${longToIpv4(networkLong)}/$prefix"
                            val startIp = longToIpv4(networkLong + 1)
                            val endIp = longToIpv4(networkLong + hostCount)

                            result.add(
                                NetInterfaceInfo(
                                    name = iface.displayName ?: iface.name,
                                    address = ip.hostAddress ?: "",
                                    netmask = longToIpv4(mask),
                                    cidr = prefix,
                                    networkCidr = networkCidr,
                                    startIp = startIp,
                                    endIp = endIp,
                                    hostCount = hostCount.toInt()
                                )
                            )
                        }
                    }
                }
            }
        } catch (_: Throwable) {
            // Ignore socket/network enumeration failures
        }
        return result
    }

    /**
     * Merges all detected local IPv4 subnets into a single deduplicated list of IPs.
     */
    fun enumerateAllLocalSubnetsMerged(): List<String>? {
        val ifaces = getIpv4Interfaces()
        if (ifaces.isEmpty()) return null

        val allIps = LinkedHashSet<String>()
        for (iface in ifaces) {
            val ips = enumerateCidr(iface.networkCidr) ?: continue
            allIps.addAll(ips)
            if (allIps.size > MAX_HOSTS) return null
        }

        return if (allIps.isEmpty()) null else allIps.toList()
    }
}
