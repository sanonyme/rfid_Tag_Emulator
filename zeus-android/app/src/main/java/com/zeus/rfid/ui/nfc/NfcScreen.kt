package com.zeus.rfid.ui.nfc

import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.nfc.NfcAdapter
import android.os.Build
import android.provider.Settings
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
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
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.rounded.BookmarkAdd
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Clear
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.ElectricBolt
import com.zeus.rfid.data.nfc.SavedNfcTag
import androidx.compose.material.icons.automirrored.rounded.HelpOutline
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.Memory
import androidx.compose.material.icons.rounded.Nfc
import androidx.compose.material.icons.rounded.Radar
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.ScrollableTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRowDefaults
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.zeus.rfid.data.nfc.NdefRecordData
import com.zeus.rfid.data.nfc.NfcHardwareStatus
import com.zeus.rfid.data.nfc.NfcMemoryPage
import com.zeus.rfid.data.nfc.NfcTagData
import com.zeus.rfid.ui.components.ZeusActionButton as Button
import com.zeus.rfid.ui.components.ZeusCard as Card
import com.zeus.rfid.ui.components.ZeusModule
import com.zeus.rfid.ui.components.ZeusScaffold as Scaffold
import com.zeus.rfid.ui.components.isZeusDarkTheme
import com.zeus.rfid.ui.components.isZeusGlass
import com.zeus.rfid.ui.components.sheetTopCameraSafePadding
import com.zeus.rfid.ui.components.zeusCardBg
import com.zeus.rfid.ui.components.zeusCardBorderColor
import com.zeus.rfid.ui.components.zeusInnerBoxBg
import com.zeus.rfid.ui.components.zeusMotionEnabled
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusCyanAccent
import com.zeus.rfid.ui.theme.ZeusMint
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

