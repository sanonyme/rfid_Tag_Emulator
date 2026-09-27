package com.zeus.rfid.ui.util

import com.zeus.rfid.ui.components.ZeusExperienceSettings

object SoundEffectHelper {

    var isEnabled: Boolean
        get() = ZeusExperienceSettings.soundEnabled
        set(value) { ZeusExperienceSettings.setSound(value) }

    fun playClick() {
        DiscoverySounds.tap(isEnabled)
    }

    fun playTagReadBeep() {
        DiscoverySounds.tap(isEnabled)
    }

    fun playEmulationStart() {
        DiscoverySounds.start(isEnabled)
    }

    fun playEmulationSuccess() {
        DiscoverySounds.found(isEnabled)
    }

    fun playEmulationStopped() {
        DiscoverySounds.stop(isEnabled)
    }
}
