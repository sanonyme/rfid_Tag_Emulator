package com.zeus.rfid.ui.emulation

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import com.zeus.rfid.ui.components.isZeusDarkTheme
import com.zeus.rfid.ui.components.zeusCardBg
import com.zeus.rfid.ui.components.zeusCardBorderColor
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
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
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Clear
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Hub
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.QrCode
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Sync
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.BasicAlertDialog
import com.zeus.rfid.ui.components.ZeusCard as Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import com.zeus.rfid.ui.components.ZeusScaffold as Scaffold
import com.zeus.rfid.ui.components.ZeusModule
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalView
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
import com.zeus.rfid.data.model.VendorDriver
import com.zeus.rfid.ui.components.AntennaBroadcastIcon
import com.zeus.rfid.ui.components.ZeusButton
import com.zeus.rfid.ui.components.ZeusButtonVariant
import com.zeus.rfid.ui.components.ZeusRssiSlider
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusMint
import com.zeus.rfid.ui.util.SoundEffectHelper
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmulationScreen(
    viewModel: EmulationViewModel,
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val haptic = LocalHapticFeedback.current

    var showDeviceSheet by remember { mutableStateOf(false) }
    var showPortDialog by remember { mutableStateOf(false) }

    if (showDeviceSheet) {
        val deviceSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
        LogicalDeviceSheet(
            devices = state.logicalDevices,
            selectedUids = state.selectedUids,
            isLoading = state.isLoadingDevices,
            sheetState = deviceSheetState,
            onToggleDevice = { uid ->
                SoundEffectHelper.playClick()
                viewModel.toggleDevice(uid)
            },
            onSelectAll = {
                SoundEffectHelper.playClick()
                viewModel.selectAllDevices()
            },
            onDeselectAll = {
                SoundEffectHelper.playClick()
                viewModel.deselectAllDevices()
            },
            onRefresh = {
                SoundEffectHelper.playClick()
                viewModel.fetchLogicalDevices()
            },
            onDismissRequest = { showDeviceSheet = false }
        )
    }

    if (showPortDialog) {
        val settingsSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
        EmulationSettingsSheet(
            serverName = state.serverName,
            host = state.host,
            tcpPort = state.port,
            alePort = state.alePort,
            connectionTimeoutMs = state.connectionTimeoutMs,
            serialContinuesAcrossLines = state.serialContinuesAcrossLines,
            showCheckDigitHints = state.showCheckDigitHints,
            detailedTagLogging = state.detailedTagLogging,
            maxLogLines = state.maxLogLines,
            soundEnabled = SoundEffectHelper.isEnabled,
            delayMs = state.delayMs,
            sheetState = settingsSheetState,
            onSave = { tcp, ale, timeout, serialContinues, checkHints, detailLogs, maxLogs, sound, delay ->
                viewModel.updateFixedSettings(
                    tcpPort = tcp,
                    alePort = ale,
                    connectionTimeoutMs = timeout,
                    serialContinuesAcrossLines = serialContinues,
                    showCheckDigitHints = checkHints,
                    detailedTagLogging = detailLogs,
                    maxLogLines = maxLogs,
                    soundEnabled = sound,
                    delayMs = delay
                )
                showPortDialog = false
            },
            onDismissRequest = { showPortDialog = false }
        )
    }

    Scaffold(
        module = ZeusModule.Fixed, status = if (state.isSending) "Transmitting tags" else "${state.calculatedTagCount} tags prepared", busy = state.isSending || state.isLooping,
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                modifier = Modifier.padding(top = 8.dp),
                title = {
                    Column {
                        Text(
                            text = "Fixed Reader Emulation",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                        Text(
                            text = "${state.host}:${state.port} • ALE :${state.alePort}",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = FontFamily.Monospace,
                            color = ZeusBlue
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
                        SoundEffectHelper.playClick()
                        showPortDialog = true
                    }) {
                        Icon(
                            imageVector = Icons.Rounded.Settings,
                            contentDescription = "Port Settings",
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
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Mode Selector Segmented Row (UPC vs Direct EPC)
            SingleChoiceSegmentedButtonRow(
                modifier = Modifier.fillMaxWidth()
            ) {
                SegmentedButton(
                    selected = state.tagMode == TagMode.UPC,
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        SoundEffectHelper.playClick()
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
                        SoundEffectHelper.playClick()
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

            // Tag Inputs Card (with check digit checker)
            TagInputCard(
                mode = state.tagMode,
                upcList = state.upcList,
                onUpcChange = viewModel::setUpcList,
                startSerial = state.startSerial,
                onStartSerialChange = viewModel::setStartSerial,
                serialContinues = state.serialContinuesAcrossLines,
                onSerialContinuesChange = viewModel::setSerialContinuesAcrossLines,
                showCheckDigitHints = state.showCheckDigitHints,
                epcList = state.epcList,
                onEpcChange = viewModel::setEpcList,
                tagCount = state.calculatedTagCount
            )

            // Antennas & RSSI Card (Electron styled buttons & haptic slider)
            AntennaAndRssiCard(
                antennas = state.antennas,
                onToggleAntenna = { ant ->
                    viewModel.toggleAntenna(ant)
                },
                rssi = state.rssi,
                onRssiChange = viewModel::setRssi,
                rssiRandomize = state.rssiRandomize,
                onRssiRandomizeChange = {
                    SoundEffectHelper.playClick()
                    viewModel.setRssiRandomize(it)
                },
                rssiMin = state.rssiRandMin,
                rssiMax = state.rssiRandMax,
                onRssiRangeChange = viewModel::setRssiRandRange
            )

            // Logical Device & Driver Card
            DeviceAndDriverCard(
                selectedUids = state.selectedUids,
                allDevices = state.logicalDevices,
                onOpenDevicePicker = {
                    SoundEffectHelper.playClick()
                    showDeviceSheet = true
                },
                onRefreshDevices = {
                    SoundEffectHelper.playClick()
                    viewModel.fetchLogicalDevices()
                },
                isLoadingDevices = state.isLoadingDevices,
                driver = state.driver,
                onDriverChange = {
                    SoundEffectHelper.playClick()
                    viewModel.setDriver(it)
                },
                delayMs = state.delayMs,
                onDelayChange = viewModel::setDelayMs
            )

            // Send Controls
            SendControlsSection(
                isSending = state.isSending,
                isLooping = state.isLooping,
                onSendOnce = {
                    SoundEffectHelper.playClick()
                    viewModel.sendTags()
                },
                onToggleLoop = {
                    SoundEffectHelper.playClick()
                    viewModel.toggleLoopSend()
                },
                onStop = {
                    SoundEffectHelper.playClick()
                    viewModel.stopSending()
                }
            )

            // Activity Log (Theme Adaptive)
            ActivityLogCard(
                logs = state.logs,
                onClear = {
                    SoundEffectHelper.playClick()
                    viewModel.clearLogs()
                },
                onCopy = {
                    SoundEffectHelper.playClick()
                    if (state.logs.isNotEmpty()) {
                        clipboardManager.setText(AnnotatedString(state.logs.joinToString("\n")))
                        Toast.makeText(context, "Log copied to clipboard", Toast.LENGTH_SHORT).show()
                    }
                }
            )

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

@Composable
private fun TagInputCard(
    mode: TagMode,
    upcList: String,
    onUpcChange: (String) -> Unit,
    startSerial: Long,
    onStartSerialChange: (Long) -> Unit,
    serialContinues: Boolean,
    onSerialContinuesChange: (Boolean) -> Unit,
    showCheckDigitHints: Boolean,
    epcList: String,
    onEpcChange: (String) -> Unit,
    tagCount: Int
) {
    val haptic = LocalHapticFeedback.current

    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier.fillMaxWidth(),
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
                        text = if (mode == TagMode.UPC) "UPC Tag Recipe" else "Direct EPC List",
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
                            text = "$tagCount tag${if (tagCount != 1) "s" else ""}",
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
                                SoundEffectHelper.playClick()
                                if (mode == TagMode.UPC) {
                                    onUpcChange("00000000000001,5\n00000000000002,3")
                                } else {
                                    onEpcChange("E28011303000020786CA9E61\nE28011303000020786CA9E62\nE28011303000020786CA9E63\nE28011303000020786CA9E64")
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
                                SoundEffectHelper.playClick()
                                if (mode == TagMode.UPC) {
                                    onUpcChange("")
                                } else {
                                    onEpcChange("")
                                }
                            }
                            .padding(horizontal = 6.dp, vertical = 4.dp)
                    )
                }
            }

            if (mode == TagMode.UPC) {
                // UPC Multiline Input
                OutlinedTextField(
                    value = upcList,
                    onValueChange = onUpcChange,
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

                // Live Check Digit Checker Banner (Configurable in settings)
                if (showCheckDigitHints) {
                    val checkStatus = remember(upcList) {
                        UpcCheckDigitHelper.analyzeUpcInput(upcList)
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
                }

                // Serial Row
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    OutlinedTextField(
                        value = startSerial.toString(),
                        onValueChange = { onStartSerialChange(it.toLongOrNull() ?: 1L) },
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
                            checked = serialContinues,
                            onCheckedChange = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                SoundEffectHelper.playClick()
                                onSerialContinuesChange(it)
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
                    value = epcList,
                    onValueChange = onEpcChange,
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
}

@Composable
private fun AntennaAndRssiCard(
    antennas: Set<Int>,
    onToggleAntenna: (Int) -> Unit,
    rssi: Float,
    onRssiChange: (Float) -> Unit,
    rssiRandomize: Boolean,
    onRssiRandomizeChange: (Boolean) -> Unit,
    rssiMin: Float,
    rssiMax: Float,
    onRssiRangeChange: (Float, Float) -> Unit
) {
    val haptic = LocalHapticFeedback.current
    val view = LocalView.current

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f), RoundedCornerShape(18.dp))
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            // Antennas Row (Header)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AntennaBroadcastIcon(
                        size = 19.dp,
                        tint = ZeusMint
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Antennas",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(ZeusMint.copy(alpha = 0.12f))
                        .padding(horizontal = 8.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "${antennas.size} active",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = ZeusMint
                    )
                }
            }

            // Electron Fixed Tab Style Antenna Row (Exact Lucide Radio wave icon + dot)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                    .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(14.dp))
                    .padding(5.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                listOf(1, 2, 3, 4).forEach { ant ->
                    val isSelected = antennas.contains(ant)
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .height(60.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(
                                if (isSelected) {
                                    Brush.verticalGradient(
                                        listOf(
                                            ZeusMint.copy(alpha = 0.22f),
                                            ZeusMint.copy(alpha = 0.08f)
                                        )
                                    )
                                } else {
                                    Brush.verticalGradient(listOf(Color.Transparent, Color.Transparent))
                                }
                            )
                            .border(
                                width = 1.dp,
                                color = if (isSelected) ZeusMint.copy(alpha = 0.75f) else Color.Transparent,
                                shape = RoundedCornerShape(10.dp)
                            )
                            .clickable {
                                try {
                                    val didVibrate = view.performHapticFeedback(android.view.HapticFeedbackConstants.KEYBOARD_TAP)
                                    if (!didVibrate) {
                                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                    }
                                } catch (_: Throwable) {
                                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                }
                                onToggleAntenna(ant)
                            }
                    ) {
                        // Glowing mint indicator dot (Top-right corner)
                        if (isSelected) {
                            Box(
                                modifier = Modifier
                                    .align(Alignment.TopEnd)
                                    .padding(6.dp)
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(ZeusMint)
                            )
                        }

                        // Icon and label
                        Column(
                            modifier = Modifier.fillMaxSize(),
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            AntennaBroadcastIcon(
                                size = 18.dp,
                                tint = if (isSelected) ZeusMint else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f)
                            )
                            Spacer(modifier = Modifier.height(3.dp))
                            Text(
                                text = "$ant",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                                color = if (isSelected) ZeusMint else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(4.dp))

            // RSSI Row (Header)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        imageVector = Icons.Rounded.Speed,
                        contentDescription = null,
                        tint = ZeusBlue,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "RSSI",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
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
                        text = String.format(Locale.US, "%.1f dBm", rssi),
                        style = MaterialTheme.typography.labelMedium,
                        fontFamily = FontFamily.Monospace,
                        fontWeight = FontWeight.Bold,
                        color = ZeusBlue
                    )
                }
            }

            // Custom Zeus RSSI Slider with Haptics and Gradient Track
            ZeusRssiSlider(
                value = rssi,
                onValueChange = onRssiChange
            )

            // Randomize RSSI Toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Randomize RSSI per tag",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Switch(
                    checked = rssiRandomize,
                    onCheckedChange = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        onRssiRandomizeChange(it)
                    },
                    colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = ZeusBlue)
                )
            }

            AnimatedVisibility(visible = rssiRandomize) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    OutlinedTextField(
                        value = rssiMin.toString(),
                        onValueChange = {
                            val minVal = it.toFloatOrNull() ?: -90f
                            onRssiRangeChange(minVal, rssiMax)
                        },
                        label = { Text("Min dBm") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp)
                    )

                    OutlinedTextField(
                        value = rssiMax.toString(),
                        onValueChange = {
                            val maxVal = it.toFloatOrNull() ?: -20f
                            onRssiRangeChange(rssiMin, maxVal)
                        },
                        label = { Text("Max dBm") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        shape = RoundedCornerShape(10.dp)
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DeviceAndDriverCard(
    selectedUids: Set<String>,
    allDevices: List<com.zeus.rfid.data.model.LogicalDevice>,
    onOpenDevicePicker: () -> Unit,
    onRefreshDevices: () -> Unit,
    isLoadingDevices: Boolean,
    driver: VendorDriver,
    onDriverChange: (VendorDriver) -> Unit,
    delayMs: Long,
    onDelayChange: (Long) -> Unit
) {
    var driverExpanded by remember { mutableStateOf(false) }

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.2f), RoundedCornerShape(18.dp))
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Rounded.Tune,
                    contentDescription = null,
                    tint = ZeusBlue,
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Driver & Target Device",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            // High-End Logical Device Selector Tile
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(
                    text = "Logical Devices Target",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(6.dp))

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                        .border(1.dp, MaterialTheme.colorScheme.outline.copy(alpha = 0.25f), RoundedCornerShape(14.dp))
                        .clickable(onClick = onOpenDevicePicker)
                        .padding(12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(CircleShape)
                            .background(ZeusBlue.copy(alpha = 0.12f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Hub,
                            contentDescription = null,
                            tint = ZeusBlue,
                            modifier = Modifier.size(20.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column(modifier = Modifier.weight(1f)) {
                        val mainLabel = when {
                            selectedUids.isEmpty() -> "All Devices (Default)"
                            selectedUids.size == 1 -> {
                                val singleUid = selectedUids.firstOrNull() ?: ""
                                val found = allDevices.find { it.uid == singleUid }
                                found?.name?.ifEmpty { found.uid } ?: singleUid
                            }
                            else -> "${selectedUids.size} Devices Targeted"
                        }
                        Text(
                            text = mainLabel,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        val firstUid = selectedUids.firstOrNull() ?: ""
                        Text(
                            text = if (firstUid.isEmpty()) "Tap to specify target devices" else "UID: $firstUid${if (selectedUids.size > 1) " + ${selectedUids.size - 1} more" else ""}",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(if (selectedUids.isNotEmpty()) ZeusMint.copy(alpha = 0.15f) else MaterialTheme.colorScheme.outline.copy(alpha = 0.15f))
                            .padding(horizontal = 8.dp, vertical = 3.dp)
                    ) {
                        Text(
                            text = if (selectedUids.isEmpty()) "All" else "${selectedUids.size} Active",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = if (selectedUids.isNotEmpty()) ZeusMint else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Spacer(modifier = Modifier.width(4.dp))

                    Icon(
                        imageVector = Icons.Rounded.ChevronRight,
                        contentDescription = "Open Device Picker",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f),
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            // Driver & Delay Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Driver Dropdown
                ExposedDropdownMenuBox(
                    expanded = driverExpanded,
                    onExpandedChange = { driverExpanded = it },
                    modifier = Modifier.weight(1.2f)
                ) {
                    OutlinedTextField(
                        value = driver.displayName,
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Driver") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = driverExpanded) },
                        modifier = Modifier
                            .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                            .fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp)
                    )

                    ExposedDropdownMenu(
                        expanded = driverExpanded,
                        onDismissRequest = { driverExpanded = false }
                    ) {
                        VendorDriver.entries.forEach { item ->
                            DropdownMenuItem(
                                text = { Text(item.displayName) },
                                onClick = {
                                    onDriverChange(item)
                                    driverExpanded = false
                                }
                            )
                        }
                    }
                }

                // Delay ms
                OutlinedTextField(
                    value = delayMs.toString(),
                    onValueChange = { onDelayChange(it.toLongOrNull() ?: 0L) },
                    label = { Text("Delay (ms)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(10.dp)
                )
            }
        }
    }
}

@Composable
private fun SendControlsSection(
    isSending: Boolean,
    isLooping: Boolean,
    onSendOnce: () -> Unit,
    onToggleLoop: () -> Unit,
    onStop: () -> Unit
) {
    if (isSending || isLooping) {
        ZeusButton(
            text = "Stop Transmission",
            onClick = onStop,
            variant = ZeusButtonVariant.Secondary,
            modifier = Modifier.fillMaxWidth(),
            leadingIcon = {
                Icon(
                    imageVector = Icons.Rounded.Stop,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.size(20.dp)
                )
            }
        )
    } else {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            ZeusButton(
                text = "Send Tags",
                onClick = onSendOnce,
                variant = ZeusButtonVariant.Primary,
                modifier = Modifier.weight(1f),
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Rounded.PlayArrow,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(20.dp)
                    )
                }
            )

            ZeusButton(
                text = "Loop Send",
                onClick = onToggleLoop,
                variant = ZeusButtonVariant.Secondary,
                modifier = Modifier.weight(1f),
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Rounded.Sync,
                        contentDescription = null,
                        tint = ZeusMint,
                        modifier = Modifier.size(20.dp)
                    )
                }
            )
        }
    }
}

@Composable
private fun ActivityLogCard(
    logs: List<String>,
    onClear: () -> Unit,
    onCopy: () -> Unit
) {
    val listState = rememberLazyListState()
    val isDark = isZeusDarkTheme()

    LaunchedEffect(logs.size) {
        if (logs.isNotEmpty()) {
            listState.animateScrollToItem(logs.size - 1)
        }
    }

    val cardBg = zeusCardBg(isDark)
    val cardBorder = zeusCardBorderColor(isDark)
    val logBoxBg = if (isDark) Color(0xFF0B0E17) else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
    val defaultLogTextColor = if (isDark) Color(0xFFC5CEE0) else Color(0xFF1E293B)

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        modifier = Modifier
            .fillMaxWidth()
            .border(1.dp, cardBorder, RoundedCornerShape(18.dp))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(ZeusMint)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Activity Log",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }

                Row {
                    IconButton(onClick = onCopy, modifier = Modifier.size(32.dp)) {
                        Icon(
                            imageVector = Icons.Rounded.ContentCopy,
                            contentDescription = "Copy Log",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                    IconButton(onClick = onClear, modifier = Modifier.size(32.dp)) {
                        Icon(
                            imageVector = Icons.Rounded.Clear,
                            contentDescription = "Clear Log",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(180.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(logBoxBg)
                    .border(0.5.dp, cardBorder, RoundedCornerShape(10.dp))
                    .padding(8.dp)
            ) {
                if (logs.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text(
                            text = "Log is idle. Send tags to view live output.",
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                        )
                    }
                } else {
                    LazyColumn(
                        state = listState,
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(logs) { logLine ->
                            Text(
                                text = logLine,
                                style = MaterialTheme.typography.labelSmall.copy(
                                    fontFamily = FontFamily.Monospace,
                                    fontSize = 11.sp
                                ),
                                color = when {
                                    logLine.contains("Error", ignoreCase = true) -> if (isDark) Color(0xFFFF5252) else Color(0xFFD32F2F)
                                    logLine.contains("Success", ignoreCase = true) -> if (isDark) ZeusMint else Color(0xFF00897B)
                                    logLine.contains("Warning", ignoreCase = true) -> if (isDark) Color(0xFFFFB74D) else Color(0xFFE65100)
                                    else -> defaultLogTextColor
                                },
                                modifier = Modifier.padding(vertical = 1.dp)
                            )
                        }
                    }
                }
            }
        }
    }
}