private val NfcRose = Color(0xFFF43F5E)
private val NfcRoseDark = Color(0xFF9F1239)
private val NfcRoseLight = Color(0xFFFDA4AF)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NfcScreen(
    viewModel: NfcViewModel,
    onNavigateBack: () -> Unit,
    onNavigateToDecode: (String?) -> Unit,
    onNavigateToFixed: () -> Unit,
    onNavigateToHandheld: () -> Unit,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val isDark = isZeusDarkTheme()
    val isGlass = isZeusGlass()
    val haptic = LocalHapticFeedback.current
    val clipboardManager = LocalClipboardManager.current
    val context = LocalContext.current
    val activity = context as? Activity

    val cardBg = zeusCardBg(isDark)
    val cardBorder = zeusCardBorderColor(isDark)
    val innerBoxBg = zeusInnerBoxBg(isDark)

    var showInfoSheet by remember { mutableStateOf(false) }

    // Register NFC Reader Mode & Hardware State Monitoring
    DisposableEffect(activity) {
        val nfcAdapter = try {
            NfcAdapter.getDefaultAdapter(context)
        } catch (_: Exception) {
            null
        }

        fun checkHwState() {
            when {
                nfcAdapter == null -> viewModel.updateHardwareStatus(NfcHardwareStatus.Unsupported)
                !nfcAdapter.isEnabled -> viewModel.updateHardwareStatus(NfcHardwareStatus.Disabled)
                else -> viewModel.updateHardwareStatus(NfcHardwareStatus.Ready)
            }
        }

        checkHwState()

        val receiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                if (intent?.action == NfcAdapter.ACTION_ADAPTER_STATE_CHANGED) {
                    checkHwState()
                }
            }
        }
        val filter = IntentFilter(NfcAdapter.ACTION_ADAPTER_STATE_CHANGED)
        context.registerReceiver(receiver, filter)

        if (activity != null && nfcAdapter != null && nfcAdapter.isEnabled) {
            val flags = NfcAdapter.FLAG_READER_NFC_A or
                NfcAdapter.FLAG_READER_NFC_B or
                NfcAdapter.FLAG_READER_NFC_F or
                NfcAdapter.FLAG_READER_NFC_V or
                NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS
            nfcAdapter.enableReaderMode(
                activity,
                { tag -> viewModel.onTagDiscovered(tag) },
                flags,
                null
            )
        }

        onDispose {
            try {
                context.unregisterReceiver(receiver)
            } catch (_: Exception) {}
            if (activity != null && nfcAdapter != null) {
                try {
                    nfcAdapter.disableReaderMode(activity)
                } catch (_: Exception) {}
            }
        }
    }

    Scaffold(
        module = ZeusModule.Nfc,
        status = when (state.hardwareStatus) {
            NfcHardwareStatus.Unsupported -> "NFC hardware absent"
            NfcHardwareStatus.Disabled -> "NFC disabled in settings"
            NfcHardwareStatus.Reading -> "Transceiving tag memory..."
            NfcHardwareStatus.Ready -> if (state.currentTag != null) "Tag UID ${state.currentTag?.uidHex}" else "Listening for 13.56 MHz tag"
        },
        busy = state.hardwareStatus == NfcHardwareStatus.Reading,
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                modifier = Modifier.padding(top = 8.dp),
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(38.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(NfcRose.copy(alpha = 0.16f))
                                .border(1.dp, NfcRose.copy(alpha = 0.35f), RoundedCornerShape(10.dp)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Nfc,
                                contentDescription = null,
                                tint = NfcRose,
                                modifier = Modifier.size(22.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = "NFC Tag Reader",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                text = "13.56 MHz HF · ISO 14443 & 15693",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "Back",
                            tint = MaterialTheme.colorScheme.onSurface
                        )
                    }
                },
                actions = {
                    if (state.currentTag != null) {
                        IconButton(
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.clearCurrentTag()
                            }
                        ) {
                            Icon(
                                imageVector = Icons.Rounded.Clear,
                                contentDescription = "Clear Tag",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                    IconButton(onClick = { showInfoSheet = true }) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.HelpOutline,
                            contentDescription = "Help & Protocols",
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.Transparent
                )
            )
        }
    ) { padding ->
        Column(
            modifier = modifier
                .fillMaxSize()
                .padding(padding)
                .navigationBarsPadding()
        ) {
            // Floating copy feedback banner
            AnimatedVisibility(
                visible = state.copyFeedback != null,
                enter = fadeIn() + expandVertically(),
                exit = fadeOut() + shrinkVertically()
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 6.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(ZeusMint.copy(alpha = 0.15f))
                        .border(1.dp, ZeusMint.copy(alpha = 0.4f), RoundedCornerShape(12.dp))
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Rounded.CheckCircle, null, tint = ZeusMint, modifier = Modifier.size(16.dp))
                        Text(
                            text = state.copyFeedback ?: "",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                            color = ZeusMint
                        )
                    }
                }
            }

            // Hardware warning banner if disabled or unsupported
            when (state.hardwareStatus) {
                NfcHardwareStatus.Disabled -> {
                    HardwareStatusBanner(
                        title = "NFC is turned off in Android settings",
                        subtitle = "Enable NFC to start reading ISO 14443 / 15693 RFID tags.",
                        actionLabel = "Open NFC Settings",
                        icon = Icons.Rounded.WarningAmber,
                        tint = Color(0xFFF59E0B),
                        onClickAction = {
                            val intent = Intent(Settings.ACTION_NFC_SETTINGS).apply {
                                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                            }
                            try {
                                context.startActivity(intent)
                            } catch (_: Exception) {
                                context.startActivity(Intent(Settings.ACTION_WIRELESS_SETTINGS))
                            }
                        }
                    )
                }
                NfcHardwareStatus.Unsupported -> {
                    HardwareStatusBanner(
                        title = "NFC Hardware Unsupported",
                        subtitle = "This Android device does not have an NFC controller chip.",
                        actionLabel = null,
                        icon = Icons.Rounded.Info,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        onClickAction = null
                    )
                }
                else -> Unit
            }

            // Main Scrollable Area
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Active HCE Emulation Banner
                val activeEmulationTag = state.emulatingTag
                if (state.isEmulating && activeEmulationTag != null) {
                    ActiveHceBanner(
                        tag = activeEmulationTag,
                        tapCount = state.emulationTapCount,
                        lastStatus = state.lastEmulationStatus,
                        onStopEmulation = viewModel::stopEmulation
                    )
                }

                // Interactive Antenna Viewfinder (Visualizer)
                NfcAntennaVisualizer(
                    hardwareStatus = state.hardwareStatus,
                    tag = state.currentTag,
                    onTapAntenna = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    }
                )

                // Tag Hero Card if a tag is present
                val tag = state.currentTag
                if (tag != null) {
                    NfcTagHeroCard(
                        tag = tag,
                        cardBg = cardBg,
                        cardBorder = cardBorder,
                        innerBoxBg = innerBoxBg,
                        onCopyUid = {
                            clipboardManager.setText(AnnotatedString(tag.uidHex))
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            viewModel.showCopyFeedback("Copied UID: ${tag.uidHex}")
                        },
                        onSendToDecoder = {
                            onNavigateToDecode(tag.uidHexPlain)
                        },
                        onEmulate = {
                            clipboardManager.setText(AnnotatedString(tag.uidHexPlain))
                            viewModel.showCopyFeedback("UID copied for emulator: ${tag.uidHexPlain}")
                            onNavigateToHandheld()
                        },
                        onSaveToVault = viewModel::openSaveDialog,
                        onPhoneEmulate = {
                            val saved = SavedNfcTag(
                                name = "Tag ${tag.uidHex.take(8)}",
                                uidHex = tag.uidHex,
                                uidDecimal = tag.uidDecimal,
                                standard = tag.standard,
                                tagType = tag.tagType,
                                vendor = tag.vendor,
                                isNdef = tag.isNdef,
                                ndefType = tag.ndefType,
                                ndefPayloadText = tag.records.firstOrNull()?.payloadText,
                                ndefUri = tag.records.firstOrNull()?.uriString
                            )
                            viewModel.startEmulation(saved)
                        },
                        onShareReport = {
                            val report = buildTagDiagnosticReport(tag)
                            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_SUBJECT, "Zeus NFC Tag Report: ${tag.uidHex}")
                                putExtra(Intent.EXTRA_TEXT, report)
                            }
                            context.startActivity(Intent.createChooser(shareIntent, "Share NFC Tag Report"))
                        }
                    )

                    // Navigation Tabs
                    ScrollableTabRow(
                        selectedTabIndex = state.selectedTab,
                        containerColor = Color.Transparent,
                        contentColor = NfcRose,
                        edgePadding = 0.dp,
                        indicator = { tabPositions ->
                            if (state.selectedTab < tabPositions.size) {
                                TabRowDefaults.SecondaryIndicator(
                                    modifier = Modifier.tabIndicatorOffset(tabPositions[state.selectedTab]),
                                    color = NfcRose,
                                    height = 3.dp
                                )
                            }
                        },
                        divider = {
                            HorizontalDivider(color = cardBorder.copy(alpha = 0.5f))
                        }
                    ) {
                        Tab(
                            selected = state.selectedTab == 0,
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.selectTab(0)
                            },
                            text = {
                                Text(
                                    "Chip Specs",
                                    fontWeight = if (state.selectedTab == 0) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 13.sp
                                )
                            }
                        )
                        Tab(
                            selected = state.selectedTab == 1,
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.selectTab(1)
                            },
                            text = {
                                Text(
                                    "NDEF (${tag.records.size})",
                                    fontWeight = if (state.selectedTab == 1) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 13.sp
                                )
                            }
                        )
                        Tab(
                            selected = state.selectedTab == 2,
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.selectTab(2)
                            },
                            text = {
                                Text(
                                    "Memory (${tag.memoryPages.size})",
                                    fontWeight = if (state.selectedTab == 2) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 13.sp
                                )
                            }
                        )
                        Tab(
                            selected = state.selectedTab == 3,
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.selectTab(3)
                            },
                            text = {
                                Text(
                                    "History (${state.scanHistory.size})",
                                    fontWeight = if (state.selectedTab == 3) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 13.sp
                                )
                            }
                        )
                        Tab(
                            selected = state.selectedTab == 4,
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.selectTab(4)
                            },
                            text = {
                                Text(
                                    "Vault (${state.vaultTags.size})",
                                    fontWeight = if (state.selectedTab == 4) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 13.sp
                                )
                            }
                        )
                    }

                    // Tab Contents
                    when (state.selectedTab) {
                        0 -> NfcChipSpecsTab(
                            tag = tag,
                            cardBg = cardBg,
                            cardBorder = cardBorder,
                            innerBoxBg = innerBoxBg,
                            onCopyText = { label, text ->
                                clipboardManager.setText(AnnotatedString(text))
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.showCopyFeedback("Copied $label: $text")
                            }
                        )
                        1 -> NfcNdefRecordsTab(
                            tag = tag,
                            cardBg = cardBg,
                            cardBorder = cardBorder,
                            innerBoxBg = innerBoxBg,
                            onCopyRecord = { text ->
                                clipboardManager.setText(AnnotatedString(text))
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.showCopyFeedback("Copied payload")
                            },
                            onOpenUri = { uriStr ->
                                try {
                                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(uriStr)).apply {
                                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                                    }
                                    context.startActivity(intent)
                                } catch (_: Exception) {
                                    viewModel.showCopyFeedback("Cannot launch URL")
                                }
                            }
                        )
                        2 -> NfcMemoryMatrixTab(
                            tag = tag,
                            cardBg = cardBg,
                            cardBorder = cardBorder,
                            innerBoxBg = innerBoxBg,
                            onCopyAllMemory = {
                                val fullDump = tag.memoryPages.joinToString("\n") { p ->
                                    "Page %02d [0x%04X]: %s | %s".format(p.pageNumber, p.byteOffset, p.hexBytes, p.ascii)
                                }
                                clipboardManager.setText(AnnotatedString(fullDump))
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.showCopyFeedback("Copied full memory matrix (${tag.memoryPages.size} pages)")
                            }
                        )
                        3 -> NfcScanHistoryTab(
                            history = state.scanHistory,
                            searchQuery = state.historySearchQuery,
                            onSearchChange = viewModel::setHistorySearchQuery,
                            onSelectTag = viewModel::selectTagFromHistory,
                            onClearHistory = viewModel::clearHistory,
                            cardBg = cardBg,
                            cardBorder = cardBorder,
                            innerBoxBg = innerBoxBg
                        )
                        4 -> NfcVaultTab(
                            tags = state.vaultTags,
                            selectedCategory = state.selectedVaultCategory,
                            searchQuery = state.vaultSearchQuery,
                            isEmulating = state.isEmulating,
                            emulatingTag = state.emulatingTag,
                            emulationTapCount = state.emulationTapCount,
                            lastEmulationStatus = state.lastEmulationStatus,
                            onSelectCategory = viewModel::setVaultCategory,
                            onSearchChange = viewModel::setVaultSearchQuery,
                            onStartEmulation = viewModel::startEmulation,
                            onStopEmulation = viewModel::stopEmulation,
                            onStreamToEdge = { onNavigateToFixed() },
                            onTagClick = viewModel::openTagDetail,
                            onDeleteTag = viewModel::deleteTagFromVault,
                            cardBg = cardBg,
                            cardBorder = cardBorder,
                            innerBoxBg = innerBoxBg
                        )
                    }
                } else {
                    // Mode Switcher when idle: Live Scanner vs Tag Vault
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(14.dp))
                            .background(cardBg)
                            .border(1.dp, cardBorder, RoundedCornerShape(14.dp))
                            .padding(4.dp),
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        val isVault = state.selectedTab == 4
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (!isVault) ZeusBlue.copy(alpha = 0.2f) else Color.Transparent)
                                .clickable { viewModel.selectTab(0) }
                                .padding(vertical = 10.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "Live Scanner",
                                fontWeight = if (!isVault) FontWeight.Bold else FontWeight.Normal,
                                color = if (!isVault) ZeusBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 13.sp
                            )
                        }
                        Box(
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (isVault) ZeusBlue.copy(alpha = 0.2f) else Color.Transparent)
                                .clickable { viewModel.selectTab(4) }
                                .padding(vertical = 10.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "Tag Vault (${state.vaultTags.size})",
                                fontWeight = if (isVault) FontWeight.Bold else FontWeight.Normal,
                                color = if (isVault) ZeusBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 13.sp
                            )
                        }
                    }

                    if (state.selectedTab == 4) {
                        NfcVaultTab(
                            tags = state.vaultTags,
                            selectedCategory = state.selectedVaultCategory,
                            searchQuery = state.vaultSearchQuery,
                            isEmulating = state.isEmulating,
                            emulatingTag = state.emulatingTag,
                            emulationTapCount = state.emulationTapCount,
                            lastEmulationStatus = state.lastEmulationStatus,
                            onSelectCategory = viewModel::setVaultCategory,
                            onSearchChange = viewModel::setVaultSearchQuery,
                            onStartEmulation = viewModel::startEmulation,
                            onStopEmulation = viewModel::stopEmulation,
                            onStreamToEdge = { onNavigateToFixed() },
                            onTagClick = viewModel::openTagDetail,
                            onDeleteTag = viewModel::deleteTagFromVault,
                            cardBg = cardBg,
                            cardBorder = cardBorder,
                            innerBoxBg = innerBoxBg
                        )
                    } else {
                        NfcEmptyGuideCard(
                            cardBg = cardBg,
                            cardBorder = cardBorder,
                            innerBoxBg = innerBoxBg,
                            historyCount = state.scanHistory.size,
                            onViewHistory = {
                                if (state.scanHistory.isNotEmpty()) {
                                    viewModel.selectTagFromHistory(state.scanHistory.first())
                                }
                            }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(24.dp))
            }
        }
    }

    // Help & Protocols Bottom Sheet
    if (showInfoSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
        ModalBottomSheet(
            onDismissRequest = { showInfoSheet = false },
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
            NfcProtocolsHelpSheet(
                cardBorder = cardBorder,
                innerBoxBg = innerBoxBg,
                onDismiss = { showInfoSheet = false }
            )
        }
    }

    // Save Tag to Vault Dialog
    val currentTagToSave = state.currentTag
    if (state.showSaveDialog && currentTagToSave != null) {
        SaveTagDialog(
            tag = currentTagToSave,
            onDismiss = { viewModel.dismissSaveDialog() },
            onSave = { name, category, notes ->
                viewModel.saveCurrentTagToVault(name, category, notes)
            }
        )
    }

    // Saved Tag Detail Bottom Sheet
    state.selectedSavedTagForDetail?.let { savedTag ->
        SavedTagDetailSheet(
            tag = savedTag,
            isEmulating = state.isEmulating && state.emulatingTag?.id == savedTag.id,
            onStartEmulation = { viewModel.startEmulation(savedTag) },
            onStopEmulation = { viewModel.stopEmulation() },
            onStreamToEdge = { onNavigateToFixed() },
            onDelete = { viewModel.deleteTagFromVault(savedTag.id) },
            onDismiss = { viewModel.openTagDetail(null) }
        )
    }
}

