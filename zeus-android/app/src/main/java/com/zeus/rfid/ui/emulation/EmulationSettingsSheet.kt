package com.zeus.rfid.ui.emulation

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import com.zeus.rfid.ui.components.sheetTopCameraSafePadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Article
import androidx.compose.material.icons.automirrored.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Clear
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.Layers
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Router
import androidx.compose.material.icons.rounded.Speed
import androidx.compose.material.icons.rounded.Timer
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SheetState
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zeus.rfid.ui.components.ZeusButton
import com.zeus.rfid.ui.components.ZeusButtonVariant
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusMint
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EmulationSettingsSheet(
    serverName: String,
    host: String,
    tcpPort: Int,
    alePort: Int,
    connectionTimeoutMs: Int,
    serialContinuesAcrossLines: Boolean,
    showCheckDigitHints: Boolean,
    detailedTagLogging: Boolean,
    maxLogLines: Int,
    soundEnabled: Boolean,
    delayMs: Long,
    onSave: (
        tcpPort: Int,
        alePort: Int,
        connectionTimeoutMs: Int,
        serialContinuesAcrossLines: Boolean,
        showCheckDigitHints: Boolean,
        detailedTagLogging: Boolean,
        maxLogLines: Int,
        soundEnabled: Boolean,
        delayMs: Long
    ) -> Unit,
    onDismissRequest: () -> Unit,
    sheetState: SheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
) {
    val coroutineScope = rememberCoroutineScope()
    val haptic = LocalHapticFeedback.current
    val isDark = isSystemInDarkTheme()

    // State bindings
    var tcpInput by remember { mutableStateOf(tcpPort.toString()) }
    var aleInput by remember { mutableStateOf(alePort.toString()) }
    var timeoutSelected by remember { mutableIntStateOf(connectionTimeoutMs) }
    var serialContinues by remember { mutableStateOf(serialContinuesAcrossLines) }
    var checkDigitHints by remember { mutableStateOf(showCheckDigitHints) }
    var detailLogs by remember { mutableStateOf(detailedTagLogging) }
    var maxLogs by remember { mutableIntStateOf(maxLogLines) }
    var soundOn by remember { mutableStateOf(soundEnabled) }
    var delayInput by remember { mutableStateOf(delayMs.toString()) }

    val parsedTcp = tcpInput.toIntOrNull()
    val isTcpValid = parsedTcp != null && parsedTcp in 1..65535

    val parsedAle = aleInput.toIntOrNull()
    val isAleValid = parsedAle != null && parsedAle in 1..65535

    val parsedDelay = delayInput.toLongOrNull()
    val isDelayValid = parsedDelay != null && parsedDelay >= 0

    val canSave = isTcpValid && isAleValid && isDelayValid

    fun dismissSmoothly() {
        coroutineScope.launch {
            try {
                sheetState.hide()
            } catch (_: Throwable) {}
            onDismissRequest()
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismissRequest,
        modifier = Modifier.sheetTopCameraSafePadding(),
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(top = 10.dp, bottom = 6.dp)
                    .size(width = 36.dp, height = 4.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))
            )
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 20.dp)
                .navigationBarsPadding()
                .verticalScroll(rememberScrollState())
                .padding(bottom = 20.dp),
            verticalArrangement = Arrangement.spacedBy(18.dp)
        ) {
            // Header Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(CircleShape)
                            .background(ZeusBlue.copy(alpha = 0.12f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Tune,
                            contentDescription = null,
                            tint = ZeusBlue,
                            modifier = Modifier.size(22.dp)
                        )
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column {
                        Text(
                            text = "Fixed Emulation Settings",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "Networking, UPC generation, activity logs & sound",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                IconButton(onClick = { dismissSmoothly() }) {
                    Icon(
                        imageVector = Icons.Rounded.Clear,
                        contentDescription = "Close",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Target Server & Active Endpoints Preview Card
            val previewCardBg = if (isDark) Color(0xFF0F172A) else Color(0xFFF8FAFC)
            val previewBorder = if (isDark) Color(0xFF1E293B) else Color(0xFFE2E8F0)
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(previewCardBg)
                    .border(1.dp, previewBorder, RoundedCornerShape(16.dp))
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(ZeusMint)
                        )
                        Text(
                            text = serverName.ifBlank { "Active Target Server" },
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(ZeusMint.copy(alpha = 0.15f))
                            .padding(horizontal = 7.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "Online",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = ZeusMint
                        )
                    }
                }

                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (isDark) Color(0xFF020617) else Color(0xFFECEFF1))
                        .padding(horizontal = 10.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text(
                        text = "• Tag Socket: tcp://${host.ifBlank { "localhost" }}:${tcpInput.ifBlank { "12352" }}",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp
                        ),
                        color = ZeusMint
                    )
                    Text(
                        text = "• ALE API:    http://${host.ifBlank { "localhost" }}:${aleInput.ifBlank { "80" }}/ALE/api/",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp
                        ),
                        color = ZeusBlue
                    )
                    Text(
                        text = "• Timeout:    ${timeoutSelected / 1000}s connection timeout",
                        style = MaterialTheme.typography.labelSmall.copy(
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp
                        ),
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // SECTION 1: Network & Connection Ports
            SettingsSectionCard(
                icon = Icons.Rounded.Router,
                iconTint = ZeusBlue,
                title = "Network & Endpoints",
                subtitle = "Configure ALE management and TCP streaming ports"
            ) {
                // ALE Management Port
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "ALE Management Port",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Port used to query logical devices and reader antennas over HTTP",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    // Presets
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        listOf(
                            80 to "80 (Standard)",
                            8080 to "8080 (Alt / Proxy)"
                        ).forEach { (portOption, label) ->
                            val isSelected = parsedAle == portOption
                            PresetChip(
                                label = label,
                                selected = isSelected,
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    aleInput = portOption.toString()
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }

                    OutlinedTextField(
                        value = aleInput,
                        onValueChange = { aleInput = it.filter { char -> char.isDigit() }.take(5) },
                        label = { Text("ALE Port (1 - 65535)") },
                        singleLine = true,
                        isError = !isAleValid,
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Rounded.Dns,
                                contentDescription = null,
                                tint = if (isAleValid) ZeusBlue else MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(18.dp)
                            )
                        },
                        trailingIcon = {
                            if (isAleValid) {
                                Icon(
                                    imageVector = Icons.Rounded.CheckCircle,
                                    contentDescription = "Valid",
                                    tint = ZeusMint,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Next
                        ),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ZeusBlue,
                            unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f),
                            errorBorderColor = MaterialTheme.colorScheme.error
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Spacer(modifier = Modifier.height(6.dp))

                // TCP Tag Streamer Port
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "TCP Tag Streamer Port",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Raw TCP socket port for transmitting RFID tag frames",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    // Presets
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        listOf(
                            12352 to "12352 (Default)",
                            12353 to "12353 (Auxiliary)"
                        ).forEach { (portOption, label) ->
                            val isSelected = parsedTcp == portOption
                            PresetChip(
                                label = label,
                                selected = isSelected,
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    tcpInput = portOption.toString()
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }

                    OutlinedTextField(
                        value = tcpInput,
                        onValueChange = { tcpInput = it.filter { char -> char.isDigit() }.take(5) },
                        label = { Text("TCP Port (1 - 65535)") },
                        singleLine = true,
                        isError = !isTcpValid,
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.Rounded.Router,
                                contentDescription = null,
                                tint = if (isTcpValid) ZeusMint else MaterialTheme.colorScheme.error,
                                modifier = Modifier.size(18.dp)
                            )
                        },
                        trailingIcon = {
                            if (isTcpValid) {
                                Icon(
                                    imageVector = Icons.Rounded.CheckCircle,
                                    contentDescription = "Valid",
                                    tint = ZeusMint,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                        },
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Next
                        ),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ZeusMint,
                            unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f),
                            errorBorderColor = MaterialTheme.colorScheme.error
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                Spacer(modifier = Modifier.height(6.dp))

                // Connection Timeout Presets
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Rounded.Timer,
                            contentDescription = null,
                            tint = ZeusBlue,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Connection Timeout",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Text(
                        text = "Timeout limit when connecting to the emulator socket server",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        listOf(
                            5000 to "5s",
                            10000 to "10s",
                            15000 to "15s",
                            30000 to "30s"
                        ).forEach { (ms, label) ->
                            val isSelected = timeoutSelected == ms
                            PresetChip(
                                label = label,
                                selected = isSelected,
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    timeoutSelected = ms
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }

            // SECTION 2: UPC & SGTIN Generation
            SettingsSectionCard(
                icon = Icons.Rounded.Layers,
                iconTint = ZeusBlue,
                title = "UPC & SGTIN Generation",
                subtitle = "Configure EPC generation and GTIN validation"
            ) {
                // Continuous Serial across UPC lines switch
                SettingsSwitchRow(
                    title = "Fixed tab — continue across lines",
                    description = "When off, each UPC line starts from the starting serial. When on, serial increments across all lines.",
                    checked = serialContinues,
                    onCheckedChange = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        serialContinues = it
                    }
                )

                Spacer(modifier = Modifier.height(4.dp))

                // Live Check Digit Hints switch
                SettingsSwitchRow(
                    title = "Live check-digit hints",
                    description = "Show GTIN modulo-10 validation feedback beneath the UPC box while typing. Sending is never blocked.",
                    checked = checkDigitHints,
                    onCheckedChange = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        checkDigitHints = it
                    }
                )
            }

            // SECTION 3: Activity Log & Transmission
            SettingsSectionCard(
                icon = Icons.AutoMirrored.Rounded.Article,
                iconTint = ZeusMint,
                title = "Activity Log & Transmission",
                subtitle = "Manage log details, buffer limits, and streaming throttle"
            ) {
                // Detailed tag logging switch
                SettingsSwitchRow(
                    title = "Full activity log",
                    description = "Off: summary lines only. On: log every individual tag frame sent in real time.",
                    checked = detailLogs,
                    onCheckedChange = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        detailLogs = it
                    }
                )

                Spacer(modifier = Modifier.height(4.dp))

                // Max log lines buffer
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Max Log Lines Buffer",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Older entries are automatically trimmed when the limit is reached.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        listOf(
                            100 to "100",
                            250 to "250",
                            500 to "500",
                            1000 to "1,000",
                            0 to "Unlimited"
                        ).forEach { (limit, label) ->
                            val isSelected = maxLogs == limit
                            PresetChip(
                                label = label,
                                selected = isSelected,
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    maxLogs = limit
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Inter-tag Delay
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Rounded.Speed,
                            contentDescription = null,
                            tint = ZeusMint,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Inter-Tag Delay (ms)",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Text(
                        text = "Pause interval between consecutive tag frames during streaming",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )

                    Row(
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        listOf(
                            0L to "0ms",
                            10L to "10ms",
                            20L to "20ms",
                            50L to "50ms",
                            100L to "100ms"
                        ).forEach { (ms, label) ->
                            val isSelected = parsedDelay == ms
                            PresetChip(
                                label = label,
                                selected = isSelected,
                                onClick = {
                                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                    delayInput = ms.toString()
                                },
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }

                    OutlinedTextField(
                        value = delayInput,
                        onValueChange = { delayInput = it.filter { char -> char.isDigit() }.take(5) },
                        label = { Text("Custom Delay (ms)") },
                        singleLine = true,
                        isError = !isDelayValid,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Number,
                            imeAction = ImeAction.Done
                        ),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = ZeusMint,
                            unfocusedBorderColor = MaterialTheme.colorScheme.outline.copy(alpha = 0.35f),
                            errorBorderColor = MaterialTheme.colorScheme.error
                        ),
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }

            // SECTION 4: Audio Feedback (Temporarily greyed out per user request)
            SettingsSectionCard(
                icon = Icons.AutoMirrored.Rounded.VolumeUp,
                iconTint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.45f),
                title = "Design & Effects",
                subtitle = "Audio cues for emulation status and results"
            ) {
                SettingsSwitchRow(
                    title = "Sound effects",
                    description = "Audio cues for emulation start, completion, and errors (disabled for now).",
                    checked = false,
                    enabled = false,
                    badge = "Coming Soon",
                    onCheckedChange = {}
                )
            }

            // Action Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Reset Defaults
                ZeusButton(
                    text = "Defaults",
                    onClick = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        tcpInput = "12352"
                        aleInput = "80"
                        timeoutSelected = 10000
                        serialContinues = false
                        checkDigitHints = true
                        detailLogs = true
                        maxLogs = 250
                        soundOn = false
                        delayInput = "20"
                    },
                    variant = ZeusButtonVariant.Secondary,
                    modifier = Modifier.weight(1f),
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Rounded.Refresh,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                )

                // Save Changes
                ZeusButton(
                    text = "Save Settings",
                    onClick = {
                        if (canSave) {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onSave(
                                parsedTcp!!,
                                parsedAle!!,
                                timeoutSelected,
                                serialContinues,
                                checkDigitHints,
                                detailLogs,
                                maxLogs,
                                soundOn,
                                parsedDelay!!
                            )
                            dismissSmoothly()
                        }
                    },
                    enabled = canSave,
                    variant = ZeusButtonVariant.Primary,
                    modifier = Modifier.weight(1.4f),
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Rounded.Check,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                )
            }
        }
    }
}

