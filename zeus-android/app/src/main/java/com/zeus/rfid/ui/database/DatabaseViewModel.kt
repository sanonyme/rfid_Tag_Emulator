package com.zeus.rfid.ui.database

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.zeus.rfid.util.NetworkUtils
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.net.InetSocketAddress
import java.net.Socket
import java.sql.Connection
import java.sql.DriverManager
import java.sql.ResultSetMetaData
import java.util.Properties

data class DatabaseUiState(
    val connection: DbConnectionConfig = DbConnectionConfig(
        host = NetworkUtils.getLocalIpAddress() ?: "127.0.0.1",
        port = 3306,
        user = "root",
        pass = "",
        databaseName = ""
    ),
    val isConnected: Boolean = false,
    val isConnecting: Boolean = false,
    val connectionError: String? = null,
    val pingMs: Long = 0,
    val activeSubTab: Int = 0, // 0: Tables, 1: SQL Console, 2: Built-in Queries, 3: Schema Structure
    val availableDatabases: List<DbDatabaseNode> = emptyList(),
    val selectedDatabaseName: String = "",
    val databaseSearchQuery: String = "",
    val isDatabasesLoading: Boolean = false,
    val isTablesLoading: Boolean = false,
    val availableTables: List<DbTableInfo> = emptyList(),
    val selectedTableName: String = "",
    val tableSearchQuery: String = "",
    val activeTableResult: DbQueryResult? = null,
    val isTableLoading: Boolean = false,
    val sqlQueryText: String = "SELECT * FROM container LIMIT 10;",
    val isSqlRunning: Boolean = false,
    val sqlResult: DbQueryResult? = null,
    val queryHistory: List<String> = emptyList(),
    val selectedBuiltinQuery: BuiltinRfidQueryId = BuiltinRfidQueryId.CONTAINER_BY_SSCC,
    val builtinQueryParam: String = "006141411234567890",
    val builtinQueryResult: DbQueryResult? = null,
    val showConnectionSheet: Boolean = false
) {
    val filteredDatabases: List<DbDatabaseNode>
        get() {
            val q = databaseSearchQuery.trim().lowercase()
            return if (q.isBlank()) availableDatabases
            else availableDatabases.filter { it.name.lowercase().contains(q) }
        }
}

class DatabaseViewModel : ViewModel() {

    private val _uiState = MutableStateFlow(DatabaseUiState())
    val uiState: StateFlow<DatabaseUiState> = _uiState.asStateFlow()

    private var activeConnection: Connection? = null

    override fun onCleared() {
        super.onCleared()
        closeConnection()
    }

    private fun closeConnection() {
        try {
            activeConnection?.close()
        } catch (_: Exception) {}
        activeConnection = null
    }

    fun setSubTab(index: Int) {
        _uiState.update { it.copy(activeSubTab = index) }
    }

    fun setTableSearchQuery(query: String) {
        _uiState.update { it.copy(tableSearchQuery = query) }
    }

    fun setSqlQueryText(text: String) {
        _uiState.update { it.copy(sqlQueryText = text) }
    }

    fun setSelectedBuiltinQuery(id: BuiltinRfidQueryId) {
        val defaultParam = when (id) {
            BuiltinRfidQueryId.CONTAINER_BY_SSCC -> "006141411234567890"
            BuiltinRfidQueryId.ORDER_BY_NUMBER -> "SO-12345"
            BuiltinRfidQueryId.ITEM_BY_BARCODE -> "09521234123453"
            BuiltinRfidQueryId.ITEMS_IN_CONTAINER -> "006141411234567890"
        }
        _uiState.update {
            it.copy(
                selectedBuiltinQuery = id,
                builtinQueryParam = defaultParam
            )
        }
    }

    fun setBuiltinQueryParam(param: String) {
        _uiState.update { it.copy(builtinQueryParam = param) }
    }

    fun setConnectionSheetVisible(visible: Boolean) {
        _uiState.update { it.copy(showConnectionSheet = visible) }
    }

    fun updateEngine(engine: DbEngine) {
        _uiState.update {
            it.copy(
                connection = it.connection.copy(
                    engine = engine,
                    port = engine.defaultPort
                ),
                connectionError = null
            )
        }
    }

    fun updateConnectionDraft(
        host: String,
        port: Int,
        user: String,
        pass: String,
        dbName: String,
        useSsl: Boolean
    ) {
        _uiState.update {
            it.copy(
                connection = it.connection.copy(
                    host = host,
                    port = port,
                    user = user,
                    pass = pass,
                    databaseName = dbName,
                    useSsl = useSsl
                ),
                connectionError = null
            )
        }
    }

