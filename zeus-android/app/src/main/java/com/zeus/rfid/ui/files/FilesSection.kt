package com.zeus.rfid.ui.files

import android.net.Uri
import android.provider.OpenableColumns
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.layout.navigationBarsPadding
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
import androidx.compose.material.icons.automirrored.rounded.InsertDriveFile
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowDownward
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Cloud
import androidx.compose.material.icons.rounded.CloudUpload
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Dns
import androidx.compose.material.icons.rounded.Download
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.ErrorOutline
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.FolderOpen
import androidx.compose.material.icons.rounded.Info
import androidx.compose.material.icons.rounded.LinearScale
import androidx.compose.material.icons.rounded.Logout
import androidx.compose.material.icons.rounded.NoteAdd
import androidx.compose.material.icons.rounded.Print
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Sort
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.StarBorder
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.TableChart
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material3.AlertDialog
import com.zeus.rfid.ui.components.ZeusActionButton as Button
import androidx.compose.material3.ButtonDefaults
import com.zeus.rfid.ui.components.ZeusCard as Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.zeus.rfid.data.files.ExplorerProtocol
import com.zeus.rfid.data.files.SavedFileConnection
import com.zeus.rfid.ui.components.sheetTopCameraSafePadding
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusCyanAccent
import com.zeus.rfid.ui.theme.ZeusMint

