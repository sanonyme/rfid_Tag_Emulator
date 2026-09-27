package com.zeus.rfid.ui.database

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.ArrowBack
import androidx.compose.material.icons.automirrored.rounded.ArrowForward
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Clear
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Code
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.PowerSettingsNew
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Storage
import androidx.compose.material.icons.rounded.TableView
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material.icons.rounded.Warning
import androidx.compose.material.icons.rounded.Wifi
import com.zeus.rfid.ui.components.ZeusActionButton as Button
import androidx.compose.material3.ButtonDefaults
import com.zeus.rfid.ui.components.ZeusCard as Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
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
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.zeus.rfid.ui.theme.ZeusBlue
import com.zeus.rfid.ui.theme.ZeusCyanAccent
import com.zeus.rfid.ui.theme.ZeusMint
import com.zeus.rfid.ui.theme.ZeusRed

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatabaseSection(
    viewModel: DatabaseViewModel,
    modifier: Modifier = Modifier
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val isDark = isZeusDarkTheme()
    val haptic = LocalHapticFeedback.current

    val cardBg = zeusCardBg(isDark)
    val cardBorder = zeusCardBorderColor(isDark)
    val innerBoxBg = zeusInnerBoxBg(isDark)
    val editorBg = if (isDark) Color(0xFF090D14) else Color(0xFFF1F5F9)

    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (!state.isConnected) {
            // =========================================================================
            // DISCONNECTED VIEW: PROFESSIONAL ZEUS DB LOGIN SCREEN (Matches Electron)
            // =========================================================================
            DbLoginCard(
                state = state,
                isDark = isDark,
                cardBg = cardBg,
                cardBorder = cardBorder,
                innerBoxBg = innerBoxBg,
                onEngineChange = { viewModel.updateEngine(it) },
                onDraftChange = { host, port, user, pass, dbName, useSsl ->
                    viewModel.updateConnectionDraft(host, port, user, pass, dbName, useSsl)
                },
                onConnect = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    viewModel.connect()
                }
            )
        } else {
            // =========================================================================
            // CONNECTED VIEW: LIVE STATUS & MULTI-TAB WORKSPACE
            // =========================================================================
            DbConnectedHeader(
                state = state,
                isDark = isDark,
                cardBg = cardBg,
                cardBorder = cardBorder,
                onDisconnect = {
                    haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                    viewModel.disconnect()
                }
            )

            if (state.selectedDatabaseName.isBlank()) {
                // =========================================================================
                // 1. LIST DATABASES ON SERVER (Matches Zeus Electron)
                // =========================================================================
                DbDatabasesBrowser(
                    state = state,
                    isDark = isDark,
                    cardBg = cardBg,
                    cardBorder = cardBorder,
                    innerBoxBg = innerBoxBg,
                    onSelectDatabase = { dbName ->
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        viewModel.selectDatabase(dbName)
                    },
                    onSearchChange = { viewModel.setDatabaseSearchQuery(it) }
                )
            } else {
                // =========================================================================
                // 2. ACTIVE DATABASE CHOSEN: BREADCRUMBS & TABLES
                // =========================================================================
                DbActiveDatabaseBreadcrumb(
                    databaseName = state.selectedDatabaseName,
                    engine = state.connection.engine,
                    cardBg = cardBg,
                    cardBorder = cardBorder,
                    innerBoxBg = innerBoxBg,
                    tableCount = state.availableTables.size,
                    onBackToDatabases = {
                        haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                        viewModel.clearSelectedDatabase()
                    }
                )

                // Sub-navigation Tabs: Tables, SQL Console, RFID Lookups
                SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                    val tabs = listOf(
                        Pair("Tables & Data", Icons.Rounded.TableView),
                        Pair("SQL Console", Icons.Rounded.Terminal),
                        Pair("RFID Lookups", Icons.Rounded.Search)
                    )

                    tabs.forEachIndexed { index, (label, icon) ->
                        SegmentedButton(
                            selected = state.activeSubTab == index,
                            onClick = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.setSubTab(index)
                            },
                            shape = SegmentedButtonDefaults.itemShape(index = index, count = tabs.size),
                            border = SegmentedButtonDefaults.borderStroke(color = cardBorder),
                            icon = {
                                Icon(
                                    imageVector = icon,
                                    contentDescription = null,
                                    modifier = Modifier.size(16.dp)
                                )
                            },
                            colors = SegmentedButtonDefaults.colors(
                                activeContainerColor = ZeusCyanAccent.copy(alpha = 0.15f),
                                activeContentColor = ZeusCyanAccent,
                                inactiveContainerColor = cardBg,
                                inactiveContentColor = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        ) {
                            Text(text = label, style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }

                // Sub-Tab Content Views
                when (state.activeSubTab) {
                    0 -> {
                        // REAL TABLES & DATA GRID
                        DbTablesBrowser(
                            state = state,
                            isDark = isDark,
                            cardBg = cardBg,
                            cardBorder = cardBorder,
                            innerBoxBg = innerBoxBg,
                            onSelectTable = { tableName ->
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.selectTableName(tableName)
                            },
                            onSearchChange = { viewModel.setTableSearchQuery(it) }
                        )
                    }
                    1 -> {
                        // SQL CONSOLE
                        DbSqlConsole(
                            state = state,
                            isDark = isDark,
                            cardBg = cardBg,
                            cardBorder = cardBorder,
                            editorBg = editorBg,
                            onQueryTextChange = { viewModel.setSqlQueryText(it) },
                            onExecute = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.executeCustomSql()
                            }
                        )
                    }
                    2 -> {
                        // BUILT-IN RFID LOOKUPS
                        DbRfidLookups(
                            state = state,
                            isDark = isDark,
                            cardBg = cardBg,
                            cardBorder = cardBorder,
                            innerBoxBg = innerBoxBg,
                            onSelectQuery = { queryId ->
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.setSelectedBuiltinQuery(queryId)
                            },
                            onParamChange = { viewModel.setBuiltinQueryParam(it) },
                            onExecute = {
                                haptic.performHapticFeedback(HapticFeedbackType.LongPress)
                                viewModel.executeBuiltinQuery()
                            }
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))
    }
}

// =============================================================================
// 1. DISCONNECTED LOGIN CARD (Matches Electron Zeus DbLoginScreen)
// =============================================================================

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DbLoginCard(
    state: DatabaseUiState,
    isDark: Boolean,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onEngineChange: (DbEngine) -> Unit,
    onDraftChange: (host: String, port: Int, user: String, pass: String, dbName: String, useSsl: Boolean) -> Unit,
    onConnect: () -> Unit
) {
    var host by remember(state.connection.host) { mutableStateOf(state.connection.host) }
    var port by remember(state.connection.port) { mutableStateOf(state.connection.port.toString()) }
    var user by remember(state.connection.user) { mutableStateOf(state.connection.user) }
    var pass by remember(state.connection.pass) { mutableStateOf(state.connection.pass) }
    var dbName by remember(state.connection.databaseName) { mutableStateOf(state.connection.databaseName) }
    var useSsl by remember(state.connection.useSsl) { mutableStateOf(state.connection.useSsl) }
    var showPassword by remember { mutableStateOf(false) }

    Card(
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, cardBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Icon Hero
            Box(
                modifier = Modifier
                    .size(56.dp)
                    .clip(RoundedCornerShape(18.dp))
                    .background(ZeusCyanAccent.copy(alpha = 0.15f))
                    .border(1.dp, ZeusCyanAccent.copy(alpha = 0.35f), RoundedCornerShape(18.dp)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Rounded.Storage,
                    contentDescription = null,
                    tint = ZeusCyanAccent,
                    modifier = Modifier.size(30.dp)
                )
            }

            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    text = "Database Explorer",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.height(3.dp))
                Text(
                    text = "Connect directly to MySQL or PostgreSQL on reader host",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Engine Selection Switch
            SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                DbEngine.entries.forEachIndexed { index, engine ->
                    SegmentedButton(
                        selected = state.connection.engine == engine,
                        onClick = {
                            onEngineChange(engine)
                            port = engine.defaultPort.toString()
                        },
                        shape = SegmentedButtonDefaults.itemShape(index = index, count = DbEngine.entries.size),
                        border = SegmentedButtonDefaults.borderStroke(color = cardBorder),
                        colors = SegmentedButtonDefaults.colors(
                            activeContainerColor = ZeusCyanAccent.copy(alpha = 0.15f),
                            activeContentColor = ZeusCyanAccent,
                            inactiveContainerColor = innerBoxBg,
                            inactiveContentColor = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    ) {
                        Text(
                            text = engine.label,
                            fontWeight = FontWeight.SemiBold,
                            fontSize = 12.sp
                        )
                    }
                }
            }

            // Host & Port Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = host,
                    onValueChange = {
                        host = it
                        onDraftChange(it, port.toIntOrNull() ?: state.connection.engine.defaultPort, user, pass, dbName, useSsl)
                    },
                    label = { Text("Host / IP Address") },
                    placeholder = { Text("192.168.1.100") },
                    singleLine = true,
                    modifier = Modifier.weight(2f),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ZeusCyanAccent,
                        unfocusedBorderColor = cardBorder
                    )
                )

                OutlinedTextField(
                    value = port,
                    onValueChange = {
                        port = it
                        onDraftChange(host, it.toIntOrNull() ?: state.connection.engine.defaultPort, user, pass, dbName, useSsl)
                    },
                    label = { Text("Port") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ZeusCyanAccent,
                        unfocusedBorderColor = cardBorder
                    )
                )
            }

            // Database Name Field
            OutlinedTextField(
                value = dbName,
                onValueChange = {
                    dbName = it
                    onDraftChange(host, port.toIntOrNull() ?: state.connection.engine.defaultPort, user, pass, it, useSsl)
                },
                label = { Text("Database / Schema (Optional)") },
                placeholder = { Text("e.g. ats_db or leave blank to browse all") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = ZeusCyanAccent,
                    unfocusedBorderColor = cardBorder
                )
            )

            // User & Password Fields
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                OutlinedTextField(
                    value = user,
                    onValueChange = {
                        user = it
                        onDraftChange(host, port.toIntOrNull() ?: state.connection.engine.defaultPort, it, pass, dbName, useSsl)
                    },
                    label = { Text("Username") },
                    singleLine = true,
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Rounded.Person,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    modifier = Modifier.weight(1f),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ZeusCyanAccent,
                        unfocusedBorderColor = cardBorder
                    )
                )

                OutlinedTextField(
                    value = pass,
                    onValueChange = {
                        pass = it
                        onDraftChange(host, port.toIntOrNull() ?: state.connection.engine.defaultPort, user, it, dbName, useSsl)
                    },
                    label = { Text("Password") },
                    singleLine = true,
                    visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                    leadingIcon = {
                        Icon(
                            imageVector = Icons.Rounded.Key,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    },
                    trailingIcon = {
                        IconButton(onClick = { showPassword = !showPassword }) {
                            Icon(
                                imageVector = if (showPassword) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                                contentDescription = if (showPassword) "Hide" else "Show",
                                modifier = Modifier.size(18.dp),
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    },
                    modifier = Modifier.weight(1f),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ZeusCyanAccent,
                        unfocusedBorderColor = cardBorder
                    )
                )
            }

            // SSL Checkbox
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable {
                        useSsl = !useSsl
                        onDraftChange(host, port.toIntOrNull() ?: state.connection.engine.defaultPort, user, pass, dbName, useSsl)
                    },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Checkbox(
                    checked = useSsl,
                    onCheckedChange = {
                        useSsl = it
                        onDraftChange(host, port.toIntOrNull() ?: state.connection.engine.defaultPort, user, pass, dbName, it)
                    },
                    colors = CheckboxDefaults.colors(checkedColor = ZeusCyanAccent)
                )
                Text(
                    text = "Use SSL / TLS Connection",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            // Connection Error Alert
            state.connectionError?.let { err ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(ZeusRed.copy(alpha = 0.12f))
                        .border(1.dp, ZeusRed.copy(alpha = 0.35f), RoundedCornerShape(12.dp))
                        .padding(12.dp)
                ) {
                    Row(
                        verticalAlignment = Alignment.Top,
                        horizontalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Warning,
                            contentDescription = "Error",
                            tint = ZeusRed,
                            modifier = Modifier.size(18.dp)
                        )
                        Text(
                            text = err,
                            style = MaterialTheme.typography.bodySmall,
                            color = ZeusRed,
                            lineHeight = 16.sp
                        )
                    }
                }
            }

            // Connect Button
            Button(
                onClick = onConnect,
                enabled = !state.isConnecting,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(48.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = ZeusCyanAccent,
                    contentColor = Color.Black
                )
            ) {
                if (state.isConnecting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        strokeWidth = 2.dp,
                        color = Color.Black
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Text(
                        text = "Connecting to ${state.connection.engine.label}...",
                        fontWeight = FontWeight.Bold
                    )
                } else {
                    Icon(
                        imageVector = Icons.Rounded.PowerSettingsNew,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = "Connect to Database",
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }
            }
        }
    }
}

