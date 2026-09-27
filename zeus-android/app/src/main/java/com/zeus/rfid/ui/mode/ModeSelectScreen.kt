package com.zeus.rfid.ui.mode

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.EaseInOut
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.isSystemInDarkTheme
import com.zeus.rfid.ui.components.isZeusDarkTheme
import com.zeus.rfid.ui.components.isZeusGlass
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.automirrored.rounded.Article
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Clear
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ChevronRight
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Hub
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.Memory
import androidx.compose.material.icons.rounded.Nfc
import androidx.compose.material.icons.rounded.QrCode
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.Radar
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.Transform
import androidx.compose.material.icons.rounded.Widgets
import androidx.compose.material.icons.rounded.Wifi
import com.zeus.rfid.ui.components.ZeusCard as Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.foundation.layout.navigationBarsPadding
import com.zeus.rfid.ui.components.sheetTopCameraSafePadding
import com.zeus.rfid.ui.theme.ZeusPurple
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.zeus.rfid.R
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusCyanAccent
import com.zeus.rfid.ui.theme.ZeusMint

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModeSelectScreen(
    viewModel: ModeSelectViewModel,
    onNavigateToFixed: () -> Unit,
    onNavigateToHandheldConnect: () -> Unit,
    onNavigateToDecode: () -> Unit,
    onNavigateToOcr: () -> Unit,
    onNavigateToLanScanner: () -> Unit,
    onNavigateToTagSynthesizer: () -> Unit = {},
    onNavigateToNfc: () -> Unit = {},
    onNavigateToDatabase: () -> Unit,
    onNavigateToFiles: () -> Unit,
    onNavigateToComingSoon: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var showOtherToolsSheet by remember { mutableStateOf(false) }
    var showGlobalSettingsSheet by remember { mutableStateOf(false) }

    // Global Settings BottomSheet
    if (showGlobalSettingsSheet) {
        com.zeus.rfid.ui.settings.GlobalSettingsModal(
            onDismiss = { showGlobalSettingsSheet = false }
        )
    }

    // Other Modules BottomSheet (setting-like vertical drag window, camera safe)
    if (showOtherToolsSheet) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
        ModalBottomSheet(
            onDismissRequest = { showOtherToolsSheet = false },
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
            OtherModulesBottomSheetContent(
                onNavigateToNfc = {
                    showOtherToolsSheet = false
                    onNavigateToNfc()
                },
                onNavigateToDecode = {
                    showOtherToolsSheet = false
                    onNavigateToDecode()
                },
                onNavigateToFiles = {
                    showOtherToolsSheet = false
                    onNavigateToFiles()
                },
                onNavigateToDatabase = {
                    showOtherToolsSheet = false
                    onNavigateToDatabase()
                },
                onNavigateToOcr = {
                    showOtherToolsSheet = false
                    onNavigateToOcr()
                },
                onNavigateToLanScanner = {
                    showOtherToolsSheet = false
                    onNavigateToLanScanner()
                },
                onNavigateToTagSynthesizer = {
                    showOtherToolsSheet = false
                    onNavigateToTagSynthesizer()
                },
                onNavigateToComingSoon = { title ->
                    showOtherToolsSheet = false
                    onNavigateToComingSoon(title)
                },
                onDismiss = { showOtherToolsSheet = false }
            )
        }
    }

    LaunchedEffect(Unit) {
        viewModel.events.collect { event ->
            when (event) {
                is ModeSelectUiEvent.NavigateToFixedDiscovery -> onNavigateToFixed()
                is ModeSelectUiEvent.NavigateToHandheldConnect -> onNavigateToHandheldConnect()
                is ModeSelectUiEvent.NavigateToDecodeEncode -> onNavigateToDecode()
                is ModeSelectUiEvent.NavigateToOcr -> onNavigateToOcr()
                is ModeSelectUiEvent.NavigateToLanScanner -> onNavigateToLanScanner()
                is ModeSelectUiEvent.NavigateToDatabase -> onNavigateToDatabase()
                is ModeSelectUiEvent.NavigateToFiles -> onNavigateToFiles()
                is ModeSelectUiEvent.NavigateToOther -> {
                    when (event.initialTab.lowercase()) {
                        "db", "database" -> onNavigateToDatabase()
                        "files", "sftp", "file" -> onNavigateToFiles()
                        "nfc", "reader" -> onNavigateToNfc()
                        else -> onNavigateToDecode()
                    }
                }
                is ModeSelectUiEvent.NavigateToComingSoon -> onNavigateToComingSoon(event.title)
            }
        }
    }

    ZeusFrontPage(
        modifier = modifier,
        onFixed = viewModel::onFixedSelected,
        onHandheld = viewModel::onHandheldSelected,
        onModules = { showOtherToolsSheet = true },
        onDecode = onNavigateToDecode,
        onFiles = onNavigateToFiles,
        onDatabase = onNavigateToDatabase,
        onOcr = onNavigateToOcr,
        onLanScanner = onNavigateToLanScanner,
        onSynthesizer = onNavigateToTagSynthesizer,
        onNfc = onNavigateToNfc,
        onOpenSettings = { showGlobalSettingsSheet = true }
    )
}

