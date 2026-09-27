package com.zeus.rfid.navigation

import kotlinx.serialization.Serializable

/**
 * Type-safe navigation destinations for the Zeus RFID app.
 */
sealed interface Screen {
    @Serializable
    data object ModeSelect : Screen

    @Serializable
    data object DiscoverServers : Screen

    @Serializable
    data class Options(
        val serverName: String,
        val host: String,
        val port: Int
    ) : Screen

    @Serializable
    data class ComingSoon(
        val featureTitle: String
    ) : Screen

    @Serializable
    data class Emulation(
        val serverName: String,
        val host: String,
        val port: Int
    ) : Screen

    @Serializable
    data object HandheldConnect : Screen

    @Serializable
    data class HandheldEmulation(
        val initialClientIp: String = ""
    ) : Screen

    @Serializable
    data object DecodeEncode : Screen

    @Serializable
    data object Database : Screen

    @Serializable
    data object Files : Screen

    @Serializable
    data class OtherTools(
        val initialTab: String = "decode"
    ) : Screen

    @Serializable
    data object Ocr : Screen

    @Serializable
    data object LanScanner : Screen

    @Serializable
    data object TagSynthesizer : Screen

    @Serializable
    data object Nfc : Screen
}
