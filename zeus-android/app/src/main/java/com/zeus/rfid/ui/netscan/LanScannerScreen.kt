package com.zeus.rfid.ui.netscan

import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import com.zeus.rfid.ui.components.isZeusDarkTheme
import com.zeus.rfid.ui.components.zeusCardBg
import com.zeus.rfid.ui.components.zeusCardBorderColor
import com.zeus.rfid.ui.components.zeusInnerBoxBg
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.material.icons.automirrored.rounded.HelpOutline
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Clear
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.Hub
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Radar
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.AlertDialog
import com.zeus.rfid.ui.components.ZeusActionButton as Button
import androidx.compose.material3.ButtonDefaults
import com.zeus.rfid.ui.components.ZeusCard as Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import com.zeus.rfid.ui.components.ZeusScaffold as Scaffold
import com.zeus.rfid.ui.components.ZeusModule
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.zeus.rfid.data.netscan.EdgeDiscoveredDevice
import com.zeus.rfid.data.netscan.NetScanTabMode
import com.zeus.rfid.data.netscan.PingScanRow
import com.zeus.rfid.data.netscan.ReaderCandidate
import com.zeus.rfid.data.netscan.ReaderConfidence
import com.zeus.rfid.data.netscan.ReaderVendor
import com.zeus.rfid.data.netscan.TargetScope

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LanScannerScreen(
    viewModel: LanScannerViewModel,
    onNavigateBack: () -> Unit,
    onSelectHost: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val isDark = isZeusDarkTheme()
    val context = LocalContext.current
    val clipboard = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }
    var showHelpDialog by remember { mutableStateOf(false) }

    val cardBg = zeusCardBg(isDark)
    val cardBorder = zeusCardBorderColor(isDark)
    val innerBoxBg = zeusInnerBoxBg(isDark)

    LaunchedEffect(state.statusMessage) {
        state.statusMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissMessage()
        }
    }

    LaunchedEffect(state.errorMessage) {
        state.errorMessage?.let {
            snackbarHostState.showSnackbar(it)
            viewModel.dismissMessage()
        }
    }

    if (showHelpDialog) {
        AlertDialog(
            onDismissRequest = { showHelpDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(imageVector = Icons.Rounded.Radar, contentDescription = null, tint = LanEmerald)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("LAN Scanner Guide", fontWeight = FontWeight.Bold)
                }
            },
            text = {
                Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        "• RFID Readers: Scans for EPCglobal LLRP (5084/5085), FEIG OBID (10001), Impinj ItemSense (14150), and HTTP/HTTPS banners to fingerprint 20+ major RFID reader vendors.",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        "• Ping Sweep: High-speed multi-threaded ping sweep (ICMP + TCP fallback) with reverse DNS PTR hostname resolution.",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        "• Edge UDP: Listens for CEdgeHeartBeatModel UDP heartbeats on port 7000 and sends custom discovery probes.",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        "• Tap any detected network interface chip (e.g. wlan0) to instantly set the active CIDR or IP range.",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { showHelpDialog = false }) {
                    Text("Got It", color = LanEmerald, fontWeight = FontWeight.Bold)
                }
            }
        )
    }

    Scaffold(
        module = ZeusModule.Network, status = if (state.isAnyScanning) "Discovering network devices" else "${state.readerResults.size} readers · ${state.pingAlive} hosts", busy = state.isAnyScanning,
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        modifier = modifier.fillMaxSize()
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Top Bar
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "Back",
                            tint = MaterialTheme.colorScheme.onBackground
                        )
                    }
                    Spacer(modifier = Modifier.width(4.dp))
                    Column {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "LAN Scanner",
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onBackground
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(6.dp))
                                    .background(LanEmerald.copy(alpha = 0.16f))
                                    .border(1.dp, LanEmerald.copy(alpha = 0.35f), RoundedCornerShape(6.dp))
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                            ) {
                                Text(
                                    text = "SUITE",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                                    fontWeight = FontWeight.Bold,
                                    color = LanEmerald,
                                    fontFamily = FontFamily.Monospace
                                )
                            }
                        }
                        Text(
                            text = "RFID reader discovery, ping sweep & UDP edge",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Row {
                    IconButton(onClick = { showHelpDialog = true }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.HelpOutline,
                            contentDescription = "Info",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Mode Selection Segmented Pill Tabs
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(innerBoxBg)
                    .border(1.dp, cardBorder, RoundedCornerShape(14.dp))
                    .padding(4.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                TabPillButton(
                    title = "RFID Readers",
                    icon = Icons.Rounded.Radio,
                    selected = state.activeTab == NetScanTabMode.READER_DISCOVERY,
                    activeColor = LanEmerald,
                    modifier = Modifier.weight(1f),
                    onClick = { viewModel.setTab(NetScanTabMode.READER_DISCOVERY) }
                )
                TabPillButton(
                    title = "Ping Sweep",
                    icon = Icons.Rounded.Dns,
                    selected = state.activeTab == NetScanTabMode.PING_SCAN,
                    activeColor = LanCyan,
                    modifier = Modifier.weight(1f),
                    onClick = { viewModel.setTab(NetScanTabMode.PING_SCAN) }
                )
                TabPillButton(
                    title = "Edge UDP",
                    icon = Icons.Rounded.Hub,
                    selected = state.activeTab == NetScanTabMode.UDP_DISCOVERY,
                    activeColor = LanViolet,
                    modifier = Modifier.weight(1f),
                    onClick = { viewModel.setTab(NetScanTabMode.UDP_DISCOVERY) }
                )
            }

            // RADAR SCAN ANIMATION HERO CARD
            Card(
                colors = CardDefaults.cardColors(containerColor = cardBg),
                border = CardDefaults.outlinedCardBorder().copy(brush = Brush.horizontalGradient(listOf(cardBorder, LanEmerald.copy(alpha = 0.35f), cardBorder))),
                shape = RoundedCornerShape(22.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    // Header inside card
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
                                    .background(if (state.isAnyScanning) LanEmerald else MaterialTheme.colorScheme.outline.copy(alpha = 0.4f))
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = when (state.activeTab) {
                                    NetScanTabMode.READER_DISCOVERY -> if (state.isReaderScanning) "SCANNING READERS" else "RADAR IDLE"
                                    NetScanTabMode.PING_SCAN -> if (state.isPingScanning) "PINGING SUBNET" else "PING IDLE"
                                    NetScanTabMode.UDP_DISCOVERY -> if (state.isUdpListening) "LISTENING UDP" else "UDP IDLE"
                                },
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                color = if (state.isAnyScanning) LanEmerald else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        // Progress stats counter
                        when (state.activeTab) {
                            NetScanTabMode.READER_DISCOVERY -> {
                                if (state.readerTotal > 0) {
                                    Text(
                                        text = "${state.readerDone}/${state.readerTotal} · found ${state.readerFound}",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = FontFamily.Monospace,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                            NetScanTabMode.PING_SCAN -> {
                                if (state.pingTotal > 0) {
                                    Text(
                                        text = "${state.pingDone}/${state.pingTotal} · ${state.pingAlive} alive",
                                        style = MaterialTheme.typography.labelSmall,
                                        fontFamily = FontFamily.Monospace,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                            NetScanTabMode.UDP_DISCOVERY -> {
                                Text(
                                    text = "${state.udpDevices.size} device(s)",
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = FontFamily.Monospace,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Radar Particle Animation
                    LanScanAnimation(
                        isScanning = state.isAnyScanning,
                        onHubClick = { viewModel.onRadarHubClicked() },
                        modifier = Modifier.padding(vertical = 4.dp)
                    )

                    // Linear progress bar when scanning
                    if (state.activeTab == NetScanTabMode.READER_DISCOVERY && state.readerTotal > 0) {
                        Spacer(modifier = Modifier.height(10.dp))
                        LinearProgressIndicator(
                            progress = {
                                if (state.readerTotal > 0) {
                                    (state.readerDone.toFloat() / state.readerTotal.coerceAtLeast(1)).coerceIn(0f, 1f)
                                } else 0f
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp)),
                            color = LanEmerald,
                            trackColor = innerBoxBg
                        )
                    } else if (state.activeTab == NetScanTabMode.PING_SCAN && state.pingTotal > 0) {
                        Spacer(modifier = Modifier.height(10.dp))
                        LinearProgressIndicator(
                            progress = {
                                if (state.pingTotal > 0) {
                                    (state.pingDone.toFloat() / state.pingTotal.coerceAtLeast(1)).coerceIn(0f, 1f)
                                } else 0f
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(4.dp)
                                .clip(RoundedCornerShape(2.dp)),
                            color = LanCyan,
                            trackColor = innerBoxBg
                        )
                    }

                    Spacer(modifier = Modifier.height(14.dp))

                    // Action buttons row
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Button(
                            onClick = { viewModel.onRadarHubClicked() },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = if (state.isAnyScanning) MaterialTheme.colorScheme.error else LanEmerald
                            ),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            Icon(
                                imageVector = if (state.isAnyScanning) Icons.Rounded.Stop else Icons.Rounded.PlayArrow,
                                contentDescription = null,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = if (state.isAnyScanning) "Stop" else when (state.activeTab) {
                                    NetScanTabMode.READER_DISCOVERY -> "Start Reader Scan"
                                    NetScanTabMode.PING_SCAN -> "Start Ping Sweep"
                                    NetScanTabMode.UDP_DISCOVERY -> "Start UDP Listener"
                                },
                                fontWeight = FontWeight.Bold
                            )
                        }

                        Button(
                            onClick = {
                                when (state.activeTab) {
                                    NetScanTabMode.READER_DISCOVERY -> viewModel.clearReaderResults()
                                    NetScanTabMode.PING_SCAN -> viewModel.clearPingResults()
                                    NetScanTabMode.UDP_DISCOVERY -> viewModel.clearUdpDevices()
                                }
                            },
                            colors = ButtonDefaults.outlinedButtonColors(),
                            border = androidx.compose.foundation.BorderStroke(1.dp, cardBorder),
                            shape = RoundedCornerShape(12.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Clear,
                                contentDescription = "Clear",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Clear", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            // TARGET RANGE & INTERFACE CONFIGURATION CARD (For Reader Discovery & Ping Scan)
            if (state.activeTab != NetScanTabMode.UDP_DISCOVERY) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = cardBg),
                    border = CardDefaults.outlinedCardBorder().copy(brush = Brush.horizontalGradient(listOf(cardBorder, cardBorder))),
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        // Title + Refresh interfaces
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "TARGET SUBNET & INTERFACES",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            IconButton(
                                onClick = { viewModel.refreshInterfaces() },
                                modifier = Modifier.size(28.dp)
                            ) {
                                Icon(
                                    imageVector = Icons.Rounded.Refresh,
                                    contentDescription = "Refresh",
                                    tint = LanEmerald,
                                    modifier = Modifier.size(16.dp)
                                )
                            }
                        }

                        // Local network interfaces chips
                        if (state.interfaces.isNotEmpty()) {
                            Text(
                                text = "Detected interfaces (tap to apply):",
                                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .horizontalScroll(rememberScrollState()),
                                horizontalArrangement = Arrangement.spacedBy(6.dp)
                            ) {
                                for (iface in state.interfaces) {
                                    val isSelected = state.cidr == iface.networkCidr
                                    FilterChip(
                                        selected = isSelected,
                                        onClick = { viewModel.selectInterface(iface) },
                                        label = {
                                            Text(
                                                text = "${iface.name}: ${iface.networkCidr}",
                                                fontFamily = FontFamily.Monospace,
                                                fontSize = 11.sp,
                                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                                            )
                                        },
                                        leadingIcon = {
                                            Icon(
                                                imageVector = Icons.Rounded.Wifi,
                                                contentDescription = null,
                                                modifier = Modifier.size(14.dp)
                                            )
                                        },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = LanEmerald.copy(alpha = 0.16f),
                                            selectedLabelColor = LanEmerald
                                        ),
                                        shape = RoundedCornerShape(8.dp)
                                    )
                                }
                            }
                        }

                        // Target Scope selector: CIDR | IP Range | All Subnets
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            ScopeSelectorPill(
                                title = "CIDR",
                                selected = state.targetScope == TargetScope.CIDR,
                                modifier = Modifier.weight(1f),
                                onClick = { viewModel.setTargetScope(TargetScope.CIDR) }
                            )
                            ScopeSelectorPill(
                                title = "IP Range",
                                selected = state.targetScope == TargetScope.RANGE,
                                modifier = Modifier.weight(1f),
                                onClick = { viewModel.setTargetScope(TargetScope.RANGE) }
                            )
                            ScopeSelectorPill(
                                title = "All Subnets",
                                selected = state.targetScope == TargetScope.ALL_SUBNETS,
                                modifier = Modifier.weight(1f),
                                onClick = { viewModel.setTargetScope(TargetScope.ALL_SUBNETS) }
                            )
                        }

                        // Inputs depending on Scope
                        when (state.targetScope) {
                            TargetScope.CIDR -> {
                                OutlinedTextField(
                                    value = state.cidr,
                                    onValueChange = { viewModel.updateCidr(it) },
                                    label = { Text("Network (CIDR)") },
                                    placeholder = { Text("192.168.1.0/24") },
                                    singleLine = true,
                                    textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedBorderColor = LanEmerald,
                                        unfocusedBorderColor = cardBorder
                                    ),
                                    shape = RoundedCornerShape(12.dp),
                                    modifier = Modifier.fillMaxWidth()
                                )
                            }
                            TargetScope.RANGE -> {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    OutlinedTextField(
                                        value = state.rangeStart,
                                        onValueChange = { viewModel.updateRangeStart(it) },
                                        label = { Text("Start IP") },
                                        placeholder = { Text("192.168.1.1") },
                                        singleLine = true,
                                        textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                                        colors = OutlinedTextFieldDefaults.colors(
                                            focusedBorderColor = LanEmerald,
                                            unfocusedBorderColor = cardBorder
                                        ),
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.weight(1f)
                                    )
                                    OutlinedTextField(
                                        value = state.rangeEnd,
                                        onValueChange = { viewModel.updateRangeEnd(it) },
                                        label = { Text("End IP") },
                                        placeholder = { Text("192.168.1.254") },
                                        singleLine = true,
                                        textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                                        colors = OutlinedTextFieldDefaults.colors(
                                            focusedBorderColor = LanEmerald,
                                            unfocusedBorderColor = cardBorder
                                        ),
                                        shape = RoundedCornerShape(12.dp),
                                        modifier = Modifier.weight(1f)
                                    )
                                }
                            }
                            TargetScope.ALL_SUBNETS -> {
                                Box(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clip(RoundedCornerShape(12.dp))
                                        .background(innerBoxBg)
                                        .border(1.dp, cardBorder, RoundedCornerShape(12.dp))
                                        .padding(12.dp)
                                ) {
                                    Text(
                                        text = "Scans all active non-loopback network interface subnets simultaneously. Useful when connected to multiple Wi-Fi, Ethernet or VPN interfaces.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }

                        // Tuning Row: Concurrency & Timeout
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedTextField(
                                value = state.concurrency,
                                onValueChange = { viewModel.updateConcurrency(it) },
                                label = { Text("Parallel") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = LanEmerald,
                                    unfocusedBorderColor = cardBorder
                                ),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            )

                            OutlinedTextField(
                                value = state.timeoutMs,
                                onValueChange = { viewModel.updateTimeoutMs(it) },
                                label = { Text("Timeout (ms)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = LanEmerald,
                                    unfocusedBorderColor = cardBorder
                                ),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }

            // UDP DISCOVERY CONFIGURATION CARD (Only when UDP tab is active)
            if (state.activeTab == NetScanTabMode.UDP_DISCOVERY) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = cardBg),
                    border = CardDefaults.outlinedCardBorder().copy(brush = Brush.horizontalGradient(listOf(cardBorder, cardBorder))),
                    shape = RoundedCornerShape(20.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            text = "UDP LISTENER & PROBE SETTINGS",
                            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedTextField(
                                value = state.udpLocalPort,
                                onValueChange = { viewModel.updateUdpLocalPort(it) },
                                label = { Text("Local Port") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = LanViolet, unfocusedBorderColor = cardBorder),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            )

                            OutlinedTextField(
                                value = state.udpDurationSeconds,
                                onValueChange = { viewModel.updateUdpDuration(it) },
                                label = { Text("Duration (s)") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = LanViolet, unfocusedBorderColor = cardBorder),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            )
                        }

                        HorizontalDivider(color = cardBorder)

                        Text(
                            text = "Send Active Probe",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp)
                        ) {
                            OutlinedTextField(
                                value = state.udpProbeIp,
                                onValueChange = { viewModel.updateUdpProbeIp(it) },
                                label = { Text("Target IP / Broadcast") },
                                singleLine = true,
                                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = LanViolet, unfocusedBorderColor = cardBorder),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(2f)
                            )

                            OutlinedTextField(
                                value = state.udpRemotePort,
                                onValueChange = { viewModel.updateUdpRemotePort(it) },
                                label = { Text("Port") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                singleLine = true,
                                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = LanViolet, unfocusedBorderColor = cardBorder),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            )
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            OutlinedTextField(
                                value = state.udpProbeMessage,
                                onValueChange = { viewModel.updateUdpProbeMessage(it) },
                                label = { Text("Probe Message (optional)") },
                                placeholder = { Text("discovery payload...") },
                                singleLine = true,
                                textStyle = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                                colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = LanViolet, unfocusedBorderColor = cardBorder),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.weight(1f)
                            )

                            Button(
                                onClick = { viewModel.sendUdpProbe() },
                                colors = ButtonDefaults.buttonColors(containerColor = LanViolet),
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.height(54.dp)
                            ) {
                                Icon(imageVector = Icons.AutoMirrored.Rounded.Send, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Probe")
                            }
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Show Raw UDP Datagrams (${state.udpRawMessages.size})",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )

                            Switch(
                                checked = state.showRawUdp,
                                onCheckedChange = { viewModel.toggleShowRawUdp() },
                                colors = SwitchDefaults.colors(checkedThumbColor = LanViolet, checkedTrackColor = LanViolet.copy(alpha = 0.35f)),
                                modifier = Modifier.scale(0.85f)
                            )
                        }
                    }
                }
            }

            // RESULTS CONTAINER ACCORDING TO ACTIVE TAB
            when (state.activeTab) {
                NetScanTabMode.READER_DISCOVERY -> {
                    ReaderResultsSection(
                        results = state.readerResults,
                        isScanning = state.isReaderScanning,
                        cardBg = cardBg,
                        cardBorder = cardBorder,
                        innerBoxBg = innerBoxBg,
                        onUseHost = { ip ->
                            clipboard.setText(AnnotatedString(ip))
                            Toast.makeText(context, "Copied $ip to clipboard", Toast.LENGTH_SHORT).show()
                            onSelectHost?.invoke(ip)
                        }
                    )
                }
                NetScanTabMode.PING_SCAN -> {
                    PingResultsSection(
                        results = state.displayedPingRows,
                        allRows = state.pingResults,
                        aliveOnly = state.aliveOnly,
                        onToggleAliveOnly = { viewModel.toggleAliveOnly(it) },
                        isScanning = state.isPingScanning,
                        cardBg = cardBg,
                        cardBorder = cardBorder,
                        innerBoxBg = innerBoxBg,
                        onCopyAliveIps = {
                            val ips = state.pingResults.filter { it.alive }.joinToString("\n") { it.ip }
                            if (ips.isNotBlank()) {
                                clipboard.setText(AnnotatedString(ips))
                                Toast.makeText(context, "Copied alive IPs to clipboard", Toast.LENGTH_SHORT).show()
                            } else {
                                Toast.makeText(context, "No alive hosts found yet", Toast.LENGTH_SHORT).show()
                            }
                        },
                        onUseHost = { ip ->
                            clipboard.setText(AnnotatedString(ip))
                            Toast.makeText(context, "Copied $ip to clipboard", Toast.LENGTH_SHORT).show()
                            onSelectHost?.invoke(ip)
                        }
                    )
                }
                NetScanTabMode.UDP_DISCOVERY -> {
                    UdpResultsSection(
                        devices = state.udpDevices,
                        rawMessages = state.udpRawMessages,
                        showRaw = state.showRawUdp,
                        cardBg = cardBg,
                        cardBorder = cardBorder,
                        innerBoxBg = innerBoxBg,
                        onUseHost = { ip ->
                            clipboard.setText(AnnotatedString(ip))
                            Toast.makeText(context, "Copied $ip to clipboard", Toast.LENGTH_SHORT).show()
                            onSelectHost?.invoke(ip)
                        }
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }
}

// -------------------------------------------------------------
// SUB-SECTIONS & COMPONENTS
// -------------------------------------------------------------

@Composable
private fun ReaderResultsSection(
    results: List<ReaderCandidate>,
    isScanning: Boolean,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onUseHost: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "DISCOVERED RFID READERS (${results.size})",
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                color = LanEmerald
            )
        }

        if (results.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(cardBg)
                    .border(1.dp, cardBorder, RoundedCornerShape(16.dp))
                    .padding(vertical = 36.dp, horizontal = 20.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Rounded.Radio,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                        modifier = Modifier.size(36.dp)
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = if (isScanning) "Probing network for LLRP, FEIG & web admin interfaces..." else "No RFID readers discovered yet.",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = "Tap 'Start Reader Scan' to sweep target subnet.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                }
            }
        } else {
            for (reader in results) {
                ReaderCard(
                    reader = reader,
                    cardBg = cardBg,
                    cardBorder = cardBorder,
                    innerBoxBg = innerBoxBg,
                    onUseHost = onUseHost
                )
            }
        }
    }
}

@Composable
private fun ReaderCard(
    reader: ReaderCandidate,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onUseHost: (String) -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = CardDefaults.outlinedCardBorder().copy(brush = Brush.horizontalGradient(listOf(cardBorder, reader.vendor.badgeBg.copy(alpha = 0.35f)))),
        shape = RoundedCornerShape(18.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Vendor Monogram Logo Box
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(reader.vendor.badgeBg),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = reader.vendor.letters,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Black,
                            color = reader.vendor.badgeFg
                        )
                    }

                    Spacer(modifier = Modifier.width(12.dp))

                    Column {
                        Text(
                            text = reader.vendorLabel,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = reader.ip,
                            style = MaterialTheme.typography.bodyMedium,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.SemiBold,
                            color = LanEmerald
                        )
                    }
                }

                // Confidence badge
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(
                            when (reader.confidence) {
                                ReaderConfidence.HIGH -> LanEmerald.copy(alpha = 0.16f)
                                ReaderConfidence.MEDIUM -> Color(0xFFF59E0B).copy(alpha = 0.16f)
                                ReaderConfidence.LOW -> Color(0xFF6B7280).copy(alpha = 0.16f)
                            }
                        )
                        .padding(horizontal = 8.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = reader.confidence.name,
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                        fontWeight = FontWeight.Bold,
                        color = when (reader.confidence) {
                            ReaderConfidence.HIGH -> LanEmerald
                            ReaderConfidence.MEDIUM -> Color(0xFFF59E0B)
                            ReaderConfidence.LOW -> Color(0xFF9CA3AF)
                        }
                    )
                }
            }

            // Reason & open ports
            Text(
                text = reader.reason,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            // Open ports chips
            if (reader.openPorts.isNotEmpty()) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Ports:",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    reader.openPorts.forEach { port ->
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(innerBoxBg)
                                .border(0.5.dp, cardBorder, RoundedCornerShape(6.dp))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = when (port) {
                                    5084, 5085 -> "$port (LLRP)"
                                    80 -> "80 (HTTP)"
                                    443 -> "443 (HTTPS)"
                                    10001 -> "10001 (FEIG)"
                                    14150 -> "14150 (ItemSense)"
                                    else -> "$port"
                                },
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                fontFamily = FontFamily.Monospace,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
            }

            // Footer with web title if available + Use button
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (!reader.title.isNullOrBlank()) {
                    Text(
                        text = "Title: ${reader.title}",
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        modifier = Modifier.weight(1f)
                    )
                } else {
                    Spacer(modifier = Modifier.weight(1f))
                }

                Button(
                    onClick = { onUseHost(reader.ip) },
                    colors = ButtonDefaults.buttonColors(containerColor = LanEmerald.copy(alpha = 0.15f)),
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.height(34.dp)
                ) {
                    Text("Use Host", color = LanEmerald, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun PingResultsSection(
    results: List<PingScanRow>,
    allRows: List<PingScanRow>,
    aliveOnly: Boolean,
    onToggleAliveOnly: (Boolean) -> Unit,
    isScanning: Boolean,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onCopyAliveIps: () -> Unit,
    onUseHost: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "PING RESULTS (${results.size})",
                style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                color = LanCyan
            )

            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("Alive only", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(modifier = Modifier.width(4.dp))
                    Switch(
                        checked = aliveOnly,
                        onCheckedChange = onToggleAliveOnly,
                        colors = SwitchDefaults.colors(checkedThumbColor = LanCyan, checkedTrackColor = LanCyan.copy(alpha = 0.35f)),
                        modifier = Modifier.scale(0.75f)
                    )
                }

                Button(
                    onClick = onCopyAliveIps,
                    colors = ButtonDefaults.outlinedButtonColors(),
                    border = androidx.compose.foundation.BorderStroke(1.dp, cardBorder),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.height(32.dp)
                ) {
                    Icon(imageVector = Icons.Rounded.ContentCopy, contentDescription = null, modifier = Modifier.size(14.dp), tint = LanCyan)
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Copy IPs", color = LanCyan, fontSize = 11.sp)
                }
            }
        }

        if (results.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(cardBg)
                    .border(1.dp, cardBorder, RoundedCornerShape(16.dp))
                    .padding(vertical = 36.dp, horizontal = 20.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = if (isScanning) "Pinging hosts across target subnet..." else "No ping results yet. Tap 'Start Ping Sweep'.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            Card(
                colors = CardDefaults.cardColors(containerColor = cardBg),
                border = CardDefaults.outlinedCardBorder().copy(brush = Brush.horizontalGradient(listOf(cardBorder, cardBorder))),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column {
                    // Header row
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .background(innerBoxBg)
                            .padding(horizontal = 14.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("IP ADDRESS", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1.3f))
                        Text("STATUS", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(0.9f))
                        Text("PTR HOSTNAME", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(1.4f))
                        Text("ACTION", style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp), fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, modifier = Modifier.weight(0.8f))
                    }

                    HorizontalDivider(color = cardBorder)

                    for (row in results) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 14.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = row.ip,
                                style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace, fontSize = 12.sp),
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.weight(1.3f)
                            )

                            Row(modifier = Modifier.weight(0.9f), verticalAlignment = Alignment.CenterVertically) {
                                if (row.alive) {
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(LanEmerald.copy(alpha = 0.16f))
                                            .padding(horizontal = 6.dp, vertical = 2.dp)
                                    ) {
                                        Text("ALIVE", style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp), color = LanEmerald, fontWeight = FontWeight.Bold)
                                    }
                                    if (row.responseTimeMs != null) {
                                        Spacer(modifier = Modifier.width(4.dp))
                                        Text("${row.responseTimeMs}ms", style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                } else {
                                    Text("—", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f))
                                }
                            }

                            Text(
                                text = row.hostname ?: "—",
                                style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp),
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                modifier = Modifier.weight(1.4f)
                            )

                            if (row.alive) {
                                IconButton(
                                    onClick = { onUseHost(row.ip) },
                                    modifier = Modifier
                                        .weight(0.8f)
                                        .size(28.dp)
                                ) {
                                    Icon(imageVector = Icons.Rounded.ContentCopy, contentDescription = "Use", tint = LanCyan, modifier = Modifier.size(16.dp))
                                }
                            } else {
                                Spacer(modifier = Modifier.weight(0.8f))
                            }
                        }
                        HorizontalDivider(color = cardBorder.copy(alpha = 0.4f))
                    }
                }
            }
        }
    }
}