@Composable
private fun OtherModulesBottomSheetContent(
    onNavigateToNfc: () -> Unit,
    onNavigateToDecode: () -> Unit,
    onNavigateToFiles: () -> Unit,
    onNavigateToDatabase: () -> Unit,
    onNavigateToOcr: () -> Unit,
    onNavigateToLanScanner: () -> Unit,
    onNavigateToTagSynthesizer: () -> Unit,
    onNavigateToComingSoon: (String) -> Unit,
    onDismiss: () -> Unit
) {
    val isDark = isZeusDarkTheme()
    val isGlass = isZeusGlass()
    val cardBorder = zeusCardBorderColor(isDark)
    val innerBoxBg = zeusInnerBoxBg(isDark)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 28.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Sheet Header Row matching Settings
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
                        .background(ZeusPurple.copy(alpha = 0.14f))
                        .border(1.dp, ZeusPurple.copy(alpha = 0.35f), CircleShape),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Widgets,
                        contentDescription = null,
                        tint = ZeusPurple,
                        modifier = Modifier.size(22.dp)
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = "Other Modules",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = "Extended RFID utility suite & tools",
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

        // SECTION 1: Active Modules
        Text(
            text = "ACTIVE MODULES",
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            color = ZeusPurple,
            letterSpacing = 1.sp
        )

        // 1. NFC RFID Tag Reader
        OtherModuleOptionItem(
            title = "NFC RFID Tag Reader",
            subtitle = "13.56 MHz HF contactless reader: ISO 14443-A/B, ISO 15693, Mifare, NTAG, NDEF records & raw page matrix dump.",
            badge = "Active · 13.56 MHz",
            icon = Icons.Rounded.Nfc,
            accentColor = Color(0xFFF43F5E),
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder,
            isActive = true,
            onClick = onNavigateToNfc
        )

        // 2. File Transfer Explorer
        OtherModuleOptionItem(
            title = "File Transfer Explorer",
            subtitle = "Multi-protocol file manager: SFTP, FTP/FTPS, Amazon S3 & S3-compatible (MinIO/R2) with saved connection profiles.",
            badge = "Active · 4 Protocols",
            icon = Icons.Rounded.Folder,
            accentColor = ZeusCyanAccent,
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder,
            isActive = true,
            onClick = onNavigateToFiles
        )

        // 2. GS1 Decode / Encode
        OtherModuleOptionItem(
            title = "GS1 Decode / Encode",
            subtitle = "Full GS1 TDS 2.3 Tag Data Translation engine with interactive bit breakdown, UPC/EPC encoding & validation.",
            badge = "Active · TDS 2.3",
            icon = Icons.Rounded.Code,
            accentColor = ZeusPurple,
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder,
            isActive = true,
            onClick = onNavigateToDecode
        )

        // 3. Visual OCR & Barcode
        OtherModuleOptionItem(
            title = "Visual OCR & Barcode",
            subtitle = "Live camera ML Kit 1D/2D scanner (UPC, EAN, QR) and socket barcode emulator for port 10482.",
            badge = "Active · Live & Socket",
            icon = Icons.Rounded.QrCodeScanner,
            accentColor = Color(0xFFF59E0B),
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder,
            isActive = true,
            onClick = onNavigateToOcr
        )

        // 4. LAN Network Scanner
        OtherModuleOptionItem(
            title = "LAN Network Scanner",
            subtitle = "Subnet IP range discovery, active LLRP reader detection, ping sweep & UDP edge listener.",
            badge = "Active · Full Suite",
            icon = Icons.Rounded.Radar,
            accentColor = ZeusMint,
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder,
            isActive = true,
            onClick = onNavigateToLanScanner
        )

        // 5. Tag Synthesizer
        OtherModuleOptionItem(
            title = "Tag Synthesizer",
            subtitle = "Batch tag generator for SGTIN-96, GRAI-96, GIAI-96, Inditex/Tempe & printable QR codes.",
            badge = "Active · GS1 & Barcode",
            icon = Icons.Rounded.QrCode,
            accentColor = Color(0xFF6366F1),
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder,
            isActive = true,
            onClick = onNavigateToTagSynthesizer
        )

        // 6. Database Hub
        OtherModuleOptionItem(
            title = "Database Hub",
            subtitle = "Direct relational database query runner and table inspector for MySQL, MariaDB & PostgreSQL.",
            badge = "Active · Dual DB",
            icon = Icons.Rounded.Storage,
            accentColor = Color(0xFF3B82F6),
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder,
            isActive = true,
            onClick = onNavigateToDatabase
        )

        Spacer(modifier = Modifier.height(2.dp))

        // SECTION 2: Zeus Platform Suite Modules
        Text(
            text = "ZEUS PLATFORM SUITE",
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
            fontWeight = FontWeight.Bold,
            fontFamily = FontFamily.Monospace,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            letterSpacing = 1.sp
        )

        // 1. Edge Device Manager
        OtherModuleOptionItem(
            title = "Edge Device Manager",
            subtitle = "CEdgeHeartBeat UDP listener, remote reader cluster management & edge diagnostics.",
            badge = "Upcoming",
            icon = Icons.Rounded.Hub,
            accentColor = ZeusCyanAccent,
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder,
            isActive = false,
            onClick = { onNavigateToComingSoon("Edge Device Manager") }
        )

        // 2. Automation Workflow Engine
        OtherModuleOptionItem(
            title = "Automation Engine",
            subtitle = "Rule-based tag triggers, timed sequence transitions & automated reader workflows.",
            badge = "Upcoming",
            icon = Icons.Rounded.AutoAwesome,
            accentColor = Color(0xFFEC4899),
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder,
            isActive = false,
            onClick = { onNavigateToComingSoon("Automation Engine") }
        )

        // 3. System Log Analyzer
        OtherModuleOptionItem(
            title = "Log Analyzer",
            subtitle = "Multi-reader log aggregation, packet dump inspection & real-time regex filtering.",
            badge = "Upcoming",
            icon = Icons.AutoMirrored.Rounded.Article,
            accentColor = Color(0xFF64748B),
            innerBoxBg = innerBoxBg,
            cardBorder = cardBorder,
            isActive = false,
            onClick = { onNavigateToComingSoon("Log Analyzer") }
        )
    }
}

