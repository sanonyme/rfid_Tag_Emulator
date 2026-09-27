package com.zeus.rfid.ui.database

import org.junit.Assert.*
import org.junit.Test

class DatabaseSqlTest {
    @Test fun tablePreviewsUseTheSelectedDatabaseDialect() {
        assertEquals("SELECT * FROM `order` LIMIT 50;", DatabaseSql.tablePreview("order", DbEngine.MYSQL))
        assertEquals("SELECT * FROM \"order\" LIMIT 50;", DatabaseSql.tablePreview("order", DbEngine.POSTGRESQL))
    }

    @Test(expected = IllegalArgumentException::class)
    fun tableNamesCannotIntroduceSql() {
        DatabaseSql.tablePreview("item; DROP TABLE item", DbEngine.MYSQL)
    }

    @Test fun builtinsBindValuesAndKeepDesktopContainerSemantics() {
        for (engine in DbEngine.entries) {
            for (id in BuiltinRfidQueryId.entries) {
                val sql = DatabaseSql.builtin(id, engine)
                assertEquals(1, sql.count { it == '?' })
                assertTrue(sql.endsWith("LIMIT 1000;"))
            }
            val items = DatabaseSql.builtin(BuiltinRfidQueryId.ITEMS_IN_CONTAINER, engine)
            assertTrue(items.contains("COALESCE(ci.deleted, 0) = 0"))
            assertTrue(items.contains("i.*"))
        }
        assertTrue(DatabaseSql.builtin(BuiltinRfidQueryId.ORDER_BY_NUMBER, DbEngine.POSTGRESQL)
            .contains("\"orderNumber\" = ?"))
    }
}
