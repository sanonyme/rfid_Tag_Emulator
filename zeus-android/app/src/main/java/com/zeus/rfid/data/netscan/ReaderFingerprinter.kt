package com.zeus.rfid.data.netscan

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStream
import java.net.InetSocketAddress
import java.net.Socket
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.Locale
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

object ReaderFingerprinter {

    val PROBE_PORTS = listOf(5084, 5085, 80, 443, 23, 10001, 14150)

    private val LLRP_GET_CAPABILITIES = byteArrayOf(
        0x04.toByte(), 0x01.toByte(),
        0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x0B.toByte(),
        0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x01.toByte(),
        0x00.toByte()
    )

    private val PEN_MAP = mapOf(
        25882 to ReaderVendor.IMPINJ,
        161 to ReaderVendor.ZEBRA,
        388 to ReaderVendor.ZEBRA,
        17996 to ReaderVendor.ALIEN,
        14958 to ReaderVendor.THINGMAGIC,
        10789 to ReaderVendor.CAEN,
        20232 to ReaderVendor.NORDIC_ID,
        1571 to ReaderVendor.HONEYWELL,
        10617 to ReaderVendor.FEIG,
        9525 to ReaderVendor.KATHREIN,
        26554 to ReaderVendor.CSL,
        34750 to ReaderVendor.INVENGO
    )

    private data class VendorRule(
        val vendor: ReaderVendor,
        val keywords: List<String>
    )

    private val VENDOR_RULES = listOf(
        VendorRule(
            ReaderVendor.IMPINJ,
            listOf("impinj", "speedway", "octane", "r700", "r720", "r420", "r120", "xarray", "xspan", "xportal", "itemsense")
        ),
        VendorRule(
            ReaderVendor.ZEBRA,
            listOf("zebra technologies", "zebra rfid", "motorola solutions", "symbol technologies", "fx7500", "fx9500", "fx9600", "fx7400", "atr7000", "rfd8500", "rfd40", "rfd90", "mc3300r", "mc3390r")
        ),
        VendorRule(
            ReaderVendor.ALIEN,
            listOf("alien technology", "alien rfid", "alr-9900", "alr-9680", "alr-9650", "alr-f800", "alr-h450", "alr9900", "alrh450")
        ),
        VendorRule(
            ReaderVendor.THINGMAGIC,
            listOf("thingmagic", "jadak", "mercury6", "mercuryapi", "sargas", "izar", "astra-ex", "astra ex", "m6e", "m7e")
        ),
        VendorRule(
            ReaderVendor.CAEN,
            listOf("caen rfid", "caenrfid", "hadron", "ion rfid", "proton rfid", "quark", "muon")
        ),
        VendorRule(
            ReaderVendor.NORDIC_ID,
            listOf("nordic id", "nordicid", "sampo s2", "sampo s3", "nordic-id")
        ),
        VendorRule(
            ReaderVendor.HONEYWELL,
            listOf("honeywell rfid", "intermec", "if2", "if5", "if30", "if61")
        ),
        VendorRule(
            ReaderVendor.SICK,
            listOf("sick ag", "sick rfid", "rfu620", "rfu630", "rfu65", "rfh620", "rfh6")
        ),
        VendorRule(
            ReaderVendor.FEIG,
            listOf("feig electronic", "feig", "obid", "id isc", "isc.lru", "isc.mru", "id cpr", "idisc")
        ),
        VendorRule(
            ReaderVendor.KATHREIN,
            listOf("kathrein", "aru 2400", "aru 3500", "aru 2560", "kathrein solutions")
        ),
        VendorRule(
            ReaderVendor.CSL,
            listOf("convergence systems", "csl rfid", "cs203", "cs463", "cs468", "cs108", "cs710s")
        ),
        VendorRule(
            ReaderVendor.INVENGO,
            listOf("invengo", "xc-rf8", "xc-af1", "xcra", "xc-af")
        ),
        VendorRule(
            ReaderVendor.NEDAP,
            listOf("nedap", "upass", "transit standard", "transit ultimate", "transit entry")
        ),
        VendorRule(
            ReaderVendor.TURCK,
            listOf("turck", "tn-uhf", "tn-q", "bl ident")
        ),
        VendorRule(
            ReaderVendor.BALLUFF,
            listOf("balluff", "bis v", "bis u", "bis m")
        ),
        VendorRule(
            ReaderVendor.SEUIC,
            listOf("seuic", "autoid", "uf3", "uf40", "uf42", "uf31")
        ),
        VendorRule(
            ReaderVendor.SIEMENS,
            listOf("simatic rf", "siemens rfid", "simatic rf600", "simatic rf200")
        ),
        VendorRule(
            ReaderVendor.CHAINWAY,
            listOf("chainway", "urx", "ur4", "uhf reader chainway")
        ),
        VendorRule(
            ReaderVendor.BLUEBIRD,
            listOf("bluebird", "pidion")
        ),
        VendorRule(
            ReaderVendor.CHAFON,
            listOf("chafon", "cf-ru", "cf-rxxx")
        ),
        VendorRule(
            ReaderVendor.DATALOGIC,
            listOf("datalogic rfid", "datalogic scanning", "dl-rfid")
        )
    )

