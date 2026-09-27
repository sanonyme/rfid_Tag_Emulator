package com.zeus.rfid.ui.handheld

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import com.zeus.rfid.ui.components.sheetTopCameraSafePadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.HelpOutline
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Clear
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.QrCode
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material.icons.rounded.Wifi
import com.zeus.rfid.ui.components.ZeusCard as Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import com.zeus.rfid.ui.components.ZeusScaffold as Scaffold
import com.zeus.rfid.ui.components.ZeusModule
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
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
import com.zeus.rfid.data.emulator.UpcCheckDigitHelper
import com.zeus.rfid.data.emulator.UpcCheckDigitStatus
import com.zeus.rfid.data.model.TagMode
import com.zeus.rfid.ui.components.ZeusButton
import com.zeus.rfid.ui.components.ZeusButtonVariant
import com.zeus.rfid.ui.components.ZeusRssiSlider
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusCyanAccent
import com.zeus.rfid.ui.theme.ZeusMint
import com.zeus.rfid.util.NetworkUtils
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HandheldEmulationScreen(
    viewModel: HandheldEmulationViewModel,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val haptic = LocalHapticFeedback.current
    val isDark = isSystemInDarkTheme()

    var showSettingsSheet by remember { mutableStateOf(false) }
    val localIp = remember { NetworkUtils.getLocalIpAddress() ?: "127.0.0.1" }

    // Settings BottomSheet (halfway expanded by default per user rule)
    if (showSettingsSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
        ModalBottomSheet(
            onDismissRequest = { showSettingsSheet = false },
            modifier = Modifier.sheetTopCameraSafePadding(),
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
        ) {
            HandheldSettingsContent(
                port = state.port,
                detailedTagLogging = state.detailedTagLogging,
                onToggleDetailedTagLogging = { viewModel.setDetailedTagLogging(it) },
                onDismiss = { showSettingsSheet = false }
            )
        }
    }

    Scaffold(
        module = ZeusModule.Handheld, status = if (state.isSending) "Broadcasting to ${state.clients.size} clients" else "${state.tagsTransmitted} tags transmitted", busy = state.isSending || state.isLooping,
        topBar = {
            TopAppBar(
                modifier = Modifier.padding(top = 8.dp),
                title = {
                    Column {
                        Text(
                            text = "Handheld Emulation",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            val dotColor = if (state.clients.isNotEmpty()) ZeusMint else Color(0xFFFFB300)
                            Box(
                                modifier = Modifier
                                    .size(7.dp)
                                    .clip(CircleShape)
                                    .background(dotColor)
                            )
                            Text(
                                text = if (state.clients.isNotEmpty()) {
                                    "Handheld Connected"
                                } else {
                                    ":${state.port} • Listening"
                                },
                                style = MaterialTheme.typography.bodySmall,
                                color = if (state.clients.isNotEmpty()) ZeusMint else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onNavigateBack()
                    }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                },
                actions = {
                    IconButton(onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        showSettingsSheet = true
                    }) {
                        Icon(
                            imageVector = Icons.Rounded.Settings,
                            contentDescription = "Settings"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
        modifier = modifier
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // 1. Connection Status Banner
            HandheldConnectionStatusCard(
                clients = state.clients,
                port = state.port,
                phoneIp = localIp,
                onCopyIp = {
                    clipboardManager.setText(AnnotatedString(localIp))
                    Toast.makeText(context, "IP copied: $localIp", Toast.LENGTH_SHORT).show()
                }
            )

            // 2. Tag Mode Tab Selector (UPC vs Direct EPC)
            SingleChoiceSegmentedButtonRow(
                modifier = Modifier.fillMaxWidth()
            ) {
                SegmentedButton(
                    selected = state.tagMode == TagMode.UPC,
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        viewModel.setTagMode(TagMode.UPC)
                    },
                    shape = SegmentedButtonDefaults.itemShape(index = 0, count = 2),
                    icon = {
                        Icon(
                            imageVector = Icons.Rounded.QrCode,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                ) {
                    Text("UPC → EPC", fontWeight = FontWeight.SemiBold)
                }

                SegmentedButton(
                    selected = state.tagMode == TagMode.EPC,
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        viewModel.setTagMode(TagMode.EPC)
                    },
                    shape = SegmentedButtonDefaults.itemShape(index = 1, count = 2),
                    icon = {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.List,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                ) {
                    Text("Direct EPC", fontWeight = FontWeight.SemiBold)
                }
            }

            // 3. Tag Configuration Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                ),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Header with badge and quick action buttons
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            Text(
                                text = if (state.tagMode == TagMode.UPC) "UPC Tag Recipe" else "Direct EPC List",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold
                            )
                            // Count badge
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(ZeusBlue.copy(alpha = 0.12f))
                                    .padding(horizontal = 8.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = "${state.calculatedTagCount} tag${if (state.calculatedTagCount != 1) "s" else ""}",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = ZeusBlue
                                )
                            }
                        }

                        // Quick buttons: Sample & Clear
                        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = "Sample",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = ZeusBlue,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .clickable {
                                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                        if (state.tagMode == TagMode.UPC) {
                                            viewModel.setUpcList("00000000000001,5\n00000000000002,3")
                                        } else {
                                            viewModel.setEpcList("E28011303000020786CA9E61\nE28011303000020786CA9E62\nE28011303000020786CA9E63\nE28011303000020786CA9E64")
                                        }
                                    }
                                    .padding(horizontal = 6.dp, vertical = 4.dp)
                            )

                            Text(
                                text = "Clear",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .clickable {
                                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                        if (state.tagMode == TagMode.UPC) {
                                            viewModel.setUpcList("")
                                        } else {
                                            viewModel.setEpcList("")
                                        }
                                    }
                                    .padding(horizontal = 6.dp, vertical = 4.dp)
                            )
                        }
                    }

                    if (state.tagMode == TagMode.UPC) {
                        // UPC Multiline Input
                        OutlinedTextField(
                            value = state.upcList,
                            onValueChange = { viewModel.setUpcList(it) },
                            placeholder = { Text("00000000000001,5\n00000000000002,3") },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(130.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = ZeusBlue,
                                unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)
                            ),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(
                                fontFamily = FontFamily.Monospace,
                                fontSize = 13.sp
                            )
                        )

                        Text(
                            text = "Format: UPC,Count[,TID[,userdata]] (one entry per line)",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        // Real-time Check Digit Helper (Same as Fixed tab!)
                        val checkStatus = remember(state.upcList) {
                            UpcCheckDigitHelper.analyzeUpcInput(state.upcList)
                        }

                        when (checkStatus) {
                            is UpcCheckDigitStatus.Hint -> {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(ZeusBlue.copy(alpha = 0.08f))
                                        .border(1.dp, ZeusBlue.copy(alpha = 0.25f), RoundedCornerShape(8.dp))
                                        .padding(horizontal = 10.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Info,
                                        contentDescription = null,
                                        tint = ZeusBlue,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        text = "Calculated check digit: ",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(ZeusBlue)
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = checkStatus.calculatedCheck,
                                            style = MaterialTheme.typography.labelSmall,
                                            fontFamily = FontFamily.Monospace,
                                            fontWeight = FontWeight.Bold,
                                            color = Color.White
                                        )
                                    }
                                    Text(
                                        text = "(${checkStatus.neededDigits} digits)",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }

                            is UpcCheckDigitStatus.Valid -> {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(ZeusMint.copy(alpha = 0.12f))
                                        .border(1.dp, ZeusMint.copy(alpha = 0.35f), RoundedCornerShape(8.dp))
                                        .padding(horizontal = 10.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.CheckCircle,
                                        contentDescription = null,
                                        tint = ZeusMint,
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        text = "Check digit is valid.",
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.SemiBold,
                                        color = ZeusMint
                                    )
                                }
                            }

                            is UpcCheckDigitStatus.Invalid -> {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(Color(0xFFFFF3E0))
                                        .border(1.dp, Color(0xFFFFB74D), RoundedCornerShape(8.dp))
                                        .padding(horizontal = 10.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Warning,
                                        contentDescription = null,
                                        tint = Color(0xFFE65100),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        text = "Check digit mismatch (expected ${checkStatus.expected}, got ${checkStatus.provided}).",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = Color(0xFFE65100)
                                    )
                                }
                            }

                            is UpcCheckDigitStatus.TooLong -> {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(Color(0xFFFFF3E0))
                                        .border(1.dp, Color(0xFFFFB74D), RoundedCornerShape(8.dp))
                                        .padding(horizontal = 10.dp, vertical = 8.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                                ) {
                                    Icon(
                                        imageVector = Icons.Rounded.Warning,
                                        contentDescription = null,
                                        tint = Color(0xFFE65100),
                                        modifier = Modifier.size(16.dp)
                                    )
                                    Text(
                                        text = "UPC has ${checkStatus.count} digits (>14).",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = Color(0xFFE65100)
                                    )
                                }
                            }

                            UpcCheckDigitStatus.None -> {}
                        }

                        // Serial Row
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedTextField(
                                value = state.startSerial.toString(),
                                onValueChange = { viewModel.setStartSerial(it.toLongOrNull() ?: 1L) },
                                label = { Text("Starting Serial") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                modifier = Modifier.weight(1f),
                                shape = RoundedCornerShape(12.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = ZeusBlue,
                                    unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)
                                )
                            )

                            Row(
                                modifier = Modifier.weight(1.3f),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.End
                            ) {
                                Column(horizontalAlignment = Alignment.End) {
                                    Text(
                                        text = "Continuous Serials",
                                        style = MaterialTheme.typography.bodySmall,
                                        fontWeight = FontWeight.Medium
                                    )
                                    Text(
                                        text = "Across UPC lines",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Spacer(modifier = Modifier.width(8.dp))
                                Switch(
                                    checked = state.serialContinuesAcrossLines,
                                    onCheckedChange = {
                                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                        viewModel.setSerialContinuesAcrossLines(it)
                                    },
                                    colors = SwitchDefaults.colors(
                                        checkedThumbColor = Color.White,
                                        checkedTrackColor = ZeusBlue
                                    )
                                )
                            }
                        }
                    } else {
                        // Direct EPC Input
                        OutlinedTextField(
                            value = state.epcList,
                            onValueChange = { viewModel.setEpcList(it) },
                            placeholder = { Text("E28011303000020786CA9E61\nE28011303000020786CA9E62") },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(140.dp),
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = ZeusBlue,
                                unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)
                            ),
                            textStyle = MaterialTheme.typography.bodyMedium.copy(
                                fontFamily = FontFamily.Monospace,
                                fontSize = 13.sp
                            )
                        )
                        Text(
                            text = "Format: EPC[,TID[,userdata]] (one hexadecimal EPC per line)",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // 4. Transmission Controls (Delay & RSSI)
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surface
                ),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(14.dp)
                ) {
                    Text(
                        text = "Transmission Parameters",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold
                    )

                    // Delay Chips & Input
                    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Inter-tag Delay",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = "${state.delayMs} ms",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                color = ZeusBlue
                            )
                        }

                        // Preset chips
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .horizontalScroll(rememberScrollState()),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            listOf(0L, 10L, 20L, 50L, 100L, 200L).forEach { ms ->
                                val isSelected = state.delayMs == ms
                                Box(
                                    modifier = Modifier
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(
                                            if (isSelected) ZeusBlue else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)
                                        )
                                        .clickable {
                                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                            viewModel.setDelayMs(ms)
                                        }
                                        .padding(horizontal = 12.dp, vertical = 6.dp)
                                ) {
                                    Text(
                                        text = "${ms}ms",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                        color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                        }
                    }

                    // Handheld RSSI Slider
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Signal Strength (RSSI)",
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Medium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = String.format(Locale.US, "%.1f dBm", state.rssi),
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                color = ZeusMint
                            )
                        }

                        ZeusRssiSlider(
                            value = state.rssi,
                            onValueChange = { viewModel.setRssi(it) },
                            valueRange = 0f..100f,
                            tickLabels = listOf("0 dBm", "25", "50", "75", "100 dBm")
                        )
                    }
                }
            }

            // 5. Send & Loop Action Buttons
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                // Primary Send Button
                ZeusButton(
                    text = if (state.isSending && !state.isLooping) {
                        "Broadcasting to Handheld..."
                    } else {
                        "Send EPCs → Handheld (${state.calculatedTagCount})"
                    },
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        viewModel.sendTags()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !state.isSending && state.calculatedTagCount > 0,
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.Send,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                    },
                    variant = ZeusButtonVariant.Primary
                )

                // Loop Send Button
                ZeusButton(
                    text = if (state.isLooping) "Stop Loop Stream" else "Loop Stream",
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        viewModel.toggleLoopSend()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = state.calculatedTagCount > 0 || state.isLooping,
                    leadingIcon = {
                        Icon(
                            imageVector = if (state.isLooping) Icons.Rounded.Stop else Icons.Rounded.PlayArrow,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                    },
                    variant = if (state.isLooping) ZeusButtonVariant.Danger else ZeusButtonVariant.Secondary
                )
            }

            // 6. Terminal Activity Log
            HandheldTerminalLogCard(
                logs = state.logs,
                tagsTransmitted = state.tagsTransmitted,
                detailedTagLogging = state.detailedTagLogging,
                onToggleDetailed = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    viewModel.setDetailedTagLogging(it)
                },
                onClear = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    viewModel.clearLogs()
                },
                onCopy = {
                    clipboardManager.setText(AnnotatedString(state.logs.joinToString("\n")))
                    Toast.makeText(context, "Log copied to clipboard", Toast.LENGTH_SHORT).show()
                }
            )
        }
    }
}

