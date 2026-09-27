package com.zeus.rfid.ui.nfc

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutLinearInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.BookmarkAdd
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.ElectricBolt
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.Nfc
import androidx.compose.material.icons.rounded.Radio
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Sensors
import androidx.compose.material.icons.rounded.Stop
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.zeus.rfid.data.nfc.NfcTagData
import com.zeus.rfid.data.nfc.SavedNfcTag
import com.zeus.rfid.ui.components.sheetTopCameraSafePadding
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusCyanAccent
import com.zeus.rfid.ui.theme.ZeusMint

private val RoseColor = Color(0xFFF43F5E)

/**
 * Animated Banner showing active Host Card Emulation (HCE) state.
 */
@Composable
fun ActiveHceBanner(
    tag: SavedNfcTag,
    tapCount: Int,
    lastStatus: String?,
    onStopEmulation: () -> Unit,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "HcePulse")
    val pulseScale by infiniteTransition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(
            animation = tween(1100, easing = FastOutLinearInEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "PulseScale"
    )

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = RoseColor.copy(alpha = 0.12f)),
        border = BorderStroke(1.2.dp, RoseColor.copy(alpha = 0.5f))
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
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
                            .size(38.dp)
                            .scale(pulseScale)
                            .clip(CircleShape)
                            .background(RoseColor.copy(alpha = 0.22f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Sensors,
                            contentDescription = null,
                            tint = RoseColor,
                            modifier = Modifier.size(22.dp)
                        )
                    }
                    Column {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text(
                                text = "EMULATING LIVE",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Black,
                                color = RoseColor,
                                letterSpacing = 1.2.sp
                            )
                            Box(
                                modifier = Modifier
                                    .size(6.dp)
                                    .clip(CircleShape)
                                    .background(RoseColor)
                            )
                        }
                        Text(
                            text = tag.name,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }

                Button(
                    onClick = onStopEmulation,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = RoseColor,
                        contentColor = Color.White
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Rounded.Stop, contentDescription = null, modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Stop", fontWeight = FontWeight.Bold)
                }
            }

            // Status row
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(Color.Black.copy(alpha = 0.25f))
                    .padding(horizontal = 14.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "UID: ${tag.uidHex}",
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (lastStatus != null) {
                        Text(
                            text = lastStatus,
                            style = MaterialTheme.typography.labelSmall,
                            color = RoseColor.copy(alpha = 0.9f)
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .clip(CircleShape)
                        .background(ZeusMint.copy(alpha = 0.16f))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "$tapCount Taps Handled",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = ZeusMint
                    )
                }
            }
        }
    }
}

/**
 * Main Tag Vault Tab Content: Search, Category Filters, and Saved Tag Cards.
 */
