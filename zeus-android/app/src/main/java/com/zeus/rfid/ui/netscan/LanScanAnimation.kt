package com.zeus.rfid.ui.netscan

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
import androidx.compose.material.icons.rounded.Radar
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
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
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

val LanEmerald = Color(0xFF10B981)
val LanEmeraldLight = Color(0xFF34D399)
val LanCyan = Color(0xFF06B6D4)
val LanViolet = Color(0xFF8B5CF6)
val LanIndigo = Color(0xFF6366F1)
val LanDeepBg = Color(0xFF0D1322)

@Immutable
private data class LanRingDot(
    val ringIndex: Int,
    val ringPhase: Float,
    val dotPhase: Float,
    val baseAngle: Float,
    val radiusRatio: Float,
    val idleAlpha: Float
)

/**
 * Radar scan animation tailored for LAN / Subnet sweep.
 * Features an Electric Emerald to Cyber Indigo/Violet gradient,
 * organic dual-direction particle field rotation, and tactile action hub.
 */
@Composable
fun LanScanAnimation(
    isScanning: Boolean,
    onHubClick: () -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 260.dp,
    hubSize: Dp = 92.dp
) {
    val haptic = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()

    val scanProgress by animateFloatAsState(
        targetValue = if (isScanning) 1f else 0f,
        animationSpec = tween(durationMillis = 600, easing = FastOutSlowInEasing),
        label = "LanScanProgress"
    )

    val hubPressScale by animateFloatAsState(
        targetValue = if (isPressed) 0.92f else 1f,
        animationSpec = spring(dampingRatio = 0.55f, stiffness = 380f),
        label = "LanHubPress"
    )

    val infiniteTransition = rememberInfiniteTransition(label = "LanRadarTransition")

    val rotationAngle by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 10000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "LanRadarRotation"
    )

    val pulseWave by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "LanRadarPulse"
    )

    val hubBreathScale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = 1.06f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1100, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "LanHubBreath"
    )

    val ringDots = remember {
        val ringCounts = listOf(16, 22, 28, 34, 40)
        val totalRings = ringCounts.size
        val dots = mutableListOf<LanRingDot>()
        val rng = java.util.Random(0x4C414E53) // "LANS" seed

        ringCounts.forEachIndexed { ringIdx, dotCount ->
            val ringPhase = ringIdx.toFloat() / totalRings
            val radiusRatio = ringIdx.toFloat() / (totalRings - 1)
            for (dotIdx in 0 until dotCount) {
                dots.add(
                    LanRingDot(
                        ringIndex = ringIdx,
                        ringPhase = ringPhase,
                        dotPhase = rng.nextFloat(),
                        baseAngle = (dotIdx.toFloat() / dotCount) * 2f * PI.toFloat(),
                        radiusRatio = radiusRatio,
                        idleAlpha = 0.12f + rng.nextFloat() * 0.12f
                    )
                )
            }
        }
        dots
    }

    Box(
        modifier = modifier.size(size),
        contentAlignment = Alignment.Center
    ) {
        Canvas(modifier = Modifier.size(size)) {
            val center = Offset(this.size.width / 2f, this.size.height / 2f)
            val hubRadiusPx = hubSize.toPx() / 2f
            val minRadius = hubRadiusPx + 14.dp.toPx()
            val maxRadius = this.size.width / 2f - 8.dp.toPx()
            val radialSpan = maxRadius - minRadius

            for (dot in ringDots) {
                val ringRadius = minRadius + dot.radiusRatio * radialSpan

                // Alternate rings counter-rotate for organic depth
                val dynamicAngle = if (isScanning || scanProgress > 0.01f) {
                    dot.baseAngle + (rotationAngle * scanProgress * if (dot.ringIndex % 2 == 0) 1f else -0.75f)
                } else {
                    dot.baseAngle
                }

                val x = center.x + ringRadius * cos(dynamicAngle)
                val y = center.y + ringRadius * sin(dynamicAngle)

                val theta = (pulseWave + dot.dotPhase) * 2f * PI.toFloat()
                val intensity = (sin(theta) + 1f) / 2f
                val activeIntensity = intensity * scanProgress

                val baseDotRadius = 2.2.dp.toPx() + (dot.ringIndex * 0.4.dp.toPx())
                val dotRadius = baseDotRadius * (
                    0.55f
                    + 0.90f * activeIntensity
                    + 0.10f * (1f - scanProgress)
                )

                // Distinctive LAN Gradient: Emerald -> Cyan -> Electric Violet
                val normalizedAngle = ((cos(dynamicAngle) + 1f) / 2f).coerceIn(0f, 1f)
                val dotColor = if (normalizedAngle < 0.5f) {
                    lerp(LanEmerald, LanCyan, normalizedAngle * 2f)
                } else {
                    lerp(LanCyan, LanViolet, (normalizedAngle - 0.5f) * 2f)
                }

                val idleShimmer = dot.idleAlpha * (0.6f + 0.4f * intensity)
                val activeAlpha = 0.20f + 0.70f * activeIntensity
                val alpha = idleShimmer + (activeAlpha - idleShimmer) * scanProgress

                drawCircle(
                    color = dotColor.copy(alpha = alpha),
                    radius = dotRadius,
                    center = Offset(x, y)
                )
            }
        }

        // Center Action Hub Button
        val effectiveBreath = 1f + ((hubBreathScale - 1f) * scanProgress)
        Box(
            modifier = Modifier
                .size(hubSize)
                .scale(effectiveBreath * hubPressScale)
                .clip(CircleShape)
                .background(
                    Brush.radialGradient(
                        colors = listOf(
                            LanEmeraldLight,
                            LanEmerald,
                            LanIndigo
                        ),
                        radius = hubSize.value * 1.7f
                    )
                )
                .clickable(
                    interactionSource = interactionSource,
                    indication = null,
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onHubClick()
                    }
                ),
            contentAlignment = Alignment.Center
        ) {
            Crossfade(
                targetState = isScanning,
                animationSpec = tween(300),
                label = "LanHubIcon"
            ) { scanning ->
                Icon(
                    imageVector = if (scanning) Icons.Rounded.Stop else Icons.Rounded.Radar,
                    contentDescription = if (scanning) "Stop Scan" else "Start Scan",
                    tint = Color.White,
                    modifier = Modifier.size(38.dp)
                )
            }
        }
    }
}
