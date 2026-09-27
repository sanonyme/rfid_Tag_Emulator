package com.zeus.rfid.ui.decode

import android.content.Intent
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.isSystemInDarkTheme
import com.zeus.rfid.ui.components.isZeusDarkTheme
import com.zeus.rfid.ui.components.zeusCardBg
import com.zeus.rfid.ui.components.zeusCardBorderColor
import com.zeus.rfid.ui.components.zeusInnerBoxBg
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.ArrowDownward
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Clear
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.ContentPaste
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Memory
import androidx.compose.material.icons.rounded.QrCode
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Transform
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Warning
import com.zeus.rfid.ui.components.ZeusActionButton as Button
import androidx.compose.material3.ButtonDefaults
import com.zeus.rfid.ui.components.ZeusCard as Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import com.zeus.rfid.ui.components.ZeusScaffold as Scaffold
import com.zeus.rfid.ui.components.ZeusModule
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.zeus.rfid.data.tdt.BitSegment
import com.zeus.rfid.data.tdt.SgtinDetails
import com.zeus.rfid.data.tdt.TdtAi
import com.zeus.rfid.data.tdt.TdtDecodeResult
import com.zeus.rfid.data.tdt.TdtEncodeResult
import com.zeus.rfid.data.tdt.TdtEngine
import com.zeus.rfid.data.tdt.TdtOutputLevel
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusCyanAccent
import com.zeus.rfid.ui.theme.ZeusMint

private val BIT_SEGMENT_COLORS = listOf(
    Color(0xFF2563EB), // Header: Blue
    Color(0xFF059669), // Filter: Emerald
    Color(0xFFD97706), // Partition: Amber
    Color(0xFF7C3AED), // Company: Violet
    Color(0xFFE11D48), // Item Ref: Rose
    Color(0xFF0891B2)  // Serial: Cyan
)