// Protocol branding accent colors
private val SftpColor = Color(0xFF00E5FF) // Cyan
private val FtpColor = Color(0xFF3B82F6)  // Zeus Blue
private val S3Color = Color(0xFFFF9900)   // AWS Orange
private val S3CompatColor = Color(0xFF8B5CF6) // MinIO / Cloudflare Violet

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FilesSection(
    viewModel: FilesViewModel,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val isDark = isZeusDarkTheme()
    val haptic = LocalHapticFeedback.current
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current

    val cardBg = zeusCardBg(isDark)
    val cardBorder = zeusCardBorderColor(isDark)
    val innerBoxBg = zeusInnerBoxBg(isDark)
    val editorBg = if (isDark) Color(0xFF090D14) else Color(0xFFF1F5F9)

    val protocolAccent = when (state.activeProtocol) {
        ExplorerProtocol.SFTP -> SftpColor
        ExplorerProtocol.FTP -> FtpColor
        ExplorerProtocol.S3 -> S3Color
        ExplorerProtocol.S3_COMPATIBLE -> S3CompatColor
    }

    // Android System File Picker for Real Uploads (Device Storage -> Remote Server)
    val filePickerLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            try {
                var fileName = "uploaded_${System.currentTimeMillis()}"
                context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (nameIndex != -1 && cursor.moveToFirst()) {
                        fileName = cursor.getString(nameIndex)
                    }
                }
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                if (bytes != null) {
                    viewModel.uploadFile(fileName, bytes)
                    Toast.makeText(context, "Uploading $fileName (${formatBytes(bytes.size.toLong())})...", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(context, "Failed to read local file: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    // Status notifications / toast handler
    LaunchedEffect(state.notificationMessage) {
        state.notificationMessage?.let { msg ->
            Toast.makeText(context, msg, Toast.LENGTH_SHORT).show()
            viewModel.clearNotification()
        }
    }

    // New Folder Dialog
    if (state.showCreateFolderDialog) {
        var newFolderName by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { viewModel.setCreateFolderDialogVisible(false) },
            title = { Text("Create Directory", fontWeight = FontWeight.Bold) },
            text = {
                OutlinedTextField(
                    value = newFolderName,
                    onValueChange = { newFolderName = it },
                    label = { Text("Directory Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (newFolderName.isNotBlank()) {
                            viewModel.createFolder(newFolderName.trim())
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ZeusBlue)
                ) {
                    Text("Create")
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.setCreateFolderDialogVisible(false) }) {
                    Text("Cancel")
                }
            }
        )
    }

    // New File Dialog (Matches Zeus Electron New File action)
    if (state.showCreateFileDialog) {
        var newFileName by remember { mutableStateOf("") }
        var initialContent by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { viewModel.setCreateFileDialogVisible(false) },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Rounded.NoteAdd, contentDescription = null, tint = ZeusCyanAccent)
                    Text("New Remote File", fontWeight = FontWeight.Bold)
                }
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(
                        value = newFileName,
                        onValueChange = { newFileName = it },
                        label = { Text("File Name (e.g. data.json, script.sh)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth()
                    )
                    OutlinedTextField(
                        value = initialContent,
                        onValueChange = { initialContent = it },
                        label = { Text("Initial Content (Optional)") },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(110.dp),
                        maxLines = 5
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (newFileName.isNotBlank()) {
                            viewModel.createNewFile(newFileName.trim(), initialContent)
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ZeusBlue)
                ) {
                    Text("Create File")
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.setCreateFileDialogVisible(false) }) {
                    Text("Cancel")
                }
            }
        )
    }

    // Rename Dialog (Matches Zeus Electron Rename action)
    state.renameTarget?.let { target ->
        var newName by remember(target) { mutableStateOf(target.name) }
        AlertDialog(
            onDismissRequest = { viewModel.setRenameTarget(null) },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Rounded.Edit, contentDescription = null, tint = ZeusCyanAccent)
                    Text("Rename ${if (target.isDirectory) "Directory" else "File"}", fontWeight = FontWeight.Bold)
                }
            },
            text = {
                OutlinedTextField(
                    value = newName,
                    onValueChange = { newName = it },
                    label = { Text("New Name") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (newName.isNotBlank()) {
                            viewModel.renameFile(target, newName.trim())
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = ZeusBlue)
                ) {
                    Text("Rename")
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.setRenameTarget(null) }) {
                    Text("Cancel")
                }
            }
        )
    }

    // File Properties Dialog (Matches Zeus Electron SftpPropertiesDialog)
    state.filePropertiesTarget?.let { propTarget ->
        AlertDialog(
            onDismissRequest = { viewModel.setFilePropertiesTarget(null) },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Rounded.Info, contentDescription = null, tint = ZeusCyanAccent)
                    Text("File Properties", fontWeight = FontWeight.Bold)
                }
            },
            text = {
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    PropertyRow("Name", propTarget.name)
                    PropertyRow("Path", propTarget.fullPath)
                    PropertyRow("Type", if (propTarget.isDirectory) "Directory" else (if (propTarget.extension.isNotBlank()) "${propTarget.extension.uppercase()} File" else "Binary File"))
                    if (!propTarget.isDirectory) {
                        PropertyRow("Size", "${propTarget.sizeBytes} bytes (${formatBytes(propTarget.sizeBytes)})")
                    }
                    if (propTarget.lastModified.isNotBlank()) {
                        PropertyRow("Modified", propTarget.lastModified)
                    }
                    if (propTarget.permissions.isNotBlank()) {
                        PropertyRow("Permissions", propTarget.permissions)
                    }
                    PropertyRow("Protocol", state.activeProtocol.label)
                }
            },
            confirmButton = {
                if (!propTarget.isDirectory) {
                    Button(
                        onClick = {
                            viewModel.downloadFile(propTarget)
                            viewModel.setFilePropertiesTarget(null)
                        },
                        colors = ButtonDefaults.buttonColors(containerColor = ZeusBlue)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Icon(Icons.Rounded.Download, contentDescription = null, modifier = Modifier.size(16.dp))
                            Text("Download")
                        }
                    }
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.setFilePropertiesTarget(null) }) {
                    Text("Close")
                }
            }
        )
    }

    // In-App File Viewer Sheet
    state.activePreview?.let { preview ->
        val viewerSheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
        ModalBottomSheet(
            onDismissRequest = { viewModel.setPreview(null) },
            modifier = Modifier.sheetTopCameraSafePadding(),
            sheetState = viewerSheetState,
            containerColor = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)
        ) {
            FileViewerContent(
                preview = preview,
                editorBg = editorBg,
                cardBorder = cardBorder,
                onDownload = {
                    val fileItem = SftpFileItem(
                        name = preview.fileName,
                        fullPath = preview.fullPath,
                        isDirectory = false
                    )
                    viewModel.downloadFile(fileItem)
                },
                onCopy = {
                    clipboardManager.setText(AnnotatedString(preview.content))
                    Toast.makeText(context, "Copied file content", Toast.LENGTH_SHORT).show()
                },
                onDismiss = { viewModel.setPreview(null) }
            )
        }
    }

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (!state.isConnected) {
            // =========================================================================
            // 1. DISCONNECTED: LOGIN & CONNECTION SETUP SCREEN
            // =========================================================================
            FileLoginScreen(
                state = state,
                protocolAccent = protocolAccent,
                cardBg = cardBg,
                cardBorder = cardBorder,
                innerBoxBg = innerBoxBg,
                onProtocolChange = { viewModel.setProtocol(it) },
                onDraftChange = { viewModel.updateDraft(it) },
                onSaveProfileToggle = { viewModel.setSaveProfileOnConnect(it) },
                onConnect = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    viewModel.connect(state.connection)
                },
                onSelectSavedConnection = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    viewModel.selectSavedConnection(it)
                },
                onTogglePin = { viewModel.togglePinConnection(it) },
                onDeleteSaved = { viewModel.deleteSavedConnection(it) }
            )
        } else {
            // =========================================================================
            // 2. CONNECTED: REAL REMOTE FILE EXPLORER
            // =========================================================================
            FileExplorerConnectedView(
                state = state,
                protocolAccent = protocolAccent,
                cardBg = cardBg,
                cardBorder = cardBorder,
                innerBoxBg = innerBoxBg,
                onDisconnect = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    viewModel.disconnect()
                },
                onNavigateToPath = { viewModel.navigateToPath(it) },
                onNavigateUp = { viewModel.navigateUp() },
                onSearchQueryChange = { viewModel.setSearchQuery(it) },
                onRefresh = { viewModel.refreshDirectory() },
                onCreateFolder = { viewModel.setCreateFolderDialogVisible(true) },
                onNewFile = { viewModel.setCreateFileDialogVisible(true) },
                onPickUpload = { filePickerLauncher.launch("*/*") },
                onOpenFile = { viewModel.openFile(it) },
                onDownloadFile = { viewModel.downloadFile(it) },
                onRenameFile = { viewModel.setRenameTarget(it) },
                onProperties = { viewModel.setFilePropertiesTarget(it) },
                onDeleteFile = { viewModel.deleteFile(it) },
                onSortChange = { viewModel.setSortOption(it) },
                onFoldersFirstToggle = { viewModel.setFoldersFirst(!state.foldersFirst) }
            )
        }
    }
}

