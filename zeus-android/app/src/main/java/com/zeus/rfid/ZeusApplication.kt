package com.zeus.rfid

import android.app.Application
import com.zeus.rfid.data.repository.DiscoveryRepository
import com.zeus.rfid.data.repository.ServerRepository
import com.zeus.rfid.data.repository.ServerRepositoryImpl
import com.zeus.rfid.data.repository.UdpEdgeDiscoveryRepository

interface AppContainer {
    val discoveryRepository: DiscoveryRepository
    val serverRepository: ServerRepository
}

class DefaultAppContainer(private val application: Application) : AppContainer {
    override val discoveryRepository: DiscoveryRepository by lazy {
        UdpEdgeDiscoveryRepository(application)
    }

    override val serverRepository: ServerRepository by lazy {
        ServerRepositoryImpl()
    }
}

class ZeusApplication : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        com.zeus.rfid.ui.components.ZeusExperienceSettings.initialize(this)
        container = DefaultAppContainer(this)
    }
}
