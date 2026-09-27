package com.zeus.rfid.ui.settings

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
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
import androidx.compose.material.icons.rounded.Animation
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.CropSquare
import androidx.compose.material.icons.rounded.DarkMode
import androidx.compose.material.icons.rounded.Dns
import com.zeus.rfid.ui.components.isZeusDarkTheme
import com.zeus.rfid.ui.components.isZeusGlass
import com.zeus.rfid.ui.components.zeusCardBg
import com.zeus.rfid.ui.components.zeusCardBorderColor
import com.zeus.rfid.ui.components.zeusInnerBoxBg
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.LightMode
import androidx.compose.material.icons.rounded.MotionPhotosOff
import androidx.compose.material.icons.rounded.Palette
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.TouchApp
import androidx.compose.material.icons.rounded.Vibration
import androidx.compose.material.icons.rounded.VolumeOff
import androidx.compose.material.icons.rounded.VolumeUp
import androidx.compose.material.icons.rounded.Wifi
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zeus.rfid.ui.components.ZeusExperienceSettings
import com.zeus.rfid.ui.components.sheetTopCameraSafePadding
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusCyanAccent
import com.zeus.rfid.ui.theme.ZeusMint
import com.zeus.rfid.ui.theme.ZeusPurple
import com.zeus.rfid.ui.util.DiscoverySounds
import com.zeus.rfid.ui.util.SoundEffectHelper

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun GlobalSettingsModal(
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
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
        GlobalSettingsContent(onDismiss = onDismiss)
    }
}

