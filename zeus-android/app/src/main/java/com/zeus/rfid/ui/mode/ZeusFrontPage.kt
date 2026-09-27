package com.zeus.rfid.ui.mode

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Hub
import androidx.compose.material.icons.rounded.Nfc
import androidx.compose.material.icons.rounded.QrCode
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Radar
import androidx.compose.material.icons.rounded.Settings
import com.zeus.rfid.ui.components.isZeusDarkTheme
import com.zeus.rfid.ui.components.isZeusGlass
import com.zeus.rfid.ui.components.zeusCardBg
import com.zeus.rfid.ui.components.zeusCardBorderColor
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.Widgets
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zeus.rfid.R
import com.zeus.rfid.ui.components.zeusMotionEnabled
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusMint
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

private val Ink = Color(0xFF07111F)
private val Electric = Color(0xFF62E8F7)
private val Violet = Color(0xFFA88BFF)

@Composable
internal fun ZeusFrontPage(
    modifier: Modifier = Modifier,
    onFixed: () -> Unit,
    onHandheld: () -> Unit,
    onModules: () -> Unit,
    onDecode: () -> Unit,
    onFiles: () -> Unit,
    onDatabase: () -> Unit,
    onOcr: () -> Unit,
    onLanScanner: () -> Unit,
    onSynthesizer: () -> Unit,
    onNfc: () -> Unit = {},
    onOpenSettings: () -> Unit = {}
) {
    val isDark = isZeusDarkTheme()
    val isGlass = isZeusGlass()
    val surface = zeusCardBg(isDark)
    val border = zeusCardBorderColor(isDark)
    val foreground = MaterialTheme.colorScheme.onBackground
    val secondary = MaterialTheme.colorScheme.onSurfaceVariant
    val haptic = LocalHapticFeedback.current
    Column(
        modifier = modifier.fillMaxSize()
            .statusBarsPadding()
            .verticalScroll(rememberScrollState())
            .navigationBarsPadding()
            .padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(20.dp)
    ) {
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(42.dp).clip(RoundedCornerShape(13.dp))
                    .background(Brush.linearGradient(listOf(Electric, ZeusBlue))),
                contentAlignment = Alignment.Center
            ) {
                Image(
                    painter = painterResource(R.drawable.zeus_icon),
                    contentDescription = "Zeus",
                    modifier = Modifier.size(34.dp).clip(RoundedCornerShape(9.dp))
                )
            }
            Spacer(Modifier.width(11.dp))
            Column {
                Text("ZEUS", color = foreground, fontWeight = FontWeight.Black, fontSize = 21.sp, letterSpacing = 2.sp)
                Text("RFID STUDIO", color = secondary, fontSize = 10.sp, letterSpacing = 2.5.sp, fontWeight = FontWeight.Bold)
            }
            Spacer(Modifier.weight(1f))
            IconButton(
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    onOpenSettings()
                },
                modifier = Modifier
                    .size(42.dp)
                    .clip(RoundedCornerShape(13.dp))
                    .background(surface)
                    .border(1.dp, border, RoundedCornerShape(13.dp))
            ) {
                Icon(
                    imageVector = Icons.Rounded.Settings,
                    contentDescription = "Global Settings",
                    tint = ZeusBlue,
                    modifier = Modifier.size(22.dp)
                )
            }
        }

        FrontHero(onFixed, onModules)

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text("Your workspace", color = foreground, fontWeight = FontWeight.Bold, fontSize = 23.sp)
                Text("Choose how you want to work", color = secondary, fontSize = 13.sp)
            }
            Text("02 MODES", color = ZeusBlue, fontSize = 10.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.Bold)
        }

        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            FrontModeCard(
                title = "Fixed reader",
                subtitle = "Discover Edge & emulate",
                icon = Icons.Rounded.Hub,
                accent = Electric,
                surface = surface,
                border = border,
                modifier = Modifier.weight(1f),
                onClick = onFixed
            )
            FrontModeCard(
                title = "Handheld",
                subtitle = "Stream tags over TCP",
                icon = Icons.Rounded.Smartphone,
                accent = ZeusMint,
                surface = surface,
                border = border,
                modifier = Modifier.weight(1f),
                onClick = onHandheld
            )
        }

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text("Quick tools", color = foreground, fontWeight = FontWeight.Bold, fontSize = 23.sp)
                Text("Jump straight into a utility", color = secondary, fontSize = 13.sp)
            }
            Text("07 TOOLS", color = Color(0xFFF43F5E), fontSize = 10.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.Bold)
        }

        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FrontToolCard("NFC reader", "13.56 MHz HF tags", Icons.Rounded.Nfc, Color(0xFFF43F5E), surface, border, Modifier.weight(1f), onNfc)
                FrontToolCard("Files", "SFTP · FTP · S3", Icons.Rounded.Folder, Electric, surface, border, Modifier.weight(1f), onFiles)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FrontToolCard("GS1 codec", "Decode & encode", Icons.Rounded.Code, Violet, surface, border, Modifier.weight(1f), onDecode)
                FrontToolCard("Scan", "OCR & barcodes", Icons.Rounded.QrCodeScanner, Color(0xFFFFBB66), surface, border, Modifier.weight(1f), onOcr)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FrontToolCard("LAN radar", "Find readers", Icons.Rounded.Radar, ZeusMint, surface, border, Modifier.weight(1f), onLanScanner)
                FrontToolCard("Tag lab", "Generate EPCs", Icons.Rounded.QrCode, Color(0xFF8EA8FF), surface, border, Modifier.weight(1f), onSynthesizer)
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                FrontToolCard("Database", "Query & inspect", Icons.Rounded.Storage, Color(0xFF76B8FF), surface, border, Modifier.weight(1f), onDatabase)
                FrontToolCard("All Tools", "Explore suite", Icons.Rounded.Widgets, Violet, surface, border, Modifier.weight(1f), onModules)
            }
        }

        FrontPressable(onClick = onModules, modifier = Modifier.fillMaxWidth()) { pressed ->
            Row(
                Modifier.fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .background(Brush.horizontalGradient(listOf(Violet.copy(alpha = 0.15f), Electric.copy(alpha = 0.09f))))
                    .border(1.dp, Violet.copy(alpha = if (pressed) 0.75f else 0.28f), RoundedCornerShape(20.dp))
                    .padding(18.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Rounded.Widgets, null, tint = Violet)
                Spacer(Modifier.width(13.dp))
                Column(Modifier.weight(1f)) {
                    Text("Explore all modules", color = foreground, fontWeight = FontWeight.Bold)
                    Text("Full toolkit and what's coming next", color = secondary, fontSize = 12.sp)
                }
                Icon(Icons.AutoMirrored.Rounded.ArrowForward, null, tint = Violet)
            }
        }
        Text(
            "ZEUS  /  BUILT FOR THE EDGE",
            modifier = Modifier.fillMaxWidth().padding(bottom = 18.dp),
            color = secondary.copy(alpha = 0.65f),
            fontSize = 10.sp,
            letterSpacing = 2.sp
        )
    }
}

