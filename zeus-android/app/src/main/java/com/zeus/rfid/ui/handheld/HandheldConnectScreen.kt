package com.zeus.rfid.ui.handheld

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.rounded.BugReport
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Router
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import com.zeus.rfid.ui.components.ZeusScaffold as Scaffold
import com.zeus.rfid.ui.components.ZeusModule
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.zeus.rfid.ui.components.ZeusButton
import com.zeus.rfid.ui.components.ZeusButtonVariant
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusMint

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HandheldConnectScreen(
    viewModel: HandheldConnectViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToEmulation: (clientIp: String) -> Unit,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val haptic = LocalHapticFeedback.current
    val isDark = isSystemInDarkTheme()

    // Listen for automatic connection events
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is HandheldConnectEvent.NavigateToEmulation -> {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    onNavigateToEmulation(event.clientIp)
                }
            }
        }
    }

    val pulseTransition = rememberInfiniteTransition(label = "RadarPulse")
    val pulseScale by pulseTransition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.35f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "PulseScale"
    )
    val pulseAlpha by pulseTransition.animateFloat(
        initialValue = 0.6f,
        targetValue = 0.1f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "PulseAlpha"
    )

    Scaffold(
        module = ZeusModule.Handheld, status = if (state.isServerRunning) "Listening on TCP ${state.port}" else "Server stopped", busy = state.isServerRunning,
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                modifier = Modifier.padding(top = 8.dp),
                title = {
                    Column {
                        Text(
                            text = "Handheld Setup",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Text(
                            text = "VSBL Debug Connection",
                            style = MaterialTheme.typography.labelSmall,
                            color = ZeusMint
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "Back",
                            tint = MaterialTheme.colorScheme.onBackground
                        )
                    }
                },
                actions = {
                    IconButton(onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                        viewModel.refreshNetworkInfo()
                        Toast.makeText(context, "Network IP refreshed", Toast.LENGTH_SHORT).show()
                    }) {
                        Icon(
                            imageVector = Icons.Rounded.Refresh,
                            contentDescription = "Refresh IP",
                            tint = MaterialTheme.colorScheme.onBackground
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = androidx.compose.ui.graphics.Color.Transparent
                )
            )
        },
        modifier = modifier.fillMaxSize()
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Live Server Status Indicator Banner
            val isConnected = state.connectedClients.isNotEmpty()
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(ZeusMint.copy(alpha = 0.12f))
                    .border(1.dp, ZeusMint.copy(alpha = 0.35f), RoundedCornerShape(14.dp))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Box(
                            modifier = Modifier
                                .size(20.dp)
                                .scale(pulseScale)
                                .clip(CircleShape)
                                .background(ZeusMint.copy(alpha = pulseAlpha))
                        )
                        Box(
                            modifier = Modifier
                                .size(10.dp)
                                .clip(CircleShape)
                                .background(ZeusMint)
                        )
                    }

                    Column {
                        Text(
                            text = if (isConnected) "Handheld Connected" else "Handheld Server Listening",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = if (isConnected) "Connection active. Ready for emulation." else "Waiting for incoming handheld connection...",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(ZeusMint)
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = ":${state.port}",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        color = Color.Black
                    )
                }
            }

            // Phone IP Address Hero Card
            val cardBg = if (isDark) Color(0xFF131722) else MaterialTheme.colorScheme.surface
            val cardBorder = if (isDark) Color(0xFF232B3E) else MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(20.dp))
                    .background(cardBg)
                    .border(1.dp, cardBorder, RoundedCornerShape(20.dp))
                    .padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(ZeusBlue.copy(alpha = 0.12f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Wifi,
                                contentDescription = null,
                                tint = ZeusBlue,
                                modifier = Modifier.size(20.dp)
                            )
                        }

                        Text(
                            text = "PHONE'S IP ADDRESS",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            letterSpacing = 0.8.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                            .clickable {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                clipboardManager.setText(AnnotatedString(state.phoneIp))
                                Toast.makeText(context, "IP copied: ${state.phoneIp}", Toast.LENGTH_SHORT).show()
                            }
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.ContentCopy,
                                contentDescription = "Copy IP",
                                tint = ZeusBlue,
                                modifier = Modifier.size(14.dp)
                            )
                            Text(
                                text = "Copy",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = ZeusBlue
                            )
                        }
                    }
                }

                // Monospace Large IP Capsule
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(
                            Brush.linearGradient(
                                colors = listOf(
                                    ZeusBlue.copy(alpha = 0.15f),
                                    ZeusMint.copy(alpha = 0.08f)
                                )
                            )
                        )
                        .border(1.dp, ZeusBlue.copy(alpha = 0.4f), RoundedCornerShape(14.dp))
                        .clickable {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            clipboardManager.setText(AnnotatedString(state.phoneIp))
                            Toast.makeText(context, "IP copied: ${state.phoneIp}", Toast.LENGTH_SHORT).show()
                        }
                        .padding(vertical = 16.dp, horizontal = 14.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(
                            text = state.phoneIp,
                            style = MaterialTheme.typography.headlineMedium.copy(
                                fontFamily = FontFamily.Monospace,
                                fontSize = 28.sp,
                                letterSpacing = 1.sp
                            ),
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Spacer(modifier = Modifier.height(2.dp))
                        Text(
                            text = "Tap to copy address",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                        )
                    }
                }
            }

            // Step By Step Process Diagram Card (Matching user reference design)
            StepByStepProcessCard(
                phoneIp = state.phoneIp,
                port = state.port,
                cardBg = cardBg,
                cardBorder = cardBorder,
                isDark = isDark,
                onCopy = { label, value ->
                    clipboardManager.setText(AnnotatedString(value))
                    Toast.makeText(context, "$label copied: $value", Toast.LENGTH_SHORT).show()
                }
            )

            // Connected Clients Banner (if any client connected) - Says Handheld Connected without listing IPs/ports
            if (isConnected) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(ZeusMint.copy(alpha = 0.15f))
                        .border(1.dp, ZeusMint, RoundedCornerShape(14.dp))
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.CheckCircle,
                        contentDescription = null,
                        tint = ZeusMint,
                        modifier = Modifier.size(24.dp)
                    )
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Handheld Connected",
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            color = ZeusMint
                        )
                        Text(
                            text = "Connection established. Ready to emulate.",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Action: Manual Emulation Button
            ZeusButton(
                text = if (isConnected) "Open Handheld Emulation" else "Enter Emulation Mode",
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    viewModel.proceedToEmulationManually()
                },
                variant = ZeusButtonVariant.Primary,
                modifier = Modifier.fillMaxWidth()
            )
        }
    }
}