// -------------------------------------------------------------------------------------------------
// ANTENNA VISUALIZER (HIGH-TECH PULSING HALO)
// -------------------------------------------------------------------------------------------------

private data class SmokePlumeSpec(
    val freqX: Float,
    val freqY: Float,
    val phaseX: Float,
    val phaseY: Float,
    val radiusFactor: Float,
    val colorIdx: Int,
    val baseAlpha: Float
)

private data class SmokeWispSpec(
    val seedX: Float,
    val speedY: Float,
    val swayFreq: Float,
    val sizeDp: Float,
    val colorIdx: Int
)

@Composable
private fun NfcAntennaVisualizer(
    hardwareStatus: NfcHardwareStatus,
    tag: NfcTagData?,
    onTapAntenna: () -> Unit,
    modifier: Modifier = Modifier
) {
    val motion = zeusMotionEnabled()
    val isDark = isZeusDarkTheme()
    val isGlass = isZeusGlass()

    val infiniteTransition = rememberInfiniteTransition(label = "NfcSmokeyNebula")

    // Master continuous fluid animation phase (silky smooth 120 FPS clock)
    val smokePhase by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * PI).toFloat(),
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 7500, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "SmokePhase"
    )

    // Breathing expansion factor for the smokey core
    val breathScale by infiniteTransition.animateFloat(
        initialValue = 0.94f,
        targetValue = 1.06f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2800, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "BreathScale"
    )

    // Pulse wave expanding through the smoke
    val wavePulse by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 2400, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "WavePulse"
    )

    // Slow organic rotation of the misty flux
    val mistRotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 16000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "MistRotation"
    )

    val activeColor by animateColorAsState(
        targetValue = when {
            hardwareStatus == NfcHardwareStatus.Disabled -> Color(0xFFF59E0B)
            hardwareStatus == NfcHardwareStatus.Unsupported -> MaterialTheme.colorScheme.outline
            hardwareStatus == NfcHardwareStatus.Reading -> ZeusCyanAccent
            tag != null -> ZeusMint
            else -> NfcRose
        },
        animationSpec = tween(500),
        label = "HaloColor"
    )

    // Chromatic smoke palette tailored to the current state and theme
    val smokeColors = remember(isDark, activeColor) {
        if (isDark) {
            listOf(
                activeColor,
                Color(0xFF8B5CF6), // Ethereal Violet
                Color(0xFFEC4899), // Neon Magenta
                Color(0xFF06B6D4), // Cyan Mist
                Color(0xFF3B82F6), // Deep Plasma Blue
                Color(0xFFFB7185)  // Soft Rose Glow
            )
        } else {
            listOf(
                activeColor,
                Color(0xFF7C3AED), // Violet
                Color(0xFFDB2777), // Magenta
                Color(0xFF0284C7), // Sky Cyan
                Color(0xFF2563EB), // Blue
                Color(0xFFE11D48)  // Rose
            )
        }
    }

    // 8 Pre-configured harmonic orbital plumes (zero allocation during draw)
    val plumes = remember {
        listOf(
            SmokePlumeSpec(0.7f, 0.9f, 0.0f, 1.2f, 0.62f, 0, 0.34f),
            SmokePlumeSpec(-0.8f, 0.6f, 1.7f, 0.4f, 0.70f, 1, 0.30f),
            SmokePlumeSpec(1.1f, -0.7f, 3.1f, 2.0f, 0.55f, 2, 0.28f),
            SmokePlumeSpec(-0.6f, -1.0f, 4.5f, 3.3f, 0.68f, 3, 0.25f),
            SmokePlumeSpec(0.9f, 1.2f, 2.2f, 4.7f, 0.50f, 4, 0.28f),
            SmokePlumeSpec(-1.0f, 0.8f, 5.3f, 1.9f, 0.64f, 5, 0.24f),
            SmokePlumeSpec(0.5f, -0.9f, 0.8f, 3.8f, 0.72f, 1, 0.27f),
            SmokePlumeSpec(-0.7f, 1.1f, 2.9f, 0.7f, 0.56f, 0, 0.32f)
        )
    }

    // 18 Floating smoke particles / wisps drifting organically upward
    val wisps = remember {
        val rand = java.util.Random(0x4E464353L)
        List(18) {
            SmokeWispSpec(
                seedX = rand.nextFloat(),
                speedY = 0.15f + rand.nextFloat() * 0.20f,
                swayFreq = 1.0f + rand.nextFloat() * 1.5f,
                sizeDp = 10f + rand.nextFloat() * 24f,
                colorIdx = rand.nextInt(6)
            )
        }
    }

    val containerBgBrush = if (isGlass) {
        if (isDark) {
            Brush.linearGradient(
                listOf(
                    Color(0xF00A0F1D),
                    Color(0xD9060913),
                    Color(0xE60D1222)
                )
            )
        } else {
            Brush.linearGradient(
                listOf(
                    Color(0xF5FFFFFF),
                    Color(0xE6F8FAFC),
                    Color(0xF0F1F5F9)
                )
            )
        }
    } else {
        if (isDark) {
            Brush.verticalGradient(
                listOf(
                    Color(0xFF090D18),
                    Color(0xFF04060C)
                )
            )
        } else {
            Brush.verticalGradient(
                listOf(
                    Color(0xFFFFFFFF),
                    Color(0xFFF1F5F9)
                )
            )
        }
    }

    val rimBorderBrush = if (isGlass) {
        Brush.linearGradient(
            if (isDark) listOf(
                Color.White.copy(alpha = 0.35f),
                activeColor.copy(alpha = 0.55f),
                Color.White.copy(alpha = 0.08f),
                activeColor.copy(alpha = 0.20f)
            ) else listOf(
                Color.White.copy(alpha = 0.95f),
                activeColor.copy(alpha = 0.40f),
                Color.Black.copy(alpha = 0.06f),
                activeColor.copy(alpha = 0.25f)
            )
        )
    } else {
        Brush.linearGradient(
            listOf(
                activeColor.copy(alpha = 0.40f),
                if (isDark) Color(0xFF1E293B) else Color(0x33000000)
            )
        )
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(260.dp)
            .clip(RoundedCornerShape(32.dp))
            .background(containerBgBrush)
            .border(
                width = if (isGlass) 1.2.dp else 1.dp,
                brush = rimBorderBrush,
                shape = RoundedCornerShape(32.dp)
            )
            .clickable(onClick = onTapAntenna),
        contentAlignment = Alignment.Center
    ) {
        // High Performance 120 FPS Smokey Aurora & Plasma Canvas
        Canvas(modifier = Modifier.fillMaxSize()) {
            val w = size.width
            val h = size.height
            val center = Offset(w / 2f, h * 0.44f)
            val baseRadius = h * 0.38f

            if (motion) {
                // 1. Swirling Volumetric Smoke Plumes
                plumes.forEach { plume ->
                    val px = center.x + baseRadius * 0.40f * cos(smokePhase * plume.freqX + plume.phaseX)
                    val py = center.y + baseRadius * 0.30f * sin(smokePhase * plume.freqY + plume.phaseY)
                    val dynRadius = baseRadius * (plume.radiusFactor + 0.15f * sin(smokePhase * 1.2f + plume.phaseX)) * breathScale
                    val pCenter = Offset(px, py)
                    val col = smokeColors[plume.colorIdx % smokeColors.size]
                    val alpha = plume.baseAlpha * (if (isDark) 1.0f else 0.75f)

                    drawCircle(
                        brush = Brush.radialGradient(
                            colors = listOf(
                                col.copy(alpha = alpha),
                                col.copy(alpha = alpha * 0.45f),
                                col.copy(alpha = alpha * 0.12f),
                                Color.Transparent
                            ),
                            center = pCenter,
                            radius = dynRadius
                        ),
                        center = pCenter,
                        radius = dynRadius
                    )
                }

                // 2. Rising & Drifting Smoke Wisps
                wisps.forEach { wisp ->
                    val progress = ((smokePhase / (2 * PI.toFloat())) * wisp.speedY * 5f + wisp.seedX) % 1f
                    val wispY = center.y + baseRadius * 0.65f - progress * (baseRadius * 1.35f)
                    val sway = sin(smokePhase * wisp.swayFreq + wisp.seedX * 8f) * (baseRadius * 0.45f)
                    val wispX = center.x + sway
                    val wispAlpha = sin(progress * PI.toFloat()) * (if (isDark) 0.22f else 0.14f)
                    if (wispAlpha > 0.015f) {
                        val wCenter = Offset(wispX, wispY)
                        val wColor = smokeColors[wisp.colorIdx % smokeColors.size]
                        val rPx = wisp.sizeDp.dp.toPx()
                        drawCircle(
                            brush = Brush.radialGradient(
                                colors = listOf(
                                    wColor.copy(alpha = wispAlpha),
                                    wColor.copy(alpha = wispAlpha * 0.35f),
                                    Color.Transparent
                                ),
                                center = wCenter,
                                radius = rPx
                            ),
                            center = wCenter,
                            radius = rPx
                        )
                    }
                }

                // 3. Harmonic Ultrasonic Waves propagating through the smoke
                val waveR1 = baseRadius * (0.50f + 0.45f * wavePulse)
                val waveAlpha1 = (1f - wavePulse).coerceIn(0f, 1f) * (if (isDark) 0.35f else 0.25f)
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            activeColor.copy(alpha = waveAlpha1),
                            activeColor.copy(alpha = waveAlpha1 * 0.3f),
                            Color.Transparent
                        ),
                        center = center,
                        radius = waveR1
                    ),
                    center = center,
                    radius = waveR1,
                    style = Stroke(width = 2.dp.toPx())
                )

                val echoPulse = (wavePulse - 0.45f).let { if (it < 0f) it + 1f else it }
                val waveR2 = baseRadius * (0.50f + 0.45f * echoPulse)
                val waveAlpha2 = (1f - echoPulse).coerceIn(0f, 1f) * (if (isDark) 0.22f else 0.15f)
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            activeColor.copy(alpha = waveAlpha2),
                            activeColor.copy(alpha = waveAlpha2 * 0.2f),
                            Color.Transparent
                        ),
                        center = center,
                        radius = waveR2
                    ),
                    center = center,
                    radius = waveR2,
                    style = Stroke(width = 1.4.dp.toPx())
                )

                // 4. Soft Orbiting Flux Sparks (Luminous dust inside the vortex)
                val sparkCount = 8
                for (s in 0 until sparkCount) {
                    val sAngle = (mistRotation * PI.toFloat() / 180f) + (s * 2f * PI.toFloat() / sparkCount)
                    val sDist = baseRadius * (0.55f + 0.12f * sin(smokePhase * 1.5f + s))
                    val sx = center.x + cos(sAngle) * sDist
                    val sy = center.y + sin(sAngle) * sDist * 0.85f
                    val sparkColor = smokeColors[(s + 1) % smokeColors.size]
                    drawCircle(
                        color = sparkColor.copy(alpha = if (isDark) 0.65f else 0.45f),
                        radius = 2.5.dp.toPx(),
                        center = Offset(sx, sy)
                    )
                }
            } else {
                // Static subtle glow when motion is disabled
                drawCircle(
                    brush = Brush.radialGradient(
                        colors = listOf(
                            activeColor.copy(alpha = 0.35f),
                            activeColor.copy(alpha = 0.10f),
                            Color.Transparent
                        ),
                        center = center,
                        radius = baseRadius * 0.75f
                    ),
                    center = center,
                    radius = baseRadius * 0.75f
                )
            }
        }

        // Center Floating Element & Live Status Indicator
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(top = 8.dp)
        ) {
            // Floating Frosted Glass Orb (Breathing Singularity)
            Box(
                modifier = Modifier
                    .size(76.dp)
                    .scale(if (motion) breathScale else 1f)
                    .clip(CircleShape)
                    .background(
                        Brush.radialGradient(
                            listOf(
                                activeColor.copy(alpha = if (isDark) 0.25f else 0.18f),
                                if (isDark) Color(0x660F172A) else Color(0x66F8FAFC),
                                Color.Transparent
                            )
                        )
                    )
                    .border(
                        width = 1.5.dp,
                        brush = Brush.linearGradient(
                            if (isDark) listOf(
                                Color.White.copy(alpha = 0.85f),
                                activeColor.copy(alpha = 0.90f),
                                Color.White.copy(alpha = 0.25f)
                            ) else listOf(
                                Color.White.copy(alpha = 0.98f),
                                activeColor.copy(alpha = 0.70f),
                                Color.Black.copy(alpha = 0.10f)
                            )
                        ),
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = when {
                        hardwareStatus == NfcHardwareStatus.Disabled -> Icons.Rounded.WarningAmber
                        tag != null -> Icons.Rounded.CheckCircle
                        else -> Icons.Rounded.Nfc
                    },
                    contentDescription = null,
                    tint = activeColor,
                    modifier = Modifier.size(38.dp)
                )
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Floating Frosted Status Capsule
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(16.dp))
                    .background(
                        if (isDark) Color(0x990A0E1A) else Color(0xCCFFFFFF)
                    )
                    .border(
                        1.dp,
                        Brush.linearGradient(
                            if (isDark) listOf(
                                Color.White.copy(alpha = 0.28f),
                                activeColor.copy(alpha = 0.45f)
                            ) else listOf(
                                Color.White.copy(alpha = 0.85f),
                                activeColor.copy(alpha = 0.35f)
                            )
                        ),
                        RoundedCornerShape(16.dp)
                    )
                    .padding(horizontal = 16.dp, vertical = 6.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .clip(CircleShape)
                            .background(activeColor)
                    )
                    Text(
                        text = when {
                            hardwareStatus == NfcHardwareStatus.Disabled -> "NFC DISABLED IN SETTINGS"
                            hardwareStatus == NfcHardwareStatus.Unsupported -> "NO NFC HARDWARE"
                            hardwareStatus == NfcHardwareStatus.Reading -> "ACQUIRING MEMORY PAGES..."
                            tag != null -> "TAG DISCOVERED · READY"
                            else -> "READY TO SCAN · 13.56 MHz HF"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        color = activeColor,
                        letterSpacing = 1.1.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(6.dp))

            Text(
                text = when {
                    tag != null -> "${tag.vendor} · ${tag.tagType}"
                    hardwareStatus == NfcHardwareStatus.Disabled -> "Tap warning above to enable in Android"
                    else -> "Hold tag against top rear of phone"
                },
                style = MaterialTheme.typography.bodySmall,
                color = if (isDark) Color(0xFF94A3B8) else Color(0xFF64748B),
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

// -------------------------------------------------------------------------------------------------
// TAG HERO CARD
// -------------------------------------------------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun NfcTagHeroCard(
    tag: NfcTagData,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onCopyUid: () -> Unit,
    onSendToDecoder: () -> Unit,
    onEmulate: () -> Unit,
    onSaveToVault: () -> Unit,
    onPhoneEmulate: () -> Unit,
    onShareReport: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isDark = isZeusDarkTheme()
    val isGlass = isZeusGlass()

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = cardBg),
        border = if (isGlass) {
            BorderStroke(
                1.2.dp,
                Brush.linearGradient(
                    listOf(
                        ZeusMint.copy(alpha = 0.6f),
                        Color.White.copy(alpha = if (isDark) 0.25f else 0.8f),
                        ZeusMint.copy(alpha = 0.2f)
                    )
                )
            )
        } else {
            BorderStroke(1.dp, cardBorder)
        }
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Header Row: Silicon Vendor & NFC Forum Standard Badge
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
                            .background(ZeusMint)
                    )
                    Text(
                        text = tag.vendor,
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = ZeusMint
                    )
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(ZeusMint.copy(alpha = 0.14f))
                        .border(1.dp, ZeusMint.copy(alpha = 0.35f), RoundedCornerShape(8.dp))
                        .padding(horizontal = 9.dp, vertical = 3.dp)
                ) {
                    Text(
                        text = tag.standard,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = ZeusMint,
                        fontSize = 11.sp
                    )
                }
            }

            // Tag Type Title
            Text(
                text = tag.tagType,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Black,
                color = MaterialTheme.colorScheme.onSurface
            )

            // Prominent Luminous UID Card with Instant Copy
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(16.dp))
                    .background(innerBoxBg)
                    .border(1.dp, cardBorder.copy(alpha = 0.8f), RoundedCornerShape(16.dp))
                    .clickable(onClick = onCopyUid)
                    .padding(16.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "UNIQUE IDENTIFIER (HEX UID)",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 10.sp,
                            letterSpacing = 1.2.sp
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = tag.uidHex,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.Black,
                            fontFamily = FontFamily.Monospace,
                            color = if (isDark) Color(0xFF6EE7B7) else Color(0xFF047857),
                            letterSpacing = 2.sp
                        )
                    }

                    Box(
                        modifier = Modifier
                            .size(42.dp)
                            .clip(CircleShape)
                            .background(ZeusMint.copy(alpha = 0.16f))
                            .border(1.dp, ZeusMint.copy(alpha = 0.4f), CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.ContentCopy,
                            contentDescription = "Copy UID",
                            tint = ZeusMint,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            }

            // Silicon Specs Mini Pills
            val memoryLabel = if (tag.ndefMaxSize > 0) "${tag.ndefMaxSize} B" else if (tag.memoryPages.isNotEmpty()) "${tag.memoryPages.size * 4} B" else "N/A"
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                TagSpecPill(label = "Memory", value = memoryLabel, innerBoxBg = innerBoxBg, modifier = Modifier.weight(1f))
                TagSpecPill(label = "Tech", value = tag.techList.firstOrNull()?.substringAfterLast(".") ?: "NfcA", innerBoxBg = innerBoxBg, modifier = Modifier.weight(1f))
                TagSpecPill(label = "Pages", value = "${tag.memoryPages.size}", innerBoxBg = innerBoxBg, modifier = Modifier.weight(1f))
            }

            // Quick Action Buttons
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                QuickActionButton(
                    icon = Icons.Rounded.BookmarkAdd,
                    label = "Save to Vault",
                    accent = ZeusBlue,
                    onClick = onSaveToVault
                )
                QuickActionButton(
                    icon = Icons.Rounded.ElectricBolt,
                    label = "Phone Emulate",
                    accent = NfcRose,
                    onClick = onPhoneEmulate
                )
                QuickActionButton(
                    icon = Icons.Rounded.Code,
                    label = "Decode in GS1",
                    accent = ZeusCyanAccent,
                    onClick = onSendToDecoder
                )
                QuickActionButton(
                    icon = Icons.Rounded.Radio,
                    label = "Edge Emulate",
                    accent = ZeusMint,
                    onClick = onEmulate
                )
                QuickActionButton(
                    icon = Icons.Rounded.Share,
                    label = "Share Report",
                    accent = Color(0xFFAA87EF),
                    onClick = onShareReport
                )
            }
        }
    }
}