@Composable
fun GlobalSettingsContent(
    onDismiss: () -> Unit
) {
    val isDark = isZeusDarkTheme()
    val isGlass = isZeusGlass()
    val haptic = LocalHapticFeedback.current

    val cardBg = zeusCardBg(isDark)
    val cardBorder = zeusCardBorderColor(isDark)
    val innerBoxBg = zeusInnerBoxBg(isDark)

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(bottom = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Header
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(38.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(ZeusBlue.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Settings,
                        contentDescription = "Settings",
                        tint = ZeusBlue,
                        modifier = Modifier.size(22.dp)
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column {
                    Text(
                        text = "Global Settings",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "App-wide preferences & module configurations",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            IconButton(
                onClick = onDismiss,
                modifier = Modifier
                    .size(32.dp)
                    .clip(CircleShape)
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
            ) {
                Icon(
                    imageVector = Icons.Rounded.Close,
                    contentDescription = "Close",
                    modifier = Modifier.size(18.dp)
                )
            }
        }

        HorizontalDivider(color = cardBorder)

        // 1. AUDIO & SOUND EFFECTS
        SettingsGroupCard(
            title = "Sound & Audio FX",
            icon = Icons.Rounded.VolumeUp,
            accentColor = ZeusCyanAccent,
            cardBg = cardBg,
            cardBorder = cardBorder
        ) {
            SettingsToggleRow(
                title = "App Sound Effects",
                subtitle = "Audio feedback on tag reads, clicks, and discovery events",
                checked = ZeusExperienceSettings.soundEnabled,
                onCheckedChange = {
                    ZeusExperienceSettings.setSound(it)
                    if (it) SoundEffectHelper.playClick()
                }
            )

            if (ZeusExperienceSettings.soundEnabled) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(innerBoxBg)
                        .padding(10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Audio Feedback Test",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Button(
                        onClick = {
                            SoundEffectHelper.playTagReadBeep()
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = ZeusCyanAccent),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.height(30.dp)
                    ) {
                        Text("Test Chime", fontSize = 11.sp, color = Color.Black, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }

        // 2. ANIMATIONS & MOTION
        SettingsGroupCard(
            title = "Animation & Graphics",
            icon = Icons.Rounded.Animation,
            accentColor = ZeusPurple,
            cardBg = cardBg,
            cardBorder = cardBorder
        ) {
            SettingsToggleRow(
                title = "Fluid Motion & Animations",
                subtitle = "Radar sweep, breathing hubs, and smooth particle transitions",
                checked = ZeusExperienceSettings.motionEnabled,
                onCheckedChange = {
                    ZeusExperienceSettings.setMotion(it)
                }
            )
        }

        // 3. TOUCH HAPTICS
        SettingsGroupCard(
            title = "Haptic Touch",
            icon = Icons.Rounded.Vibration,
            accentColor = ZeusMint,
            cardBg = cardBg,
            cardBorder = cardBorder
        ) {
            SettingsToggleRow(
                title = "Haptic Vibration",
                subtitle = "Subtle tactile click on buttons, sliders, and tag streaming",
                checked = ZeusExperienceSettings.hapticEnabled,
                onCheckedChange = {
                    ZeusExperienceSettings.setHaptic(it)
                    if (it) haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                }
            )
        }

        // 4. THEME & APPEARANCE
        SettingsGroupCard(
            title = "Appearance & Design",
            icon = Icons.Rounded.Palette,
            accentColor = Color(0xFFFFB300),
            cardBg = cardBg,
            cardBorder = cardBorder
        ) {
            Text(
                text = "Surface Design Style",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf(
                    Triple("GLASS", "Glassmorphism", Icons.Rounded.AutoAwesome),
                    Triple("NORMAL", "Normal (Solid)", Icons.Rounded.CropSquare)
                ).forEach { (style, label, icon) ->
                    val selected = ZeusExperienceSettings.uiStyle == style
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (selected) Color(0xFFFFB300).copy(alpha = 0.2f) else innerBoxBg)
                            .border(
                                1.dp,
                                if (selected) Color(0xFFFFB300) else cardBorder,
                                RoundedCornerShape(10.dp)
                            )
                            .clickable {
                                ZeusExperienceSettings.setUiStyle(style)
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            }
                            .padding(vertical = 10.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                imageVector = icon,
                                contentDescription = null,
                                tint = if (selected) Color(0xFFFFB300) else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = label,
                                fontSize = 11.sp,
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                                color = if (selected) Color(0xFFFFB300) else MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Color Theme",
                style = MaterialTheme.typography.bodySmall,
                fontWeight = FontWeight.SemiBold
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                listOf(
                    Triple("SYSTEM", "Auto System", Icons.Rounded.Settings),
                    Triple("DARK", "Dark OLED", Icons.Rounded.DarkMode),
                    Triple("LIGHT", "Light Mode", Icons.Rounded.LightMode)
                ).forEach { (mode, label, icon) ->
                    val selected = ZeusExperienceSettings.themeMode == mode
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (selected) ZeusBlue.copy(alpha = 0.2f) else innerBoxBg)
                            .border(
                                1.dp,
                                if (selected) ZeusBlue else cardBorder,
                                RoundedCornerShape(10.dp)
                            )
                            .clickable {
                                ZeusExperienceSettings.setTheme(mode)
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                            }
                            .padding(vertical = 10.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                            Icon(
                                imageVector = icon,
                                contentDescription = null,
                                tint = if (selected) ZeusBlue else MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            Text(
                                text = label,
                                fontSize = 11.sp,
                                fontWeight = if (selected) FontWeight.Bold else FontWeight.Normal,
                                color = if (selected) ZeusBlue else MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }
            }
        }

        // 5. NETWORK & SCANNER DEFAULTS
        SettingsGroupCard(
            title = "Network & Discovery",
            icon = Icons.Rounded.Wifi,
            accentColor = ZeusBlue,
            cardBg = cardBg,
            cardBorder = cardBorder
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Fixed Edge Discovery Port", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Text("Standard UDP broadcast listener port", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(innerBoxBg)
                        .border(1.dp, cardBorder, RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Text("7000", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = ZeusBlue)
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Edge Heartbeat Broadcast Rate", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Text("Active probe ping interval", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(innerBoxBg)
                        .border(1.dp, cardBorder, RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 6.dp)
                ) {
                    Text("3.0 sec", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 13.sp, color = ZeusMint)
                }
            }
        }

        // 6. MODULE PROTOCOLS
        SettingsGroupCard(
            title = "Module Protocols",
            icon = Icons.Rounded.Folder,
            accentColor = ZeusCyanAccent,
            cardBg = cardBg,
            cardBorder = cardBorder
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("File Explorer Engines", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Text("SFTP (JSch 0.2.21), FTP (Commons Net), AWS S3 REST", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(ZeusCyanAccent.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text("4 PROTOCOLS", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = ZeusCyanAccent)
                }
            }

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text("Database Drivers", fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                    Text("MariaDB / MySQL JDBC 3.4.1 & PostgreSQL JDBC 42.7.4", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(ZeusMint.copy(alpha = 0.15f))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text("2 ENGINES", fontSize = 10.sp, fontWeight = FontWeight.Bold, color = ZeusMint)
                }
            }
        }

        // 7. ABOUT APP & BUILD
        SettingsGroupCard(
            title = "About Zeus RFID Studio",
            icon = Icons.Rounded.Info,
            accentColor = MaterialTheme.colorScheme.onSurfaceVariant,
            cardBg = cardBg,
            cardBorder = cardBorder
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Version", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("2.4.0 (Electron Parity)", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Platform", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Android Compose Native", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun SettingsGroupCard(
    title: String,
    icon: ImageVector,
    accentColor: Color,
    cardBg: Color,
    cardBorder: Color,
    content: @Composable () -> Unit
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = BorderStroke(1.dp, cardBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = icon,
                    contentDescription = null,
                    tint = accentColor,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
            }
            content()
        }
    }
}

@Composable
private fun SettingsToggleRow(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onCheckedChange(!checked) },
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f).padding(end = 12.dp)) {
            Text(
                text = title,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold
            )
            Text(
                text = subtitle,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Switch(
            checked = checked,
            onCheckedChange = onCheckedChange,
            colors = SwitchDefaults.colors(
                checkedThumbColor = Color.White,
                checkedTrackColor = ZeusBlue
            )
        )
    }
}