/**
 * Step by Step Process Data Model.
 */
private data class ProcessStep(
    val id: Int,
    val title: String,
    val shortCaption: String,
    val description: String,
    val icon: ImageVector,
    val isHighlighted: Boolean = false,
    val copyValue: String? = null,
    val copyLabel: String? = null
)

/**
 * Sinuous snake process diagram card matching user reference image.
 */
@Composable
private fun StepByStepProcessCard(
    phoneIp: String,
    port: Int,
    cardBg: Color,
    cardBorder: Color,
    isDark: Boolean,
    onCopy: (String, String) -> Unit,
    modifier: Modifier = Modifier
) {
    val haptic = LocalHapticFeedback.current
    var selectedStepId by remember { mutableIntStateOf(2) } // Default highlight Step 2 (Debug ON) like 'Design' in reference image

    val steps = remember(phoneIp, port) {
        listOf(
            ProcessStep(
                id = 1,
                title = "Same Wi-Fi",
                shortCaption = "Connect to same\nlocal Wi-Fi",
                description = "Ensure this phone and the handheld reader are connected to the exact same local Wi-Fi network.",
                icon = Icons.Rounded.Wifi
            ),
            ProcessStep(
                id = 2,
                title = "Debug ON",
                shortCaption = "Enable Debug in\nVSBL app",
                description = "In the VSBL App on the handheld reader, open Settings and make sure Debugging is turned ON.",
                icon = Icons.Rounded.BugReport,
                isHighlighted = true
            ),
            ProcessStep(
                id = 3,
                title = "Port $port",
                shortCaption = "Set port number\nto $port",
                description = "In the VSBL Debug configuration, set the communication port to $port.",
                icon = Icons.Rounded.Router,
                copyValue = port.toString(),
                copyLabel = "Port"
            ),
            ProcessStep(
                id = 4,
                title = "Server IP",
                shortCaption = "Enter phone IP in\nVSBL host",
                description = "Put this phone's IP address ($phoneIp) into the Server IP field in VSBL.",
                icon = Icons.Rounded.Smartphone,
                copyValue = phoneIp,
                copyLabel = "IP"
            ),
            ProcessStep(
                id = 5,
                title = "Start Scan",
                shortCaption = "Return to scanner\n& begin scan",
                description = "Go back in the VSBL App to the main scanner page and begin an RFID scan or inventory operation.",
                icon = Icons.Rounded.PlayArrow
            ),
            ProcessStep(
                id = 6,
                title = "Emulate!",
                shortCaption = "Auto connects &\nstarts emulation",
                description = "When the handheld connects, Zeus will automatically open the emulation page.",
                icon = Icons.Rounded.CheckCircle
            )
        )
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(cardBg)
            .border(1.dp, cardBorder, RoundedCornerShape(20.dp))
            .padding(18.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // 1. Header (Matching reference image typography with translucent watermark motif)
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Translucent geometric polygon watermark icon matching reference image top-left motif
                Canvas(modifier = Modifier.size(16.dp)) {
                    val path = Path().apply {
                        moveTo(0f, size.height * 0.15f)
                        lineTo(size.width, size.height * 0.5f)
                        lineTo(size.width * 0.2f, size.height * 0.95f)
                        close()
                    }
                    drawPath(path, color = ZeusBlue.copy(alpha = 0.35f))
                }

                Text(
                    text = "STEP BY STEP PROCESS",
                    style = MaterialTheme.typography.labelSmall.copy(
                        letterSpacing = 1.6.sp,
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.5.sp
                    ),
                    color = if (isDark) Color(0xFF94A3B8) else Color(0xFF64748B)
                )
            }

            Text(
                text = buildAnnotatedString {
                    append("We Complete every ")
                    withStyle(
                        SpanStyle(
                            fontWeight = FontWeight.Bold,
                            color = if (isDark) Color.White else Color(0xFF0F172A)
                        )
                    ) {
                        append("Step Carefully")
                    }
                },
                style = MaterialTheme.typography.titleMedium.copy(
                    fontSize = 18.sp,
                    fontWeight = FontWeight.Normal
                ),
                color = if (isDark) Color(0xFFCBD5E1) else Color(0xFF334155)
            )
        }

        // 2. The Sinuous Snake Pathway Diagram (100% symmetric, both horizontally and vertically)
        BoxWithConstraints(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp)
        ) {
            val totalWidthPx = constraints.maxWidth.toFloat()
            val density = LocalDensity.current
            val circleRadiusPx = with(density) { 26.dp.toPx() }

            // Dynamic layout coordinate tracking to guarantee exact center alignment
            var row1CenterY by remember { mutableFloatStateOf(0f) }
            var row2CenterY by remember { mutableFloatStateOf(0f) }
            var col1X by remember { mutableFloatStateOf(0f) }
            var col2X by remember { mutableFloatStateOf(0f) }
            var col3X by remember { mutableFloatStateOf(0f) }

            // Background continuous blue winding path
            Canvas(modifier = Modifier.matchParentSize()) {
                if (row1CenterY > 0f && row2CenterY > 0f && col3X > 0f) {
                    val y1 = row1CenterY
                    val y2 = row2CenterY
                    // Symmetrical vertical centerline: exact midpoint between Row 1 and Row 2
                    val yMid = (y1 + y2) / 2f

                    // Symmetrical horizontal margins from card edges
                    val marginPx = with(density) { 6.dp.toPx() }
                    val turnRightApexX = totalWidthPx - marginPx
                    val turnLeftApexX = marginPx

                    // Available space outside Col 3 and Col 1 is identical by geometry
                    val spaceRight = turnRightApexX - col3X
                    val spaceLeft = col1X - turnLeftApexX
                    val symmetricSpace = minOf(spaceRight, spaceLeft)
                    val turnWidth = minOf(symmetricSpace * 0.70f, with(density) { 34.dp.toPx() })

                    val turnRightStartX = turnRightApexX - turnWidth
                    val turnLeftStartX = turnLeftApexX + turnWidth

                    // Control point offset for smooth, symmetric 180° loop
                    val cpOffset = turnWidth / 3f

                    // Symmetrical start & end tail extension beyond outer nodes
                    val tailPx = with(density) { 12.dp.toPx() }
                    val startX = col1X - circleRadiusPx - tailPx
                    val endX = col3X + circleRadiusPx + tailPx

                    val path = Path().apply {
                        // Row 1: Line passing through Col 1, Col 2, Col 3 to right turn start
                        moveTo(startX, y1)
                        lineTo(turnRightStartX, y1)

                        // Right 180° hairpin curve down to exact vertical midpoint yMid
                        cubicTo(
                            x1 = turnRightApexX + cpOffset, y1 = y1,
                            x2 = turnRightApexX + cpOffset, y2 = yMid,
                            x3 = turnRightStartX, y3 = yMid
                        )

                        // Middle horizontal line heading left across the centerline to left turn start
                        lineTo(turnLeftStartX, yMid)

                        // Left 180° hairpin curve down to Row 2 y2
                        cubicTo(
                            x1 = turnLeftApexX - cpOffset, y1 = yMid,
                            x2 = turnLeftApexX - cpOffset, y2 = y2,
                            x3 = turnLeftStartX, y3 = y2
                        )

                        // Row 2: Line passing through Col 1, Col 2, Col 3 to endX
                        lineTo(endX, y2)
                    }

                    drawPath(
                        path = path,
                        color = ZeusBlue,
                        style = Stroke(
                            width = with(density) { 3.5.dp.toPx() },
                            cap = StrokeCap.Round,
                            join = StrokeJoin.Round
                        )
                    )
                }
            }

            // Foreground: Nodes and labels layout
            Column(modifier = Modifier.fillMaxWidth()) {
                // Row 1 Circles (Steps 1, 2, 3)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .onGloballyPositioned { coords ->
                            row1CenterY = coords.positionInParent().y + coords.size.height / 2f
                        },
                    horizontalArrangement = Arrangement.SpaceAround,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    steps.take(3).forEachIndexed { index, step ->
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .onGloballyPositioned { coords ->
                                    val cX = coords.positionInParent().x + coords.size.width / 2f
                                    when (index) {
                                        0 -> col1X = cX
                                        1 -> col2X = cX
                                        2 -> col3X = cX
                                    }
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            ProcessStepCircle(
                                step = step,
                                isSelected = selectedStepId == step.id,
                                isDark = isDark,
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    selectedStepId = step.id
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Row 1 Labels
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceAround
                ) {
                    steps.take(3).forEach { step ->
                        ProcessStepLabel(
                            step = step,
                            isSelected = selectedStepId == step.id,
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                selectedStepId = step.id
                            },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }

                // Vertical spacing channel between Row 1 labels and Row 2 circles
                Spacer(modifier = Modifier.height(58.dp))

                // Row 2 Circles (Steps 4, 5, 6)
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .onGloballyPositioned { coords ->
                            row2CenterY = coords.positionInParent().y + coords.size.height / 2f
                        },
                    horizontalArrangement = Arrangement.SpaceAround,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    steps.drop(3).forEach { step ->
                        Box(
                            modifier = Modifier.weight(1f),
                            contentAlignment = Alignment.Center
                        ) {
                            ProcessStepCircle(
                                step = step,
                                isSelected = selectedStepId == step.id,
                                isDark = isDark,
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    selectedStepId = step.id
                                }
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Row 2 Labels
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceAround
                ) {
                    steps.drop(3).forEach { step ->
                        ProcessStepLabel(
                            step = step,
                            isSelected = selectedStepId == step.id,
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                selectedStepId = step.id
                            },
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }

        // 3. Interactive Step Detail Inspector
        val currentStep = steps.find { it.id == selectedStepId } ?: steps[1]
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(if (isDark) Color(0xFF1B2234) else ZeusBlue.copy(alpha = 0.06f))
                .border(
                    width = 1.dp,
                    color = ZeusBlue.copy(alpha = 0.35f),
                    shape = RoundedCornerShape(14.dp)
                )
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(36.dp)
                    .clip(CircleShape)
                    .background(ZeusBlue),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = currentStep.icon,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp)
                )
            }

            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = "STEP ${currentStep.id}: ${currentStep.title}",
                        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                        color = ZeusBlue
                    )
                }
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = currentStep.description,
                    style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            if (currentStep.copyValue != null) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(ZeusBlue)
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null
                        ) {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onCopy(currentStep.copyLabel ?: "Value", currentStep.copyValue)
                        }
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.ContentCopy,
                            contentDescription = "Copy",
                            tint = Color.White,
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            text = "Copy",
                            style = MaterialTheme.typography.labelSmall.copy(
                                fontWeight = FontWeight.Bold,
                                color = Color.White
                            )
                        )
                    }
                }
            }
        }
    }
}