@Composable
private fun TagSpecPill(label: String, value: String, innerBoxBg: Color, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(innerBoxBg)
            .padding(vertical = 8.dp, horizontal = 10.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = label.uppercase(),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 9.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1
            )
        }
    }
}

@Composable
private fun QuickActionButton(
    icon: ImageVector,
    label: String,
    accent: Color,
    onClick: () -> Unit
) {
    val haptic = LocalHapticFeedback.current
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(accent.copy(alpha = 0.12f))
            .border(1.dp, accent.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
            .clickable {
                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                onClick()
            }
            .padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp)
    ) {
        Icon(icon, null, tint = accent, modifier = Modifier.size(15.dp))
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = accent
        )
    }
}

// -------------------------------------------------------------------------------------------------
// TAB 0: CHIPSET & SPECS
// -------------------------------------------------------------------------------------------------

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun NfcChipSpecsTab(
    tag: NfcTagData,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onCopyText: (String, String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // UID Formats
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = cardBg),
            border = BorderStroke(1.dp, cardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "IDENTIFIER REPRESENTATIONS",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = NfcRose,
                    letterSpacing = 1.sp
                )

                SpecRowItem(
                    label = "Hex (Colon)",
                    value = tag.uidHex,
                    innerBoxBg = innerBoxBg,
                    cardBorder = cardBorder,
                    onCopy = { onCopyText("Hex UID", tag.uidHex) }
                )

                SpecRowItem(
                    label = "Hex (Plain)",
                    value = tag.uidHexPlain,
                    innerBoxBg = innerBoxBg,
                    cardBorder = cardBorder,
                    onCopy = { onCopyText("Plain Hex", tag.uidHexPlain) }
                )

                SpecRowItem(
                    label = "Reversed Hex (Little-Endian)",
                    value = tag.uidReversedHex,
                    innerBoxBg = innerBoxBg,
                    cardBorder = cardBorder,
                    onCopy = { onCopyText("Reversed Hex", tag.uidReversedHex) }
                )

                SpecRowItem(
                    label = "Decimal (BigInteger)",
                    value = tag.uidDecimal,
                    innerBoxBg = innerBoxBg,
                    cardBorder = cardBorder,
                    onCopy = { onCopyText("Decimal UID", tag.uidDecimal) }
                )
            }
        }

        // RF & Protocol Specs
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = cardBg),
            border = BorderStroke(1.dp, cardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "RF & PROTOCOL TELEMETRY",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = ZeusCyanAccent,
                    letterSpacing = 1.sp
                )

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SpecTile(
                        label = "ATQA",
                        value = tag.atqa ?: "N/A",
                        innerBoxBg = innerBoxBg,
                        cardBorder = cardBorder,
                        modifier = Modifier.weight(1f)
                    )
                    SpecTile(
                        label = "SAK",
                        value = tag.sak ?: "N/A",
                        innerBoxBg = innerBoxBg,
                        cardBorder = cardBorder,
                        modifier = Modifier.weight(1f)
                    )
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    SpecTile(
                        label = "Max Transceive",
                        value = tag.maxTransceiveLength?.let { "$it bytes" } ?: "Standard",
                        innerBoxBg = innerBoxBg,
                        cardBorder = cardBorder,
                        modifier = Modifier.weight(1f)
                    )
                    SpecTile(
                        label = "Operating Frequency",
                        value = "13.56 MHz HF",
                        innerBoxBg = innerBoxBg,
                        cardBorder = cardBorder,
                        modifier = Modifier.weight(1f)
                    )
                }

                if (tag.historicalBytesHex != null) {
                    SpecRowItem(
                        label = "Historical Bytes (ATR/ATS)",
                        value = tag.historicalBytesHex,
                        innerBoxBg = innerBoxBg,
                        cardBorder = cardBorder,
                        onCopy = { onCopyText("Historical Bytes", tag.historicalBytesHex) }
                    )
                }
            }
        }

        // Technologies Stack
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(18.dp),
            colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = cardBg),
            border = BorderStroke(1.dp, cardBorder)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Text(
                    text = "ACTIVE TECHNOLOGY STACK",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = ZeusMint,
                    letterSpacing = 1.sp
                )

                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    tag.techList.forEach { tech ->
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(innerBoxBg)
                                .border(1.dp, ZeusMint.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
                                .padding(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Text(
                                text = "android.nfc.tech.$tech",
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = FontFamily.Monospace,
                                color = ZeusMint,
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }
        }

        // NDEF Status & Memory Limits
        if (tag.isNdef) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = cardBg),
                border = BorderStroke(1.dp, cardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        text = "NDEF STORAGE METRICS",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        color = Color(0xFFAA87EF),
                        letterSpacing = 1.sp
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Used / Capacity",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = "${tag.ndefCurrentSize} / ${tag.ndefMaxSize} bytes",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }

                    val progress = if (tag.ndefMaxSize > 0) {
                        (tag.ndefCurrentSize.toFloat() / tag.ndefMaxSize.toFloat()).coerceIn(0f, 1f)
                    } else 0f

                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(CircleShape),
                        color = Color(0xFFAA87EF),
                        trackColor = innerBoxBg
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        StatusPill(
                            label = if (tag.isWritable) "Read / Write" else "Read Only",
                            isPositive = tag.isWritable,
                            modifier = Modifier.weight(1f)
                        )
                        StatusPill(
                            label = if (tag.canMakeReadOnly) "Lockable" else "Permanent Lock",
                            isPositive = tag.canMakeReadOnly,
                            modifier = Modifier.weight(1f)
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SpecRowItem(
    label: String,
    value: String,
    innerBoxBg: Color,
    cardBorder: Color,
    onCopy: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(10.dp))
            .background(innerBoxBg)
            .border(1.dp, cardBorder.copy(alpha = 0.5f), RoundedCornerShape(10.dp))
            .clickable(onClick = onCopy)
            .padding(10.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 10.sp
                )
                Text(
                    text = value,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Icon(
                imageVector = Icons.Rounded.ContentCopy,
                contentDescription = "Copy",
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                modifier = Modifier.size(16.dp)
            )
        }
    }
}

@Composable
private fun SpecTile(
    label: String,
    value: String,
    innerBoxBg: Color,
    cardBorder: Color,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(innerBoxBg)
            .border(1.dp, cardBorder.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
            .padding(12.dp)
    ) {
        Column {
            Text(
                text = label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 10.sp
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
    }
}

@Composable
private fun StatusPill(
    label: String,
    isPositive: Boolean,
    modifier: Modifier = Modifier
) {
    val color = if (isPositive) ZeusMint else Color(0xFFF59E0B)
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(8.dp))
            .background(color.copy(alpha = 0.12f))
            .border(1.dp, color.copy(alpha = 0.35f), RoundedCornerShape(8.dp))
            .padding(vertical = 6.dp),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.Bold,
            color = color
        )
    }
}

