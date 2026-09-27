package com.zeus.rfid.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusMint
import kotlin.math.roundToInt

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ZeusRssiSlider(
    value: Float,
    onValueChange: (Float) -> Unit,
    modifier: Modifier = Modifier,
    valueRange: ClosedFloatingPointRange<Float> = -80f..0f,
    tickLabels: List<String>? = null
) {
    val haptic = LocalHapticFeedback.current
    var lastHapticStep by remember { mutableIntStateOf(value.roundToInt()) }

    val resolvedLabels = remember(valueRange, tickLabels) {
        tickLabels ?: if (valueRange.start >= 0f) {
            listOf("${valueRange.start.toInt()} dBm", "25", "50", "75", "${valueRange.endInclusive.toInt()} dBm")
        } else {
            listOf("-80 dBm", "-60", "-40", "-20", "0 dBm")
        }
    }

    Column(modifier = modifier.fillMaxWidth()) {
        Slider(
            value = value,
            onValueChange = { newVal ->
                val currentStep = newVal.roundToInt()
                if (currentStep != lastHapticStep) {
                    lastHapticStep = currentStep
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                }
                onValueChange(newVal)
            },
            valueRange = valueRange,
            steps = 159, // intervals
            modifier = Modifier
                .fillMaxWidth()
                .height(36.dp),
            thumb = {
                // Elevated premium thumb
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .shadow(elevation = 4.dp, shape = CircleShape)
                        .clip(CircleShape)
                        .background(Color.White)
                        .border(width = 3.dp, color = ZeusBlue, shape = CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(ZeusBlue)
                    )
                }
            },
            track = { sliderState ->
                val fraction = (value - valueRange.start) / (valueRange.endInclusive - valueRange.start)
                val clampedFraction = fraction.coerceIn(0f, 1f)
                val trackHeight = 10.dp
                val inactiveTrackColor = MaterialTheme.colorScheme.surfaceVariant

                Canvas(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(trackHeight)
                ) {
                    val w = size.width
                    val h = size.height
                    val activeWidth = w * clampedFraction

                    // Draw Inactive background capsule
                    drawRoundRect(
                        color = inactiveTrackColor,
                        size = size,
                        cornerRadius = androidx.compose.ui.geometry.CornerRadius(h / 2f, h / 2f)
                    )

                    // Draw Active gradient capsule
                    if (activeWidth > 0f) {
                        drawRoundRect(
                            brush = Brush.horizontalGradient(
                                colors = listOf(ZeusBlue, ZeusMint),
                                startX = 0f,
                                endX = w
                            ),
                            size = androidx.compose.ui.geometry.Size(activeWidth, h),
                            cornerRadius = androidx.compose.ui.geometry.CornerRadius(h / 2f, h / 2f)
                        )
                    }

                    // Tick dots
                    val tickCount = resolvedLabels.size
                    for (i in 0 until tickCount) {
                        val tickFraction = i.toFloat() / (tickCount - 1)
                        val tickX = w * tickFraction
                        val isPassed = tickX <= activeWidth
                        drawCircle(
                            color = if (isPassed) Color.White.copy(alpha = 0.85f) else Color.Gray.copy(alpha = 0.35f),
                            radius = 2.dp.toPx(),
                            center = Offset(tickX, h / 2f)
                        )
                    }
                }
            }
        )

        Spacer(modifier = Modifier.height(2.dp))

        // Tick labels
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            resolvedLabels.forEach { label ->
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall.copy(
                        fontSize = 11.sp,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Medium
                    ),
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )
            }
        }
    }
}