@Composable
private fun SettingsSectionCard(
    icon: ImageVector,
    iconTint: Color,
    title: String,
    subtitle: String,
    content: @Composable () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f))
            .border(
                1.dp,
                MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
                RoundedCornerShape(16.dp)
            )
            .padding(14.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth()
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(iconTint.copy(alpha = 0.12f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = iconTint,
                    modifier = Modifier.size(18.dp)
                )
            }
            Spacer(modifier = Modifier.width(10.dp))
            Column {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        content()
    }
}

@Composable
private fun SettingsSwitchRow(
    title: String,
    description: String,
    checked: Boolean,
    enabled: Boolean = true,
    badge: String? = null,
    onCheckedChange: (Boolean) -> Unit
) {
    val rowAlpha = if (enabled) 1f else 0.45f

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface.copy(alpha = 0.5f))
            .clickable(enabled = enabled) { onCheckedChange(!checked) }
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = rowAlpha)
                )

                if (badge != null) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.colorScheme.outline.copy(alpha = 0.2f))
                            .padding(horizontal = 6.dp, vertical = 1.dp)
                    ) {
                        Text(
                            text = badge,
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = description,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = rowAlpha),
                lineHeight = 16.sp
            )
        }

        Switch(
            checked = checked,
            enabled = enabled,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = ZeusBlue,
                disabledCheckedThumbColor = Color.LightGray,
                disabledUncheckedThumbColor = Color.Gray
            )
        )
    }
}

@Composable
private fun PresetChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val bgColor by animateColorAsState(
        targetValue = if (selected) ZeusBlue.copy(alpha = 0.14f) else MaterialTheme.colorScheme.surface.copy(alpha = 0.6f),
        animationSpec = tween(180),
        label = "PresetChipBg"
    )
    val borderColor by animateColorAsState(
        targetValue = if (selected) ZeusBlue else MaterialTheme.colorScheme.outline.copy(alpha = 0.2f),
        animationSpec = tween(180),
        label = "PresetChipBorder"
    )
    val textColor by animateColorAsState(
        targetValue = if (selected) ZeusBlue else MaterialTheme.colorScheme.onSurface,
        animationSpec = tween(180),
        label = "PresetChipText"
    )

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(bgColor)
            .border(
                width = if (selected) 1.5.dp else 1.dp,
                color = borderColor,
                shape = RoundedCornerShape(10.dp)
            )
            .clickable(onClick = onClick)
            .padding(vertical = 9.dp, horizontal = 4.dp)
    ) {
        if (selected) {
            Icon(
                imageVector = Icons.Rounded.Check,
                contentDescription = null,
                tint = ZeusBlue,
                modifier = Modifier.size(13.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = textColor
        )
    }
}