// -------------------------------------------------------------------------------------------------
// TAB 1: NDEF RECORDS
// -------------------------------------------------------------------------------------------------

@Composable
private fun NfcNdefRecordsTab(
    tag: NfcTagData,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onCopyRecord: (String) -> Unit,
    onOpenUri: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        if (tag.records.isEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = cardBg),
                border = BorderStroke(1.dp, cardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Info,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(32.dp)
                    )
                    Text(
                        text = "No NDEF Records Found",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "This transponder does not contain standard NFC Forum NDEF records. It is either formatted with a custom/proprietary memory map, raw RFID blocks, or is unformatted.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                }
            }
        } else {
            tag.records.forEach { record ->
                NdefRecordCard(
                    record = record,
                    cardBg = cardBg,
                    cardBorder = cardBorder,
                    innerBoxBg = innerBoxBg,
                    onCopyRecord = onCopyRecord,
                    onOpenUri = onOpenUri
                )
            }
        }
    }
}

@Composable
private fun NdefRecordCard(
    record: NdefRecordData,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onCopyRecord: (String) -> Unit,
    onOpenUri: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var isRawExpanded by remember { mutableStateOf(false) }

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = cardBg),
        border = BorderStroke(1.dp, cardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header Row: Record #, Type Badge, TNF
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
                            .size(24.dp)
                            .clip(CircleShape)
                            .background(NfcRose.copy(alpha = 0.16f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = "#${record.recordIndex}",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = NfcRose,
                            fontSize = 11.sp
                        )
                    }

                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(innerBoxBg)
                            .border(1.dp, cardBorder, RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = record.type,
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontSize = 11.sp
                        )
                    }
                }

                Text(
                    text = record.tnfDescription.take(22) + if (record.tnfDescription.length > 22) "…" else "",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 10.sp
                )
            }

            // Record Payload Text Display
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(innerBoxBg)
                    .border(1.dp, cardBorder.copy(alpha = 0.6f), RoundedCornerShape(12.dp))
                    .padding(12.dp)
            ) {
                Text(
                    text = record.payloadText,
                    style = MaterialTheme.typography.bodyMedium,
                    fontFamily = if (record.type == "Text" || record.type == "URI") FontFamily.Default else FontFamily.Monospace,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            // Language / Encoding / Mime pills if applicable
            Row(
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (record.languageCode != null) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(ZeusMint.copy(alpha = 0.14f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "Lang: ${record.languageCode.uppercase()}",
                            style = MaterialTheme.typography.labelSmall,
                            color = ZeusMint,
                            fontSize = 10.sp
                        )
                    }
                }
                if (record.encoding != null) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(ZeusCyanAccent.copy(alpha = 0.14f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = record.encoding,
                            style = MaterialTheme.typography.labelSmall,
                            color = ZeusCyanAccent,
                            fontSize = 10.sp
                        )
                    }
                }
                if (record.mimeType != null) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(Color(0xFFAA87EF).copy(alpha = 0.14f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = record.mimeType,
                            style = MaterialTheme.typography.labelSmall,
                            color = Color(0xFFAA87EF),
                            fontSize = 10.sp
                        )
                    }
                }
            }

            // Action row: Copy, Open Browser, Raw Toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    // Copy Payload
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(innerBoxBg)
                            .border(1.dp, cardBorder, RoundedCornerShape(8.dp))
                            .clickable { onCopyRecord(record.payloadText) }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(Icons.Rounded.ContentCopy, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(14.dp))
                        Text("Copy", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurface)
                    }

                    // Open URI if applicable
                    if (record.uriString != null) {
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(ZeusCyanAccent.copy(alpha = 0.15f))
                                .border(1.dp, ZeusCyanAccent.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
                            .clickable { onOpenUri(record.uriString) }
                            .padding(horizontal = 10.dp, vertical = 6.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Icon(Icons.AutoMirrored.Rounded.OpenInNew, null, tint = ZeusCyanAccent, modifier = Modifier.size(14.dp))
                            Text("Open", style = MaterialTheme.typography.labelSmall, color = ZeusCyanAccent, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                // Toggle raw hex dump
                Text(
                    text = if (isRawExpanded) "Hide Hex" else "Raw Hex",
                    style = MaterialTheme.typography.labelSmall,
                    color = NfcRose,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.clickable { isRawExpanded = !isRawExpanded }
                )
            }

            AnimatedVisibility(visible = isRawExpanded) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color(0xFF070B12))
                        .border(1.dp, cardBorder.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
                        .padding(10.dp)
                ) {
                    Text(
                        text = record.rawPayloadHex,
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = Color(0xFF94A3B8),
                        fontSize = 11.sp
                    )
                }
            }
        }
    }
}