/**
 * Individual circular process step node with concentric double-ring for selected/active steps.
 */
@Composable
private fun ProcessStepCircle(
    step: ProcessStep,
    isSelected: Boolean,
    isDark: Boolean,
    onClick: () -> Unit
) {
    val nodeBg = if (isDark) Color(0xFF161C2C) else Color.White

    Box(
        modifier = Modifier
            .size(54.dp)
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) { onClick() },
        contentAlignment = Alignment.Center
    ) {
        if (isSelected || step.isHighlighted) {
            // Outer concentric ring matching "Design" node in reference image
            Box(
                modifier = Modifier
                    .size(54.dp)
                    .clip(CircleShape)
                    .border(width = 2.dp, color = ZeusBlue, shape = CircleShape)
            )

            // Inner solid circle with breathing space
            Box(
                modifier = Modifier
                    .size(42.dp)
                    .clip(CircleShape)
                    .background(nodeBg)
                    .border(width = 1.8.dp, color = ZeusBlue, shape = CircleShape),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = step.icon,
                    contentDescription = step.title,
                    tint = ZeusBlue,
                    modifier = Modifier.size(20.dp)
                )
            }
        } else {
            // Regular unselected node: clean circle with subtle outline
            Box(
                modifier = Modifier
                    .size(46.dp)
                    .clip(CircleShape)
                    .background(nodeBg)
                    .border(
                        width = 1.4.dp,
                        color = if (isDark) Color(0xFF2A344A) else Color(0xFFE2E8F0),
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = step.icon,
                    contentDescription = step.title,
                    tint = if (isDark) Color(0xFF8E9BAE) else Color(0xFF64748B),
                    modifier = Modifier.size(20.dp)
                )
            }
        }
    }
}

/**
 * Label and subtitle text below each process step node.
 */
@Composable
private fun ProcessStepLabel(
    step: ProcessStep,
    isSelected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null
            ) { onClick() }
            .padding(horizontal = 4.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = step.title,
            style = MaterialTheme.typography.labelMedium.copy(
                fontSize = 11.5.sp,
                fontWeight = if (isSelected || step.isHighlighted) FontWeight.Bold else FontWeight.SemiBold
            ),
            color = if (isSelected || step.isHighlighted) ZeusBlue else MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
            maxLines = 1
        )

        Spacer(modifier = Modifier.height(2.dp))

        Text(
            text = step.shortCaption,
            style = MaterialTheme.typography.labelSmall.copy(
                fontSize = 9.5.sp,
                lineHeight = 12.sp
            ),
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.8f),
            textAlign = TextAlign.Center,
            maxLines = 2
        )
    }
}