private val EXAMPLE_EPCS = listOf(
    Pair("SGTIN-96", "3034257BF400B40000000123"),
    Pair("TDS 2.x", "F73095212341234538566CB0AFC4"),
    Pair("AI JSON", "{\"01\":\"09521234123453\",\"21\":\"32a/b\"}"),
    Pair("Digital Link", "https://id.gs1.org/01/09521234123453/21/32a%2Fb"),
    Pair("Tag URI", "urn:epc:tag:sgtin-198:0.9521234.012345.32a%2F"),
    Pair("Pure URI", "urn:epc:id:sgtin:9521234.012345.32a%2Fb"),
    Pair("Bare ID", "gtin=09521234123453;serial=32a/b")
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DecodeEncodeScreen(
    viewModel: DecodeEncodeViewModel,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val isDark = isZeusDarkTheme()
    val haptic = LocalHapticFeedback.current

    val cardBg = zeusCardBg(isDark)
    val cardBorder = zeusCardBorderColor(isDark)
    val innerBoxBg = zeusInnerBoxBg(isDark)

    Scaffold(
        module = ZeusModule.Codec, status = if (state.isDecoding || state.isEncoding) "Translating tag data" else if (state.selectedTab == 0) "EPC to GS1 identity" else "GS1 identity to EPC", busy = state.isDecoding || state.isEncoding,
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                modifier = Modifier.padding(top = 8.dp),
                title = {
                    Column {
                        Text(
                            text = "Decode / Encode",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Text(
                            text = "Universal EPC Tag Data Translation",
                            style = MaterialTheme.typography.labelSmall,
                            color = ZeusCyanAccent,
                            fontWeight = FontWeight.Medium
                        )
                    }
                },
                navigationIcon = {
                    IconButton(
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onNavigateBack()
                        }
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "Back",
                            tint = MaterialTheme.colorScheme.onBackground
                        )
                    }
                },
                actions = {
                    Box(
                        modifier = Modifier
                            .padding(end = 16.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(ZeusBlue.copy(alpha = 0.12f))
                            .border(1.dp, ZeusBlue.copy(alpha = 0.25f), RoundedCornerShape(8.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = "GS1 TDS 2.3",
                            style = MaterialTheme.typography.labelSmall,
                            color = ZeusBlue,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = androidx.compose.ui.graphics.Color.Transparent
                )
            )
        },
        modifier = modifier.fillMaxSize()
    ) { paddingValues ->
        DecodeEncodeContent(
            viewModel = viewModel,
            modifier = Modifier.padding(paddingValues)
        )
    }
}

@Composable
fun DecodeEncodeContent(
    viewModel: DecodeEncodeViewModel,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val isDark = isZeusDarkTheme()
    val haptic = LocalHapticFeedback.current

    val cardBg = zeusCardBg(isDark)
    val cardBorder = zeusCardBorderColor(isDark)
    val innerBoxBg = zeusInnerBoxBg(isDark)

    val scrollState = rememberScrollState()

    // Smoothly scroll down when encodeResult arrives so the user immediately sees the generated card
    LaunchedEffect(state.encodeResult) {
        if (state.encodeResult != null) {
            scrollState.animateScrollTo(scrollState.maxValue)
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 16.dp)
            .padding(top = 12.dp, bottom = 48.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Segmented Control Row
        SingleChoiceSegmentedButtonRow(
            modifier = Modifier.fillMaxWidth()
        ) {
            SegmentedButton(
                selected = state.selectedTab == 0,
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    viewModel.setTab(0)
                },
                shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
                border = SegmentedButtonDefaults.borderStroke(color = cardBorder),
                icon = {
                    Icon(
                        imageVector = Icons.Rounded.ArrowDownward,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                },
                colors = SegmentedButtonDefaults.colors(
                    activeContainerColor = ZeusBlue.copy(alpha = 0.15f),
                    activeContentColor = ZeusBlue,
                    inactiveContainerColor = cardBg,
                    inactiveContentColor = MaterialTheme.colorScheme.onSurfaceVariant
                )
            ) {
                Text("Decode", fontWeight = FontWeight.Bold)
            }

            SegmentedButton(
                selected = state.selectedTab == 1,
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    viewModel.setTab(1)
                },
                shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
                border = SegmentedButtonDefaults.borderStroke(color = cardBorder),
                icon = {
                    Icon(
                        imageVector = Icons.Rounded.ArrowUpward,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                },
                colors = SegmentedButtonDefaults.colors(
                    activeContainerColor = ZeusMint.copy(alpha = 0.15f),
                    activeContentColor = ZeusMint,
                    inactiveContainerColor = cardBg,
                    inactiveContentColor = MaterialTheme.colorScheme.onSurfaceVariant
                )
            ) {
                Text("Encode", fontWeight = FontWeight.Bold)
            }
        }

        // Tab Content
        Crossfade(
            targetState = state.selectedTab,
            animationSpec = tween(200),
            label = "DecodeEncodeCrossfade"
        ) { tab ->
            when (tab) {
                0 -> DecodeSection(
                    state = state,
                    viewModel = viewModel,
                    cardBg = cardBg,
                    cardBorder = cardBorder,
                    innerBoxBg = innerBoxBg,
                    isDark = isDark
                )
                1 -> EncodeSection(
                    state = state,
                    viewModel = viewModel,
                    cardBg = cardBg,
                    cardBorder = cardBorder,
                    innerBoxBg = innerBoxBg,
                    isDark = isDark
                )
            }
        }
        Spacer(modifier = Modifier.height(28.dp))
    }
}

// =============================================================================
// DECODE SECTION
// =============================================================================

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DecodeSection(
    state: DecodeEncodeUiState,
    viewModel: DecodeEncodeViewModel,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    isDark: Boolean
) {
    val haptic = LocalHapticFeedback.current
    val clipboardManager = LocalClipboardManager.current
    val context = LocalContext.current

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Input Card
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = cardBg),
            elevation = CardDefaults.cardElevation(defaultElevation = if (isDark) 0.dp else 1.5.dp),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, cardBorder, RoundedCornerShape(18.dp))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(ZeusBlue.copy(alpha = 0.14f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.QrCode,
                                contentDescription = null,
                                tint = ZeusBlue,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "EPC Input",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "Paste 24-hex EPC, URI, Digital Link, or AI JSON",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        IconButton(
                            onClick = {
                                val clip = clipboardManager.getText()?.text.orEmpty().trim()
                                if (clip.isNotEmpty()) {
                                    viewModel.setEpcInput(clip)
                                    viewModel.onDecode()
                                    Toast.makeText(context, "Pasted from clipboard", Toast.LENGTH_SHORT).show()
                                } else {
                                    Toast.makeText(context, "Clipboard is empty", Toast.LENGTH_SHORT).show()
                                }
                            },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.ContentPaste,
                                contentDescription = "Paste",
                                tint = ZeusCyanAccent,
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        IconButton(
                            onClick = { viewModel.onClearDecode() },
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Clear,
                                contentDescription = "Clear",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                OutlinedTextField(
                    value = state.epcInput,
                    onValueChange = { viewModel.setEpcInput(it) },
                    placeholder = {
                        Text(
                            text = "3034257BF400B40000000123 / urn:epc:tag:... / https://id.gs1.org/...",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                        )
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedContainerColor = innerBoxBg,
                        unfocusedContainerColor = innerBoxBg,
                        focusedBorderColor = ZeusBlue,
                        unfocusedBorderColor = cardBorder
                    ),
                    textStyle = MaterialTheme.typography.bodyMedium.copy(
                        fontFamily = FontFamily.Monospace,
                        fontSize = 13.sp,
                        lineHeight = 18.sp
                    ),
                    minLines = 2,
                    maxLines = 4
                )

                Spacer(modifier = Modifier.height(10.dp))

                // Quick Examples Bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Rounded.AutoAwesome,
                        contentDescription = null,
                        tint = ZeusCyanAccent,
                        modifier = Modifier.size(14.dp)
                    )
                    Text(
                        text = "EXAMPLES:",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontWeight = FontWeight.Bold
                    )
                    EXAMPLE_EPCS.forEach { (label, value) ->
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (isDark) Color(0xFF1E2638) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                                .border(0.5.dp, cardBorder, RoundedCornerShape(8.dp))
                                .clickable {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    viewModel.applyExample(value)
                                }
                                .padding(horizontal = 9.dp, vertical = 5.dp)
                        ) {
                            Text(
                                text = label,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurface,
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(14.dp))

                // Scheme Selector Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Scheme Target",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    var schemeExpanded by remember { mutableStateOf(false) }
                    Box {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(innerBoxBg)
                                .border(1.dp, cardBorder, RoundedCornerShape(10.dp))
                                .clickable { schemeExpanded = true }
                                .padding(horizontal = 12.dp, vertical = 7.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = if (state.forcedScheme.isEmpty()) {
                                        "Auto-detect${if (state.detectedSchemes.isNotEmpty()) " · ${state.detectedSchemes.first()}" else ""}"
                                    } else state.forcedScheme,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold,
                                    color = if (state.forcedScheme.isEmpty()) ZeusCyanAccent else ZeusBlue
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Icon(
                                    imageVector = Icons.Rounded.KeyboardArrowDown,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }

                        DropdownMenu(
                            expanded = schemeExpanded,
                            onDismissRequest = { schemeExpanded = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Auto-detect (Recommended)") },
                                onClick = {
                                    viewModel.setForcedScheme("")
                                    schemeExpanded = false
                                }
                            )
                            TdtEngine.ALL_SUPPORTED_SCHEMES.forEach { s ->
                                DropdownMenuItem(
                                    text = { Text(s, fontFamily = FontFamily.Monospace) },
                                    onClick = {
                                        viewModel.setForcedScheme(s)
                                        schemeExpanded = false
                                    }
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Modern Decode Button
                DecodeActionButton(
                    text = "Decode EPC",
                    isLoading = state.isDecoding,
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        viewModel.onDecode()
                    }
                )
            }
        }

        // Error message if any
        if (state.decodeError != null) {
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f)),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Warning,
                        contentDescription = "Error",
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = state.decodeError ?: "Decoding failed",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                }
            }
        }

        // Decode Result
        state.decodeResult?.let { res ->
            // Parsed Status Bar
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
                            .clip(RoundedCornerShape(8.dp))
                            .background(ZeusMint.copy(alpha = 0.15f))
                            .padding(horizontal = 10.dp, vertical = 5.dp)
                    ) {
                        Text(
                            text = res.scheme,
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = ZeusMint,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                    if (res.detectedGcpLength != null) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(innerBoxBg)
                                .border(0.5.dp, cardBorder, RoundedCornerShape(8.dp))
                                .padding(horizontal = 8.dp, vertical = 5.dp)
                        ) {
                            Text(
                                text = "GCP ${res.detectedGcpLength} digits",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(innerBoxBg)
                        .padding(horizontal = 8.dp, vertical = 5.dp)
                ) {
                    Text(
                        text = "Parsed ${res.inputLevel}",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // SGTIN-96 Deconstruction Console (when available)
            res.sgtinDetails?.let { details ->
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = cardBg),
                    elevation = CardDefaults.cardElevation(defaultElevation = if (isDark) 0.dp else 1.5.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, cardBorder, RoundedCornerShape(18.dp))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(ZeusCyanAccent.copy(alpha = 0.15f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Memory,
                                        contentDescription = null,
                                        tint = ZeusCyanAccent,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text(
                                        text = "SGTIN-96 Deconstruction",
                                        style = MaterialTheme.typography.titleSmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = "Field-level GS1 element breakdown",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(14.dp))

                        DetailRow(label = "GTIN-14", value = details.gtin, isMono = true, canCopy = true)
                        DetailRow(
                            label = "Check Digit",
                            value = details.checkDigit,
                            isMono = true,
                            valueColor = ZeusMint,
                            badge = "Valid"
                        )
                        DetailRow(label = "Serial Number", value = details.serial, isMono = true, canCopy = true)
                        DetailRow(label = "Filter Value", value = "${details.filter} (${getFilterLabel(details.filter)})")
                        DetailRow(label = "Partition Table", value = "Partition ${details.partition} (${details.companyPrefix.length}d Company, ${details.itemReference.length}d Item)")
                        DetailRow(label = "Company Prefix", value = details.companyPrefix, isMono = true)
                        DetailRow(label = "Item Reference", value = details.itemReference, isMono = true)
                    }
                }
            }

            // GS1 Application Identifiers (AI)
            if (res.ais.isNotEmpty()) {
                Card(
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.cardColors(containerColor = cardBg),
                    elevation = CardDefaults.cardElevation(defaultElevation = if (isDark) 0.dp else 1.5.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .border(1.dp, cardBorder, RoundedCornerShape(18.dp))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(32.dp)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(ZeusBlue.copy(alpha = 0.15f)),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Layers,
                                        contentDescription = null,
                                        tint = ZeusBlue,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                                Spacer(modifier = Modifier.width(10.dp))
                                Text(
                                    text = "Application Identifiers",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(ZeusBlue.copy(alpha = 0.12f))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = "${res.ais.size} AIs",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = ZeusBlue,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(12.dp))

                        res.ais.forEach { ai ->
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(vertical = 4.dp)
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(innerBoxBg)
                                    .border(0.5.dp, cardBorder, RoundedCornerShape(12.dp))
                                    .padding(12.dp)
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Row(
                                        verticalAlignment = Alignment.CenterVertically,
                                        modifier = Modifier.weight(1f)
                                    ) {
                                        Box(
                                            modifier = Modifier
                                                .clip(RoundedCornerShape(8.dp))
                                                .background(ZeusCyanAccent.copy(alpha = 0.15f))
                                                .padding(horizontal = 8.dp, vertical = 4.dp)
                                        ) {
                                            Text(
                                                text = "AI ${ai.ai}",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = ZeusCyanAccent,
                                                fontWeight = FontWeight.Bold,
                                                fontFamily = FontFamily.Monospace
                                            )
                                        }
                                        Spacer(modifier = Modifier.width(12.dp))
                                        Column {
                                            Text(
                                                text = ai.label,
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                            Text(
                                                text = ai.value,
                                                style = MaterialTheme.typography.bodySmall,
                                                fontFamily = FontFamily.Monospace,
                                                fontWeight = FontWeight.Bold,
                                                color = MaterialTheme.colorScheme.onSurface
                                            )
                                        }
                                    }

                                    IconButton(
                                        onClick = {
                                            clipboardManager.setText(AnnotatedString(ai.value))
                                            Toast.makeText(context, "Copied AI (${ai.ai})", Toast.LENGTH_SHORT).show()
                                        },
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.ContentCopy,
                                            contentDescription = "Copy",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.size(16.dp)
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // All Representations Card
            Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = cardBg),
                elevation = CardDefaults.cardElevation(defaultElevation = if (isDark) 0.dp else 1.5.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, cardBorder, RoundedCornerShape(18.dp))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "All Representations",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Standard URI formats and GS1 data carriers",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Spacer(modifier = Modifier.height(14.dp))

                    TdtOutputLevel.entries.forEach { level ->
                        val value = res.outputs[level]
                        if (!value.isNullOrEmpty()) {
                            RepresentationRow(
                                label = level.label,
                                value = value,
                                innerBoxBg = innerBoxBg,
                                cardBorder = cardBorder
                            )
                            Spacer(modifier = Modifier.height(10.dp))
                        }
                    }
                }
            }
        }
    }
}

// =============================================================================
// ENCODE SECTION
// =============================================================================

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EncodeSection(
    state: DecodeEncodeUiState,
    viewModel: DecodeEncodeViewModel,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    isDark: Boolean
) {
    val haptic = LocalHapticFeedback.current
    val clipboardManager = LocalClipboardManager.current
    val context = LocalContext.current

    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Target Scheme Card
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = cardBg),
            elevation = CardDefaults.cardElevation(defaultElevation = if (isDark) 0.dp else 1.5.dp),
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, cardBorder, RoundedCornerShape(18.dp))
        ) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(34.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(ZeusMint.copy(alpha = 0.14f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Tune,
                                contentDescription = null,
                                tint = ZeusMint,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(10.dp))
                        Column {
                            Text(
                                text = "Encoding Scheme",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "Select RFID tag encoding standard",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }

                    var schemeMenuOpen by remember { mutableStateOf(false) }
                    Box {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(innerBoxBg)
                                .border(1.dp, cardBorder, RoundedCornerShape(10.dp))
                                .clickable { schemeMenuOpen = true }
                                .padding(horizontal = 12.dp, vertical = 7.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = state.encodeScheme,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold,
                                    color = ZeusMint
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Icon(
                                    imageVector = Icons.Rounded.KeyboardArrowDown,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }

                        DropdownMenu(
                            expanded = schemeMenuOpen,
                            onDismissRequest = { schemeMenuOpen = false }
                        ) {
                            TdtEngine.ALL_SUPPORTED_SCHEMES.forEach { s ->
                                DropdownMenuItem(
                                    text = { Text(s, fontFamily = FontFamily.Monospace) },
                                    onClick = {
                                        viewModel.setEncodeScheme(s)
                                        schemeMenuOpen = false
                                    }
                                )
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Scheme Quick Fields
                val scheme = state.encodeScheme.uppercase()
                when {
                    scheme.contains("SSCC") -> {
                        OutlinedTextField(
                            value = state.quickSscc,
                            onValueChange = { viewModel.setQuickSscc(it) },
                            label = { Text("SSCC (17 or 18 digits)") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)
                        )
                        CheckDigitHint(raw = state.quickSscc, bodyLen = 17)
                        Spacer(modifier = Modifier.height(10.dp))
                        PrefixAndFilterRow(
                            companyPrefixLength = state.companyPrefixLength,
                            onCompanyPrefixChange = { viewModel.setCompanyPrefixLength(it) },
                            filterValue = state.filterValue,
                            onFilterChange = { viewModel.setFilterValue(it) },
                            innerBoxBg = innerBoxBg,
                            cardBorder = cardBorder
                        )
                    }
                    scheme.contains("SGLN") -> {
                        OutlinedTextField(
                            value = state.quickGln,
                            onValueChange = { viewModel.setQuickGln(it) },
                            label = { Text("GLN (12 or 13 digits)") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)
                        )
                        CheckDigitHint(raw = state.quickGln, bodyLen = 12)
                        Spacer(modifier = Modifier.height(10.dp))
                        OutlinedTextField(
                            value = state.quickSerial,
                            onValueChange = { viewModel.setQuickSerial(it) },
                            label = { Text("Extension / Serial") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        PrefixAndFilterRow(
                            companyPrefixLength = state.companyPrefixLength,
                            onCompanyPrefixChange = { viewModel.setCompanyPrefixLength(it) },
                            filterValue = state.filterValue,
                            onFilterChange = { viewModel.setFilterValue(it) },
                            innerBoxBg = innerBoxBg,
                            cardBorder = cardBorder
                        )
                    }
                    scheme.contains("GID") -> {
                        OutlinedTextField(
                            value = state.quickGm,
                            onValueChange = { viewModel.setQuickGm(it) },
                            label = { Text("General Manager Number") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        OutlinedTextField(
                            value = state.quickObjectClass,
                            onValueChange = { viewModel.setQuickObjectClass(it) },
                            label = { Text("Object Class") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        OutlinedTextField(
                            value = state.quickSerial,
                            onValueChange = { viewModel.setQuickSerial(it) },
                            label = { Text("Serial Number") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)
                        )
                    }
                    scheme.contains("USDOD") -> {
                        OutlinedTextField(
                            value = state.quickCage,
                            onValueChange = { viewModel.setQuickCage(it) },
                            label = { Text("CAGE / DoDAAC (5-6 characters)") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)
                        )
                        Spacer(modifier = Modifier.height(10.dp))
                        OutlinedTextField(
                            value = state.quickSerial,
                            onValueChange = { viewModel.setQuickSerial(it) },
                            label = { Text("Serial Number") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)
                        )
                    }
                    else -> {
                        // SGTIN-96 default form
                        OutlinedTextField(
                            value = state.quickGtin,
                            onValueChange = { viewModel.setQuickGtin(it) },
                            label = { Text("GTIN / UPC") },
                            placeholder = { Text("e.g. 09521234123453") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)
                        )
                        CheckDigitHint(raw = state.quickGtin, bodyLen = 13)

                        Spacer(modifier = Modifier.height(10.dp))

                        OutlinedTextField(
                            value = state.quickSerial,
                            onValueChange = { viewModel.setQuickSerial(it) },
                            label = { Text(if (state.serialIsUid) "UID (E016 + 12 Hex)" else "Serial Number") },
                            placeholder = { Text(if (state.serialIsUid) "e.g. E0167801034E89FC" else "e.g. 123") },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(12.dp),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace)
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        // UID Toggle Box
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(12.dp))
                                .background(innerBoxBg)
                                .border(0.5.dp, cardBorder, RoundedCornerShape(12.dp))
                                .padding(horizontal = 14.dp, vertical = 10.dp)
                        ) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = "UID Input Toggle",
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Text(
                                        text = "E016 + 12 hex → extracts lower 38 bits numeric EPC serial",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Switch(
                                    checked = state.serialIsUid,
                                    onCheckedChange = { viewModel.setSerialIsUid(it) },
                                    colors = SwitchDefaults.colors(
                                        checkedThumbColor = Color.White,
                                        checkedTrackColor = ZeusMint
                                    )
                                )
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))

                        PrefixAndFilterRow(
                            companyPrefixLength = state.companyPrefixLength,
                            onCompanyPrefixChange = { viewModel.setCompanyPrefixLength(it) },
                            filterValue = state.filterValue,
                            onFilterChange = { viewModel.setFilterValue(it) },
                            innerBoxBg = innerBoxBg,
                            cardBorder = cardBorder
                        )
                    }
                }

                Spacer(modifier = Modifier.height(18.dp))

                // Encode Action Button
                EncodeActionButton(
                    text = "Generate Hex EPC",
                    isLoading = state.isEncoding,
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        viewModel.onEncode()
                    }
                )
            }
        }

        // Encode Error
        if (state.encodeError != null) {
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f)),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, MaterialTheme.colorScheme.error.copy(alpha = 0.5f), RoundedCornerShape(14.dp))
            ) {
                Row(
                    modifier = Modifier.padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Warning,
                        contentDescription = "Error",
                        tint = MaterialTheme.colorScheme.error,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = state.encodeError ?: "Encoding failed",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                }
            }
        }

        // Generated EPC Output Card
        state.encodeResult?.let { enc ->
            Card(
                shape = RoundedCornerShape(20.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (isDark) Color(0xFF131A26) else MaterialTheme.colorScheme.surface
                ),
                elevation = CardDefaults.cardElevation(defaultElevation = if (isDark) 0.dp else 2.5.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .border(
                        width = 1.dp,
                        color = if (isDark) ZeusMint.copy(alpha = 0.35f) else ZeusMint.copy(alpha = 0.45f),
                        shape = RoundedCornerShape(20.dp)
                    )
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(18.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    // Header: Icon + Title + Badges
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp)
                        ) {
                            Box(
                                modifier = Modifier
                                    .size(34.dp)
                                    .clip(RoundedCornerShape(10.dp))
                                    .background(ZeusMint.copy(alpha = 0.15f)),
                                contentAlignment = Alignment.Center
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.CheckCircle,
                                    contentDescription = null,
                                    tint = ZeusMint,
                                    modifier = Modifier.size(19.dp)
                                )
                            }
                            Column {
                                Text(
                                    text = "Generated EPC (Hex)",
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                                Text(
                                    text = "GS1 TDS 2.3 Binary Encoding",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        // Badges: Scheme & Bit Count
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(ZeusMint.copy(alpha = 0.15f))
                                    .border(1.dp, ZeusMint.copy(alpha = 0.3f), RoundedCornerShape(8.dp))
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Text(
                                    text = enc.scheme,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (isDark) ZeusMint else Color(0xFF047857),
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(ZeusBlue.copy(alpha = 0.12f))
                                    .border(1.dp, ZeusBlue.copy(alpha = 0.25f), RoundedCornerShape(8.dp))
                                    .padding(horizontal = 7.dp, vertical = 4.dp)
                            ) {
                                Text(
                                    text = "${enc.binary.length}b",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (isDark) ZeusBlue else Color(0xFF1D4ED8),
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }
                    }

                    // 1. High-Contrast Terminal Hex Box
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(if (isDark) Color(0xFF090D16) else Color(0xFF0F172A))
                            .border(1.dp, Color(0xFF1E293B), RoundedCornerShape(14.dp))
                            .padding(14.dp)
                    ) {
                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "EPC HEX PAYLOAD",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.3.sp,
                                    color = Color(0xFF94A3B8)
                                )

                                var copiedHex by remember { mutableStateOf(false) }
                                Row(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(6.dp))
                                        .background(Color(0xFF1E293B))
                                        .clickable {
                                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                            clipboardManager.setText(AnnotatedString(enc.hex))
                                            copiedHex = true
                                            Toast.makeText(context, "Copied Hex EPC", Toast.LENGTH_SHORT).show()
                                        }
                                        .padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                                ) {
                                    Icon(
                                        imageVector = if (copiedHex) Icons.Rounded.Check else Icons.Rounded.ContentCopy,
                                        contentDescription = "Copy Hex",
                                        tint = if (copiedHex) Color(0xFF34D399) else Color(0xFF94A3B8),
                                        modifier = Modifier.size(13.dp)
                                    )
                                    Text(
                                        text = if (copiedHex) "COPIED" else "COPY",
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                        fontWeight = FontWeight.Bold,
                                        fontFamily = FontFamily.Monospace,
                                        color = if (copiedHex) Color(0xFF34D399) else Color(0xFFCBD5E1)
                                    )
                                }
                            }

                            Text(
                                text = enc.hex,
                                style = MaterialTheme.typography.bodyLarge.copy(
                                    fontFamily = FontFamily.Monospace,
                                    fontWeight = FontWeight.Bold,
                                    letterSpacing = 1.4.sp,
                                    fontSize = 15.sp,
                                    lineHeight = 22.sp
                                ),
                                color = Color(0xFF38BDF8)
                            )
                        }
                    }

                    // 2. Expandable GS1 Format Identifiers
                    var showExtraFormats by remember { mutableStateOf(false) }
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(innerBoxBg)
                            .border(0.5.dp, cardBorder, RoundedCornerShape(12.dp))
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { showExtraFormats = !showExtraFormats }
                                .padding(horizontal = 14.dp, vertical = 11.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.QrCode,
                                    contentDescription = null,
                                    tint = ZeusMint,
                                    modifier = Modifier.size(17.dp)
                                )
                                Text(
                                    text = "GS1 URIs & Digital Link",
                                    style = MaterialTheme.typography.labelMedium,
                                    fontWeight = FontWeight.SemiBold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }
                            Icon(
                                imageVector = if (showExtraFormats) Icons.Rounded.ArrowUpward else Icons.Rounded.KeyboardArrowDown,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp)
                            )
                        }

                        AnimatedVisibility(visible = showExtraFormats) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = 14.dp)
                                    .padding(bottom = 12.dp),
                                verticalArrangement = Arrangement.spacedBy(10.dp)
                            ) {
                                enc.tagUri?.let { uri ->
                                    RepresentationRow(label = "Tag URI (TDS 2.3)", value = uri, innerBoxBg = cardBg, cardBorder = cardBorder)
                                }
                                enc.pureUri?.let { uri ->
                                    RepresentationRow(label = "Pure Identity URI", value = uri, innerBoxBg = cardBg, cardBorder = cardBorder)
                                }
                                enc.digitalLink?.let { dl ->
                                    RepresentationRow(label = "GS1 Digital Link URI", value = dl, innerBoxBg = cardBg, cardBorder = cardBorder)
                                }
                                RepresentationRow(label = "Binary Representation (${enc.binary.length} bits)", value = enc.binary, innerBoxBg = cardBg, cardBorder = cardBorder)
                            }
                        }
                    }

                    // 3. Actions Row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .height(46.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(
                                    Brush.horizontalGradient(
                                        colors = listOf(ZeusBlue, Color(0xFF2563EB))
                                    )
                                )
                                .clickable {
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    viewModel.sendToDecoder(enc.hex)
                                },
                            contentAlignment = Alignment.Center
                        ) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Transform,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp)
                                )
                                Text(
                                    text = "Send to Decoder",
                                    color = Color.White,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }

                        IconButton(
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                val shareBody = buildString {
                                    appendLine("GS1 EPC (${enc.scheme})")
                                    appendLine("Hex: ${enc.hex}")
                                    enc.tagUri?.let { appendLine("Tag URI: $it") }
                                    enc.digitalLink?.let { appendLine("Digital Link: $it") }
                                }
                                val sendIntent = Intent().apply {
                                    action = Intent.ACTION_SEND
                                    putExtra(Intent.EXTRA_TEXT, shareBody)
                                    type = "text/plain"
                                }
                                context.startActivity(Intent.createChooser(sendIntent, "Share Encoded EPC"))
                            },
                            modifier = Modifier
                                .size(46.dp)
                                .clip(RoundedCornerShape(12.dp))
                                .background(innerBoxBg)
                                .border(1.dp, cardBorder, RoundedCornerShape(12.dp))
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Share,
                                contentDescription = "Share",
                                tint = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