// =============================================================================
// 2. CONNECTED HEADER
// =============================================================================

@Composable
private fun DbConnectedHeader(
    state: DatabaseUiState,
    isDark: Boolean,
    cardBg: Color,
    cardBorder: Color,
    onDisconnect: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, cardBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(ZeusMint.copy(alpha = 0.15f))
                        .border(1.dp, ZeusMint.copy(alpha = 0.35f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Storage,
                        contentDescription = null,
                        tint = ZeusMint,
                        modifier = Modifier.size(22.dp)
                    )
                }

                Column {
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
                            text = if (state.connection.databaseName.isNotBlank()) state.connection.databaseName else "Connected",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(4.dp))
                                .background(ZeusMint.copy(alpha = 0.12f))
                                .padding(horizontal = 6.dp, vertical = 2.dp)
                        ) {
                            Text(
                                text = "${state.pingMs}ms",
                                style = MaterialTheme.typography.labelSmall.copy(fontSize = 9.sp),
                                fontWeight = FontWeight.Bold,
                                fontFamily = FontFamily.Monospace,
                                color = ZeusMint
                            )
                        }
                    }
                    Text(
                        text = "${state.connection.engine.label} • ${state.connection.host}:${state.connection.port}",
                        style = MaterialTheme.typography.bodySmall,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            OutlinedButton(
                onClick = onDisconnect,
                shape = RoundedCornerShape(10.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, ZeusRed.copy(alpha = 0.5f)),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = ZeusRed),
                modifier = Modifier.height(34.dp)
            ) {
                Icon(
                    imageVector = Icons.Rounded.PowerSettingsNew,
                    contentDescription = "Disconnect",
                    modifier = Modifier.size(14.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(text = "Disconnect", fontSize = 11.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

// =============================================================================
// 3. TABLES & DATA GRID (0 Demo Data, 100% Real from DB)
// =============================================================================

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DbTablesBrowser(
    state: DatabaseUiState,
    isDark: Boolean,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onSelectTable: (String) -> Unit,
    onSearchChange: (String) -> Unit
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, cardBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Header & Search
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Schema Tables (${state.availableTables.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )

                if (state.isTableLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = ZeusCyanAccent
                    )
                }
            }

            if (state.availableTables.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "No tables found in this database schema.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            } else {
                // Table Chips Selector
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    state.availableTables.forEach { table ->
                        val isSelected = state.selectedTableName.equals(table.name, ignoreCase = true)
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(10.dp))
                                .background(if (isSelected) ZeusCyanAccent.copy(alpha = 0.2f) else innerBoxBg)
                                .border(
                                    1.dp,
                                    if (isSelected) ZeusCyanAccent else cardBorder,
                                    RoundedCornerShape(10.dp)
                                )
                                .clickable { onSelectTable(table.name) }
                                .padding(horizontal = 12.dp, vertical = 7.dp)
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    text = table.name,
                                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 12.sp,
                                    fontFamily = FontFamily.Monospace,
                                    color = if (isSelected) ZeusCyanAccent else MaterialTheme.colorScheme.onSurface
                                )
                                if (table.rowCount >= 0) {
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(
                                        text = "${table.rowCount}",
                                        fontSize = 10.sp,
                                        fontFamily = FontFamily.Monospace,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }
                    }
                }

                HorizontalDivider(color = cardBorder.copy(alpha = 0.6f))

                // Table Data Grid Display
                val result = state.activeTableResult
                if (result != null) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Rows: ${result.rowCount} • Query: ${result.executionTimeMs}ms",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    if (result.rows.isEmpty()) {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 32.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                text = "Table is empty (0 rows found)",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    } else {
                        // Data Grid
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .border(1.dp, cardBorder, RoundedCornerShape(10.dp))
                                .horizontalScroll(rememberScrollState())
                        ) {
                            Column {
                                // Header Row
                                Row(
                                    modifier = Modifier
                                        .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
                                        .padding(horizontal = 12.dp, vertical = 10.dp)
                                ) {
                                    result.columns.forEach { col ->
                                        Box(modifier = Modifier.width(140.dp)) {
                                            Text(
                                                text = col,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 12.sp,
                                                fontFamily = FontFamily.Monospace,
                                                color = MaterialTheme.colorScheme.onSurface
                                            )
                                        }
                                    }
                                }

                                // Data Rows
                                result.rows.forEachIndexed { idx, row ->
                                    val rowBg = if (idx % 2 == 0) Color.Transparent else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f)
                                    Row(
                                        modifier = Modifier
                                            .background(rowBg)
                                            .padding(horizontal = 12.dp, vertical = 8.dp)
                                    ) {
                                        row.forEach { cell ->
                                            Box(modifier = Modifier.width(140.dp)) {
                                                Text(
                                                    text = cell,
                                                    fontSize = 11.sp,
                                                    fontFamily = FontFamily.Monospace,
                                                    color = if (cell == "NULL") MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f) else MaterialTheme.colorScheme.onSurface
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// =============================================================================
// 4. SQL CONSOLE (Real Query Runner)
// =============================================================================

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DbSqlConsole(
    state: DatabaseUiState,
    isDark: Boolean,
    cardBg: Color,
    cardBorder: Color,
    editorBg: Color,
    onQueryTextChange: (String) -> Unit,
    onExecute: () -> Unit
) {
    val keyboard = LocalSoftwareKeyboardController.current

    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, cardBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "SQL Query Console",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )

                Button(
                    onClick = {
                        keyboard?.hide()
                        onExecute()
                    },
                    enabled = !state.isSqlRunning,
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ZeusCyanAccent,
                        contentColor = Color.Black
                    ),
                    modifier = Modifier.height(36.dp)
                ) {
                    if (state.isSqlRunning) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = Color.Black
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Rounded.PlayArrow,
                            contentDescription = "Run",
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(text = "Run SQL", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                    }
                }
            }

            // Quick Query Templates
            FlowRow(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                val templates = listOf(
                    "SHOW TABLES;",
                    if (state.selectedTableName.isNotBlank()) "SELECT * FROM `${state.selectedTableName}` LIMIT 20;" else "SELECT 1;",
                    "SHOW DATABASES;"
                )
                templates.forEach { tmpl ->
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                            .border(0.5.dp, cardBorder, RoundedCornerShape(8.dp))
                            .clickable { onQueryTextChange(tmpl) }
                            .padding(horizontal = 8.dp, vertical = 4.dp)
                    ) {
                        Text(
                            text = tmpl,
                            fontSize = 11.sp,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // SQL Input
            OutlinedTextField(
                value = state.sqlQueryText,
                onValueChange = onQueryTextChange,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(110.dp),
                textStyle = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = editorBg,
                    unfocusedContainerColor = editorBg,
                    focusedBorderColor = ZeusCyanAccent,
                    unfocusedBorderColor = cardBorder
                )
            )

            // Results Display
            state.sqlResult?.let { res ->
                HorizontalDivider(color = cardBorder.copy(alpha = 0.5f))

                if (res.errorMessage != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(ZeusRed.copy(alpha = 0.12f))
                            .border(1.dp, ZeusRed.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                            .padding(12.dp)
                    ) {
                        Text(
                            text = res.errorMessage,
                            style = MaterialTheme.typography.bodySmall,
                            color = ZeusRed,
                            fontFamily = FontFamily.Monospace
                        )
                    }
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Result: ${res.rowCount} row(s) • ${res.executionTimeMs}ms",
                            style = MaterialTheme.typography.labelSmall,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .border(1.dp, cardBorder, RoundedCornerShape(10.dp))
                            .horizontalScroll(rememberScrollState())
                    ) {
                        Column {
                            Row(
                                modifier = Modifier
                                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
                                    .padding(horizontal = 12.dp, vertical = 8.dp)
                            ) {
                                res.columns.forEach { col ->
                                    Box(modifier = Modifier.width(130.dp)) {
                                        Text(
                                            text = col,
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 11.sp,
                                            fontFamily = FontFamily.Monospace
                                        )
                                    }
                                }
                            }

                            res.rows.forEachIndexed { idx, row ->
                                val rowBg = if (idx % 2 == 0) Color.Transparent else MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f)
                                Row(
                                    modifier = Modifier
                                        .background(rowBg)
                                        .padding(horizontal = 12.dp, vertical = 6.dp)
                                ) {
                                    row.forEach { cell ->
                                        Box(modifier = Modifier.width(130.dp)) {
                                            Text(
                                                text = cell,
                                                fontSize = 11.sp,
                                                fontFamily = FontFamily.Monospace,
                                                color = MaterialTheme.colorScheme.onSurface
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// =============================================================================
// 5. RFID LOOKUPS
// =============================================================================

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DbRfidLookups(
    state: DatabaseUiState,
    isDark: Boolean,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onSelectQuery: (BuiltinRfidQueryId) -> Unit,
    onParamChange: (String) -> Unit,
    onExecute: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, cardBorder),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            Text(
                text = "RFID Built-in Lookups",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold
            )

            // Lookup Template Selector
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                val queries = listOf(
                    Pair(BuiltinRfidQueryId.CONTAINER_BY_SSCC, "Container by SSCC"),
                    Pair(BuiltinRfidQueryId.ORDER_BY_NUMBER, "Order by Number"),
                    Pair(BuiltinRfidQueryId.ITEM_BY_BARCODE, "Item by Barcode"),
                    Pair(BuiltinRfidQueryId.ITEMS_IN_CONTAINER, "Items inside Container")
                )

                queries.forEach { (id, label) ->
                    val isSelected = state.selectedBuiltinQuery == id
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(if (isSelected) ZeusCyanAccent.copy(alpha = 0.15f) else innerBoxBg)
                            .border(1.dp, if (isSelected) ZeusCyanAccent else cardBorder, RoundedCornerShape(10.dp))
                            .clickable { onSelectQuery(id) }
                            .padding(horizontal = 14.dp, vertical = 10.dp)
                    ) {
                        Text(
                            text = label,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            fontSize = 13.sp,
                            color = if (isSelected) ZeusCyanAccent else MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }

            // Search Parameter Input
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                OutlinedTextField(
                    value = state.builtinQueryParam,
                    onValueChange = onParamChange,
                    label = { Text("Lookup Parameter") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = ZeusCyanAccent,
                        unfocusedBorderColor = cardBorder
                    )
                )

                Button(
                    onClick = onExecute,
                    enabled = !state.isSqlRunning,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = ZeusCyanAccent,
                        contentColor = Color.Black
                    ),
                    modifier = Modifier.height(48.dp)
                ) {
                    Text("Search", fontWeight = FontWeight.Bold)
                }
            }

            // Results Display
            state.builtinQueryResult?.let { res ->
                HorizontalDivider(color = cardBorder.copy(alpha = 0.5f))

                if (res.rows.isEmpty()) {
                    Text(
                        text = "No records matched this parameter.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .border(1.dp, cardBorder, RoundedCornerShape(10.dp))
                            .horizontalScroll(rememberScrollState())
                    ) {
                        Column {
                            Row(
                                modifier = Modifier
                                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f))
                                    .padding(horizontal = 12.dp, vertical = 8.dp)
                            ) {
                                res.columns.forEach { col ->
                                    Box(modifier = Modifier.width(130.dp)) {
                                        Text(text = col, fontWeight = FontWeight.Bold, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                                    }
                                }
                            }
                            res.rows.forEach { row ->
                                Row(modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
                                    row.forEach { cell ->
                                        Box(modifier = Modifier.width(130.dp)) {
                                            Text(text = cell, fontSize = 11.sp, fontFamily = FontFamily.Monospace)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

// =============================================================================
// ACTIVE DATABASE BREADCRUMB
// =============================================================================

@Composable
private fun DbActiveDatabaseBreadcrumb(
    databaseName: String,
    engine: DbEngine,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    tableCount: Int,
    onBackToDatabases: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, cardBorder)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                // Back to database catalog button
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(ZeusCyanAccent.copy(alpha = 0.12f))
                        .border(1.dp, ZeusCyanAccent.copy(alpha = 0.35f), RoundedCornerShape(10.dp))
                        .clickable { onBackToDatabases() }
                        .padding(horizontal = 10.dp, vertical = 6.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Rounded.ArrowBack,
                            contentDescription = "All Databases",
                            tint = ZeusCyanAccent,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = "Databases",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = ZeusCyanAccent
                        )
                    }
                }

                // Active database indicator
                Column {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Storage,
                            contentDescription = null,
                            tint = ZeusMint,
                            modifier = Modifier.size(16.dp)
                        )
                        Text(
                            text = databaseName,
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            fontFamily = FontFamily.Monospace,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Text(
                        text = "Active Database Catalog",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Engine & Table count badges
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(innerBoxBg)
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = engine.label,
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(6.dp))
                        .background(ZeusCyanAccent.copy(alpha = 0.1f))
                        .padding(horizontal = 8.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "$tableCount Tables",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = ZeusCyanAccent
                    )
                }
            }
        }
    }
}

// =============================================================================
// DATABASES BROWSER (LISTS SERVER DATABASES ON LOGIN LIKE ZEUS ELECTRON)
// =============================================================================

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DbDatabasesBrowser(
    state: DatabaseUiState,
    isDark: Boolean,
    cardBg: Color,
    cardBorder: Color,
    innerBoxBg: Color,
    onSelectDatabase: (String) -> Unit,
    onSearchChange: (String) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = cardBg),
        border = androidx.compose.foundation.BorderStroke(1.dp, cardBorder)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Header
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Box(
                        modifier = Modifier
                            .size(38.dp)
                            .clip(RoundedCornerShape(10.dp))
                            .background(ZeusCyanAccent.copy(alpha = 0.15f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Rounded.Storage,
                            contentDescription = null,
                            tint = ZeusCyanAccent,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                    Column {
                        Text(
                            text = "Server Databases",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "Select a database catalog to inspect tables and run queries",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }

                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(8.dp))
                        .background(innerBoxBg)
                        .border(1.dp, cardBorder, RoundedCornerShape(8.dp))
                        .padding(horizontal = 10.dp, vertical = 4.dp)
                ) {
                    Text(
                        text = "${state.availableDatabases.size} Catalogs",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = ZeusCyanAccent
                    )
                }
            }

            // Search Bar
            OutlinedTextField(
                value = state.databaseSearchQuery,
                onValueChange = onSearchChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Filter databases...", style = MaterialTheme.typography.bodySmall) },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Rounded.Search,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.size(18.dp)
                    )
                },
                trailingIcon = {
                    if (state.databaseSearchQuery.isNotBlank()) {
                        IconButton(onClick = { onSearchChange("") }) {
                            Icon(
                                imageVector = Icons.Rounded.Close,
                                contentDescription = "Clear",
                                modifier = Modifier.size(16.dp)
                            )
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(10.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = ZeusCyanAccent,
                    unfocusedBorderColor = cardBorder,
                    focusedContainerColor = innerBoxBg,
                    unfocusedContainerColor = innerBoxBg
                )
            )

            // Content: Loading, Empty or List
            if (state.isDatabasesLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(10.dp)
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(28.dp),
                            color = ZeusCyanAccent,
                            strokeWidth = 2.5.dp
                        )
                        Text(
                            text = "Querying databases on host...",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            } else {
                val query = state.databaseSearchQuery.trim().lowercase()
                val filtered = state.availableDatabases.filter {
                    query.isEmpty() || it.name.lowercase().contains(query)
                }

                val userDatabases = filtered.filter { !it.isSystem }
                val systemDatabases = filtered.filter { it.isSystem }

                if (filtered.isEmpty()) {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 20.dp),
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            text = if (state.databaseSearchQuery.isBlank()) "No databases discovered on server." else "No database matching \"${state.databaseSearchQuery}\"",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                } else {
                    // USER DATABASES (Primary)
                    if (userDatabases.isNotEmpty()) {
                        Text(
                            text = "USER DATABASES (${userDatabases.size})",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = ZeusCyanAccent
                        )

                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            userDatabases.forEach { db ->
                                DbDatabaseItemCard(
                                    db = db,
                                    cardBorder = cardBorder,
                                    innerBoxBg = innerBoxBg,
                                    onSelect = { onSelectDatabase(db.name) }
                                )
                            }
                        }
                    }

                    // SYSTEM DATABASES (Secondary)
                    if (systemDatabases.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "SYSTEM & ENGINE CATALOGS (${systemDatabases.size})",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                        )

                        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            systemDatabases.forEach { db ->
                                DbDatabaseItemCard(
                                    db = db,
                                    cardBorder = cardBorder,
                                    innerBoxBg = innerBoxBg,
                                    onSelect = { onSelectDatabase(db.name) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DbDatabaseItemCard(
    db: DbDatabaseNode,
    cardBorder: Color,
    innerBoxBg: Color,
    onSelect: () -> Unit
) {
    val highlightColor = if (db.isSystem) MaterialTheme.colorScheme.onSurfaceVariant else ZeusCyanAccent

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(innerBoxBg)
            .border(
                1.dp,
                if (!db.isSystem) ZeusCyanAccent.copy(alpha = 0.35f) else cardBorder.copy(alpha = 0.6f),
                RoundedCornerShape(12.dp)
            )
            .clickable { onSelect() }
            .padding(14.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Box(
                    modifier = Modifier
                        .size(34.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(highlightColor.copy(alpha = 0.12f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        imageVector = Icons.Rounded.Storage,
                        contentDescription = null,
                        tint = highlightColor,
                        modifier = Modifier.size(18.dp)
                    )
                }

                Column {
                    Text(
                        text = db.name,
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Text(
                        text = if (db.isSystem) "System Catalog" else "Application Database",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                if (db.isSystem) {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "SYS",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            fontSize = 9.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                } else {
                    Box(
                        modifier = Modifier
                            .clip(RoundedCornerShape(4.dp))
                            .background(ZeusCyanAccent.copy(alpha = 0.12f))
                            .padding(horizontal = 6.dp, vertical = 2.dp)
                    ) {
                        Text(
                            text = "ACTIVE",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            fontSize = 9.sp,
                            color = ZeusCyanAccent
                        )
                    }
                }

                Icon(
                    imageVector = Icons.AutoMirrored.Rounded.ArrowForward,
                    contentDescription = "Open database",
                    tint = highlightColor,
                    modifier = Modifier.size(16.dp)
                )
            }
        }
    }
}