@Composable
fun NfcVaultTab(
    tags: List<SavedNfcTag>,
    selectedCategory: String,
    searchQuery: String,
    isEmulating: Boolean,
    emulatingTag: SavedNfcTag?,
    emulationTapCount: Int,
    lastEmulationStatus: String?,
    onSelectCategory: (String) -> Unit,
    onSearchChange: (String) -> Unit,
    onStartEmulation: (SavedNfcTag) -> Unit,
    onStopEmulation: () -> Unit,
    onStreamToEdge: (SavedNfcTag) -> Unit,
    onTagClick: (SavedNfcTag) -> Unit,
    onDeleteTag: (String) -> Unit,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    modifier: Modifier = Modifier
) {
    val categories = remember(tags) {
        listOf("All") + tags.map { it.category }.distinct().filter { it.isNotBlank() }
    }

    val filteredTags = remember(tags, selectedCategory, searchQuery) {
        tags.filter { tag ->
            val matchesCategory = selectedCategory == "All" || tag.category.equals(selectedCategory, ignoreCase = true)
            val matchesQuery = searchQuery.isBlank() ||
                    tag.name.contains(searchQuery, ignoreCase = true) ||
                    tag.uidHex.contains(searchQuery, ignoreCase = true) ||
                    (tag.ndefPayloadText?.contains(searchQuery, ignoreCase = true) == true)
            matchesCategory && matchesQuery
        }
    }

    Column(
        modifier = modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Active Emulation Banner
        if (isEmulating && emulatingTag != null) {
            ActiveHceBanner(
                tag = emulatingTag,
                tapCount = emulationTapCount,
                lastStatus = lastEmulationStatus,
                onStopEmulation = onStopEmulation
            )
        }

        // Search Bar
        OutlinedTextField(
            value = searchQuery,
            onValueChange = onSearchChange,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Search vault tags by name, UID, or payload...") },
            leadingIcon = { Icon(Icons.Rounded.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) },
            trailingIcon = {
                if (searchQuery.isNotBlank()) {
                    IconButton(onClick = { onSearchChange("") }) {
                        Icon(Icons.Rounded.Close, contentDescription = "Clear search")
                    }
                }
            },
            shape = RoundedCornerShape(14.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = ZeusBlue,
                unfocusedBorderColor = cardBorder
            ),
            singleLine = true
        )

        // Category Filter Chips
        if (categories.size > 1) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                categories.forEach { cat ->
                    val isSelected = cat == selectedCategory
                    FilterChip(
                        selected = isSelected,
                        onClick = { onSelectCategory(cat) },
                        label = { Text(cat, fontSize = 12.sp) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = ZeusBlue.copy(alpha = 0.2f),
                            selectedLabelColor = ZeusBlue
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = isSelected,
                            selectedBorderColor = ZeusBlue,
                            borderColor = cardBorder
                        )
                    )
                }
            }
        }

        // Tags List or Empty State
        if (filteredTags.isEmpty()) {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(cardBg)
                    .border(1.dp, cardBorder, RoundedCornerShape(18.dp))
                    .padding(32.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Rounded.Folder,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
                        modifier = Modifier.size(42.dp)
                    )
                    Spacer(modifier = Modifier.height(10.dp))
                    Text(
                        text = if (searchQuery.isBlank()) "No tags saved in this category yet" else "No tags match \"$searchQuery\"",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "Scan an NFC tag and tap 'Save to Vault' to add it here.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                    )
                }
            }
        } else {
            filteredTags.forEach { tag ->
                SavedTagRowCard(
                    tag = tag,
                    isCurrentlyEmulating = isEmulating && emulatingTag?.id == tag.id,
                    onStartEmulation = { onStartEmulation(tag) },
                    onStopEmulation = onStopEmulation,
                    onStreamToEdge = { onStreamToEdge(tag) },
                    onClick = { onTagClick(tag) },
                    onDelete = { onDeleteTag(tag.id) },
                    cardBg = cardBg,
                    cardBorder = cardBorder,
                    innerBoxBg = innerBoxBg
                )
            }
        }
    }
}

/**
 * Individual Card in the Tag Vault.
 */
