package com.zeus.rfid.ui.discover

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.HelpOutline
import androidx.compose.material.icons.automirrored.rounded.List
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import com.zeus.rfid.ui.components.ZeusScaffold as Scaffold
import com.zeus.rfid.ui.components.ZeusModule
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.zeus.rfid.data.model.DiscoveredServer
import com.zeus.rfid.ui.components.ManualConnectSheet
import com.zeus.rfid.ui.components.RadarScanAnimation
import com.zeus.rfid.ui.components.ServerDetailSheet
import com.zeus.rfid.ui.components.ZeusButton
import com.zeus.rfid.ui.components.ZeusButtonVariant
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusMint
import com.zeus.rfid.ui.theme.ZeusRed
import com.zeus.rfid.ui.util.DiscoverySounds
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscoverScreen(
    viewModel: DiscoverViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToOptions: (DiscoveredServer) -> Unit,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    val manualSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    var showHelpDialog by remember { mutableStateOf(false) }
    val soundEnabled = com.zeus.rfid.ui.components.ZeusExperienceSettings.soundEnabled
    var previousServerCount by remember { mutableStateOf(0) }

    LaunchedEffect(state.servers.size) {
        if (state.servers.size > previousServerCount) DiscoverySounds.found(soundEnabled)
        previousServerCount = state.servers.size
    }
    LaunchedEffect(state.step::class) {
        if (state.step is DiscoverStep.Empty) DiscoverySounds.empty(soundEnabled)
    }

    // Stop discovery and release MulticastLock when screen leaves composition
    DisposableEffect(Unit) {
        onDispose {
            viewModel.stopDiscovery()
        }
    }

    // Collect one-off UI events
    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is DiscoverUiEvent.NavigateToOptions -> {
                    onNavigateToOptions(event.server)
                }

                is DiscoverUiEvent.ShowMessage -> {
                    snackbarHostState.showSnackbar(event.message)
                }
            }
        }
    }

    Scaffold(
        module = ZeusModule.Discovery, status = if (state.isScanning) "Listening for Edge heartbeats" else if (state.servers.isNotEmpty()) "${state.servers.size} servers available" else "Tap the halo to discover", busy = state.isScanning,
        containerColor = MaterialTheme.colorScheme.background,
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                modifier = Modifier.padding(top = 8.dp),
                title = { },
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
                    IconButton(onClick = { showHelpDialog = true }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.HelpOutline,
                            contentDescription = "Help & Discovery Info",
                            tint = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f)
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent
                )
            )
        },
        modifier = modifier.fillMaxSize()
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Top Title Area (Apple / Home Assistant design)
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 12.dp)
            ) {
                // Key on step TYPE only — Found is a data class whose equality changes
                // every time a server is added, which was causing a full fade on each discovery.
                // Keying on ::class means only real state transitions (Idle→Scanning→Found)
                // trigger the crossfade, not internal data updates within the same step.
                AnimatedContent(
                    targetState = state.step::class,
                    transitionSpec = { fadeIn() togetherWith fadeOut() },
                    label = "TitleTransition"
                ) {
                    val step = state.step
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        val titleText = when (step) {
                            is DiscoverStep.Idle -> "Find Edge\nServer"
                            is DiscoverStep.Scanning -> "Searching for Edge\nServers on Wi-Fi"
                            is DiscoverStep.Found -> "Edge Servers\nDetected"
                            is DiscoverStep.Empty -> "No Edge Server\nFound"
                            is DiscoverStep.Error -> "Search\nUnavailable"
                        }

                        Text(
                            text = titleText,
                            style = MaterialTheme.typography.displayLarge,
                            fontWeight = FontWeight.Bold,
                            textAlign = TextAlign.Center,
                            color = MaterialTheme.colorScheme.onBackground
                        )

                        Spacer(modifier = Modifier.height(10.dp))

                        val subtitleText = when (step) {
                            is DiscoverStep.Idle -> "Tap Find to listen for Edge Server UDP heartbeats (port ${state.udpPort})"
                            is DiscoverStep.Scanning -> "Listening on UDP port ${state.udpPort} & broadcasting wake-up probe..."
                            is DiscoverStep.Found -> "${state.servers.size} Edge server(s) detected and ready to connect"
                            is DiscoverStep.Empty -> "No heartbeat received on port ${state.udpPort}. Verify device is connected to the same Wi-Fi."
                            is DiscoverStep.Error -> step.message
                        }

                        Text(
                            text = subtitleText,
                            style = MaterialTheme.typography.bodyMedium,
                            textAlign = TextAlign.Center,
                            color = if (step is DiscoverStep.Error) ZeusRed else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // The radar stays visible through all discovery states to keep its action clear.
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.weight(1f)
            ) {
                BoxWithConstraints(contentAlignment = Alignment.Center) {
                    val radarSize = minOf(maxWidth, maxHeight, 320.dp)
                    RadarScanAnimation(
                        size = radarSize,
                        isScanning = state.isScanning,
                        discoveredServers = state.servers,
                        onHubClick = {
                            if (state.isScanning) {
                                DiscoverySounds.stop(soundEnabled)
                                viewModel.stopDiscovery()
                            } else {
                                DiscoverySounds.start(soundEnabled)
                                viewModel.startDiscovery()
                            }
                        }
                    )
                }
            }

            // Bottom Actions Area
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(14.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 24.dp)
            ) {
                val statusText = when (state.step) {
                    is DiscoverStep.Idle -> "READY TO DISCOVER"
                    is DiscoverStep.Scanning -> "LISTENING FOR EDGE HEARTBEATS"
                    is DiscoverStep.Found -> "${state.servers.size} EDGE SERVER${if (state.servers.size == 1) "" else "S"} IN RANGE"
                    is DiscoverStep.Empty -> "NO SIGNAL · TAP RADAR TO RETRY"
                    is DiscoverStep.Error -> "SEARCH INTERRUPTED · TAP TO RETRY"
                }
                Text(
                    text = statusText,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = if (state.servers.isNotEmpty()) ZeusMint else ZeusBlue,
                    modifier = Modifier
                        .border(1.dp, ZeusBlue.copy(alpha = 0.25f), RoundedCornerShape(100.dp))
                        .background(ZeusBlue.copy(alpha = 0.07f), RoundedCornerShape(100.dp))
                        .padding(horizontal = 16.dp, vertical = 9.dp)
                )
                // "See servers (N)" reveals dynamically when servers are found
                AnimatedVisibility(
                    visible = state.servers.isNotEmpty(),
                    enter = slideInVertically(initialOffsetY = { it / 2 }) + fadeIn(),
                    exit = slideOutVertically(targetOffsetY = { it / 2 }) + fadeOut()
                ) {
                    ZeusButton(
                        text = "See servers (${state.servers.size})",
                        onClick = { viewModel.setBottomSheetVisible(true) },
                        variant = ZeusButtonVariant.Primary,
                        leadingIcon = {
                            Icon(
                                imageVector = Icons.AutoMirrored.Rounded.List,
                                contentDescription = null,
                                modifier = Modifier.size(20.dp)
                            )
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                }

                // Apple/Home Assistant style text button at the bottom
                Text(
                    text = "Enter address manually",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    color = ZeusBlue,
                    modifier = Modifier
                        .clickable(
                            interactionSource = remember { MutableInteractionSource() },
                            indication = null,
                            onClick = viewModel::onManualAddressRequested
                        )
                        .padding(vertical = 10.dp, horizontal = 16.dp)
                )
            }
        }
    }

    // Server list sheet
    if (state.isBottomSheetOpen) {
        ServerDetailSheet(
            servers = state.servers,
            connectionState = state.connectionState,
            onConnect = viewModel::connectToServer,
            onDismiss = { viewModel.setBottomSheetVisible(false) },
            sheetState = sheetState
        )
    }

    // Manual IP connect sheet
    if (state.isManualSheetOpen) {
        ManualConnectSheet(
            sheetState = manualSheetState,
            onConnect = { host, port -> viewModel.connectManually(host, port) },
            onDismiss = { viewModel.setManualSheetVisible(false) }
        )
    }

    // Help Dialog
    if (showHelpDialog) {
        AlertDialog(
            onDismissRequest = { showHelpDialog = false },
            title = {
                Text(
                    text = "Edge Server Discovery Guide",
                    style = MaterialTheme.typography.titleLarge
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Zeus scans your local Wi-Fi for Edge Server heartbeat broadcasts over UDP, matching Zeus Desktop.",
                        style = MaterialTheme.typography.bodyMedium
                    )
                    Text(
                        text = "• Heartbeat Port: UDP ${state.udpPort} (CEdgeHeartBeatModel)",
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.SemiBold,
                        color = ZeusBlue
                    )
                    Text(
                        text = "• Active Probe: Broadcasts wake-up datagrams on port 23 and ${state.udpPort} to prompt immediate responses.",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        text = "• Wi-Fi AP Isolation: Ensure 'Client Isolation' or 'Guest Mode' is disabled on your router so UDP broadcast traffic can traverse between devices.",
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        text = "• Android MulticastLock: Automatically acquired while scanning to prevent the chipset from filtering incoming UDP packets.",
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { showHelpDialog = false }) {
                    Text("Got it", color = ZeusBlue)
                }
            },
            containerColor = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(20.dp)
        )
    }
}