@Composable
private fun DecodeActionButton(
    text: String,
    isLoading: Boolean,
    onClick: () -> Unit
) {
    val haptic = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.97f else 1f,
        animationSpec = spring(dampingRatio = 0.6f, stiffness = 400f),
        label = "DecodeButtonScale"
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .scale(scale)
            .clip(RoundedCornerShape(14.dp))
            .background(
                Brush.horizontalGradient(
                    colors = listOf(ZeusCyanAccent, ZeusBlue)
                )
            )
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    onClick()
                }
            ),
        contentAlignment = Alignment.Center
    ) {
        if (isLoading) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = Color.White,
                    strokeWidth = 2.dp
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Decoding…", fontWeight = FontWeight.Bold, color = Color.White)
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Rounded.Transform,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = text,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    style = MaterialTheme.typography.bodyLarge
                )
            }
        }
    }
}

@Composable
private fun EncodeActionButton(
    text: String,
    isLoading: Boolean,
    onClick: () -> Unit
) {
    val haptic = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.97f else 1f,
        animationSpec = spring(dampingRatio = 0.6f, stiffness = 400f),
        label = "EncodeButtonScale"
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(48.dp)
            .scale(scale)
            .clip(RoundedCornerShape(14.dp))
            .background(
                Brush.horizontalGradient(
                    colors = listOf(ZeusMint, Color(0xFF0D9488))
                )
            )
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    onClick()
                }
            ),
        contentAlignment = Alignment.Center
    ) {
        if (isLoading) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                CircularProgressIndicator(
                    modifier = Modifier.size(20.dp),
                    color = Color.White,
                    strokeWidth = 2.dp
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Encoding…", fontWeight = FontWeight.Bold, color = Color.White)
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Rounded.AutoAwesome,
                    contentDescription = null,
                    tint = Color.White,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = text,
                    fontWeight = FontWeight.Bold,
                    color = Color.White,
                    style = MaterialTheme.typography.bodyLarge
                )
            }
        }
    }
}

