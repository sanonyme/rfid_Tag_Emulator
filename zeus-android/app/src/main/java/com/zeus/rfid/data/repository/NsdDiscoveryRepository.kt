package com.zeus.rfid.data.repository

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import android.util.Log
import com.zeus.rfid.data.model.DiscoveredServer
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import java.util.UUID

class NsdDiscoveryRepository(
    private val context: Context
) : DiscoveryRepository {

    companion object {
        private const val TAG = "NsdDiscoveryRepo"
    }

    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as? NsdManager
    private val wifiManager = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager

    override fun discoverServers(serviceType: String): Flow<DiscoveryEvent> = callbackFlow {
        if (nsdManager == null) {
            trySend(DiscoveryEvent.Error("Network Service Discovery is not supported on this device."))
            close()
            return@callbackFlow
        }

        // Acquire MulticastLock to ensure mDNS broadcast packets reach the app
        val multicastLock = wifiManager?.createMulticastLock("ZeusNsdDiscoveryLock")?.apply {
            setReferenceCounted(false)
        }

        try {
            multicastLock?.acquire()
            Log.d(TAG, "MulticastLock acquired: ${multicastLock?.isHeld}")
        } catch (e: Exception) {
            Log.w(TAG, "Could not acquire MulticastLock: ${e.message}")
        }

        val discoveryListener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String) {
                Log.d(TAG, "Service discovery started for: $regType")
                trySend(DiscoveryEvent.Started)
            }

            override fun onServiceFound(serviceInfo: NsdServiceInfo) {
                Log.d(TAG, "Service found: ${serviceInfo.serviceName} type=${serviceInfo.serviceType}")

                // Android NsdManager may prepend/append dots or .local
                val cleanRequested = serviceType.trim('.')
                val cleanReported = serviceInfo.serviceType?.trim('.') ?: ""

                if (!cleanReported.contains(cleanRequested, ignoreCase = true)) {
                    Log.d(TAG, "Service type does not match ($cleanReported vs $cleanRequested). Skipping.")
                    return
                }

                // Resolve each discovered service with a separate ResolveListener
                val resolveListener = object : NsdManager.ResolveListener {
                    override fun onResolveFailed(info: NsdServiceInfo, errorCode: Int) {
                        Log.w(TAG, "Resolve failed for ${info.serviceName}: error code $errorCode")
                    }

                    override fun onServiceResolved(info: NsdServiceInfo) {
                        Log.d(TAG, "Service resolved: ${info.serviceName} @ ${info.host}:${info.port}")

                        val hostAddress = info.host?.hostAddress ?: "unknown"
                        val port = info.port
                        val attributes = try {
                            info.attributes.mapValues { (_, valueBytes) ->
                                String(valueBytes, Charsets.UTF_8)
                            }
                        } catch (_: Exception) {
                            emptyMap()
                        }

                        val server = DiscoveredServer(
                            id = "${info.serviceName}_${hostAddress}_$port",
                            name = info.serviceName ?: "Zeus Server",
                            host = hostAddress,
                            port = port,
                            attributes = attributes
                        )

                        trySend(DiscoveryEvent.ServerFound(server))
                    }
                }

                try {
                    @Suppress("DEPRECATION")
                    nsdManager.resolveService(serviceInfo, resolveListener)
                } catch (e: Exception) {
                    Log.e(TAG, "Exception resolving service ${serviceInfo.serviceName}", e)
                }
            }

            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                Log.d(TAG, "Service lost: ${serviceInfo.serviceName}")
                trySend(DiscoveryEvent.ServerLost(serviceInfo.serviceName))
            }

            override fun onDiscoveryStopped(serviceType: String) {
                Log.d(TAG, "Service discovery stopped for: $serviceType")
                trySend(DiscoveryEvent.Completed)
            }

            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.e(TAG, "Discovery start failed: error code $errorCode")
                val msg = when (errorCode) {
                    NsdManager.FAILURE_ALREADY_ACTIVE -> "Discovery is already active."
                    NsdManager.FAILURE_MAX_LIMIT -> "Device reached maximum discovery listeners limit."
                    else -> "Failed to start discovery (error code: $errorCode)."
                }
                trySend(DiscoveryEvent.Error(msg))
                close()
            }

            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {
                Log.e(TAG, "Discovery stop failed: error code $errorCode")
                close()
            }
        }

        try {
            nsdManager.discoverServices(serviceType, NsdManager.PROTOCOL_DNS_SD, discoveryListener)
        } catch (e: Exception) {
            Log.e(TAG, "Error initiating discoverServices", e)
            trySend(DiscoveryEvent.Error("Failed to initiate service discovery: ${e.localizedMessage}", e))
            close()
        }

        awaitClose {
            Log.d(TAG, "Cleaning up discovery and releasing resources...")
            try {
                nsdManager.stopServiceDiscovery(discoveryListener)
            } catch (e: Exception) {
                Log.w(TAG, "Exception while stopping service discovery", e)
            }

            try {
                if (multicastLock?.isHeld == true) {
                    multicastLock.release()
                    Log.d(TAG, "MulticastLock released.")
                }
            } catch (e: Exception) {
                Log.w(TAG, "Exception releasing MulticastLock", e)
            }
        }
    }
}
