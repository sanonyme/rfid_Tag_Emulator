package com.zeus.rfid.ui.components

import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.dp
import com.zeus.rfid.ui.theme.ZeusBlue

@Composable
fun TransmissionWaves(
    isTransmitting: Boolean,
    modifier: Modifier = Modifier,
    waveColor: Color = ZeusBlue
) {
    val infiniteTransition = rememberInfiniteTransition(label = "WaveTransition")
    
    // Create 3 waves with staggered phases
    val waves = (0 until 3).map { index ->
        val phase = index * (2000 / 3) // Stagger 3 waves over a 2000ms period
        
        // We only animate if transmitting. Otherwise, we pause at 0.
        val progress by infiniteTransition.animateFloat(
            initialValue = 0f,
            targetValue = if (isTransmitting) 1f else 0f,
            animationSpec = if (isTransmitting) {
                infiniteRepeatable(
                    animation = tween(2000, delayMillis = phase, easing = FastOutLinearInEasing),
                    repeatMode = RepeatMode.Restart
                )
            } else {
                infiniteRepeatable(tween(100)) // Idle state, doesn't really matter
            },
            label = "WaveProgress_$index"
        )
        progress
    }

    Box(
        modifier = modifier.size(240.dp),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.size(240.dp)) {
            val center = center
            val maxRadius = size.width / 2f
            
            // Draw central solid circle
            drawCircle(
                color = waveColor,
                radius = 24.dp.toPx(),
                center = center
            )
            
            // Draw radiating waves
            if (isTransmitting) {
                waves.forEach { progress ->
                    if (progress > 0f) {
                        val currentRadius = 24.dp.toPx() + (maxRadius - 24.dp.toPx()) * progress
                        val alpha = 1f - progress // Fade out as it expands
                        
                        drawCircle(
                            color = waveColor.copy(alpha = alpha * 0.6f),
                            radius = currentRadius,
                            center = center,
                            style = Stroke(width = 2.dp.toPx())
                        )
                    }
                }
            }
        }
    }
}