@Composable
private fun DetailRow(
    label: String,
    value: String,
    isMono: Boolean = false,
    valueColor: Color = MaterialTheme.colorScheme.onSurface,
    badge: String? = null,
    canCopy: Boolean = false
) {
    val clipboardManager = LocalClipboardManager.current
    val context = LocalContext.current

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 5.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = value,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontFamily = if (isMono) FontFamily.Monospace else FontFamily.Default,
                    fontWeight = FontWeight.SemiBold
                ),
                color = valueColor
            )
            if (badge != null) {
                Spacer(modifier = Modifier.width(6.dp))
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(4.dp))
                        .background(ZeusMint.copy(alpha = 0.15f))
                        .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = badge,
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                        color = ZeusMint,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            if (canCopy) {
                Spacer(modifier = Modifier.width(6.dp))
                IconButton(
                    onClick = {
                        clipboardManager.setText(AnnotatedString(value))
                        Toast.makeText(context, "Copied $label", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier.size(24.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.ContentCopy,
                        contentDescription = "Copy",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(13.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun RepresentationRow(
    label: String,
    value: String,
    innerBoxBg: Color,
    cardBorder: Color
) {
    val clipboardManager = LocalClipboardManager.current
    val context = LocalContext.current

    Column(modifier = Modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            IconButton(
                onClick = {
                    clipboardManager.setText(AnnotatedString(value))
                    Toast.makeText(context, "Copied $label", Toast.LENGTH_SHORT).show()
                },
                modifier = Modifier.size(24.dp)
            ) {
                Icon(
                    imageVector = Icons.Rounded.ContentCopy,
                    contentDescription = "Copy",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(13.dp)
                )
            }
        }

        Spacer(modifier = Modifier.height(3.dp))

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(10.dp))
                .background(innerBoxBg)
                .border(0.5.dp, cardBorder, RoundedCornerShape(10.dp))
                .padding(10.dp)
        ) {
            Text(
                text = value,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontFamily = FontFamily.Monospace,
                    fontSize = 11.sp,
                    lineHeight = 16.sp
                ),
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun BitVisualizerCard(
    segments: List<BitSegment>,
    epcHex: String,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    isDark: Boolean
) {
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        elevation = CardDefaults.cardElevation(defaultElevation = if (isDark) 0.dp else 1.5.dp),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, cardBorder, RoundedCornerShape(18.dp))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(ZeusBlue.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Memory,
                            contentDescription = null,
                            tint = ZeusBlue,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = "SGTIN-96 Bit Layout",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "Color-mapped 96-bit register segmentation",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(ZeusBlue.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "96 bits",
                        style = MaterialTheme.typography.labelSmall,
                        color = ZeusBlue,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace
                    )
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Proportional Segments Bar
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(38.dp)
                    .clip(RoundedCornerShape(10.dp))
            ) {
                Row(modifier = Modifier.fillMaxSize()) {
                    segments.forEach { seg ->
                        val color = BIT_SEGMENT_COLORS.getOrElse(seg.colorIndex) { Color.Gray }
                        Box(
                            modifier = Modifier
                                .weight(seg.bits.toFloat())
                                .fillMaxSize()
                                .background(color),
                            contentAlignment = Alignment.Center
                        ) {
                            if (seg.bits >= 8) {
                                Text(
                                    text = seg.label,
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold
                                )
                            }
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            // Value indicators below bar
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(32.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(innerBoxBg)
                    .border(0.5.dp, cardBorder, RoundedCornerShape(10.dp))
            ) {
                Row(modifier = Modifier.fillMaxSize()) {
                    segments.forEach { seg ->
                        Box(
                            modifier = Modifier
                                .weight(seg.bits.toFloat())
                                .fillMaxSize()
                                .border(0.5.dp, cardBorder.copy(alpha = 0.5f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = seg.value,
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Legend
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                segments.forEach { seg ->
                    val color = BIT_SEGMENT_COLORS.getOrElse(seg.colorIndex) { Color.Gray }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(9.dp)
                                .clip(CircleShape)
                                .background(color)
                        )
                        Spacer(modifier = Modifier.width(5.dp))
                        Text(
                            text = "${seg.label} (${seg.bits}b)",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Share / Copy Actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedButton(
                    onClick = {
                        val text = segments.joinToString("\n") {
                            "${it.label} (${it.bits}b): ${it.value} [${it.binaryStr}]"
                        } + "\n\nEPC Hex: $epcHex"
                        clipboardManager.setText(AnnotatedString(text))
                        Toast.makeText(context, "Bit layout copied as text", Toast.LENGTH_SHORT).show()
                    },
                    modifier = Modifier.height(36.dp),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.ContentCopy,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Copy Layout", style = MaterialTheme.typography.labelSmall)
                }

                Spacer(modifier = Modifier.width(8.dp))

                OutlinedButton(
                    onClick = {
                        val sendIntent: Intent = Intent().apply {
                            action = Intent.ACTION_SEND
                            putExtra(
                                Intent.EXTRA_TEXT,
                                "SGTIN-96 Deconstruction:\n" +
                                        segments.joinToString("\n") { "${it.label} (${it.bits}b): ${it.value}" } +
                                        "\nEPC Hex: $epcHex"
                            )
                            type = "text/plain"
                        }
                        val shareIntent = Intent.createChooser(sendIntent, "Share Bit Layout")
                        context.startActivity(shareIntent)
                    },
                    modifier = Modifier.height(36.dp),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Share,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Share", style = MaterialTheme.typography.labelSmall)
                }
            }
        }
    }
}

@Composable
private fun CheckDigitHint(raw: String, bodyLen: Int) {
    val digits = raw.replace(Regex("[^0-9]"), "")
    if (digits.length == bodyLen) {
        val calc = TdtEngine.calculateCheckDigit(digits)
        Row(
            modifier = Modifier.padding(top = 5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Calculated check digit: ",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(ZeusBlue.copy(alpha = 0.15f))
                    .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
                Text(
                    text = calc,
                    style = MaterialTheme.typography.labelSmall,
                    color = ZeusBlue,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace
                )
            }
        }
    } else if (digits.length == bodyLen + 1) {
        val body = digits.take(bodyLen)
        val provided = digits.takeLast(1)
        val calc = TdtEngine.calculateCheckDigit(body)
        val isValid = provided == calc

        Row(
            modifier = Modifier.padding(top = 5.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (isValid) Icons.Rounded.CheckCircle else Icons.Rounded.Warning,
                contentDescription = null,
                tint = if (isValid) ZeusMint else MaterialTheme.colorScheme.error,
                modifier = Modifier.size(15.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = if (isValid) "Check digit is valid ($provided)" else "Check digit mismatch (expected $calc, got $provided)",
                style = MaterialTheme.typography.labelSmall,
                fontWeight = FontWeight.SemiBold,
                color = if (isValid) ZeusMint else MaterialTheme.colorScheme.error
            )
        }
    }
}

@Composable
private fun PrefixAndFilterRow(
    companyPrefixLength: Int,
    onCompanyPrefixChange: (Int) -> Unit,
    filterValue: Int,
    onFilterChange: (Int) -> Unit,
    innerBoxBg: Color,
    cardBorder: Color
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        // Company Prefix Length Picker
        var cplMenuOpen by remember { mutableStateOf(false) }
        Box(modifier = Modifier.weight(1f)) {
            Column {
                Text(
                    text = "Prefix Length",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium
                )
                Spacer(modifier = Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(innerBoxBg)
                        .border(1.dp, cardBorder, RoundedCornerShape(10.dp))
                        .clickable { cplMenuOpen = true }
                        .padding(horizontal = 12.dp, vertical = 9.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "$companyPrefixLength digits",
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Bold
                        )
                        Icon(
                            imageVector = Icons.Rounded.KeyboardArrowDown,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }

            DropdownMenu(
                expanded = cplMenuOpen,
                onDismissRequest = { cplMenuOpen = false }
            ) {
                (6..12).forEach { len ->
                    DropdownMenuItem(
                        text = { Text("$len digits", fontFamily = FontFamily.Monospace) },
                        onClick = {
                            onCompanyPrefixChange(len)
                            cplMenuOpen = false
                        }
                    )
                }
            }
        }

        // Filter Value Picker
        var filterMenuOpen by remember { mutableStateOf(false) }
        Box(modifier = Modifier.weight(1f)) {
            Column {
                Text(
                    text = "Filter Value",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium
                )
                Spacer(modifier = Modifier.height(4.dp))
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(innerBoxBg)
                        .border(1.dp, cardBorder, RoundedCornerShape(10.dp))
                        .clickable { filterMenuOpen = true }
                        .padding(horizontal = 12.dp, vertical = 9.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "$filterValue — ${getFilterShortLabel(filterValue)}",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Bold,
                            maxLines = 1
                        )
                        Icon(
                            imageVector = Icons.Rounded.KeyboardArrowDown,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }

            DropdownMenu(
                expanded = filterMenuOpen,
                onDismissRequest = { filterMenuOpen = false }
            ) {
                (0..7).forEach { f ->
                    DropdownMenuItem(
                        text = { Text("$f — ${getFilterLabel(f)}") },
                        onClick = {
                            onFilterChange(f)
                            filterMenuOpen = false
                        }
                    )
                }
            }
        }
    }
}

private fun getFilterLabel(filter: Int): String {
    return when (filter) {
        0 -> "All others (retail)"
        1 -> "POS trade item"
        2 -> "Full case transport"
        3 -> "Reserved"
        4 -> "Inner pack"
        5 -> "Reserved"
        6 -> "Unit load"
        7 -> "Component"
        else -> "Filter $filter"
    }
}

private fun getFilterShortLabel(filter: Int): String {
    return when (filter) {
        0 -> "Retail"
        1 -> "POS Item"
        2 -> "Full Case"
        3 -> "Reserved"
        4 -> "Inner Pack"
        5 -> "Reserved"
        6 -> "Unit Load"
        7 -> "Component"
        else -> "$filter"
    }
}