// -------------------------------------------------------------------------------------------------
// TAB 2: MEMORY MATRIX (RAW BLOCKS / PAGES)
// -------------------------------------------------------------------------------------------------

@Composable
private fun NfcMemoryMatrixTab(
    tag: NfcTagData,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onCopyAllMemory: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        if (tag.memoryPages.isEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = cardBg),
                border = BorderStroke(1.dp, cardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Memory,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(32.dp)
                    )
                    Text(
                        text = "Memory Dump Unavailable",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Hardware page-by-page memory reading is available for Type-2, MIFARE Ultralight, and NTAG transponders. Other technologies require mutual ISO-DEP authentication or proprietary crypto keys.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center
                    )
                }
            }
        } else {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = cardBg),
                border = BorderStroke(1.dp, cardBorder)
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "RAW MEMORY MATRIX",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                color = NfcRose,
                                letterSpacing = 1.sp
                            )
                            Text(
                                text = "${tag.memoryPages.size} pages · 4 bytes / page (64 bytes)",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }

                        Button(
                            onClick = onCopyAllMemory,
                            shape = RoundedCornerShape(8.dp),
                            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp)
                        ) {
                            Icon(Icons.Rounded.ContentCopy, null, modifier = Modifier.size(14.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Copy Dump", fontSize = 11.sp)
                        }
                    }

                    HorizontalDivider(color = cardBorder.copy(alpha = 0.5f))

                    // Matrix Table Header
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "PAGE",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.width(44.dp)
                        )
                        Text(
                            text = "HEX BYTES (0..3)",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            text = "ASCII",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.width(46.dp)
                        )
                    }

                    // Pages List
                    tag.memoryPages.forEach { page ->
                        MemoryPageRow(
                            page = page,
                            innerBoxBg = innerBoxBg,
                            cardBorder = cardBorder
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MemoryPageRow(
    page: NfcMemoryPage,
    innerBoxBg: Color,
    cardBorder: Color
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(innerBoxBg)
            .border(1.dp, cardBorder.copy(alpha = 0.4f), RoundedCornerShape(8.dp))
            .padding(horizontal = 10.dp, vertical = 8.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "%02d".format(page.pageNumber),
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = NfcRose,
                    modifier = Modifier.width(44.dp)
                )

                Text(
                    text = page.hexBytes,
                    style = MaterialTheme.typography.bodySmall,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f)
                )

                Text(
                    text = page.ascii,
                    style = MaterialTheme.typography.bodySmall,
                    fontFamily = FontFamily.Monospace,
                    color = ZeusMint,
                    modifier = Modifier.width(46.dp)
                )
            }

            if (page.description != null) {
                Text(
                    text = page.description,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 10.sp
                )
            }
        }
    }
}

