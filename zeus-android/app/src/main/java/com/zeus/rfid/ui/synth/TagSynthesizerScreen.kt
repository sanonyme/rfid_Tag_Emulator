package com.zeus.rfid.ui.synth

import android.graphics.Bitmap
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.rounded.AutoFixHigh
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.FlashOn
import androidx.compose.material.icons.rounded.Fullscreen
import androidx.compose.material.icons.rounded.Inventory
import androidx.compose.material.icons.rounded.QrCode
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Share
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Warning
import com.zeus.rfid.ui.components.ZeusActionButton as Button
import androidx.compose.material3.ButtonDefaults
import com.zeus.rfid.ui.components.ZeusCard as Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import com.zeus.rfid.ui.components.ZeusScaffold as Scaffold
import com.zeus.rfid.ui.components.ZeusModule
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.zeus.rfid.data.synth.BarcodeFormatType
import com.zeus.rfid.data.synth.EpcSchemeType
import com.zeus.rfid.data.synth.SynthesizedTag
import com.zeus.rfid.ui.theme.ZeusAmber
import com.zeus.rfid.ui.theme.ZeusCyanAccent
import com.zeus.rfid.ui.theme.ZeusEmerald

private val SynthIndigo = Color(0xFF6366F1)
private val SynthViolet = Color(0xFF8B5CF6)
private val SynthRose = Color(0xFFF43F5E)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TagSynthesizerScreen(
    viewModel: TagSynthesizerViewModel,
    onNavigateBack: () -> Unit
) {
    val state by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current

    var showPresetMenu by remember { mutableStateOf(false) }
    var zoomBarcodeBitmap by remember { mutableStateOf<Bitmap?>(null) }

    Scaffold(
        module = ZeusModule.Synthesizer, status = if (state.isSynthesizing) "Generating tag batch" else "${state.synthesizedTags.size} tags generated", busy = state.isSynthesizing,
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "Tag Synthesizer",
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface,
                            fontSize = 17.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
                        Text(
                            text = "GS1 EPC / Barcode / QR",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 11.sp,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis
                        )
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
                    // Presets Dropdown
                    Box {
                        IconButton(onClick = { showPresetMenu = true }) {
                            Icon(
                                imageVector = Icons.Rounded.Tune,
                                contentDescription = "Presets",
                                tint = SynthIndigo
                            )
                        }
                        DropdownMenu(
                            expanded = showPresetMenu,
                            onDismissRequest = { showPresetMenu = false },
                            modifier = Modifier.background(MaterialTheme.colorScheme.surfaceVariant)
                        ) {
                            DropdownMenuItem(
                                text = { Text("Retail SGTIN-96", color = MaterialTheme.colorScheme.onSurface) },
                                onClick = {
                                    viewModel.applyPreset("Retail SGTIN-96")
                                    showPresetMenu = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Pallet SSCC-96", color = MaterialTheme.colorScheme.onSurface) },
                                onClick = {
                                    viewModel.applyPreset("Pallet SSCC-96")
                                    showPresetMenu = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Warehouse SGLN-96", color = MaterialTheme.colorScheme.onSurface) },
                                onClick = {
                                    viewModel.applyPreset("Warehouse SGLN-96")
                                    showPresetMenu = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Returnable Tote GRAI-96", color = MaterialTheme.colorScheme.onSurface) },
                                onClick = {
                                    viewModel.applyPreset("Returnable Tote GRAI-96")
                                    showPresetMenu = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Zara Footwear (Tempe V2)", color = MaterialTheme.colorScheme.onSurface) },
                                onClick = {
                                    viewModel.applyPreset("Tempe V2 (Zara Footwear)")
                                    showPresetMenu = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Zara Apparel (Inditex V2)", color = MaterialTheme.colorScheme.onSurface) },
                                onClick = {
                                    viewModel.applyPreset("Inditex V2 (Zara Apparel)")
                                    showPresetMenu = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("GS1 Digital Link QR", color = MaterialTheme.colorScheme.onSurface) },
                                onClick = {
                                    viewModel.applyPreset("GS1 Digital Link QR")
                                    showPresetMenu = false
                                }
                            )
                            DropdownMenuItem(
                                text = { Text("Retail Code 128", color = MaterialTheme.colorScheme.onSurface) },
                                onClick = {
                                    viewModel.applyPreset("Retail Code 128")
                                    showPresetMenu = false
                                }
                            )
                        }
                    }

                    // Share All
                    IconButton(
                        onClick = { viewModel.shareTags(context) },
                        enabled = state.synthesizedTags.isNotEmpty()
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Share,
                            contentDescription = "Share",
                            tint = if (state.synthesizedTags.isNotEmpty()) ZeusCyanAccent else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    // Copy All
                    IconButton(
                        onClick = { viewModel.copyAllToClipboard(context) },
                        enabled = state.synthesizedTags.isNotEmpty()
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.ContentCopy,
                            contentDescription = "Copy All",
                            tint = if (state.synthesizedTags.isNotEmpty()) ZeusEmerald else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
        ) {
            // Segmented Tabs
            SynthesizerTabRow(
                activeTab = state.activeTab,
                onTabSelect = { tab ->
                    haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                    viewModel.selectTab(tab)
                }
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Main Content Area with LazyColumn
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                // Tab-specific configuration card
                item {
                    when (state.activeTab) {
                        SynthesizerTab.TDS_EPC -> TdsEpcConfigCard(viewModel, state)
                        SynthesizerTab.BARCODE_QR -> BarcodeQrConfigCard(
                            viewModel = viewModel,
                            state = state,
                            onZoomBarcode = { bmp -> zoomBarcodeBitmap = bmp }
                        )
                        SynthesizerTab.INDITEX_TEMPE -> InditexTempeConfigCard(viewModel, state)
                        SynthesizerTab.PATTERN_BATCH -> CustomPatternConfigCard(viewModel, state)
                    }
                }

                // Primary Generate Button
                item {
                    Button(
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            if (state.activeTab == SynthesizerTab.BARCODE_QR) {
                                viewModel.generateBarcode()
                            }
                            viewModel.synthesizeTags()
                        },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp),
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color.Transparent)
                    ) {
                        Box(
                            modifier = Modifier
                                .fillMaxSize()
                                .background(
                                    brush = Brush.horizontalGradient(
                                        listOf(SynthIndigo, SynthViolet)
                                    ),
                                    shape = RoundedCornerShape(14.dp)
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Rounded.FlashOn,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = if (state.isSynthesizing) "Synthesizing Tags..." else "Synthesize Tags Batch",
                                    color = Color.White,
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 15.sp
                                )
                            }
                        }
                    }
                }

                // Results Header and Search Bar (only show if tags exist or searching)
                if (state.synthesizedTags.isNotEmpty() || state.searchQuery.isNotEmpty()) {
                    item {
                        Column {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        text = "Generated Output",
                                        fontWeight = FontWeight.Bold,
                                        color = MaterialTheme.colorScheme.onSurface,
                                        fontSize = 16.sp
                                    )
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(12.dp))
                                            .background(ZeusEmerald.copy(alpha = 0.15f))
                                            .padding(horizontal = 8.dp, vertical = 2.dp)
                                    ) {
                                        Text(
                                            text = "${state.synthesizedTags.size} Tags",
                                            color = ZeusEmerald,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 12.sp
                                        )
                                    }
                                }

                                Row {
                                    IconButton(
                                        onClick = { viewModel.clearTags() },
                                        modifier = Modifier.size(32.dp)
                                    ) {
                                        Icon(
                                            imageVector = Icons.Rounded.Delete,
                                            contentDescription = "Clear",
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier.size(18.dp)
                                        )
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            // Search / Filter Field
                            OutlinedTextField(
                                value = state.searchQuery,
                                onValueChange = { viewModel.updateSearchQuery(it) },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(48.dp),
                                placeholder = {
                                    Text(
                                        "Filter by EPC hex or details...",
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        fontSize = 13.sp
                                    )
                                },
                                leadingIcon = {
                                    Icon(
                                        Icons.Rounded.Search,
                                        contentDescription = null,
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.size(18.dp)
                                    )
                                },
                                trailingIcon = {
                                    if (state.searchQuery.isNotEmpty()) {
                                        IconButton(onClick = { viewModel.updateSearchQuery("") }) {
                                            Icon(
                                                Icons.Rounded.Close,
                                                contentDescription = "Clear search",
                                                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    }
                                },
                                singleLine = true,
                                shape = RoundedCornerShape(10.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    focusedBorderColor = SynthIndigo,
                                    unfocusedBorderColor = MaterialTheme.colorScheme.outline,
                                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                                    focusedTextColor = MaterialTheme.colorScheme.onSurface,
                                    unfocusedTextColor = MaterialTheme.colorScheme.onSurface
                                )
                            )
                        }
                    }

                    // Filtered Tag Items
                    val filteredTags = state.synthesizedTags.filter { tag ->
                        state.searchQuery.isBlank() ||
                                tag.epc.contains(state.searchQuery, ignoreCase = true) ||
                                tag.details.contains(state.searchQuery, ignoreCase = true) ||
                                (tag.rawValue?.contains(state.searchQuery, ignoreCase = true) == true)
                    }

                    items(filteredTags, key = { "${it.index}_${it.epc}" }) { tag ->
                        SynthesizedTagCard(
                            tag = tag,
                            onCopy = {
                                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                                viewModel.copyTagToClipboard(context, tag.epc)
                            }
                        )
                    }
                }

                item {
                    Spacer(modifier = Modifier.height(24.dp))
                }
            }
        }
    }

    // Fullscreen Barcode Zoom Dialog
    zoomBarcodeBitmap?.let { bmp ->
        Dialog(onDismissRequest = { zoomBarcodeBitmap = null }) {
            Card(
                colors = CardDefaults.cardColors(containerColor = Color.White),
                shape = RoundedCornerShape(16.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Column(
                    modifier = Modifier.padding(20.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = state.barcodeFormat.label,
                            fontWeight = FontWeight.Bold,
                            color = Color.Black,
                            fontSize = 16.sp
                        )
                        IconButton(onClick = { zoomBarcodeBitmap = null }) {
                            Icon(Icons.Rounded.Close, contentDescription = "Close", tint = Color.Black)
                        }
                    }

                    Spacer(modifier = Modifier.height(12.dp))

                    Image(
                        bitmap = bmp.asImageBitmap(),
                        contentDescription = "Zoomed Barcode",
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(260.dp)
                    )

                    Spacer(modifier = Modifier.height(12.dp))

                    Text(
                        text = state.barcodeContent,
                        fontFamily = FontFamily.Monospace,
                        fontSize = 12.sp,
                        color = Color.DarkGray,
                        textAlign = TextAlign.Center
                    )
                }
            }
        }
    }
}

@Composable
private fun SynthesizerTabRow(
    activeTab: SynthesizerTab,
    onTabSelect: (SynthesizerTab) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        SynthesizerTab.entries.forEach { tab ->
            val isSelected = tab == activeTab
            val bgColor by animateColorAsState(
                targetValue = if (isSelected) SynthIndigo else Color.Transparent,
                animationSpec = tween(200),
                label = "TabBg"
            )
            val textColor by animateColorAsState(
                targetValue = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                animationSpec = tween(200),
                label = "TabText"
            )

            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(bgColor)
                    .clickable { onTabSelect(tab) }
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    text = tab.label,
                    color = textColor,
                    fontSize = 11.sp,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun TdsEpcConfigCard(
    viewModel: TagSynthesizerViewModel,
    state: TagSynthesizerUiState
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp),
        border = CardDefaults.outlinedCardBorder().copy(brush = Brush.horizontalGradient(listOf(MaterialTheme.colorScheme.outline, MaterialTheme.colorScheme.outline))),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "GS1 TDS EPC Scheme",
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 15.sp
            )
            Spacer(modifier = Modifier.height(8.dp))

            // Scheme Selector horizontal chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val availableSchemes = listOf(
                    EpcSchemeType.SGTIN_96,
                    EpcSchemeType.SGTIN_198,
                    EpcSchemeType.SSCC_96,
                    EpcSchemeType.SGLN_96,
                    EpcSchemeType.GRAI_96,
                    EpcSchemeType.GIAI_96
                )
                availableSchemes.forEach { scheme ->
                    val isSelected = scheme == state.selectedScheme
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isSelected) SynthIndigo.copy(alpha = 0.25f) else MaterialTheme.colorScheme.surfaceVariant)
                            .border(
                                width = 1.dp,
                                color = if (isSelected) SynthIndigo else Color.Transparent,
                                shape = RoundedCornerShape(8.dp)
                            )
                            .clickable { viewModel.setScheme(scheme) }
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Text(
                            text = scheme.displayName,
                            color = if (isSelected) SynthIndigo else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // Scheme specific fields
            when (state.selectedScheme) {
                EpcSchemeType.SGTIN_96, EpcSchemeType.SGTIN_198 -> {
                    // GTIN Input
                    OutlinedTextField(
                        value = state.gtinInput,
                        onValueChange = { viewModel.updateGtin(it) },
                        label = { Text("GTIN-14 / UPC", fontSize = 12.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        colors = outlinedTextFieldColors()
                    )

                    Spacer(modifier = Modifier.height(8.dp))

                    // Check Digit Status Pill
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                imageVector = if (state.isGtinCheckDigitValid) Icons.Rounded.CheckCircle else Icons.Rounded.Warning,
                                contentDescription = null,
                                tint = if (state.isGtinCheckDigitValid) ZeusEmerald else ZeusAmber,
                                modifier = Modifier.size(14.dp)
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = if (state.isGtinCheckDigitValid) "Check digit valid" else "Invalid check digit (Expected ${state.suggestedCheckDigit})",
                                fontSize = 11.sp,
                                color = if (state.isGtinCheckDigitValid) ZeusEmerald else ZeusAmber
                            )
                        }

                        if (!state.isGtinCheckDigitValid) {
                            Text(
                                text = "Auto-Fix",
                                color = SynthIndigo,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold,
                                modifier = Modifier
                                    .clickable { viewModel.autoFixGtinCheckDigit() }
                                    .padding(4.dp)
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // CPL & Filter
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        OutlinedTextField(
                            value = state.companyPrefixLength.toString(),
                            onValueChange = {
                                val v = it.filter { ch -> ch.isDigit() }.toIntOrNull() ?: 6
                                viewModel.updateCompanyPrefixLength(v)
                            },
                            label = { Text("Prefix Digits (6-12)", fontSize = 12.sp) },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            colors = outlinedTextFieldColors()
                        )

                        OutlinedTextField(
                            value = state.filterValue.toString(),
                            onValueChange = {
                                val v = it.filter { ch -> ch.isDigit() }.toIntOrNull() ?: 0
                                viewModel.updateFilterValue(v)
                            },
                            label = { Text("Filter (0-7)", fontSize = 12.sp) },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            colors = outlinedTextFieldColors()
                        )
                    }

                    if (state.selectedScheme == EpcSchemeType.SGTIN_198) {
                        Spacer(modifier = Modifier.height(8.dp))
                        OutlinedTextField(
                            value = state.serialPrefix,
                            onValueChange = { viewModel.updateSerialPrefix(it) },
                            label = { Text("Serial Text Prefix (e.g. SN-)", fontSize = 12.sp) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            colors = outlinedTextFieldColors()
                        )
                    }
                }
                EpcSchemeType.SSCC_96, EpcSchemeType.SGLN_96, EpcSchemeType.GRAI_96, EpcSchemeType.GIAI_96 -> {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        OutlinedTextField(
                            value = state.companyPrefixInput,
                            onValueChange = { viewModel.updateCompanyPrefixInput(it) },
                            label = { Text("Company Prefix", fontSize = 12.sp) },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            colors = outlinedTextFieldColors()
                        )

                        OutlinedTextField(
                            value = state.referenceOrLocationInput,
                            onValueChange = { viewModel.updateReferenceInput(it) },
                            label = {
                                Text(
                                    when (state.selectedScheme) {
                                        EpcSchemeType.SSCC_96 -> "Serial Ref"
                                        EpcSchemeType.SGLN_96 -> "Location Ref"
                                        EpcSchemeType.GRAI_96 -> "Asset Type"
                                        EpcSchemeType.GIAI_96 -> "Asset Ref"
                                        else -> "Reference"
                                    },
                                    fontSize = 12.sp
                                )
                            },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                            colors = outlinedTextFieldColors()
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    OutlinedTextField(
                        value = state.filterValue.toString(),
                        onValueChange = {
                            val v = it.filter { ch -> ch.isDigit() }.toIntOrNull() ?: 0
                            viewModel.updateFilterValue(v)
                        },
                        label = { Text("Filter Value (0-7)", fontSize = 12.sp) },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        colors = outlinedTextFieldColors()
                    )
                }
                else -> {}
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Quantity & Start Serial
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = state.quantity.toString(),
                    onValueChange = {
                        val v = it.filter { ch -> ch.isDigit() }.toIntOrNull() ?: 1
                        viewModel.updateQuantity(v)
                    },
                    label = { Text("Quantity (1-1000)", fontSize = 12.sp) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = outlinedTextFieldColors()
                )

                OutlinedTextField(
                    value = state.startSerial.toString(),
                    onValueChange = {
                        val v = it.filter { ch -> ch.isDigit() }.toLongOrNull() ?: 1L
                        viewModel.updateStartSerial(v)
                    },
                    label = { Text("Start Serial", fontSize = 12.sp) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = outlinedTextFieldColors()
                )
            }
        }
    }
}

@Composable
private fun BarcodeQrConfigCard(
    viewModel: TagSynthesizerViewModel,
    state: TagSynthesizerUiState,
    onZoomBarcode: (Bitmap) -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp),
        border = CardDefaults.outlinedCardBorder().copy(brush = Brush.horizontalGradient(listOf(MaterialTheme.colorScheme.outline, MaterialTheme.colorScheme.outline))),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "1D / 2D Barcode Generator",
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 15.sp
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Format Selector chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                BarcodeFormatType.entries.forEach { fmt ->
                    val isSelected = fmt == state.barcodeFormat
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isSelected) SynthIndigo.copy(alpha = 0.25f) else MaterialTheme.colorScheme.surfaceVariant)
                            .border(
                                width = 1.dp,
                                color = if (isSelected) SynthIndigo else Color.Transparent,
                                shape = RoundedCornerShape(8.dp)
                            )
                            .clickable { viewModel.updateBarcodeFormat(fmt) }
                            .padding(horizontal = 10.dp, vertical = 6.dp)
                    ) {
                        Text(
                            text = fmt.label,
                            color = if (isSelected) SynthIndigo else MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 12.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Barcode Content Input
            OutlinedTextField(
                value = state.barcodeContent,
                onValueChange = { viewModel.updateBarcodeContent(it) },
                label = { Text("Barcode / QR Data Payload", fontSize = 12.sp) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = false,
                maxLines = 3,
                colors = outlinedTextFieldColors()
            )

            Spacer(modifier = Modifier.height(14.dp))

            // Live Barcode Preview Box
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.White)
                    .padding(16.dp),
                contentAlignment = Alignment.Center
            ) {
                if (state.barcodeBitmap != null) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Image(
                            bitmap = state.barcodeBitmap.asImageBitmap(),
                            contentDescription = "Live Barcode Preview",
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(if (state.barcodeFormat == BarcodeFormatType.QR_CODE || state.barcodeFormat == BarcodeFormatType.GS1_DIGITAL_LINK) 180.dp else 100.dp)
                                .clickable { onZoomBarcode(state.barcodeBitmap) }
                        )

                        Spacer(modifier = Modifier.height(6.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = "Tap barcode to zoom",
                                fontSize = 10.sp,
                                color = Color.Gray
                            )
                            Icon(
                                imageVector = Icons.Rounded.Fullscreen,
                                contentDescription = "Zoom",
                                tint = Color.Gray,
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                } else if (state.barcodeErrorMessage != null) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(12.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Warning,
                            contentDescription = null,
                            tint = SynthRose,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = state.barcodeErrorMessage,
                            color = SynthRose,
                            fontSize = 12.sp,
                            textAlign = TextAlign.Center
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun InditexTempeConfigCard(
    viewModel: TagSynthesizerViewModel,
    state: TagSynthesizerUiState
) {
    val f = state.inditexFields
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp),
        border = CardDefaults.outlinedCardBorder().copy(brush = Brush.horizontalGradient(listOf(MaterialTheme.colorScheme.outline, MaterialTheme.colorScheme.outline))),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Inditex / Tempe 128-bit EPC",
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 15.sp
            )
            Spacer(modifier = Modifier.height(8.dp))

            // Brand & Version selector row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Brand (1: Inditex, 2: Tempe)
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(4.dp)
                ) {
                    val isTempe = f.brandId == 2
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isTempe) SynthIndigo else Color.Transparent)
                            .clickable { viewModel.updateInditexBrand(2) }
                            .padding(vertical = 6.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Tempe", color = if (isTempe) Color.White else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    }
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (!isTempe) SynthIndigo else Color.Transparent)
                            .clickable { viewModel.updateInditexBrand(1) }
                            .padding(vertical = 6.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Inditex", color = if (!isTempe) Color.White else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    }
                }

                // Version (V1 / V2)
                Row(
                    modifier = Modifier
                        .weight(1f)
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant)
                        .padding(4.dp)
                ) {
                    val isV2 = f.version == 2
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isV2) SynthIndigo else Color.Transparent)
                            .clickable { viewModel.updateInditexVersion(2) }
                            .padding(vertical = 6.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Version 2", color = if (isV2) Color.White else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    }
                    Box(
                        modifier = Modifier
                            .weight(1f)
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (!isV2) SynthIndigo else Color.Transparent)
                            .clickable { viewModel.updateInditexVersion(1) }
                            .padding(vertical = 6.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("Version 1", color = if (!isV2) Color.White else MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Garment Model, Quality, Color, Size
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(
                    value = f.model.toString(),
                    onValueChange = {
                        val v = it.filter { ch -> ch.isDigit() }.toIntOrNull() ?: 0
                        viewModel.updateInditexModel(v)
                    },
                    label = { Text("Model", fontSize = 11.sp) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = outlinedTextFieldColors()
                )

                OutlinedTextField(
                    value = f.quality.toString(),
                    onValueChange = {
                        val v = it.filter { ch -> ch.isDigit() }.toIntOrNull() ?: 0
                        viewModel.updateInditexQuality(v)
                    },
                    label = { Text("Quality", fontSize = 11.sp) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = outlinedTextFieldColors()
                )

                OutlinedTextField(
                    value = f.color.toString(),
                    onValueChange = {
                        val v = it.filter { ch -> ch.isDigit() }.toIntOrNull() ?: 0
                        viewModel.updateInditexColor(v)
                    },
                    label = { Text("Color", fontSize = 11.sp) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = outlinedTextFieldColors()
                )

                OutlinedTextField(
                    value = f.size.toString(),
                    onValueChange = {
                        val v = it.filter { ch -> ch.isDigit() }.toIntOrNull() ?: 0
                        viewModel.updateInditexSize(v)
                    },
                    label = { Text("Size", fontSize = 11.sp) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = outlinedTextFieldColors()
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Start Serial & Count
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = f.startSerial.toString(),
                    onValueChange = {
                        val v = it.filter { ch -> ch.isDigit() }.toLongOrNull() ?: 1L
                        viewModel.updateInditexStartSerial(v)
                    },
                    label = { Text("Start Serial", fontSize = 12.sp) },
                    modifier = Modifier.weight(1.4f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = outlinedTextFieldColors()
                )

                OutlinedTextField(
                    value = state.inditexQuantity.toString(),
                    onValueChange = {
                        val v = it.filter { ch -> ch.isDigit() }.toIntOrNull() ?: 1
                        viewModel.updateInditexQuantity(v)
                    },
                    label = { Text("Count", fontSize = 12.sp) },
                    modifier = Modifier.weight(0.8f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = outlinedTextFieldColors()
                )
            }
        }
    }
}

@Composable
private fun CustomPatternConfigCard(
    viewModel: TagSynthesizerViewModel,
    state: TagSynthesizerUiState
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(16.dp),
        border = CardDefaults.outlinedCardBorder().copy(brush = Brush.horizontalGradient(listOf(MaterialTheme.colorScheme.outline, MaterialTheme.colorScheme.outline))),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                text = "Custom Hex Pattern Sequence",
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                fontSize = 15.sp
            )
            Spacer(modifier = Modifier.height(8.dp))

            OutlinedTextField(
                value = state.customHexPrefix,
                onValueChange = { viewModel.updateCustomPrefix(it) },
                label = { Text("Hex Prefix (e.g. E28011303000)", fontSize = 12.sp) },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                colors = outlinedTextFieldColors()
            )

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = state.customTargetLength.toString(),
                    onValueChange = {
                        val v = it.filter { ch -> ch.isDigit() }.toIntOrNull() ?: 24
                        viewModel.updateCustomLength(v)
                    },
                    label = { Text("Length (Hex Chars)", fontSize = 12.sp) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = outlinedTextFieldColors()
                )

                Row(
                    modifier = Modifier.weight(1f),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Switch(
                        checked = state.customIsRandom,
                        onCheckedChange = { viewModel.updateCustomIsRandom(it) },
                        colors = SwitchDefaults.colors(
                            checkedThumbColor = Color.White,
                            checkedTrackColor = SynthIndigo
                        )
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = if (state.customIsRandom) "Random" else "Counter",
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 12.sp
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = state.customQuantity.toString(),
                    onValueChange = {
                        val v = it.filter { ch -> ch.isDigit() }.toIntOrNull() ?: 1
                        viewModel.updateCustomQuantity(v)
                    },
                    label = { Text("Quantity", fontSize = 12.sp) },
                    modifier = Modifier.weight(1f),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    colors = outlinedTextFieldColors()
                )

                if (!state.customIsRandom) {
                    OutlinedTextField(
                        value = state.customStartSerial.toString(),
                        onValueChange = {
                            val v = it.filter { ch -> ch.isDigit() }.toLongOrNull() ?: 1L
                            viewModel.updateCustomStartSerial(v)
                        },
                        label = { Text("Start Index", fontSize = 12.sp) },
                        modifier = Modifier.weight(1f),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        colors = outlinedTextFieldColors()
                    )
                }
            }
        }
    }
}

@Composable
private fun SynthesizedTagCard(
    tag: SynthesizedTag,
    onCopy: () -> Unit
) {
    Card(
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
        shape = RoundedCornerShape(12.dp),
        border = CardDefaults.outlinedCardBorder().copy(brush = Brush.horizontalGradient(listOf(MaterialTheme.colorScheme.outline, MaterialTheme.colorScheme.outline))),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(MaterialTheme.colorScheme.surface)
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "#${tag.index}",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                    Spacer(modifier = Modifier.width(6.dp))
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(SynthIndigo.copy(alpha = 0.15f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = tag.scheme.displayName,
                            color = SynthIndigo,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                Text(
                    text = tag.epc,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(2.dp))

                Text(
                    text = tag.details,
                    fontSize = 11.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }

            IconButton(onClick = onCopy) {
                Icon(
                    imageVector = Icons.Rounded.ContentCopy,
                    contentDescription = "Copy EPC",
                    tint = ZeusEmerald,
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

@Composable
private fun outlinedTextFieldColors() = OutlinedTextFieldDefaults.colors(
    focusedBorderColor = SynthIndigo,
    unfocusedBorderColor = MaterialTheme.colorScheme.outline,
    focusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
    unfocusedContainerColor = MaterialTheme.colorScheme.surfaceVariant,
    focusedTextColor = MaterialTheme.colorScheme.onSurface,
    unfocusedTextColor = MaterialTheme.colorScheme.onSurface,
    focusedLabelColor = SynthIndigo,
    unfocusedLabelColor = MaterialTheme.colorScheme.onSurfaceVariant
)