private data class NeuronSpec(
    val baseX: Float,
    val baseY: Float,
    val driftAmpX: Float,
    val driftAmpY: Float,
    val freqX: Float,
    val freqY: Float,
    val phaseX: Float,
    val phaseY: Float,
    val baseRadiusDp: Float,
    val pulseFreq: Float,
    val pulsePhase: Float
)

private data class SynapticSignal(
    val fromIdx: Int,
    val toIdx: Int,
    val speed: Float,
    val phaseOffset: Float,
    val colorType: Int
)

@Composable
private fun FrontHero(onFixed: () -> Unit, onModules: () -> Unit) {
    val motionEnabled = zeusMotionEnabled()
    val transition = rememberInfiniteTransition(label = "NeuralNetwork")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * PI).toFloat(),
        animationSpec = infiniteRepeatable(tween(12000, easing = LinearEasing)),
        label = "NeuronDriftPhase"
    )
    val signalPhase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(3600, easing = LinearEasing)),
        label = "SynapticSignalPhase"
    )

    // Neural network constellation topology (22 nodes distributed across right/background)
    val neurons = remember {
        listOf(
            // Primary focal cluster
            NeuronSpec(0.00f, 0.00f, 0.07f, 0.05f, 1.0f, 0.8f, 0.0f, 1.2f, 4.2f, 1.4f, 0.2f),
            NeuronSpec(0.25f, -0.22f, 0.06f, 0.08f, 0.7f, 1.1f, 1.5f, 0.5f, 3.4f, 1.2f, 1.8f),
            NeuronSpec(-0.24f, -0.18f, 0.08f, 0.06f, 1.2f, 0.6f, 2.7f, 3.1f, 3.6f, 1.7f, 0.9f),
            NeuronSpec(0.20f, 0.24f, 0.06f, 0.07f, 0.9f, 1.3f, 4.1f, 2.0f, 3.2f, 1.0f, 2.5f),
            NeuronSpec(-0.19f, 0.20f, 0.07f, 0.06f, 1.4f, 0.9f, 5.2f, 4.4f, 3.8f, 1.3f, 3.3f),

            // Secondary intermediate nodes
            NeuronSpec(0.48f, -0.06f, 0.06f, 0.07f, 0.8f, 1.0f, 3.3f, 0.8f, 3.2f, 1.3f, 4.1f),
            NeuronSpec(-0.46f, -0.08f, 0.07f, 0.08f, 1.1f, 1.2f, 0.8f, 5.0f, 3.5f, 1.5f, 1.1f),
            NeuronSpec(0.36f, -0.44f, 0.07f, 0.06f, 1.3f, 0.7f, 2.1f, 2.6f, 2.8f, 0.9f, 0.4f),
            NeuronSpec(-0.10f, -0.48f, 0.06f, 0.07f, 0.6f, 1.4f, 4.8f, 1.7f, 3.2f, 1.6f, 2.9f),
            NeuronSpec(0.44f, 0.36f, 0.06f, 0.07f, 1.0f, 0.8f, 1.9f, 3.8f, 2.8f, 1.1f, 3.7f),
            NeuronSpec(-0.04f, 0.50f, 0.07f, 0.06f, 1.2f, 1.0f, 3.6f, 0.3f, 3.6f, 1.4f, 1.5f),
            NeuronSpec(-0.40f, 0.38f, 0.06f, 0.07f, 0.8f, 1.2f, 5.5f, 2.9f, 2.9f, 1.2f, 4.8f),

            // Bridge nodes reaching across to background behind text
            NeuronSpec(-0.70f, -0.20f, 0.06f, 0.07f, 0.9f, 0.7f, 1.1f, 4.0f, 2.6f, 1.0f, 0.7f),
            NeuronSpec(-0.66f, 0.16f, 0.07f, 0.06f, 1.1f, 1.3f, 2.4f, 1.6f, 2.8f, 1.3f, 2.2f),
            NeuronSpec(-0.86f, -0.04f, 0.05f, 0.06f, 0.7f, 1.0f, 4.3f, 3.4f, 2.3f, 0.8f, 3.9f),

            // Outer periphery network
            NeuronSpec(0.16f, -0.66f, 0.05f, 0.06f, 1.2f, 0.9f, 0.5f, 2.2f, 2.5f, 1.3f, 1.9f),
            NeuronSpec(0.64f, -0.26f, 0.06f, 0.07f, 0.8f, 1.1f, 3.0f, 5.1f, 2.6f, 1.1f, 4.3f),
            NeuronSpec(0.66f, 0.18f, 0.05f, 0.06f, 1.4f, 0.8f, 2.0f, 0.9f, 2.7f, 1.5f, 0.6f),
            NeuronSpec(0.30f, 0.60f, 0.06f, 0.07f, 0.9f, 1.2f, 4.6f, 3.3f, 2.4f, 1.0f, 2.8f),
            NeuronSpec(-0.54f, 0.46f, 0.05f, 0.06f, 1.0f, 0.8f, 1.7f, 2.5f, 2.3f, 1.2f, 5.1f),
            NeuronSpec(-0.34f, -0.54f, 0.06f, 0.07f, 1.3f, 1.1f, 3.9f, 1.4f, 2.6f, 1.4f, 3.4f),
            NeuronSpec(0.56f, 0.50f, 0.05f, 0.06f, 0.7f, 1.3f, 5.1f, 4.2f, 2.4f, 0.9f, 1.0f)
        )
    }

    // Active synaptic pathways where electrical impulses (action potentials) fire
    val signals = remember {
        listOf(
            SynapticSignal(fromIdx = 0, toIdx = 1, speed = 0.85f, phaseOffset = 0.00f, colorType = 0),
            SynapticSignal(fromIdx = 1, toIdx = 5, speed = 0.95f, phaseOffset = 0.35f, colorType = 0),
            SynapticSignal(fromIdx = 0, toIdx = 2, speed = 0.75f, phaseOffset = 0.50f, colorType = 1),
            SynapticSignal(fromIdx = 2, toIdx = 6, speed = 1.10f, phaseOffset = 0.85f, colorType = 0),
            SynapticSignal(fromIdx = 6, toIdx = 12, speed = 0.70f, phaseOffset = 0.20f, colorType = 2),
            SynapticSignal(fromIdx = 12, toIdx = 14, speed = 0.90f, phaseOffset = 0.65f, colorType = 1),
            SynapticSignal(fromIdx = 0, toIdx = 4, speed = 0.80f, phaseOffset = 0.40f, colorType = 0),
            SynapticSignal(fromIdx = 4, toIdx = 10, speed = 1.05f, phaseOffset = 0.75f, colorType = 1),
            SynapticSignal(fromIdx = 10, toIdx = 11, speed = 0.65f, phaseOffset = 0.10f, colorType = 0),
            SynapticSignal(fromIdx = 0, toIdx = 3, speed = 0.90f, phaseOffset = 0.30f, colorType = 2),
            SynapticSignal(fromIdx = 3, toIdx = 9, speed = 1.15f, phaseOffset = 0.60f, colorType = 0),
            SynapticSignal(fromIdx = 2, toIdx = 8, speed = 0.85f, phaseOffset = 0.45f, colorType = 1),
            SynapticSignal(fromIdx = 1, toIdx = 7, speed = 1.00f, phaseOffset = 0.90f, colorType = 0),
            SynapticSignal(fromIdx = 5, toIdx = 17, speed = 0.75f, phaseOffset = 0.15f, colorType = 0)
        )
    }

    Box(
        Modifier.fillMaxWidth().height(284.dp)
            .clip(RoundedCornerShape(30.dp))
            .background(Brush.linearGradient(listOf(Ink, Color(0xFF0B3148), Color(0xFF07566B))))
            .border(1.dp, Electric.copy(alpha = 0.27f), RoundedCornerShape(30.dp))
    ) {
        Canvas(Modifier.fillMaxSize()) {
            val center = Offset(size.width * 0.78f, size.height * 0.46f)
            val networkRadius = size.width * 0.44f
            val count = neurons.size

            // 1. Calculate real-time positions for all neurons (zero heap allocation)
            val nodeX = FloatArray(count)
            val nodeY = FloatArray(count)
            for (i in 0 until count) {
                val n = neurons[i]
                val driftX = if (motionEnabled) sin(phase * n.freqX + n.phaseX) * n.driftAmpX else 0f
                val driftY = if (motionEnabled) cos(phase * n.freqY + n.phaseY) * n.driftAmpY else 0f
                nodeX[i] = center.x + (n.baseX + driftX) * networkRadius
                nodeY[i] = center.y + (n.baseY + driftY) * networkRadius * 0.85f
            }

            // 2. Ambient deep neural field glow
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        Electric.copy(alpha = 0.16f),
                        Color(0xFF0EA5E9).copy(alpha = 0.08f),
                        Color.Transparent
                    ),
                    center = center,
                    radius = networkRadius * 0.70f
                ),
                center = center,
                radius = networkRadius * 0.70f
            )

            // 3. Synaptic connections (axons/dendrites drawn when nodes are in proximity)
            val maxConnectDist = networkRadius * 0.40f
            val maxDistSq = maxConnectDist * maxConnectDist

            for (i in 0 until count) {
                val x1 = nodeX[i]
                val y1 = nodeY[i]
                for (j in i + 1 until count) {
                    val x2 = nodeX[j]
                    val y2 = nodeY[j]
                    val dx = x1 - x2
                    val dy = y1 - y2
                    val dSq = dx * dx + dy * dy
                    if (dSq < maxDistSq) {
                        val dist = sqrt(dSq)
                        val proximity = 1f - (dist / maxConnectDist)
                        val alpha = (proximity * proximity * 0.48f).coerceIn(0f, 0.48f)
                        val strokeWidth = (proximity * 1.6f + 0.6f).dp.toPx()
                        drawLine(
                            color = Electric.copy(alpha = alpha),
                            start = Offset(x1, y1),
                            end = Offset(x2, y2),
                            strokeWidth = strokeWidth
                        )
                    }
                }
            }

            // 4. Action Potentials / Synaptic Impulses traveling along connections
            if (motionEnabled) {
                signals.forEach { sig ->
                    val x1 = nodeX[sig.fromIdx]
                    val y1 = nodeY[sig.fromIdx]
                    val x2 = nodeX[sig.toIdx]
                    val y2 = nodeY[sig.toIdx]
                    val dx = x1 - x2
                    val dy = y1 - y2
                    val dSq = dx * dx + dy * dy
                    if (dSq < maxDistSq * 1.25f) {
                        val progress = (signalPhase * sig.speed + sig.phaseOffset) % 1f
                        val sigX = x1 + (x2 - x1) * progress
                        val sigY = y1 + (y2 - y1) * progress
                        val sigPos = Offset(sigX, sigY)
                        val pulseFade = sin(progress * PI.toFloat()).coerceIn(0f, 1f)

                        if (pulseFade > 0.05f) {
                            val sparkColor = when (sig.colorType) {
                                1 -> Color(0xFF38BDF8)
                                2 -> Violet
                                else -> Color.White
                            }

                            // Synaptic impulse aura
                            drawCircle(
                                brush = Brush.radialGradient(
                                    colors = listOf(
                                        sparkColor.copy(alpha = pulseFade * 0.85f),
                                        Electric.copy(alpha = pulseFade * 0.35f),
                                        Color.Transparent
                                    ),
                                    center = sigPos,
                                    radius = 9.dp.toPx()
                                ),
                                center = sigPos,
                                radius = 9.dp.toPx()
                            )

                            // Brilliant action potential spark core
                            drawCircle(
                                color = Color.White.copy(alpha = pulseFade),
                                radius = 2.2.dp.toPx(),
                                center = sigPos
                            )
                        }
                    }
                }
            }

            // 5. Neuron Nodes (Soma with pulsating auras and bright nuclei)
            for (i in 0 until count) {
                val n = neurons[i]
                val posX = nodeX[i]
                val posY = nodeY[i]
                val pos = Offset(posX, posY)

                val pulse = if (motionEnabled) {
                    (0.85f + 0.25f * sin(phase * n.pulseFreq + n.pulsePhase)).coerceIn(0.6f, 1.2f)
                } else 1.0f

                val baseRadiusPx = n.baseRadiusDp.dp.toPx() * pulse

                // Soft neural halo / receptive field
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            Electric.copy(alpha = 0.28f * pulse),
                            Color(0xFF0EA5E9).copy(alpha = 0.10f * pulse),
                            Color.Transparent
                        ),
                        center = pos,
                        radius = baseRadiusPx * 3.4f
                    ),
                    center = pos,
                    radius = baseRadiusPx * 3.4f
                )

                // Neuron soma cell body
                drawCircle(
                    color = Electric.copy(alpha = 0.80f),
                    radius = baseRadiusPx,
                    center = pos
                )

                // High-luminance nucleus
                drawCircle(
                    color = Color.White.copy(alpha = 0.95f),
                    radius = baseRadiusPx * 0.45f,
                    center = pos
                )
            }
        }
        Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.SpaceBetween) {
            Text("RFID CONTROL CENTER   /   V10.2", color = Electric, fontSize = 10.sp, letterSpacing = 1.5.sp, fontWeight = FontWeight.Bold)
            Column {
                Text("RFID, in\nmotion.", color = Color.White, fontSize = 38.sp, lineHeight = 40.sp, fontWeight = FontWeight.Black)
                Spacer(Modifier.height(7.dp))
                Text("Discover. Emulate. Decode.", color = Color(0xFFB7D8E3), fontSize = 13.sp)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                FrontPressable(onClick = onFixed) { _ ->
                    Row(
                        Modifier.clip(CircleShape).background(Electric)
                            .padding(horizontal = 17.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Find an Edge", color = Ink, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        Spacer(Modifier.width(7.dp))
                        Icon(Icons.AutoMirrored.Rounded.ArrowForward, null, tint = Ink, modifier = Modifier.size(16.dp))
                    }
                }
                FrontPressable(onClick = onModules) { _ ->
                    Text(
                        "Tools",
                        color = Color.White,
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(10.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun FrontModeCard(
    title: String, subtitle: String, icon: ImageVector, accent: Color,
    surface: Color, border: Color, modifier: Modifier = Modifier, onClick: () -> Unit
) {
    val foreground = MaterialTheme.colorScheme.onSurface
    val secondary = MaterialTheme.colorScheme.onSurfaceVariant
    FrontPressable(onClick, modifier) { pressed ->
        Column(
            Modifier.fillMaxWidth().height(160.dp)
                .clip(RoundedCornerShape(22.dp))
                .background(surface)
                .border(1.dp, if (pressed) accent else border, RoundedCornerShape(22.dp))
                .padding(16.dp),
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            Box(Modifier.size(43.dp).clip(RoundedCornerShape(13.dp))
                .background(accent.copy(alpha = 0.16f)), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = accent, modifier = Modifier.size(23.dp))
            }
            Column {
                Text(title, color = foreground, fontSize = 16.sp, fontWeight = FontWeight.Bold)
                Text(subtitle, color = secondary, fontSize = 11.sp, lineHeight = 14.sp)
            }
            Icon(Icons.AutoMirrored.Rounded.ArrowForward, null, tint = accent, modifier = Modifier.size(17.dp))
        }
    }
}

@Composable
private fun FrontToolCard(
    title: String, subtitle: String, icon: ImageVector, accent: Color,
    surface: Color, border: Color, modifier: Modifier = Modifier, onClick: () -> Unit
) {
    val foreground = MaterialTheme.colorScheme.onSurface
    val secondary = MaterialTheme.colorScheme.onSurfaceVariant
    FrontPressable(onClick, modifier) { pressed ->
        Row(
            Modifier.fillMaxWidth().height(86.dp)
                .clip(RoundedCornerShape(19.dp))
                .background(surface)
                .border(1.dp, if (pressed) accent else border, RoundedCornerShape(19.dp))
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(Modifier.size(37.dp).clip(RoundedCornerShape(11.dp))
                .background(accent.copy(alpha = 0.14f)), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = accent, modifier = Modifier.size(21.dp))
            }
            Spacer(Modifier.width(9.dp))
            Column {
                Text(title, color = foreground, fontSize = 13.sp, fontWeight = FontWeight.Bold, maxLines = 1)
                Text(subtitle, color = secondary, fontSize = 10.sp, maxLines = 1)
            }
        }
    }
}

@Composable
private fun FrontPressable(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    content: @Composable (Boolean) -> Unit
) {
    val haptic = LocalHapticFeedback.current
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val motionEnabled = zeusMotionEnabled()
    val scale by animateFloatAsState(
        if (pressed && motionEnabled) 0.96f else 1f,
        spring(dampingRatio = 0.65f, stiffness = 450f),
        label = "FrontPress"
    )
    Box(
        modifier.scale(scale).clickable(interactionSource = interaction, indication = null, role = Role.Button) {
            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
            com.zeus.rfid.ui.util.SoundEffectHelper.playClick()
            onClick()
        }
    ) { content(pressed) }
}