@Composable
private fun OtherModuleOptionItem(
    title: String,
    subtitle: String,
    badge: String,
    icon: ImageVector,
    accentColor: Color,
    innerBoxBg: Color,
    cardBorder: Color,
    isActive: Boolean = false,
    onClick: () -> Unit
) {
    val haptic = LocalHapticFeedback.current
    val interactionSource = remember { MutableInteractionSource() }
    val isPressed by interactionSource.collectIsPressedAsState()

    val scale by animateFloatAsState(
        targetValue = if (isPressed) 0.98f else 1f,
        animationSpec = spring(dampingRatio = 0.65f, stiffness = 450f),
        label = "SubCardScale"
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .scale(scale)
            .clip(RoundedCornerShape(18.dp))
            .background(innerBoxBg)
            .border(
                1.dp,
                if (isPressed) accentColor else if (isActive) accentColor.copy(alpha = 0.45f) else cardBorder.copy(alpha = 0.8f),
                RoundedCornerShape(18.dp)
            )
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    onClick()
                }
            )
            .padding(16.dp)
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
                        .size(46.dp)
                        .clip(RoundedCornerShape(14.dp))
                        .background(accentColor.copy(alpha = if (isActive) 0.18f else 0.12f))
                        .border(1.dp, accentColor.copy(alpha = if (isActive) 0.45f else 0.25f), RoundedCornerShape(14.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = accentColor,
                        modifier = Modifier.size(24.dp)
                    )
                }

                Spacer(modifier = Modifier.width(14.dp))

                Column {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            text = title,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .background(accentColor.copy(alpha = if (isActive) 0.16f else 0.08f))
                                .border(0.5.dp, accentColor.copy(alpha = if (isActive) 0.35f else 0.18f), RoundedCornerShape(6.dp))
                                .padding(horizontal = 7.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = badge,
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp),
                                fontWeight = FontWeight.Bold,
                                color = accentColor,
                                fontFamily = FontFamily.Monospace
                            )
                        }
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 12.sp),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        lineHeight = 16.sp
                    )
                }
            }

            Spacer(modifier = Modifier.width(10.dp))

            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(CircleShape)
                    .background(accentColor.copy(alpha = if (isActive) 0.18f else 0.08f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = if (isActive) Icons.AutoMirrored.Rounded.ArrowForward else Icons.Rounded.ChevronRight,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}