@Composable
private fun UdpResultsSection(
    devices: List<EdgeDiscoveredDevice>,
    rawMessages: List<com.zeus.rfid.data.netscan.RawUdpMessage>,
    showRaw: Boolean,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onUseHost: (String) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = "DISCOVERED EDGE SERVERS (${devices.size})",
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            color = LanViolet
        )

        if (showRaw) {
            Card(
                colors = CardDefaults.cardColors(containerColor = cardBg),
                border = CardDefaults.outlinedCardBorder().copy(brush = Brush.horizontalGradient(listOf(cardBorder, cardBorder))),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "RAW UDP PACKETS STREAM",
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        color = LanViolet
                    )
                    if (rawMessages.isEmpty()) {
                        Text("No UDP datagrams received yet.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        for (raw in rawMessages.take(20)) {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(innerBoxBg)
                                    .padding(8.dp)
                            ) {
                                Column {
                                    Text(
                                        text = "${raw.from}:${raw.fromPort}",
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                        fontFamily = FontFamily.Monospace,
                                        color = LanViolet,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = raw.data.take(160),
                                        style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace, fontSize = 10.sp),
                                        color = MaterialTheme.colorScheme.onSurface
                                    )
                                }
                            }
                        }
                    }
                }
            }
        } else {
            if (devices.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(16.dp))
                        .background(cardBg)
                        .border(1.dp, cardBorder, RoundedCornerShape(16.dp))
                        .padding(vertical = 36.dp, horizontal = 20.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Listening for Edge heartbeats... Start listener above.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                for (dev in devices) {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = cardBg),
                        border = CardDefaults.outlinedCardBorder().copy(brush = Brush.horizontalGradient(listOf(cardBorder, LanViolet.copy(alpha = 0.35f)))),
                        shape = RoundedCornerShape(16.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column {
                                    Text(
                                        text = dev.name.ifEmpty { "Edge Server" },
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Text(
                                        text = "${dev.ip}:${dev.port}",
                                        style = MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace),
                                        color = LanViolet,
                                        fontWeight = FontWeight.Bold
                                    )
                                }

                                Button(
                                    onClick = { onUseHost(dev.ip) },
                                    colors = ButtonDefaults.buttonColors(containerColor = LanViolet.copy(alpha = 0.16f)),
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier.height(32.dp)
                                ) {
                                    Text("Use", color = LanViolet, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                                }
                            }

                            if (dev.mac.isNotEmpty()) {
                                Text("MAC: ${dev.mac} · Ver: ${dev.version.ifEmpty { "—" }}", style = MaterialTheme.typography.bodySmall.copy(fontSize = 11.sp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            if (dev.guid.isNotEmpty()) {
                                Text("GUID: ${dev.guid}", style = MaterialTheme.typography.bodySmall.copy(fontSize = 10.sp, fontFamily = FontFamily.Monospace), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TabPillButton(
    title: String,
    icon: ImageVector,
    selected: Boolean,
    activeColor: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val haptic = androidx.compose.ui.platform.LocalHapticFeedback.current
    val bg by animateColorAsState(
        targetValue = if (selected) activeColor.copy(alpha = 0.16f) else Color.Transparent,
        label = "TabPillBg"
    )

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .clickable {
                haptic.performHapticFeedback(androidx.compose.ui.hapticfeedback.HapticFeedbackType.LongPress)
                onClick()
            }
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = if (selected) activeColor else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(16.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                color = if (selected) activeColor else MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun ScopeSelectorPill(
    title: String,
    selected: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    val bg = if (selected) LanEmerald.copy(alpha = 0.16f) else Color.Transparent
    val border = if (selected) LanEmerald else MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)

    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(bg)
            .border(1.dp, border, RoundedCornerShape(10.dp))
            .clickable(onClick = onClick)
            .padding(vertical = 8.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = if (selected) FontWeight.Bold else FontWeight.Medium,
            color = if (selected) LanEmerald else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}