// -------------------------------------------------------------------------------------------------
// TAB 3: SCAN HISTORY
// -------------------------------------------------------------------------------------------------

@Composable
private fun NfcScanHistoryTab(
    history: List<NfcTagData>,
    searchQuery: String,
    onSearchChange: (String) -> Unit,
    onSelectTag: (NfcTagData) -> Unit,
    onClearHistory: () -> Unit,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    modifier: Modifier = Modifier
) {
    val filteredHistory = remember(history, searchQuery) {
        if (searchQuery.isBlank()) history
        else history.filter {
            it.uidHex.contains(searchQuery, ignoreCase = true) ||
                it.vendor.contains(searchQuery, ignoreCase = true) ||
                it.tagType.contains(searchQuery, ignoreCase = true)
        }
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Search & Clear Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = onSearchChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text("Filter history by UID or chip...", fontSize = 12.sp) },
                leadingIcon = {
                    Icon(Icons.Rounded.Search, null, tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(18.dp))
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = NfcRose,
                    unfocusedBorderColor = cardBorder
                )
            )

            if (history.isNotEmpty()) {
                IconButton(onClick = onClearHistory) {
                    Icon(
                        imageVector = Icons.Rounded.DeleteOutline,
                        contentDescription = "Clear History",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        if (filteredHistory.isEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(18.dp),
                colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = cardBg),
                border = BorderStroke(1.dp, cardBorder)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(28.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = if (searchQuery.isNotBlank()) "No tags match '$searchQuery'" else "Scan history is empty for this session.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            filteredHistory.forEach { item ->
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { onSelectTag(item) },
                    shape = RoundedCornerShape(16.dp),
                    colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = cardBg),
                    border = BorderStroke(1.dp, cardBorder)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = item.uidHex,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    color = NfcRose
                                )
                                Text(
                                    text = item.formattedTimestamp,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 10.sp
                                )
                            }
                            Spacer(modifier = Modifier.height(3.dp))
                            Text(
                                text = "${item.tagType} · ${item.vendor}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                fontSize = 11.sp
                            )
                        }

                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(innerBoxBg)
                                .padding(horizontal = 8.dp, vertical = 4.dp)
                        ) {
                            Text(
                                text = "${item.records.size} NDEF",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = ZeusCyanAccent,
                                fontSize = 10.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

// -------------------------------------------------------------------------------------------------
// EMPTY STATE INSTRUCTIONS CARD
// -------------------------------------------------------------------------------------------------

@Composable
private fun NfcEmptyGuideCard(
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    historyCount: Int,
    onViewHistory: () -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(26.dp),
        colors = androidx.compose.material3.CardDefaults.cardColors(containerColor = cardBg),
        border = BorderStroke(1.dp, cardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "FIELD SENSOR & PROTOCOL MATRIX",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    color = NfcRose,
                    letterSpacing = 1.2.sp
                )
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(NfcRose.copy(alpha = 0.14f))
                        .padding(horizontal = 7.dp, vertical = 2.dp)
                ) {
                    Text(
                        text = "13.56 MHz HF",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = NfcRose,
                        fontSize = 10.sp
                    )
                }
            }

            // 3 Modern Telemetry Tiles
            GuideTileRow(
                icon = Icons.Rounded.Smartphone,
                title = "Antenna Location",
                detail = "Hold tag against the upper chassis or rear camera bezel where Android coupling coils reside.",
                accent = ZeusCyanAccent,
                innerBoxBg = innerBoxBg
            )

            GuideTileRow(
                icon = Icons.Rounded.Radar,
                title = "Induction Proximity",
                detail = "Zero contact up to 3 cm air gap. Hold stationary for ~150 ms to complete full memory transceiving.",
                accent = ZeusMint,
                innerBoxBg = innerBoxBg
            )

            GuideTileRow(
                icon = Icons.Rounded.Memory,
                title = "Transponder Standards",
                detail = "ISO 14443-A/B, ISO 15693 (Vicinity), NTAG213/215/216, MIFARE Ultralight, Classic, DESFire & FeliCa.",
                accent = Color(0xFFA88BFF),
                innerBoxBg = innerBoxBg
            )

            if (historyCount > 0) {
                HorizontalDivider(color = cardBorder.copy(alpha = 0.4f))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(innerBoxBg)
                        .clickable(onClick = onViewHistory)
                        .padding(horizontal = 14.dp, vertical = 10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Rounded.History, null, tint = ZeusCyanAccent, modifier = Modifier.size(18.dp))
                        Text(
                            text = "Recall last scan ($historyCount saved in session)",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.SemiBold,
                            color = ZeusCyanAccent
                        )
                    }
                    Icon(
                        imageVector = Icons.AutoMirrored.Rounded.ArrowForward,
                        contentDescription = null,
                        tint = ZeusCyanAccent,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}

@Composable
private fun GuideTileRow(
    icon: ImageVector,
    title: String,
    detail: String,
    accent: Color,
    innerBoxBg: Color
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(innerBoxBg)
            .padding(12.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(
            modifier = Modifier
                .size(40.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(accent.copy(alpha = 0.14f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(icon, null, tint = accent, modifier = Modifier.size(20.dp))
        }
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface
            )
            Spacer(modifier = Modifier.height(2.dp))
            Text(
                text = detail,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                lineHeight = 15.sp,
                fontSize = 11.sp
            )
        }
    }
}

// -------------------------------------------------------------------------------------------------
// HARDWARE STATUS BANNER
// -------------------------------------------------------------------------------------------------

@Composable
private fun HardwareStatusBanner(
    title: String,
    subtitle: String,
    actionLabel: String?,
    icon: ImageVector,
    tint: Color,
    onClickAction: (() -> Unit)?,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 6.dp)
            .clip(RoundedCornerShape(16.dp))
            .background(tint.copy(alpha = 0.12f))
            .border(1.dp, tint.copy(alpha = 0.35f), RoundedCornerShape(16.dp))
            .padding(14.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                Icon(icon, null, tint = tint, modifier = Modifier.size(24.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = title,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 11.sp
                    )
                }
            }

            if (actionLabel != null && onClickAction != null) {
                Button(
                    onClick = onClickAction,
                    shape = RoundedCornerShape(8.dp),
                    colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = tint),
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
                ) {
                    Text(actionLabel, color = Color.Black, fontWeight = FontWeight.Bold, fontSize = 11.sp)
                }
            }
        }
    }
}