/**
 * Top banner showing connected handheld clients or waiting listener status.
 */
@Composable
private fun HandheldConnectionStatusCard(
    clients: List<com.zeus.rfid.data.handheld.HandheldClient>,
    port: Int,
    phoneIp: String,
    onCopyIp: () -> Unit
) {
    val isConnected = clients.isNotEmpty()
    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val pulseAlpha by infiniteTransition.animateFloat(
        initialValue = 0.35f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1200),
            repeatMode = RepeatMode.Reverse
        ),
        label = "pulseAlpha"
    )

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = if (isConnected) {
                ZeusMint.copy(alpha = 0.08f)
            } else {
                MaterialTheme.colorScheme.surface
            }
        ),
        border = androidx.compose.foundation.BorderStroke(
            width = 1.dp,
            color = if (isConnected) ZeusMint.copy(alpha = 0.4f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.2f)
        ),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
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
                            .size(10.dp)
                            .clip(CircleShape)
                            .background(
                                if (isConnected) ZeusMint.copy(alpha = pulseAlpha) else Color(0xFFFFB300).copy(alpha = pulseAlpha)
                            )
                    )
                    Text(
                        text = if (isConnected) "Handheld Connected" else "Listening for Handheld",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = if (isConnected) ZeusMint else MaterialTheme.colorScheme.onSurface
                    )
                }

                // Port badge
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "Port $port",
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }

            if (isConnected) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.CheckCircle,
                        contentDescription = null,
                        tint = ZeusMint,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = "Handheld Connected",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = ZeusMint,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = "Ready",
                        style = MaterialTheme.typography.labelSmall,
                        color = ZeusMint,
                        fontWeight = FontWeight.Bold
                    )
                }
            } else {
                // Helpful instruction showing Phone IP
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
                        .clickable { onCopyIp() }
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Wifi,
                            contentDescription = null,
                            tint = ZeusBlue,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = "Set VSBL Host to: $phoneIp:$port",
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Medium
                        )
                    }
                    Icon(
                        imageVector = Icons.Rounded.ContentCopy,
                        contentDescription = "Copy IP",
                        tint = ZeusBlue,
                        modifier = Modifier.size(14.dp)
                    )
                }
            }
        }
    }
}