    private val GENERIC_RFID_HINTS = listOf(
        "llrp", "uhf reader", "uhf rfid", "rfid reader", "rain rfid",
        "epcglobal", "epc gen2", "gen2 reader", "tag reader", "rfid-reader",
        "rfid gateway", "fixed reader"
    )

    private val trustAllSslSocketFactory by lazy {
        val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
            override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
            override fun checkClientTrusted(chain: Array<X509Certificate>?, authType: String?) {}
            override fun checkServerTrusted(chain: Array<X509Certificate>?, authType: String?) {}
        })
        val sslContext = SSLContext.getInstance("TLS")
        sslContext.init(null, trustAllCerts, SecureRandom())
        sslContext.socketFactory
    }

    /**
     * Checks if a single TCP port is open.
     */
    fun checkPortOpen(ip: String, port: Int, timeoutMs: Int): Boolean {
        return try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(ip, port), timeoutMs)
                true
            }
        } catch (_: Throwable) {
            false
        }
    }

    /**
     * Probes an IP for RFID reader characteristics.
     */
    suspend fun probeHostForReader(ip: String, timeoutMs: Int): ReaderCandidate? = withContext(Dispatchers.IO) {
        val openPorts = mutableListOf<Int>()
        for (port in PROBE_PORTS) {
            if (checkPortOpen(ip, port, timeoutMs)) {
                openPorts.add(port)
            }
        }

        if (openPorts.isEmpty()) {
            return@withContext null
        }

        // 1. Try LLRP PEN probe if port 5084 or 5085 is open
        if (5084 in openPorts || 5085 in openPorts) {
            val llrpPort = if (5084 in openPorts) 5084 else 5085
            val llrpResult = probeLlrpPen(ip, llrpPort, timeoutMs)
            if (llrpResult != null) {
                return@withContext ReaderCandidate(
                    ip = ip,
                    vendor = llrpResult.second,
                    vendorLabel = llrpResult.second.title,
                    confidence = ReaderConfidence.HIGH,
                    openPorts = openPorts,
                    reason = "LLRP protocol response identified IANA Private Enterprise Number (PEN: ${llrpResult.first})",
                    pen = llrpResult.first
                )
            }
        }

        // 2. Try HTTP / HTTPS Web Banner Probe if port 80 or 443 is open
        var webTitle: String? = null
        var webServer: String? = null
        var webText = ""

        if (80 in openPorts || 443 in openPorts) {
            val webProbe = probeWebBanner(ip, 80 in openPorts, timeoutMs)
            webTitle = webProbe.title
            webServer = webProbe.server
            webText = (webTitle.orEmpty() + " " + webServer.orEmpty() + " " + webProbe.body).lowercase(Locale.ROOT)

            for (rule in VENDOR_RULES) {
                for (keyword in rule.keywords) {
                    if (webText.contains(keyword)) {
                        return@withContext ReaderCandidate(
                            ip = ip,
                            vendor = rule.vendor,
                            vendorLabel = rule.vendor.title,
                            confidence = ReaderConfidence.HIGH,
                            openPorts = openPorts,
                            reason = "Matched web signature '$keyword' in HTTP response",
                            title = webTitle,
                            server = webServer,
                            url = if (443 in openPorts) "https://$ip" else "http://$ip"
                        )
                    }
                }
            }
        }

        // 3. Check for Feig OBID port (10001) or Impinj ItemSense port (14150)
        if (10001 in openPorts) {
            return@withContext ReaderCandidate(
                ip = ip,
                vendor = ReaderVendor.FEIG,
                vendorLabel = "FEIG OBID / Industrial RFID",
                confidence = ReaderConfidence.MEDIUM,
                openPorts = openPorts,
                reason = "Port 10001 open (standard FEIG OBID / Balluff / Turck reader service)",
                title = webTitle,
                server = webServer
            )
        }

        if (14150 in openPorts) {
            return@withContext ReaderCandidate(
                ip = ip,
                vendor = ReaderVendor.IMPINJ,
                vendorLabel = ReaderVendor.IMPINJ.title,
                confidence = ReaderConfidence.MEDIUM,
                openPorts = openPorts,
                reason = "Port 14150 open (Impinj ItemSense / R700 service)",
                title = webTitle,
                server = webServer
            )
        }

        // 4. Generic RFID heuristics
        val isLlrp = 5084 in openPorts || 5085 in openPorts
        val hasGenericKeyword = GENERIC_RFID_HINTS.any { webText.contains(it) }

        if (isLlrp || hasGenericKeyword) {
            return@withContext ReaderCandidate(
                ip = ip,
                vendor = ReaderVendor.GENERIC,
                vendorLabel = "Generic RFID Reader",
                confidence = if (isLlrp) ReaderConfidence.HIGH else ReaderConfidence.MEDIUM,
                openPorts = openPorts,
                reason = if (isLlrp) "Standard EPCglobal LLRP port open (5084/5085)" else "Generic RFID service keywords matched in web banner",
                title = webTitle,
                server = webServer,
                url = if (80 in openPorts) "http://$ip" else if (443 in openPorts) "https://$ip" else null
            )
        }

        // If other non-RFID ports open without any RFID markers, don't classify as reader
        null
    }

    private fun probeLlrpPen(ip: String, port: Int, timeoutMs: Int): Pair<Int, ReaderVendor>? {
        return try {
            Socket().use { socket ->
                socket.connect(InetSocketAddress(ip, port), timeoutMs)
                socket.soTimeout = timeoutMs
                val out: OutputStream = socket.getOutputStream()
                out.write(LLRP_GET_CAPABILITIES)
                out.flush()

                val buf = ByteArray(512)
                val read = socket.getInputStream().read(buf)
                if (read >= 4) {
                    for ((pen, vendor) in PEN_MAP) {
                        for (i in 0 until (read - 3)) {
                            if (buf[i] == 0.toByte() && buf[i + 1] == 0.toByte()) {
                                val value = ((buf[i + 2].toInt() and 0xFF) shl 8) or (buf[i + 3].toInt() and 0xFF)
                                if (value == pen) {
                                    return Pair(pen, vendor)
                                }
                            }
                        }
                    }
                }
                null
            }
        } catch (_: Throwable) {
            null
        }
    }

    private data class WebProbeResult(
        val title: String? = null,
        val server: String? = null,
        val body: String = ""
    )

    private fun probeWebBanner(ip: String, useHttp: Boolean, timeoutMs: Int): WebProbeResult {
        return try {
            val port = if (useHttp) 80 else 443
            val socket = if (useHttp) {
                Socket().apply { connect(InetSocketAddress(ip, port), timeoutMs) }
            } else {
                (trustAllSslSocketFactory.createSocket() as SSLSocket).apply {
                    connect(InetSocketAddress(ip, port), timeoutMs)
                    startHandshake()
                }
            }

            socket.use { s ->
                s.soTimeout = timeoutMs
                val writer = s.getOutputStream()
                val request = "GET / HTTP/1.1\r\nHost: $ip\r\nUser-Agent: ZeusRFID/1.0\r\nConnection: close\r\n\r\n"
                writer.write(request.toByteArray(Charsets.UTF_8))
                writer.flush()

                val reader = BufferedReader(InputStreamReader(s.getInputStream(), Charsets.UTF_8))
                var line: String?
                var serverHeader: String? = null
                val bodyBuilder = StringBuilder()

                // Read headers
                while (reader.readLine().also { line = it } != null) {
                    if (line.isNullOrBlank()) break
                    val current = line!!
                    if (current.startsWith("Server:", ignoreCase = true)) {
                        serverHeader = current.substringAfter(":").trim()
                    }
                }

                // Read body excerpt
                var totalChars = 0
                val charBuf = CharArray(1024)
                var n: Int
                while (reader.read(charBuf).also { n = it } != -1 && totalChars < 4096) {
                    bodyBuilder.append(charBuf, 0, n)
                    totalChars += n
                }

                val fullBody = bodyBuilder.toString()
                val titleMatch = Regex("""<title[^>]*>(.*?)</title>""", RegexOption.IGNORE_CASE).find(fullBody)
                val title = titleMatch?.groupValues?.get(1)?.trim()

                WebProbeResult(title = title, server = serverHeader, body = fullBody)
            }
        } catch (_: Throwable) {
            WebProbeResult()
        }
    }
}
