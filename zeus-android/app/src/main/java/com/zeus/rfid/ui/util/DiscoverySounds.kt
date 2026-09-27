package com.zeus.rfid.ui.util

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import java.util.concurrent.Executors
import kotlin.math.PI
import kotlin.math.exp
import kotlin.math.sin

/** Soft, short synthesized cues. Audio is generated off the UI thread and needs no media files. */
object DiscoverySounds {
    private var lastTap = 0L
    private val player = Executors.newSingleThreadExecutor { task ->
        Thread(task, "zeus-discovery-audio").apply { isDaemon = true }
    }

    fun start(enabled: Boolean) = play(enabled, doubleArrayOf(520.0, 780.0), 0.22)
    fun found(enabled: Boolean) = play(enabled, doubleArrayOf(660.0, 880.0, 1320.0), 0.32)
    fun stop(enabled: Boolean) = play(enabled, doubleArrayOf(580.0, 390.0), 0.20)
    fun empty(enabled: Boolean) = play(enabled, doubleArrayOf(420.0, 350.0), 0.22)
    @Synchronized
    fun tap(enabled: Boolean) {
        val now = android.os.SystemClock.elapsedRealtime()
        if (!enabled || now - lastTap < 100L) return
        lastTap = now
        play(true, doubleArrayOf(880.0), 0.065)
    }

    private fun play(enabled: Boolean, notes: DoubleArray, seconds: Double) {
        if (!enabled) return
        player.execute {
            val rate = 22_050
            val count = (rate * seconds).toInt()
            val pcm = ShortArray(count)
            for (sample in 0 until count) {
                val t = sample.toDouble() / rate
                var value = 0.0
                notes.forEachIndexed { index, frequency ->
                    val noteTime = t - index * seconds / (notes.size + 0.5)
                    if (noteTime >= 0.0) {
                        val envelope = (1.0 - exp(-noteTime * 120.0)) * exp(-noteTime * 17.0)
                        value += (sin(2.0 * PI * frequency * noteTime) +
                            0.16 * sin(2.0 * PI * frequency * 2.0 * noteTime)) * envelope
                    }
                }
                val tail = ((seconds - t) / 0.025).coerceIn(0.0, 1.0)
                pcm[sample] = (value * tail * 3200.0)
                    .toInt().coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
            }
            try {
                val track = AudioTrack.Builder()
                    .setAudioAttributes(AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                    .setAudioFormat(AudioFormat.Builder()
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .setSampleRate(rate)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
                    .setTransferMode(AudioTrack.MODE_STATIC)
                    .setBufferSizeInBytes(pcm.size * 2)
                    .build()
                try {
                    track.write(pcm, 0, pcm.size)
                    track.play()
                    Thread.sleep((seconds * 1000).toLong() + 30)
                } finally {
                    track.release()
                }
            } catch (_: Exception) {
                // Devices without an available audio output still keep discovery usable.
            }
        }
    }
}