/**
 * Terminal-style activity log card.
 */
@Composable
private fun HandheldTerminalLogCard(
    logs: List<String>,
    tagsTransmitted: Long,
    detailedTagLogging: Boolean,
    onToggleDetailed: (Boolean) -> Unit,
    onClear: () -> Unit,
    onCopy: () -> Unit
) {
    val listState = rememberLazyListState()

    LaunchedEffect(logs.size) {
        if (logs.isNotEmpty()) {
            listState.animateScrollToItem(logs.size - 1)
        }
    }

    val isDark = isSystemInDarkTheme()
    val cardBg = if (isDark) Color(0xFF131722) else MaterialTheme.colorScheme.surface
    val cardBorder = if (isDark) Color(0xFF232B3E) else MaterialTheme.colorScheme.outline.copy(alpha = 0.25f)
    val logBoxBg = if (isDark) Color(0xFF0B0E17) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
    val defaultLogTextColor = if (isDark) Color(0xFFC5CEE0) else Color(0xFF1E293B)
    val headerTextColor = if (isDark) Color(0xFFE2E8F0) else MaterialTheme.colorScheme.onSurface
    val actionIconColor = if (isDark) Color(0xFF8B949E) else MaterialTheme.colorScheme.onSurfaceVariant
    val idleTextColor = if (isDark) Color(0xFF6E7681) else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(
            containerColor = cardBg
        ),
        shape = RoundedCornerShape(16.dp),
        border = androidx.compose.foundation.BorderStroke(1.dp, cardBorder)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "Activity Log",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = headerTextColor
                    )
                    if (tagsTransmitted > 0) {
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(ZeusBlue.copy(alpha = 0.25f))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = "$tagsTransmitted sent",
                                style = MaterialTheme.typography.labelSmall,
                                color = ZeusCyanAccent,
                                fontFamily = FontFamily.Monospace,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    // Copy
                    Icon(
                        imageVector = Icons.Rounded.ContentCopy,
                        contentDescription = "Copy",
                        tint = actionIconColor,
                        modifier = Modifier
                            .size(18.dp)
                            .clickable { onCopy() }
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    // Clear
                    Icon(
                        imageVector = Icons.Rounded.DeleteOutline,
                        contentDescription = "Clear",
                        tint = actionIconColor,
                        modifier = Modifier
                            .size(18.dp)
                            .clickable { onClear() }
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Log display box
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(logBoxBg)
                    .border(0.5.dp, cardBorder, RoundedCornerShape(8.dp))
                    .padding(8.dp)
            ) {
                if (logs.isEmpty()) {
                    Text(
                        text = "Awaiting activity... Tap Send or Loop Stream to emit tags.",
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = idleTextColor,
                        modifier = Modifier.align(Alignment.Center)
                    )
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        items(logs) { line ->
                            val textColor = when {
                                line.contains("Error", ignoreCase = true) -> Color(0xFFF85149)
                                line.contains("Warning", ignoreCase = true) -> if (isDark) Color(0xFFD29922) else Color(0xFFB45309)
                                line.contains("Round", ignoreCase = true) -> ZeusCyanAccent
                                line.contains("connected", ignoreCase = true) -> if (isDark) ZeusMint else Color(0xFF0D9488)
                                line.contains("completed", ignoreCase = true) -> if (isDark) ZeusMint else Color(0xFF0D9488)
                                else -> defaultLogTextColor
                            }
                            Text(
                                text = line,
                                style = MaterialTheme.typography.bodySmall.copy(
                                    fontSize = 11.sp,
                                    fontFamily = FontFamily.Monospace
                                ),
                                color = textColor
                            )
                        }
                    }
                }
            }
        }
    }
}