    fun connect(config: DbConnectionConfig = _uiState.value.connection) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    connection = config,
                    isConnecting = true,
                    connectionError = null,
                    showConnectionSheet = false
                )
            }

            try {
                withContext(Dispatchers.IO) {
                    val targetHost = config.host.trim().ifBlank { "127.0.0.1" }
                    val targetPort = if (config.port in 1..65535) config.port else config.engine.defaultPort

                    // Fast TCP reachability probe (3.5s timeout)
                    try {
                        Socket().use { sock ->
                            sock.connect(InetSocketAddress(targetHost, targetPort), 3500)
                        }
                    } catch (e: Exception) {
                        throw RuntimeException("Could not reach $targetHost:$targetPort (${e.message ?: "Connection refused"}). Ensure MySQL/PostgreSQL server is running and port is accessible.")
                    }

                    // Load JDBC Driver
                    if (config.engine == DbEngine.MYSQL) {
                        Class.forName("org.mariadb.jdbc.Driver")
                    } else {
                        Class.forName("org.postgresql.Driver")
                    }

                    val url = if (config.engine == DbEngine.MYSQL) {
                        val dbPart = if (config.databaseName.isNotBlank()) "/${config.databaseName.trim()}" else ""
                        "jdbc:mariadb://$targetHost:$targetPort$dbPart?connectTimeout=5000&socketTimeout=10000"
                    } else {
                        val dbPart = if (config.databaseName.isNotBlank()) "/${config.databaseName.trim()}" else "/postgres"
                        "jdbc:postgresql://$targetHost:$targetPort$dbPart?connectTimeout=5&socketTimeout=10"
                    }

                    val props = Properties().apply {
                        put("user", config.user.trim())
                        put("password", config.pass)
                        if (config.useSsl) {
                            if (config.engine == DbEngine.MYSQL) put("sslMode", "trust")
                            else put("sslmode", "require")
                        }
                    }

                    val startTime = System.currentTimeMillis()
                    val conn = DriverManager.getConnection(url, props)
                    val ping = System.currentTimeMillis() - startTime

                    closeConnection()
                    activeConnection = conn

                    // Fetch databases on server (matching Zeus Electron)
                    val dbs = mutableListOf<DbDatabaseNode>()
                    try {
                        val stmt = conn.createStatement()
                        val query = if (config.engine == DbEngine.MYSQL) {
                            "SHOW DATABASES;"
                        } else {
                            "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;"
                        }
                        val rs = stmt.executeQuery(query)
                        val sysNames = if (config.engine == DbEngine.MYSQL) {
                            setOf("information_schema", "mysql", "performance_schema", "sys")
                        } else {
                            setOf("postgres", "template0", "template1")
                        }
                        while (rs.next()) {
                            val dbName = rs.getString(1) ?: continue
                            dbs.add(DbDatabaseNode(name = dbName, isSystem = sysNames.contains(dbName.lowercase())))
                        }
                        rs.close()
                        stmt.close()
                    } catch (_: Exception) {}

                    val sortedDbs = dbs.sortedWith(
                        compareBy<DbDatabaseNode> { it.isSystem }.thenBy { it.name.lowercase() }
                    )

                    _uiState.update {
                        it.copy(
                            isConnected = true,
                            isConnecting = false,
                            connectionError = null,
                            pingMs = ping,
                            availableDatabases = sortedDbs,
                            selectedDatabaseName = "",
                            availableTables = emptyList(),
                            selectedTableName = "",
                            activeTableResult = null
                        )
                    }

                    // If user specified an explicit non-blank database name in login draft, auto-select it
                    if (config.databaseName.isNotBlank() && sortedDbs.any { it.name.equals(config.databaseName.trim(), ignoreCase = true) }) {
                        selectDatabase(config.databaseName.trim())
                    }
                }
            } catch (e: Exception) {
                closeConnection()
                _uiState.update {
                    it.copy(
                        isConnected = false,
                        isConnecting = false,
                        connectionError = e.localizedMessage ?: e.message ?: "Failed to connect to database"
                    )
                }
            }
        }
    }

    fun setDatabaseSearchQuery(query: String) {
        _uiState.update { it.copy(databaseSearchQuery = query) }
    }

    fun selectDatabase(databaseName: String) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    selectedDatabaseName = databaseName,
                    isTablesLoading = true,
                    availableTables = emptyList(),
                    selectedTableName = "",
                    activeTableResult = null
                )
            }
            withContext(Dispatchers.IO) {
                try {
                    val conn = activeConnection ?: return@withContext
                    if (_uiState.value.connection.engine == DbEngine.MYSQL) {
                        val stmt = conn.createStatement()
                        stmt.execute("USE `$databaseName`;")
                        stmt.close()
                    } else {
                        conn.catalog = databaseName
                    }

                    val tables = fetchTablesForDatabase(conn, databaseName, _uiState.value.connection.engine)
                    _uiState.update {
                        it.copy(
                            availableTables = tables,
                            selectedTableName = tables.firstOrNull()?.name ?: "",
                            isTablesLoading = false
                        )
                    }

                    if (tables.isNotEmpty()) {
                        loadTableDataInternal(tables.first().name)
                    }
                } catch (e: Exception) {
                    _uiState.update {
                        it.copy(
                            isTablesLoading = false,
                            connectionError = "Error loading database $databaseName: ${e.message}"
                        )
                    }
                }
            }
        }
    }

    fun clearSelectedDatabase() {
        _uiState.update {
            it.copy(
                selectedDatabaseName = "",
                availableTables = emptyList(),
                selectedTableName = "",
                activeTableResult = null
            )
        }
    }

    private fun fetchTablesForDatabase(conn: Connection, dbName: String, engine: DbEngine): List<DbTableInfo> {
        val tables = mutableListOf<DbTableInfo>()
        try {
            val md = conn.metaData
            val rs = md.getTables(
                dbName,
                if (engine == DbEngine.POSTGRESQL) "public" else null,
                "%",
                arrayOf("TABLE", "VIEW")
            )
            while (rs.next()) {
                val tName = rs.getString("TABLE_NAME") ?: continue
                tables.add(DbTableInfo(name = tName))
            }
            rs.close()
        } catch (_: Exception) {}

        if (tables.isEmpty()) {
            try {
                val stmt = conn.createStatement()
                val query = if (engine == DbEngine.MYSQL) {
                    "SHOW TABLES;"
                } else {
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
                }
                val rs = stmt.executeQuery(query)
                while (rs.next()) {
                    val tName = rs.getString(1) ?: continue
                    tables.add(DbTableInfo(name = tName))
                }
                rs.close()
                stmt.close()
            } catch (_: Exception) {}
        }
        return tables.sortedBy { it.name.lowercase() }
    }

    fun disconnect() {
        closeConnection()
        _uiState.update {
            it.copy(
                isConnected = false,
                isConnecting = false,
                connectionError = null,
                availableDatabases = emptyList(),
                selectedDatabaseName = "",
                availableTables = emptyList(),
                selectedTableName = "",
                activeTableResult = null,
                sqlResult = null,
                builtinQueryResult = null
            )
        }
    }

    fun selectTableName(name: String) {
        _uiState.update { it.copy(selectedTableName = name) }
        viewModelScope.launch {
            loadTableDataInternal(name)
        }
    }

    private suspend fun loadTableDataInternal(tableName: String) {
        val conn = activeConnection ?: return
        if (tableName.isBlank()) return

        withContext(Dispatchers.IO) {
            _uiState.update { it.copy(isTableLoading = true) }
            try {
                val start = System.currentTimeMillis()
                val stmt = conn.createStatement()
                val sql = DatabaseSql.tablePreview(tableName, _uiState.value.connection.engine)
                stmt.queryTimeout = 30
                val rs = stmt.executeQuery(sql)
                val elapsed = System.currentTimeMillis() - start

                val md = rs.metaData
                val colCount = md.columnCount
                val columns = (1..colCount).map { md.getColumnLabel(it) }
                val columnMetas = (1..colCount).map { idx ->
                    DbColumnMeta(
                        name = md.getColumnLabel(idx),
                        type = md.getColumnTypeName(idx),
                        isNullable = md.isNullable(idx) == ResultSetMetaData.columnNullable
                    )
                }

                val rows = mutableListOf<List<String>>()
                while (rs.next() && rows.size < 50) {
                    val row = (1..colCount).map { idx ->
                        rs.getString(idx) ?: "NULL"
                    }
                    rows.add(row)
                }
                rs.close()
                stmt.close()

                val queryResult = DbQueryResult(
                    querySql = sql,
                    columns = columns,
                    rows = rows,
                    executionTimeMs = elapsed,
                    rowCount = rows.size
                )

                _uiState.update { state ->
                    val updatedTables = state.availableTables.map { t ->
                        if (t.name.equals(tableName, ignoreCase = true)) {
                            t.copy(columns = columnMetas, rowCount = rows.size)
                        } else t
                    }
                    state.copy(
                        isTableLoading = false,
                        activeTableResult = queryResult,
                        availableTables = updatedTables
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isTableLoading = false,
                        activeTableResult = DbQueryResult(
                            querySql = "SELECT * FROM `$tableName` LIMIT 50;",
                            columns = listOf("Error"),
                            rows = listOf(listOf(e.localizedMessage ?: "Query execution failed")),
                            executionTimeMs = 0,
                            rowCount = 0,
                            errorMessage = e.localizedMessage
                        )
                    )
                }
            }
        }
    }

    fun executeCustomSql() {
        val sql = _uiState.value.sqlQueryText.trim()
        if (sql.isBlank()) return

        val conn = activeConnection
        if (conn == null) {
            _uiState.update {
                it.copy(
                    sqlResult = DbQueryResult(
                        querySql = sql,
                        columns = listOf("Error"),
                        rows = listOf(listOf("Not connected to database. Please connect above.")),
                        executionTimeMs = 0,
                        rowCount = 0,
                        errorMessage = "Not connected"
                    )
                )
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSqlRunning = true) }
            withContext(Dispatchers.IO) {
                try {
                    val start = System.currentTimeMillis()
                    val stmt = conn.createStatement()
                    stmt.maxRows = DatabaseSql.MAX_ROWS
                    stmt.queryTimeout = 30
                    val isResultSet = stmt.execute(sql)
                    val elapsed = System.currentTimeMillis() - start

                    val result = if (isResultSet) {
                        val rs = stmt.resultSet
                        val md = rs.metaData
                        val colCount = md.columnCount
                        val columns = (1..colCount).map { md.getColumnLabel(it) }
                        val rows = mutableListOf<List<String>>()
                        while (rs.next() && rows.size < DatabaseSql.MAX_ROWS) {
                            rows.add((1..colCount).map { rs.getString(it) ?: "NULL" })
                        }
                        rs.close()
                        DbQueryResult(
                            querySql = sql,
                            columns = columns,
                            rows = rows,
                            executionTimeMs = elapsed,
                            rowCount = rows.size
                        )
                    } else {
                        val count = stmt.updateCount
                        DbQueryResult(
                            querySql = sql,
                            columns = listOf("Result"),
                            rows = listOf(listOf("Query OK, $count row(s) affected")),
                            executionTimeMs = elapsed,
                            rowCount = count
                        )
                    }
                    stmt.close()

                    _uiState.update { state ->
                        val newHistory = (listOf(sql) + state.queryHistory).distinct().take(10)
                        state.copy(
                            isSqlRunning = false,
                            sqlResult = result,
                            queryHistory = newHistory
                        )
                    }
                } catch (e: Exception) {
                    _uiState.update {
                        it.copy(
                            isSqlRunning = false,
                            sqlResult = DbQueryResult(
                                querySql = sql,
                                columns = listOf("SQL Error"),
                                rows = listOf(listOf(e.localizedMessage ?: "Query execution failed")),
                                executionTimeMs = 0,
                                rowCount = 0,
                                errorMessage = e.localizedMessage
                            )
                        )
                    }
                }
            }
        }
    }

    fun executeBuiltinQuery() {
        val qId = _uiState.value.selectedBuiltinQuery
        val param = _uiState.value.builtinQueryParam.trim()
        val sql = DatabaseSql.builtin(qId, _uiState.value.connection.engine)

        val conn = activeConnection
        if (conn == null) {
            _uiState.update {
                it.copy(
                    builtinQueryResult = DbQueryResult(
                        querySql = sql,
                        columns = listOf("Status"),
                        rows = listOf(listOf("Please connect to database to run this query.")),
                        executionTimeMs = 0,
                        rowCount = 0,
                        errorMessage = "Not connected"
                    )
                )
            }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSqlRunning = true) }
            withContext(Dispatchers.IO) {
                try {
                    val start = System.currentTimeMillis()
                    val stmt = conn.prepareStatement(sql)
                    stmt.setString(1, param)
                    stmt.maxRows = DatabaseSql.MAX_ROWS
                    stmt.queryTimeout = 30
                    val rs = stmt.executeQuery()
                    val elapsed = System.currentTimeMillis() - start

                    val md = rs.metaData
                    val colCount = md.columnCount
                    val columns = (1..colCount).map { md.getColumnLabel(it) }
                    val rows = mutableListOf<List<String>>()
                    while (rs.next() && rows.size < DatabaseSql.MAX_ROWS) {
                        rows.add((1..colCount).map { rs.getString(it) ?: "NULL" })
                    }
                    rs.close()
                    stmt.close()

                    val result = DbQueryResult(
                        querySql = sql,
                        columns = columns,
                        rows = rows,
                        executionTimeMs = elapsed,
                        rowCount = rows.size
                    )

                    _uiState.update {
                        it.copy(
                            isSqlRunning = false,
                            builtinQueryResult = result
                        )
                    }
                } catch (e: Exception) {
                    _uiState.update {
                        it.copy(
                            isSqlRunning = false,
                            builtinQueryResult = DbQueryResult(
                                querySql = sql,
                                columns = listOf("Error"),
                                rows = listOf(listOf(e.localizedMessage ?: "Query execution failed")),
                                executionTimeMs = 0,
                                rowCount = 0,
                                errorMessage = e.localizedMessage
                            )
                        )
                    }
                }
            }
        }
    }
}