@Composable
private fun SavedTagRowCard(
    tag: SavedNfcTag,
    isCurrentlyEmulating: Boolean,
    onStartEmulation: () -> Unit,
    onStopEmulation: () -> Unit,
    onStreamToEdge: () -> Unit,
    onClick: () -> Unit,
    onDelete: () -> Unit,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = BorderStroke(
            1.dp,
            if (isCurrentlyEmulating) RoseColor.copy(alpha = 0.7f) else cardBorder
        )
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            // Header: Name and Category Badge
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = tag.name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = tag.tagType,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(ZeusBlue.copy(alpha = 0.15f))
                        .padding(horizontal = 9.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = tag.category,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = ZeusBlue,
                        fontSize = 11.sp
                    )
                }
            }

            // UID & Payload Strip
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(10.dp))
                    .background(innerBoxBg)
                    .padding(horizontal = 12.dp, vertical = 8.dp)
            ) {
                Column(verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "UID: ${tag.uidHex}",
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                            fontWeight = FontWeight.Medium,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = tag.vendor,
                            style = MaterialTheme.typography.labelSmall,
                            color = ZeusMint
                        )
                    }
                    if (tag.ndefPayloadText != null && tag.ndefPayloadText.isNotBlank()) {
                        Text(
                            text = tag.ndefPayloadText,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            maxLines = 1
                        )
                    }
                }
            }

            // Action Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Emulate with Phone (HCE) Button
                if (isCurrentlyEmulating) {
                    Button(
                        onClick = onStopEmulation,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = RoseColor),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Rounded.Stop, null, modifier = Modifier.size(15.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Emulating", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                } else {
                    OutlinedButton(
                        onClick = onStartEmulation,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.outlinedButtonColors(contentColor = RoseColor),
                        border = BorderStroke(1.dp, RoseColor.copy(alpha = 0.6f)),
                        shape = RoundedCornerShape(10.dp)
                    ) {
                        Icon(Icons.Rounded.ElectricBolt, null, modifier = Modifier.size(15.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Phone HCE", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }

                // Stream to Zeus Edge Button
                OutlinedButton(
                    onClick = onStreamToEdge,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = ZeusMint),
                    border = BorderStroke(1.dp, ZeusMint.copy(alpha = 0.6f)),
                    shape = RoundedCornerShape(10.dp)
                ) {
                    Icon(Icons.Rounded.Radio, null, modifier = Modifier.size(15.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Edge Stream", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }

                // Delete Button
                IconButton(
                    onClick = onDelete,
                    modifier = Modifier.size(36.dp)
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Delete,
                        contentDescription = "Delete from vault",
                        tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

/**
 * Dialog to Name and Categorize a newly scanned NFC tag for Vault storage.
 */
@Composable
fun SaveTagDialog(
    tag: NfcTagData,
    onDismiss: () -> Unit,
    onSave: (name: String, category: String, notes: String) -> Unit
) {
    var tagName by remember { mutableStateOf("NFC Tag ${tag.uidHex.take(8)}") }
    var category by remember {
        mutableStateOf(
            when {
                tag.isNdef && tag.records.any { it.type == "URI" } -> "Web / Smart Poster"
                tag.tagType.contains("Classic", ignoreCase = true) -> "Access Control"
                tag.uidHex.length > 20 -> "Inventory / EPC"
                else -> "General"
            }
        )
    }
    var notes by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(Icons.Rounded.BookmarkAdd, null, tint = ZeusBlue)
                Text("Save Tag to Vault")
            }
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text(
                    text = "Store this tag to emulate it directly with your phone or stream it to Zeus Edge readers.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                OutlinedTextField(
                    value = tagName,
                    onValueChange = { tagName = it },
                    label = { Text("Tag Name / Description") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = category,
                    onValueChange = { category = it },
                    label = { Text("Category (e.g. Access, Retail, Personal)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )

                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it },
                    label = { Text("Notes (Optional)") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(tagName, category, notes) },
                colors = ButtonDefaults.buttonColors(containerColor = ZeusBlue)
            ) {
                Text("Save to Vault")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

/**
 * Bottom Sheet displaying full Saved Tag specifications and actions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SavedTagDetailSheet(
    tag: SavedNfcTag,
    isEmulating: Boolean,
    onStartEmulation: () -> Unit,
    onStopEmulation: () -> Unit,
    onStreamToEdge: () -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = Modifier.sheetTopCameraSafePadding(),
        sheetState = sheetState
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = tag.name,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = "${tag.standard} · ${tag.vendor}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(ZeusBlue.copy(alpha = 0.15f))
                        .padding(horizontal = 10.dp, vertical = 5.dp)
                ) {
                    Text(
                        text = tag.category,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = ZeusBlue
                    )
                }
            }

            // Specs Box
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(14.dp))
                    .background(MaterialTheme.colorScheme.surfaceVariant)
                    .padding(14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text("UID: ${tag.uidHex}", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                if (tag.uidDecimal.isNotBlank()) {
                    Text("Decimal: ${tag.uidDecimal}", fontFamily = FontFamily.Monospace, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                if (tag.ndefPayloadText != null) {
                    Text("NDEF Payload: ${tag.ndefPayloadText}", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurface)
                }
                if (tag.ndefUri != null) {
                    Text("URI: ${tag.ndefUri}", fontSize = 13.sp, color = ZeusCyanAccent)
                }
                if (tag.notes.isNotBlank()) {
                    Text("Notes: ${tag.notes}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }

            // Action Buttons
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                if (isEmulating) {
                    Button(
                        onClick = onStopEmulation,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = RoseColor),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Rounded.Stop, null)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Stop Emulation")
                    }
                } else {
                    Button(
                        onClick = onStartEmulation,
                        modifier = Modifier.weight(1f),
                        colors = ButtonDefaults.buttonColors(containerColor = RoseColor),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Rounded.ElectricBolt, null)
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("Phone HCE")
                    }
                }

                Button(
                    onClick = onStreamToEdge,
                    modifier = Modifier.weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = ZeusMint, contentColor = Color.Black),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Rounded.Radio, null)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Edge Stream")
                }
            }

            TextButton(
                onClick = {
                    onDelete()
                    onDismiss()
                },
                modifier = Modifier.align(Alignment.CenterHorizontally),
                colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
            ) {
                Icon(Icons.Rounded.Delete, null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("Delete Tag from Vault")
            }
        }
    }
}
