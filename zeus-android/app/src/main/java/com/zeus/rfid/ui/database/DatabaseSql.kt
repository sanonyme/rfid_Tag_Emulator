package com.zeus.rfid.ui.database

/** Desktop-compatible identifier validation and engine-specific SQL generation. */
object DatabaseSql {
    const val MAX_ROWS = 1000
    private val identifier = Regex("[A-Za-z0-9_$]+")

    fun quoteIdentifier(name: String, engine: DbEngine): String {
        val clean = name.trim()
        require(identifier.matches(clean)) { "Unsupported SQL identifier: $name" }
        val quote = if (engine == DbEngine.POSTGRESQL) '"' else '`'
        return "$quote$clean$quote"
    }

    fun tablePreview(name: String, engine: DbEngine): String =
        "SELECT * FROM ${quoteIdentifier(name, engine)} LIMIT 50;"

    /** Values are bound separately through JDBC, never interpolated into SQL. */
    fun builtin(id: BuiltinRfidQueryId, engine: DbEngine): String {
        fun q(name: String) = quoteIdentifier(name, engine)
        return when (id) {
            BuiltinRfidQueryId.CONTAINER_BY_SSCC ->
                "SELECT * FROM container WHERE sscc = ? LIMIT $MAX_ROWS;"
            BuiltinRfidQueryId.ORDER_BY_NUMBER ->
                "SELECT * FROM ${q("order")} WHERE ${q("orderNumber")} = ? LIMIT $MAX_ROWS;"
            BuiltinRfidQueryId.ITEM_BY_BARCODE ->
                "SELECT * FROM item WHERE barcode = ? LIMIT $MAX_ROWS;"
            BuiltinRfidQueryId.ITEMS_IN_CONTAINER ->
                "SELECT c.sscc, c.id AS ${q("containerId")}, ci.id AS ${q("containerItemId")}, ci.quantity, i.* " +
                    "FROM container c INNER JOIN container_item ci ON ci.${q("containerId")} = c.id " +
                    "AND COALESCE(ci.deleted, 0) = 0 INNER JOIN item i ON i.id = ci.${q("itemId")} " +
                    "WHERE c.sscc = ? LIMIT $MAX_ROWS;"
        }
    }
}