/**
 * Clean login page where the user selects the connection protocol (SFTP, FTP, S3, S3-Compatible),
 * fills in connection details, or chooses from saved connections.
 */
@Composable
private fun FileLoginScreen(
    state: FilesUiState,
    protocolAccent: Color,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onProtocolChange: (ExplorerProtocol) -> Unit,
    onDraftChange: (SavedFileConnection) -> Unit,
    onSaveProfileToggle: (Boolean) -> Unit,
    onConnect: () -> Unit,
    onSelectSavedConnection: (SavedFileConnection) -> Unit,
    onTogglePin: (String) -> Unit,
    onDeleteSaved: (String) -> Unit
) {
    val draft = state.connection
    var showPassword by remember { mutableStateOf(false) }

    // Protocol Segmented Bar
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(innerBoxBg)
            .border(1.dp, cardBorder, RoundedCornerShape(14.dp))
            .padding(4.dp),
        horizontalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        ExplorerProtocol.entries.forEach { proto ->
            val isSelected = state.activeProtocol == proto
            val accent = when (proto) {
                ExplorerProtocol.SFTP -> SftpColor
                ExplorerProtocol.FTP -> FtpColor
                ExplorerProtocol.S3 -> S3Color
                ExplorerProtocol.S3_COMPATIBLE -> S3CompatColor
            }
            Box(
                modifier = Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(10.dp))
                    .background(if (isSelected) accent.copy(alpha = 0.20f) else Color.Transparent)
                    .border(1.dp, if (isSelected) accent.copy(alpha = 0.6f) else Color.Transparent, RoundedCornerShape(10.dp))
                    .clickable { onProtocolChange(proto) }
                    .padding(vertical = 10.dp),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Icon(
                        imageVector = when (proto) {
                            ExplorerProtocol.SFTP -> Icons.Rounded.Folder
                            ExplorerProtocol.FTP -> Icons.Rounded.Dns
                            ExplorerProtocol.S3 -> Icons.Rounded.Cloud
                            ExplorerProtocol.S3_COMPATIBLE -> Icons.Rounded.Storage
                        },
                        contentDescription = proto.label,
                        tint = if (isSelected) accent else MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = proto.shortLabel,
                        fontSize = 11.sp,
                        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                        color = if (isSelected) accent else MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }

    // Main Login & Setup Card
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = BorderStroke(1.dp, Brush.horizontalGradient(listOf(cardBorder, protocolAccent.copy(alpha = 0.35f), cardBorder))),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Column {
                Text(
                    text = state.activeProtocol.label,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Text(
                    text = state.activeProtocol.hint,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Error display banner
            if (state.connectionError != null) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(Color(0xFFFF5252).copy(alpha = 0.12f))
                        .border(1.dp, Color(0xFFFF5252).copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                        .padding(12.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Icon(Icons.Rounded.ErrorOutline, contentDescription = null, tint = Color(0xFFFF5252), modifier = Modifier.size(18.dp))
                        Text(
                            text = state.connectionError,
                            fontSize = 12.sp,
                            color = Color(0xFFFF5252),
                            lineHeight = 16.sp
                        )
                    }
                }
            }

            // Protocol-specific form fields
            when (state.activeProtocol) {
                ExplorerProtocol.SFTP, ExplorerProtocol.FTP -> {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = draft.host,
                            onValueChange = { onDraftChange(draft.copy(host = it)) },
                            label = { Text("Host / IP Address") },
                            placeholder = { Text("e.g. 192.168.1.100") },
                            modifier = Modifier.weight(2f),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = if (draft.port == 0) "" else draft.port.toString(),
                            onValueChange = { onDraftChange(draft.copy(port = it.toIntOrNull() ?: 0)) },
                            label = { Text("Port") },
                            placeholder = { Text("${state.activeProtocol.defaultPort}") },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                        )
                    }

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = draft.username,
                            onValueChange = { onDraftChange(draft.copy(username = it)) },
                            label = { Text("Username") },
                            placeholder = { Text(if (state.activeProtocol == ExplorerProtocol.SFTP) "root" else "anonymous") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = draft.password,
                            onValueChange = { onDraftChange(draft.copy(password = it)) },
                            label = { Text("Password") },
                            singleLine = true,
                            modifier = Modifier.weight(1f),
                            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                            trailingIcon = {
                                IconButton(onClick = { showPassword = !showPassword }) {
                                    Icon(
                                        imageVector = if (showPassword) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                                        contentDescription = "Toggle password",
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                        )
                    }

                    if (state.activeProtocol == ExplorerProtocol.FTP) {
                        Text("FTP Security Mode", style = MaterialTheme.typography.labelMedium)
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            listOf("OFF" to "Plain FTP", "EXPLICIT" to "FTPS Explicit", "IMPLICIT" to "FTPS Implicit").forEach { (mode, label) ->
                                val isSel = draft.secureFtpMode == mode
                                Box(
                                    modifier = Modifier
                                        .weight(1f)
                                        .clip(RoundedCornerShape(8.dp))
                                        .background(if (isSel) FtpColor.copy(alpha = 0.25f) else innerBoxBg)
                                        .border(1.dp, if (isSel) FtpColor else cardBorder, RoundedCornerShape(8.dp))
                                        .clickable { onDraftChange(draft.copy(secureFtpMode = mode)) }
                                        .padding(vertical = 8.dp),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(label, fontSize = 10.sp, fontWeight = if (isSel) FontWeight.Bold else FontWeight.Medium, color = if (isSel) FtpColor else MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }

                    OutlinedTextField(
                        value = draft.rootPath,
                        onValueChange = { onDraftChange(draft.copy(rootPath = it)) },
                        label = { Text("Remote Directory") },
                        placeholder = { Text(if (state.activeProtocol == ExplorerProtocol.SFTP) "/home/zeus" else "/") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }

                ExplorerProtocol.S3, ExplorerProtocol.S3_COMPATIBLE -> {
                    if (state.activeProtocol == ExplorerProtocol.S3_COMPATIBLE) {
                        OutlinedTextField(
                            value = draft.endpoint,
                            onValueChange = { onDraftChange(draft.copy(endpoint = it)) },
                            label = { Text("S3 Endpoint URL") },
                            placeholder = { Text("http://192.168.1.50:9000") },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true
                        )
                    }

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = draft.bucket,
                            onValueChange = { onDraftChange(draft.copy(bucket = it)) },
                            label = { Text("Bucket Name") },
                            placeholder = { Text("my-bucket") },
                            modifier = Modifier.weight(1.5f),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = draft.region,
                            onValueChange = { onDraftChange(draft.copy(region = it)) },
                            label = { Text("Region") },
                            placeholder = { Text("us-east-1") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                    }

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        OutlinedTextField(
                            value = draft.accessKeyId,
                            onValueChange = { onDraftChange(draft.copy(accessKeyId = it)) },
                            label = { Text("Access Key ID") },
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                        OutlinedTextField(
                            value = draft.secretAccessKey,
                            onValueChange = { onDraftChange(draft.copy(secretAccessKey = it)) },
                            label = { Text("Secret Access Key") },
                            modifier = Modifier.weight(1f),
                            singleLine = true,
                            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                            trailingIcon = {
                                IconButton(onClick = { showPassword = !showPassword }) {
                                    Icon(
                                        imageVector = if (showPassword) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                                        contentDescription = "Toggle secret",
                                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.size(18.dp)
                                    )
                                }
                            }
                        )
                    }

                    OutlinedTextField(
                        value = draft.rootPath,
                        onValueChange = { onDraftChange(draft.copy(rootPath = it)) },
                        label = { Text("Prefix / Folder (Optional)") },
                        placeholder = { Text("e.g. exports/") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true
                    )
                }
            }

            // Connection Profile Name & Save Option
            OutlinedTextField(
                value = draft.name,
                onValueChange = { onDraftChange(draft.copy(name = it)) },
                label = { Text("Profile Name (Optional)") },
                placeholder = { Text("e.g. Production Edge Host") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true
            )

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable { onSaveProfileToggle(!state.saveProfileOnConnect) }
            ) {
                Checkbox(
                    checked = state.saveProfileOnConnect,
                    onCheckedChange = { onSaveProfileToggle(it) },
                    colors = CheckboxDefaults.colors(checkedColor = ZeusBlue)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text("Save to Connection Profiles", style = MaterialTheme.typography.bodySmall)
            }

            Button(
                onClick = onConnect,
                enabled = !state.isConnecting && (draft.host.isNotBlank() || draft.bucket.isNotBlank()),
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                colors = ButtonDefaults.buttonColors(containerColor = protocolAccent),
                shape = RoundedCornerShape(12.dp)
            ) {
                if (state.isConnecting) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Spacer(modifier = Modifier.width(10.dp))
                    Text("Connecting...", fontWeight = FontWeight.Bold, color = Color.White)
                } else {
                    Text("Connect to Server", fontWeight = FontWeight.Bold, color = Color.Black)
                }
            }
        }
    }

    // Saved Connections List (if any exist for this protocol or overall)
    if (state.savedConnections.isNotEmpty()) {
        Card(
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(containerColor = cardBg),
            border = BorderStroke(1.dp, cardBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    text = "Saved Connections (${state.savedConnections.size})",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )

                state.savedConnections.forEach { conn ->
                    val connAccent = when (conn.protocol) {
                        ExplorerProtocol.SFTP -> SftpColor
                        ExplorerProtocol.FTP -> FtpColor
                        ExplorerProtocol.S3 -> S3Color
                        ExplorerProtocol.S3_COMPATIBLE -> S3CompatColor
                    }

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(innerBoxBg)
                            .border(1.dp, cardBorder, RoundedCornerShape(12.dp))
                            .clickable { onSelectSavedConnection(conn) }
                            .padding(horizontal = 12.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(10.dp),
                            modifier = Modifier.weight(1f)
                        ) {
                            IconButton(onClick = { onTogglePin(conn.id) }, modifier = Modifier.size(28.dp)) {
                                Icon(
                                    imageVector = if (conn.pinned) Icons.Rounded.Star else Icons.Rounded.StarBorder,
                                    contentDescription = "Pin",
                                    tint = if (conn.pinned) Color(0xFFFFB300) else MaterialTheme.colorScheme.outline,
                                    modifier = Modifier.size(18.dp)
                                )
                            }
                            Column(modifier = Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(conn.name.ifBlank { conn.displayLabel() }, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                    Box(
                                        modifier = Modifier
                                            .clip(RoundedCornerShape(4.dp))
                                            .background(connAccent.copy(alpha = 0.15f))
                                            .padding(horizontal = 5.dp, vertical = 2.dp)
                                    ) {
                                        Text(conn.protocol.shortLabel, fontSize = 9.sp, fontWeight = FontWeight.Bold, color = connAccent)
                                    }
                                }
                                Text(
                                    text = conn.displayLabel(),
                                    style = MaterialTheme.typography.labelSmall,
                                    fontFamily = FontFamily.Monospace,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }

                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Button(
                                onClick = { onSelectSavedConnection(conn) },
                                colors = ButtonDefaults.buttonColors(containerColor = connAccent),
                                shape = RoundedCornerShape(8.dp),
                                modifier = Modifier.height(32.dp)
                            ) {
                                Text("Connect", fontSize = 11.sp, color = Color.Black, fontWeight = FontWeight.Bold)
                            }
                            IconButton(onClick = { onDeleteSaved(conn.id) }, modifier = Modifier.size(32.dp)) {
                                Icon(Icons.Rounded.Delete, contentDescription = "Delete", tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Real active file explorer view rendered when connected.
 */
@Composable
private fun FileExplorerConnectedView(
    state: FilesUiState,
    protocolAccent: Color,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onDisconnect: () -> Unit,
    onNavigateToPath: (String) -> Unit,
    onNavigateUp: () -> Unit,
    onSearchQueryChange: (String) -> Unit,
    onRefresh: () -> Unit,
    onCreateFolder: () -> Unit,
    onNewFile: () -> Unit,
    onPickUpload: () -> Unit,
    onOpenFile: (SftpFileItem) -> Unit,
    onDownloadFile: (SftpFileItem) -> Unit,
    onRenameFile: (SftpFileItem) -> Unit,
    onProperties: (SftpFileItem) -> Unit,
    onDeleteFile: (SftpFileItem) -> Unit,
    onSortChange: (FileSortOption) -> Unit,
    onFoldersFirstToggle: () -> Unit
) {
    val haptic = LocalHapticFeedback.current
    val context = LocalContext.current

    // Connected Header Card
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = BorderStroke(1.dp, Brush.horizontalGradient(listOf(cardBorder, ZeusMint.copy(alpha = 0.5f), cardBorder))),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.weight(1f)
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(ZeusMint.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = when (state.activeProtocol) {
                            ExplorerProtocol.SFTP -> Icons.Rounded.Folder
                            ExplorerProtocol.FTP -> Icons.Rounded.Dns
                            ExplorerProtocol.S3 -> Icons.Rounded.Cloud
                            ExplorerProtocol.S3_COMPATIBLE -> Icons.Rounded.Storage
                        },
                        contentDescription = null,
                        tint = ZeusMint,
                        modifier = Modifier.size(22.dp)
                    )
                }

                Column(modifier = Modifier.weight(1f)) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(ZeusMint)
                        )
                        Text(
                            text = "Connected (${state.activeProtocol.shortLabel})",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onBackground
                        )
                    }
                    Text(
                        text = state.connection.displayLabel(),
                        style = MaterialTheme.typography.labelSmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }
            }

            OutlinedButton(
                onClick = onDisconnect,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFFF5252)),
                border = BorderStroke(1.dp, Color(0xFFFF5252).copy(alpha = 0.5f)),
                shape = RoundedCornerShape(10.dp)
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    Icon(Icons.AutoMirrored.Rounded.Logout, contentDescription = "Disconnect", modifier = Modifier.size(16.dp))
                    Text("Disconnect", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }

    // Active Transfers Banner (Uploads & Downloads)
    if (state.activeTransfers.isNotEmpty()) {
        Card(
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = cardBg),
            border = BorderStroke(1.dp, cardBorder),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Transfer Activity (${state.activeTransfers.size})",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = ZeusCyanAccent
                )
                state.activeTransfers.take(3).forEach { task ->
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(innerBoxBg)
                            .padding(8.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                Icon(
                                    imageVector = if (task.isUpload) Icons.Rounded.CloudUpload else Icons.Rounded.Download,
                                    contentDescription = null,
                                    tint = if (task.isCompleted) ZeusMint else ZeusCyanAccent,
                                    modifier = Modifier.size(14.dp)
                                )
                                Text(
                                    text = task.fileName,
                                    style = MaterialTheme.typography.bodySmall,
                                    fontWeight = FontWeight.Bold,
                                    fontFamily = FontFamily.Monospace,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                            }
                            Text(
                                text = task.speedFormatted,
                                style = MaterialTheme.typography.labelSmall,
                                color = if (task.isCompleted) ZeusMint else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        if (!task.isCompleted) {
                            LinearProgressIndicator(
                                progress = { task.progressPercent / 100f },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(4.dp)
                                    .clip(RoundedCornerShape(2.dp)),
                                color = ZeusCyanAccent,
                                trackColor = innerBoxBg
                            )
                        }
                    }
                }
            }
        }
    }

    // Path Breadcrumbs & Search / Action Toolbar
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = BorderStroke(1.dp, cardBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            // Path Breadcrumbs
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                        .clickable { onNavigateUp() }
                        .padding(horizontal = 8.dp, vertical = 5.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.AutoMirrored.Rounded.ArrowBack, contentDescription = "Up", modifier = Modifier.size(12.dp), tint = ZeusBlue)
                        Text("Up", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = ZeusBlue)
                    }
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                        .clickable { onNavigateToPath("/") }
                        .padding(horizontal = 8.dp, vertical = 5.dp)
                ) {
                    Text(
                        text = if (state.activeProtocol == ExplorerProtocol.S3 || state.activeProtocol == ExplorerProtocol.S3_COMPATIBLE) {
                            state.connection.bucket.ifBlank { "s3://" }
                        } else "root /",
                        fontFamily = FontFamily.Monospace,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = protocolAccent
                    )
                }

                var cumulative = ""
                state.pathSegments.forEach { segment ->
                    cumulative += "/$segment"
                    val target = cumulative
                    Text("/", color = MaterialTheme.colorScheme.outline, fontSize = 11.sp)
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(6.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                            .clickable { onNavigateToPath(target) }
                            .padding(horizontal = 8.dp, vertical = 5.dp)
                    ) {
                        Text(
                            text = segment,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }

            // Search Bar & Primary Actions
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = state.searchQuery,
                    onValueChange = onSearchQueryChange,
                    placeholder = { Text("Filter files...", fontSize = 12.sp) },
                    leadingIcon = {
                        Icon(Icons.Rounded.Search, contentDescription = null, modifier = Modifier.size(16.dp))
                    },
                    modifier = Modifier
                        .weight(1f)
                        .height(44.dp),
                    singleLine = true,
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = protocolAccent,
                        unfocusedBorderColor = cardBorder
                    )
                )

                // Upload Button (triggers device file picker)
                IconButton(
                    onClick = onPickUpload,
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(innerBoxBg)
                        .border(1.dp, ZeusMint.copy(alpha = 0.5f), RoundedCornerShape(10.dp))
                ) {
                    Icon(Icons.Rounded.CloudUpload, contentDescription = "Upload", tint = ZeusMint)
                }

                // New File Button
                IconButton(
                    onClick = onNewFile,
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(innerBoxBg)
                        .border(1.dp, cardBorder, RoundedCornerShape(10.dp))
                ) {
                    Icon(Icons.Rounded.NoteAdd, contentDescription = "New File", tint = ZeusCyanAccent)
                }

                // New Folder Button
                IconButton(
                    onClick = onCreateFolder,
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(innerBoxBg)
                        .border(1.dp, cardBorder, RoundedCornerShape(10.dp))
                ) {
                    Icon(Icons.Rounded.CreateNewFolder, contentDescription = "New Folder", tint = protocolAccent)
                }

                // Refresh Button
                IconButton(
                    onClick = onRefresh,
                    modifier = Modifier
                        .size(44.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(innerBoxBg)
                        .border(1.dp, cardBorder, RoundedCornerShape(10.dp))
                ) {
                    Icon(Icons.Rounded.Refresh, contentDescription = "Refresh", tint = MaterialTheme.colorScheme.onBackground)
                }
            }

            // Secondary Toolbar: Sorting and Folders-First (Matches Zeus Electron SftpToolbar)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState()),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                // Folders First Toggle Chip
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(if (state.foldersFirst) ZeusCyanAccent.copy(alpha = 0.12f) else innerBoxBg)
                        .border(1.dp, if (state.foldersFirst) ZeusCyanAccent.copy(alpha = 0.4f) else cardBorder, RoundedCornerShape(8.dp))
                        .clickable { onFoldersFirstToggle() }
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(
                            imageVector = Icons.Rounded.Folder,
                            contentDescription = null,
                            tint = if (state.foldersFirst) ZeusCyanAccent else MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.size(12.dp)
                        )
                        Text(
                            text = "Folders First",
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (state.foldersFirst) ZeusCyanAccent else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                // Sort Options
                FileSortOption.entries.forEach { opt ->
                    val isSelected = state.sortBy == opt
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (isSelected) ZeusBlue.copy(alpha = 0.15f) else innerBoxBg)
                            .border(1.dp, if (isSelected) ZeusBlue else cardBorder, RoundedCornerShape(8.dp))
                            .clickable { onSortChange(opt) }
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(
                                text = opt.label,
                                fontSize = 10.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                color = if (isSelected) ZeusBlue else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            if (isSelected) {
                                Icon(
                                    imageVector = if (state.sortAscending) Icons.Rounded.ArrowUpward else Icons.Rounded.ArrowDownward,
                                    contentDescription = null,
                                    tint = ZeusBlue,
                                    modifier = Modifier.size(10.dp)
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    // Real Remote File Listing Card
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = BorderStroke(1.dp, cardBorder),
        modifier = Modifier.fillMaxWidth()
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
                Text(
                    text = "Remote Items (${state.filteredFiles.size})",
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = state.currentPath,
                    style = MaterialTheme.typography.labelSmall,
                    fontFamily = FontFamily.Monospace,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.width(180.dp)
                )
            }

            if (state.filteredFiles.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 36.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.Rounded.FolderOpen, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(36.dp))
                        Text("This directory is empty on the remote server", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            } else {
                state.filteredFiles.forEach { file ->
                    RemoteFileRow(
                        file = file,
                        cardBorder = cardBorder,
                        innerBoxBg = innerBoxBg,
                        protocolAccent = protocolAccent,
                        onClick = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onOpenFile(file)
                        },
                        onDownload = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onDownloadFile(file)
                        },
                        onRename = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onRenameFile(file)
                        },
                        onProperties = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onProperties(file)
                        },
                        onDelete = {
                            haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                            onDeleteFile(file)
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun RemoteFileRow(
    file: SftpFileItem,
    cardBorder: Color,
    innerBoxBg: Color,
    protocolAccent: Color,
    onClick: () -> Unit,
    onDownload: () -> Unit,
    onRename: () -> Unit,
    onProperties: () -> Unit,
    onDelete: () -> Unit
) {
    val fileIcon = when {
        file.isDirectory -> Icons.Rounded.Folder
        file.extension.equals("json", ignoreCase = true) -> Icons.Rounded.Code
        file.extension.equals("csv", ignoreCase = true) -> Icons.Rounded.TableChart
        file.extension.equals("zpl", ignoreCase = true) -> Icons.Rounded.Print
        file.extension.equals("log", ignoreCase = true) -> Icons.Rounded.Terminal
        file.extension.equals("xml", ignoreCase = true) -> Icons.Rounded.LinearScale
        else -> Icons.AutoMirrored.Rounded.InsertDriveFile
    }

    val iconColor = when {
        file.isDirectory -> protocolAccent
        file.extension.equals("json", ignoreCase = true) -> ZeusMint
        file.extension.equals("csv", ignoreCase = true) -> Color(0xFF4CAF50)
        file.extension.equals("zpl", ignoreCase = true) -> Color(0xFFFF9800)
        file.extension.equals("log", ignoreCase = true) -> ZeusBlue
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(innerBoxBg)
            .border(1.dp, cardBorder.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            modifier = Modifier.weight(1f)
        ) {
            Box(
                modifier = Modifier
                    .size(34.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(iconColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(imageVector = fileIcon, contentDescription = null, tint = iconColor, modifier = Modifier.size(18.dp))
            }

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = file.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = if (file.isDirectory) FontFamily.Default else FontFamily.Monospace,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = if (file.isDirectory) {
                        "Directory"
                    } else {
                        "${formatBytes(file.sizeBytes)}${if (file.lastModified.isNotBlank()) " • " + file.lastModified else ""}"
                    },
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(2.dp)) {
            if (!file.isDirectory) {
                // Download directly to device
                IconButton(onClick = onDownload, modifier = Modifier.size(30.dp)) {
                    Icon(Icons.Rounded.Download, contentDescription = "Download", tint = ZeusMint, modifier = Modifier.size(16.dp))
                }
                // View content
                IconButton(onClick = onClick, modifier = Modifier.size(30.dp)) {
                    Icon(Icons.Rounded.Visibility, contentDescription = "View", tint = ZeusCyanAccent, modifier = Modifier.size(16.dp))
                }
            }
            // Rename
            IconButton(onClick = onRename, modifier = Modifier.size(30.dp)) {
                Icon(Icons.Rounded.Edit, contentDescription = "Rename", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
            }
            // Properties
            IconButton(onClick = onProperties, modifier = Modifier.size(30.dp)) {
                Icon(Icons.Rounded.Info, contentDescription = "Properties", tint = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.size(15.dp))
            }
            // Delete
            IconButton(onClick = onDelete, modifier = Modifier.size(30.dp)) {
                Icon(Icons.Rounded.Delete, contentDescription = "Delete", tint = Color(0xFFFF5252).copy(alpha = 0.8f), modifier = Modifier.size(15.dp))
            }
        }
    }
}

@Composable
private fun PropertyRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.width(90.dp)
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            fontFamily = FontFamily.Monospace,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f)
        )
    }
}

@Composable
private fun FileViewerContent(
    preview: ActiveFilePreview,
    editorBg: Color,
    cardBorder: Color,
    onDownload: () -> Unit,
    onCopy: () -> Unit,
    onDismiss: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp)
            .navigationBarsPadding()
            .padding(bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = preview.fileName,
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    fontFamily = FontFamily.Monospace,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = "${preview.sizeFormatted} • ${preview.lineCount} lines",
                    style = MaterialTheme.typography.labelSmall,
                    color = ZeusCyanAccent
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedButton(
                    onClick = onDownload,
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = ZeusMint),
                    border = BorderStroke(1.dp, ZeusMint.copy(alpha = 0.5f))
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Icon(Icons.Rounded.Download, contentDescription = null, modifier = Modifier.size(14.dp))
                        Text("Download", fontSize = 12.sp)
                    }
                }

                Button(
                    onClick = onCopy,
                    colors = ButtonDefaults.buttonColors(containerColor = ZeusBlue),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Icon(Icons.Rounded.ContentCopy, contentDescription = null, modifier = Modifier.size(16.dp))
                        Text("Copy", fontSize = 12.sp)
                    }
                }
            }
        }

        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(340.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(editorBg)
                .border(1.dp, cardBorder, RoundedCornerShape(12.dp))
                .verticalScroll(rememberScrollState())
                .horizontalScroll(rememberScrollState())
                .padding(14.dp)
        ) {
            Text(
                text = preview.content,
                fontFamily = FontFamily.Monospace,
                fontSize = 12.sp,
                lineHeight = 18.sp,
                color = MaterialTheme.colorScheme.onBackground
            )
        }
    }
}

private fun formatBytes(bytes: Long): String {
    return when {
        bytes >= 1_048_576 -> String.format(java.util.Locale.US, "%.1f MB", bytes / 1_048_576.0)
        bytes >= 1024 -> String.format(java.util.Locale.US, "%.1f KB", bytes / 1024.0)
        else -> "$bytes B"
    }
}