// -------------------------------------------------------------------------------------------------
// PROTOCOLS HELP BOTTOM SHEET
// -------------------------------------------------------------------------------------------------

@Composable
private fun NfcProtocolsHelpSheet(
    cardBorder: Color,
    innerBoxBg: Color,
    onDismiss: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
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
                        .background(NfcRose.copy(alpha = 0.14f))
                        .border(1.dp, NfcRose.copy(alpha = 0.35f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Nfc,
                        contentDescription = null,
                        tint = NfcRose,
                        modifier = Modifier.size(22.dp)
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = "NFC & RFID Architecture",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Supported standards, protocols & chipsets",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            IconButton(onClick = onDismiss) {
                Icon(
                    imageVector = Icons.Rounded.Clear,
                    contentDescription = "Close",
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        HorizontalDivider(color = cardBorder.copy(alpha = 0.6f))

        ProtocolInfoCard(
            title = "ISO/IEC 14443 Type A (NFC-A)",
            desc = "106 kbit/s ASK 100% modulation with Miller coding. Used in MIFARE Classic, MIFARE Ultralight, NTAG21x, DESFire, bank cards, and transit systems.",
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder
        )

        ProtocolInfoCard(
            title = "ISO/IEC 14443 Type B (NFC-B)",
            desc = "106 kbit/s ASK 10% modulation with NRZ coding. Common in national electronic IDs, biometric passports (e-passports), and secure tokens.",
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder
        )

        ProtocolInfoCard(
            title = "ISO/IEC 15693 (NFC-V / Vicinity)",
            desc = "High-frequency long-range vicinity protocol (read range up to 1-1.5 meters with external antennas). Extensively used in library tagging, supply chain, and pharmaceutical asset tracking (NXP ICODE SLIX, ST25TV).",
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder
        )

        ProtocolInfoCard(
            title = "JIS X 6319-4 (Sony FeliCa / NFC-F)",
            desc = "High-speed 212 / 424 kbit/s Manchester encoded RFID standard widely adopted across Japan and Asia (Suica, Pasmo, Octopus).",
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder
        )

        ProtocolInfoCard(
            title = "NDEF (NFC Data Exchange Format)",
            desc = "Lightweight binary format defined by NFC Forum to encapsulate URLs, vCards, Bluetooth pairing tokens, WiFi credentials, plain text, and Android Application Records (AAR).",
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder
        )
    }
}

@Composable
private fun ProtocolInfoCard(
    title: String,
    desc: String,
    innerBoxBg: Color,
    cardBorder: Color
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(innerBoxBg)
            .border(1.dp, cardBorder.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
            .padding(14.dp)
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Bold,
                color = NfcRose
            )
            Text(
                text = desc,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                lineHeight = 16.sp
            )
        }
    }
}

// -------------------------------------------------------------------------------------------------
// DIAGNOSTIC REPORT BUILDER
// -------------------------------------------------------------------------------------------------

private fun buildTagDiagnosticReport(tag: NfcTagData): String {
    val sb = StringBuilder()
    sb.appendLine("==========================================")
    sb.appendLine("ZEUS RFID STUDIO - NFC TAG DIAGNOSTIC REPORT")
    sb.appendLine("==========================================")
    sb.appendLine("Timestamp      : ${tag.formattedTimestamp}")
    sb.appendLine("UID (Hex)      : ${tag.uidHex}")
    sb.appendLine("UID (Plain)    : ${tag.uidHexPlain}")
    sb.appendLine("UID (Reversed) : ${tag.uidReversedHex}")
    sb.appendLine("UID (Decimal)  : ${tag.uidDecimal}")
    sb.appendLine("Standard       : ${tag.standard}")
    sb.appendLine("Tag Type       : ${tag.tagType}")
    sb.appendLine("IC Vendor      : ${tag.vendor}")
    sb.appendLine("ATQA           : ${tag.atqa ?: "N/A"}")
    sb.appendLine("SAK            : ${tag.sak ?: "N/A"}")
    sb.appendLine("Technologies   : ${tag.techList.joinToString(", ")}")
    sb.appendLine("Max Transceive : ${tag.maxTransceiveLength ?: "N/A"} bytes")
    if (tag.historicalBytesHex != null) {
        sb.appendLine("Historical/ATR : ${tag.historicalBytesHex}")
    }
    sb.appendLine()
    sb.appendLine("--- NDEF RECORDS (${tag.records.size}) ---")
    if (tag.records.isEmpty()) {
        sb.appendLine("No NDEF payload formatted on transponder.")
    } else {
        tag.records.forEach { r ->
            sb.appendLine("[#${r.recordIndex}] Type: ${r.type} (${r.tnfDescription})")
            if (r.languageCode != null) sb.appendLine("  Language: ${r.languageCode} (${r.encoding})")
            if (r.mimeType != null) sb.appendLine("  MIME: ${r.mimeType}")
            sb.appendLine("  Payload: ${r.payloadText}")
            sb.appendLine("  Raw Hex: ${r.rawPayloadHex}")
        }
    }
    if (tag.memoryPages.isNotEmpty()) {
        sb.appendLine()
        sb.appendLine("--- MEMORY DUMP (${tag.memoryPages.size} PAGES) ---")
        tag.memoryPages.forEach { p ->
            sb.appendLine("Page %02d [0x%04X]: %-12s | %s".format(p.pageNumber, p.byteOffset, p.hexBytes, p.ascii))
        }
    }
    sb.appendLine("==========================================")
    return sb.toString()
}