/**
 * Handheld Settings Sheet (with Sound effect greyed out per user rule).
 */
@Composable
private fun HandheldSettingsContent(
    port: Int,
    detailedTagLogging: Boolean,
    onToggleDetailedTagLogging: (Boolean) -> Unit,
    onDismiss: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .navigationBarsPadding()
            .padding(horizontal = 20.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Handheld Server Settings",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )
            IconButton(onClick = onDismiss) {
                Icon(Icons.Rounded.Close, contentDescription = "Close")
            }
        }

        // Port Setting Row
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Listening Port",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "TCP Server port for VSBL Handheld clients",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            ) {
                Text(
                    text = port.toString(),
                    style = MaterialTheme.typography.labelLarge,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        // Detailed Tag Logging
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Detailed Activity Logging",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = "Log individual tag transmissions in real time",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Switch(
                checked = detailedTagLogging,
                onCheckedChange = onToggleDetailedTagLogging,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = Color.White,
                    checkedTrackColor = ZeusBlue
                )
            )
        }

        // Sound Effects (Greyed out per user rule)
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Text(
                        text = "Sound Effects",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                    )
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "Coming Soon",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
                Text(
                    text = "Haptic and audio cues when tags transmit (temporarily disabled)",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.38f)
                )
            }
            Switch(
                checked = false,
                onCheckedChange = null,
                enabled = false,
                colors = SwitchDefaults.colors(
                    disabledUncheckedThumbColor = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f),
                    disabledUncheckedTrackColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.38f)
                )
            )
        }

        Spacer(modifier = Modifier.height(8.dp))

        ZeusButton(
            text = "Done",
            onClick = onDismiss,
            modifier = Modifier.fillMaxWidth(),
            variant = ZeusButtonVariant.Primary
        )
    }
}
