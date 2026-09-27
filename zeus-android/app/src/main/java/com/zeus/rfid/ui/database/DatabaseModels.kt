package com.zeus.rfid.ui.database

/**
 * Supported database engines in Zeus.
 */
enum class DbEngine(val label: String, val defaultPort: Int) {
    MYSQL("MySQL", 3306),
    POSTGRESQL("PostgreSQL", 5432)
}

/**
 * Connection credentials and profile configuration.
 */
data class DbConnectionConfig(
    val engine: DbEngine = DbEngine.MYSQL,
    val host: String = "127.0.0.1",
    val port: Int = 3306,
    val databaseName: String = "",
    val user: String = "root",
    val pass: String = "",
    val useSsl: Boolean = false
)

/**
 * Database node matching Zeus Electron schema tree.
 */
data class DbDatabaseNode(
    val name: String,
    val isSystem: Boolean = false,
    val tableCount: Int? = null,
    val sizeBytes: Long? = null
)

/**
 * Column metadata for schema display.
 */
data class DbColumnMeta(
    val name: String,
    val type: String,
    val isPrimaryKey: Boolean = false,
    val isNullable: Boolean = true
)

/**
 * Table metadata and row count.
 */
data class DbTableInfo(
    val name: String,
    val rowCount: Int = -1,
    val columns: List<DbColumnMeta> = emptyList(),
    val description: String = ""
)

/**
 * Generic query execution result for the SQL console and data grid.
 */
data class DbQueryResult(
    val querySql: String,
    val columns: List<String>,
    val rows: List<List<String>>,
    val executionTimeMs: Long,
    val rowCount: Int,
    val errorMessage: String? = null
)

/**
 * Predefined RFID lookup queries matching the electron Zeus app.
 */
enum class BuiltinRfidQueryId {
    CONTAINER_BY_SSCC,
    ORDER_BY_NUMBER,
    ITEM_BY_BARCODE,
    ITEMS_IN_CONTAINER
}

data class BuiltinRfidQuery(
    val id: BuiltinRfidQueryId,
    val label: String,
    val description: String,
    val paramLabel: String,
    val defaultParam: String,
    val placeholder: String
)
