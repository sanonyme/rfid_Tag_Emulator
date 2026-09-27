package com.zeus.rfid.ui.components

import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CellTower
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.zeus.rfid.data.model.DiscoveredServer
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusBlueLight
import com.zeus.rfid.ui.theme.ZeusCyanAccent
import com.zeus.rfid.ui.theme.ZeusMint
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

private data class RingDot(
    val ringIndex: Int,
    val dotPhase: Float,
    val baseAngle: Float,
    val radiusRatio: Float,
    val idleAlpha: Float
)

/** The original softly rotating, independently shimmering dotted search halo. */
@Composable
fun RadarScanAnimation(
    isScanning: Boolean,
    onHubClick: () -> Unit,
    modifier: Modifier = Modifier,
    discoveredServers: List<DiscoveredServer> = emptyList(),
    size: Dp = 280.dp,
    hubSize: Dp = 96.dp
) {
    val haptic = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()
    val motionEnabled = zeusMotionEnabled()
    val scanProgress by animateFloatAsState(
        targetValue = if (isScanning) 1f else 0f,
        animationSpec = tween(600, easing = FastOutSlowInEasing),
        label = "ScanProgress"
    )
    val hubPressScale by animateFloatAsState(
        targetValue = if (isPressed) 0.92f else 1f,
        animationSpec = spring(dampingRatio = 0.55f, stiffness = 380f),
        label = "HubPress"
    )
    val motion = rememberInfiniteTransition(label = "RadarTransition")
    val rotationAngle by motion.animateFloat(
        0f, (2 * PI).toFloat(),
        infiniteRepeatable(tween(30000, easing = LinearEasing)),
        label = "RadarRotation"
    )
    val pulseWave by motion.animateFloat(
        0f, 1f,
        infiniteRepeatable(tween(9000, easing = LinearEasing)),
        label = "RadarPulse"
    )
    val hubBreathScale by motion.animateFloat(
        1f, 1.05f,
        infiniteRepeatable(tween(1200, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "HubBreath"
    )
    val dots = remember {
        val random = java.util.Random(0xDEADBEEF)
        listOf(18, 24, 30, 36, 42).flatMapIndexed { ring, count ->
            List(count) { index ->
                RingDot(
                    ringIndex = ring,
                    dotPhase = random.nextFloat(),
                    baseAngle = index.toFloat() / count * 2f * PI.toFloat(),
                    radiusRatio = ring / 4f,
                    idleAlpha = 0.12f + random.nextFloat() * 0.10f
                )
            }
        }
    }
    Box(modifier = modifier.size(size), contentAlignment = Alignment.Center) {
        Canvas(Modifier.size(size)) {
            val center = Offset(this.size.width / 2f, this.size.height / 2f)
            val minRadius = hubSize.toPx() / 2f + 14.dp.toPx()
            val radialSpan = this.size.width / 2f - 10.dp.toPx() - minRadius
            dots.forEach { dot ->
                val radius = minRadius + dot.radiusRatio * radialSpan
                val angle = dot.baseAngle +
                    (if (motionEnabled) rotationAngle else 0f) * scanProgress * if (dot.ringIndex % 2 == 0) 1f else -0.7f
                val intensity = (sin(((if (motionEnabled) pulseWave else 0f) + dot.dotPhase) * 2f * PI.toFloat()) + 1f) / 2f
                val activeIntensity = intensity * scanProgress
                val baseRadius = 2.2.dp.toPx() + dot.ringIndex * 0.45.dp.toPx()
                val dotRadius = baseRadius * (0.55f + 0.90f * activeIntensity + 0.10f * (1f - scanProgress))
                val color = lerp(ZeusMint, ZeusCyanAccent, ((cos(angle) + 1f) / 2f).coerceIn(0f, 1f))
                val idle = dot.idleAlpha * (0.6f + 0.4f * intensity)
                val active = 0.20f + 0.70f * activeIntensity
                val alpha = idle + (active - idle) * scanProgress
                drawCircle(color.copy(alpha = alpha), dotRadius,
                    Offset(center.x + radius * cos(angle), center.y + radius * sin(angle)))
            }
        }
        Box(
            modifier = Modifier.size(hubSize)
                .scale(if (motionEnabled) (1f + (hubBreathScale - 1f) * scanProgress) * hubPressScale else 1f)
                .clip(CircleShape)
                .background(Brush.radialGradient(listOf(
                    ZeusCyanAccent, ZeusBlue, ZeusBlueLight.copy(alpha = 0.9f)
                ), radius = hubSize.value * 1.8f))
                .clickable(interactionSource = interactionSource, indication = null) {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    onHubClick()
                },
            contentAlignment = Alignment.Center
        ) {
            Crossfade(isScanning, animationSpec = tween(350, easing = FastOutSlowInEasing), label = "HubIconCrossfade") { scanning ->
                Icon(
                    imageVector = if (scanning) Icons.Rounded.CellTower else Icons.Rounded.Search,
                    contentDescription = if (scanning) "Stop searching" else "Start discovery",
                    tint = Color.White,
                    modifier = Modifier.size(hubSize * 0.46f)
                )
            }
        }
    }
}
