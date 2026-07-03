use super::events;
use mysql_async::{prelude::Queryable, Conn, OptsBuilder, Row, Value as MysqlValue};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;
use tauri::AppHandle;

const DB_QUERY_MAX_ROWS: usize = 1000;
const DB_IMPORT_MAX_ROWS: usize = 10_000;
const DB_EXPORT_BATCH_SIZE: usize = 10_000;

#[derive(Clone)]
struct TableMeta {
    column_types: HashMap<String, String>,
    primary_keys: Vec<String>,
    row_estimate: u64,
}

pub struct DbService {
    inner: Mutex<DbInner>,
}

struct DbInner {
    conn: Option<Conn>,
    current_database: Option<String>,
    table_meta_cache: HashMap<String, TableMeta>,
}

impl DbService {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(DbInner {
                conn: None,
                current_database: None,
                table_meta_cache: HashMap::new(),
            }),
        }
    }

    pub async fn invoke(&self, app: &AppHandle, channel: &str, args: &[Value]) -> Result<Value, String> {
        match channel {
            "db-connect" => {
                self.connect(
                    &arg_str(args, 0)?,
                    &arg_str(args, 1)?,
                    &arg_str(args, 2)?,
                )
                .await
            }
            "db-disconnect" => {
                self.disconnect().await;
                Ok(Value::Null)
            }
            "db-list-databases" => self.list_databases().await,
            "db-get-tables" => self.get_tables(&arg_str(args, 0)?).await,
            "db-get-table-data" => {
                let limit = args.get(2).and_then(|v| v.as_u64()).unwrap_or(1000) as usize;
                let offset = args.get(3).and_then(|v| v.as_u64()).unwrap_or(0) as usize;
                self.get_table_data(&arg_str(args, 0)?, &arg_str(args, 1)?, limit, offset)
                    .await
            }
            "db-execute-query" => {
                let db = args.get(1).and_then(|v| v.as_str()).map(String::from);
                self.execute_query(&arg_str(args, 0)?, db.as_deref()).await
            }
            "db-get-primary-keys" => {
                Ok(Value::Array(
                    self.get_primary_keys(&arg_str(args, 0)?, &arg_str(args, 1)?)
                        .await
                        .into_iter()
                        .map(Value::String)
                        .collect(),
                ))
            }
            "db-update-cell" => {
                let pks = args
                    .get(2)
                    .and_then(|v| v.as_object())
                    .cloned()
                    .unwrap_or_default();
                self.update_cell(
                    &arg_str(args, 0)?,
                    &arg_str(args, 1)?,
                    pks,
                    &arg_str(args, 3)?,
                    args.get(4).cloned().unwrap_or(Value::Null),
                )
                .await
            }
            "db-get-table-structure" => {
                self.get_table_structure(&arg_str(args, 0)?, &arg_str(args, 1)?)
                    .await
            }
            "db-delete-row" => {
                let pks = args
                    .get(2)
                    .and_then(|v| v.as_object())
                    .cloned()
                    .unwrap_or_default();
                self.delete_row(&arg_str(args, 0)?, &arg_str(args, 1)?, pks)
                    .await
            }
            "db-insert-row" => {
                let vals = args
                    .get(2)
                    .and_then(|v| v.as_object())
                    .cloned()
                    .unwrap_or_default();
                self.insert_row(&arg_str(args, 0)?, &arg_str(args, 1)?, vals)
                    .await
            }
            "db-delete-rows" => {
                let rows = args
                    .get(2)
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                self.delete_rows(&arg_str(args, 0)?, &arg_str(args, 1)?, rows)
                    .await
            }
            "db-export-table" => {
                self.export_table(&arg_str(args, 0)?, &arg_str(args, 1)?)
                    .await
            }
            "db-export-database-sql" => {
                self.export_database_sql(&arg_str(args, 0)?).await
            }
            "db-import-rows" => {
                let rows = args
                    .get(2)
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                self.import_rows(&arg_str(args, 0)?, &arg_str(args, 1)?, rows)
                    .await
            }
            "db-get-database-schema" => {
                self.get_database_schema(&arg_str(args, 0)?).await
            }
            "db-save-export-table-to-path" => {
                self.save_export_table_to_path(
                    app,
                    &arg_str(args, 0)?,
                    &arg_str(args, 1)?,
                    &arg_str(args, 2)?,
                    &arg_str(args, 3)?,
                )
                .await
            }
            "db-save-export-database-sql-to-path" => {
                self.save_export_database_sql_to_path(app, &arg_str(args, 0)?, &arg_str(args, 1)?)
                    .await
            }
            "db-save-export-database-csv-to-path" => {
                self.save_export_database_csv_to_path(app, &arg_str(args, 0)?, &arg_str(args, 1)?)
                    .await
            }
            _ => Err(format!("Unknown db channel `{channel}`")),
        }
    }
}

impl DbInner {
    async fn require_conn(&mut self) -> Result<&mut Conn, Value> {
        match self.conn.as_mut() {
            Some(c) => Ok(c),
            None => Err(json!({ "ok": false, "error": "Not connected" })),
        }
    }
}

impl DbService {
    async fn disconnect(&self) {
        let mut inner = self.inner.lock().await;
        if let Some(conn) = inner.conn.take() {
            let _ = conn.disconnect().await;
        }
        inner.current_database = None;
        inner.table_meta_cache.clear();
    }

    async fn connect(&self, host: &str, user: &str, password: &str) -> Result<Value, String> {
        self.disconnect().await;
        let opts = OptsBuilder::default()
            .ip_or_hostname(host)
            .user(Some(user))
            .pass(Some(password));
        let conn = Conn::new(opts)
            .await
            .map_err(|e| e.to_string())?;
        let mut inner = self.inner.lock().await;
        inner.conn = Some(conn);
        drop(inner);
        self.list_databases().await
    }

    async fn list_databases(&self) -> Result<Value, String> {
        let mut inner = self.inner.lock().await;
        let conn = match inner.require_conn().await {
            Ok(c) => c,
            Err(v) => return Ok(v),
        };
        let rows: Vec<Row> = conn
            .query("SHOW DATABASES")
            .await
            .map_err(|e| e.to_string())?;
        let databases: Vec<String> = rows
            .into_iter()
            .filter_map(|r| row_string(&r, 0))
            .collect();
        Ok(json!({ "ok": true, "databases": databases }))
    }

    async fn select_database(&self, database: &str) -> Result<(), Value> {
        let safe = assert_safe_identifier(database).ok_or_else(|| {
            json!({ "ok": false, "error": "Invalid database name" })
        })?;
        let mut inner = self.inner.lock().await;
        if inner.current_database.as_deref() == Some(&safe) {
            return Ok(());
        }
        let conn = inner.require_conn().await?;
        let sql = format!("USE `{safe}`");
        conn.query_drop(sql)
            .await
            .map_err(|e| json!({ "ok": false, "error": e.to_string() }))?;
        inner.current_database = Some(safe);
        Ok(())
    }

    async fn get_tables(&self, database: &str) -> Result<Value, String> {
        let safe = match assert_safe_identifier(database) {
            Some(s) => s,
            None => return Ok(json!({ "ok": false, "error": "Invalid database name" })),
        };
        let mut inner = self.inner.lock().await;
        let conn = match inner.require_conn().await {
            Ok(c) => c,
            Err(v) => return Ok(v),
        };
        let rows: Vec<Row> = conn
            .exec(
                "SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES \
                 WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
                (safe,),
            )
            .await
            .map_err(|e| e.to_string())?;
        let tables: Vec<Value> = rows
            .into_iter()
            .filter_map(|r| {
                let name = row_string(&r, 0).or_else(|| row_string_col(&r, "TABLE_NAME"))?;
                Some(json!({
                    "name": name,
                    "rows": row_u64(&r, 1),
                }))
            })
            .collect();
        Ok(json!({ "ok": true, "tables": tables }))
    }

    async fn fetch_table_meta(&self, db: &str, table: &str) -> Result<TableMeta, String> {
        let mut inner = self.inner.lock().await;
        let key = format!("{db}\0{table}");
        if let Some(cached) = inner.table_meta_cache.get(&key) {
            return Ok(cached.clone());
        }
        let conn = inner
            .require_conn()
            .await
            .map_err(|v| v.get("error").and_then(|e| e.as_str()).unwrap_or("Not connected").to_string())?;
        let col_rows: Vec<Row> = conn
            .query(format!(
                "SHOW FULL COLUMNS FROM `{table}` FROM `{db}`"
            ))
            .await
            .map_err(|e| e.to_string())?;
        let mut column_types = HashMap::new();
        for r in &col_rows {
            if let (Some(field), Some(ty)) = (r.get::<String, _>(0), r.get::<String, _>(1)) {
                column_types.insert(field, ty);
            }
        }
        let pk_rows: Vec<Row> = conn
            .query(format!(
                "SHOW KEYS FROM `{table}` FROM `{db}` WHERE Key_name = 'PRIMARY'"
            ))
            .await
            .map_err(|e| e.to_string())?;
        let mut primary_keys: Vec<(u32, String)> = pk_rows
            .into_iter()
            .filter_map(|r| {
                Some((
                    r.get::<u32, _>("Seq_in_index")?,
                    r.get::<String, _>("Column_name")?,
                ))
            })
            .collect();
        primary_keys.sort_by_key(|(seq, _)| *seq);
        let primary_keys: Vec<String> = primary_keys.into_iter().map(|(_, c)| c).collect();
        let est_rows: Vec<Row> = conn
            .exec(
                "SELECT TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
                (db, table),
            )
            .await
            .map_err(|e| e.to_string())?;
        let row_estimate = est_rows
            .first()
            .and_then(|r| r.get::<u64, _>(0))
            .unwrap_or(0);
        let meta = TableMeta {
            column_types,
            primary_keys,
            row_estimate,
        };
        inner.table_meta_cache.insert(key, meta.clone());
        Ok(meta)
    }

    async fn get_table_data(
        &self,
        database: &str,
        table: &str,
        limit: usize,
        offset: usize,
    ) -> Result<Value, String> {
        let safe_db = match assert_safe_identifier(database) {
            Some(s) => s,
            None => return Ok(json!({ "ok": false, "error": "Invalid database or table name" })),
        };
        let safe_table = match assert_safe_identifier(table) {
            Some(s) => s,
            None => return Ok(json!({ "ok": false, "error": "Invalid database or table name" })),
        };
        if let Err(v) = self.select_database(&safe_db).await {
            return Ok(v);
        }
        let meta = self.fetch_table_meta(&safe_db, &safe_table).await?;
        let mut inner = self.inner.lock().await;
        let conn = match inner.require_conn().await {
            Ok(c) => c,
            Err(v) => return Ok(v),
        };
        let rows: Vec<Row> = conn
            .exec(
                format!("SELECT * FROM `{safe_table}` LIMIT ? OFFSET ?"),
                (limit as u64, offset as u64),
            )
            .await
            .map_err(|e| e.to_string())?;
        let columns: Vec<String> = if let Some(first) = rows.first() {
            first
                .columns_ref()
                .iter()
                .map(|c| c.name_str().to_string())
                .collect()
        } else {
            meta.column_types.keys().cloned().collect()
        };
        let json_rows: Vec<Value> = rows.iter().map(row_to_json).collect();
        let mut total = meta.row_estimate;
        if json_rows.len() < limit {
            total = (offset + json_rows.len()) as u64;
        } else {
            total = total.max((offset + limit + 1) as u64);
        }
        let col_types: Map<String, Value> = meta
            .column_types
            .iter()
            .map(|(k, v)| (k.clone(), Value::String(v.clone())))
            .collect();
        Ok(json!({
            "ok": true,
            "columns": columns,
            "rows": json_rows,
            "total": total,
            "columnTypes": col_types,
            "primaryKeys": meta.primary_keys,
        }))
    }

    async fn execute_query(&self, query: &str, database: Option<&str>) -> Result<Value, String> {
        if let Some(db) = database {
            if let Err(v) = self.select_database(db).await {
                return Ok(v);
            }
        }
        let mut sql = query.trim().to_string();
        let is_read = is_read_query(&sql);
        if is_read && !has_limit_clause(&sql) {
            sql = format!("{} LIMIT {}", sql.trim_end_matches(';'), DB_QUERY_MAX_ROWS);
        }
        let mut inner = self.inner.lock().await;
        let conn = match inner.require_conn().await {
            Ok(c) => c,
            Err(v) => return Ok(v),
        };
        if is_read {
            let rows: Vec<Row> = match conn.query(sql).await {
                Ok(r) => r,
                Err(e) => {
                    return Ok(json!({ "ok": false, "error": e.to_string() }));
                }
            };
            let columns: Vec<String> = rows
                .first()
                .map(|r| r.columns_ref().iter().map(|c| c.name_str().to_string()).collect())
                .unwrap_or_default();
            let json_rows: Vec<Value> = rows.iter().take(DB_QUERY_MAX_ROWS).map(row_to_json).collect();
            let truncated = rows.len() > DB_QUERY_MAX_ROWS;
            Ok(json!({
                "ok": true,
                "columns": columns,
                "rows": json_rows,
                "message": if truncated { Some(format!("Results truncated to {DB_QUERY_MAX_ROWS} rows")) } else { None },
            }))
        } else if let Err(e) = conn.query_drop(sql).await {
            Ok(json!({ "ok": false, "error": e.to_string() }))
        } else {
            let affected = conn.affected_rows();
            Ok(json!({
                "ok": true,
                "columns": [],
                "rows": [],
                "affectedRows": affected,
                "message": format!("Query OK, {affected} row(s) affected"),
            }))
        }
    }

    async fn get_primary_keys(&self, database: &str, table: &str) -> Vec<String> {
        let mut inner = self.inner.lock().await;
        let conn = match inner.require_conn().await {
            Ok(c) => c,
            Err(_) => return vec![],
        };
        let rows: Vec<Row> = match conn
            .exec(
                "SELECT COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE \
                 WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' \
                 ORDER BY ORDINAL_POSITION",
                (database, table),
            )
            .await
        {
            Ok(r) => r,
            Err(_) => return vec![],
        };
        rows.into_iter()
            .filter_map(|r| r.get::<String, _>(0))
            .collect()
    }

    async fn update_cell(
        &self,
        database: &str,
        table: &str,
        primary_keys: Map<String, Value>,
        column: &str,
        value: Value,
    ) -> Result<Value, String> {
        if let Err(v) = self.select_database(database).await {
            return Ok(v);
        }
        if primary_keys.is_empty() {
            return Ok(json!({ "ok": false, "error": "No primary key provided" }));
        }
        let where_clause: Vec<String> = primary_keys.keys().map(|k| format!("`{k}` = ?")).collect();
        let mut params: Vec<MysqlValue> = vec![json_to_mysql(value)];
        for k in primary_keys.keys() {
            params.push(json_to_mysql(primary_keys[k].clone()));
        }
        let sql = format!(
            "UPDATE `{table}` SET `{column}` = ? WHERE {} LIMIT 1",
            where_clause.join(" AND ")
        );
        let mut inner = self.inner.lock().await;
        let conn = match inner.require_conn().await {
            Ok(c) => c,
            Err(v) => return Ok(v),
        };
        conn.exec_drop(sql, params).await.map_err(|e| e.to_string())?;
        Ok(json!({ "ok": true, "affectedRows": 1 }))
    }

    async fn get_table_structure(&self, database: &str, table: &str) -> Result<Value, String> {
        let mut inner = self.inner.lock().await;
        let conn = match inner.require_conn().await {
            Ok(c) => c,
            Err(v) => return Ok(v),
        };
        let rows: Vec<Row> = conn
            .query(format!("SHOW FULL COLUMNS FROM `{table}` FROM `{database}`"))
            .await
            .map_err(|e| e.to_string())?;
        let columns: Vec<Value> = rows
            .into_iter()
            .filter_map(|r| {
                Some(json!({
                    "name": r.get::<String, _>("Field")?,
                    "type": r.get::<String, _>("Type")?,
                    "nullable": r.get::<String, _>("Null")? == "YES",
                    "defaultValue": r.get::<Option<String>, _>("Default").flatten(),
                    "key": r.get::<String, _>("Key").unwrap_or_default(),
                    "extra": r.get::<String, _>("Extra").unwrap_or_default(),
                    "comment": r.get::<String, _>("Comment").unwrap_or_default(),
                }))
            })
            .collect();
        Ok(json!({ "ok": true, "columns": columns }))
    }

    async fn delete_row(
        &self,
        database: &str,
        table: &str,
        primary_keys: Map<String, Value>,
    ) -> Result<Value, String> {
        if let Err(v) = self.select_database(database).await {
            return Ok(v);
        }
        if primary_keys.is_empty() {
            return Ok(json!({ "ok": false, "error": "No primary key provided" }));
        }
        let where_clause: Vec<String> = primary_keys.keys().map(|k| format!("`{k}` = ?")).collect();
        let params: Vec<MysqlValue> = primary_keys
            .values()
            .cloned()
            .map(json_to_mysql)
            .collect();
        let sql = format!(
            "DELETE FROM `{table}` WHERE {} LIMIT 1",
            where_clause.join(" AND ")
        );
        let mut inner = self.inner.lock().await;
        let conn = match inner.require_conn().await {
            Ok(c) => c,
            Err(v) => return Ok(v),
        };
        conn.exec_drop(sql, params).await.map_err(|e| e.to_string())?;
        Ok(json!({ "ok": true, "affectedRows": 1 }))
    }

    async fn insert_row(
        &self,
        database: &str,
        table: &str,
        values: Map<String, Value>,
    ) -> Result<Value, String> {
        if let Err(v) = self.select_database(database).await {
            return Ok(v);
        }
        if values.is_empty() {
            return Ok(json!({ "ok": false, "error": "No columns to insert" }));
        }
        let cols: Vec<String> = values.keys().map(|k| format!("`{k}`")).collect();
        let placeholders = std::iter::repeat("?").take(values.len()).collect::<Vec<_>>().join(", ");
        let params: Vec<MysqlValue> = values.values().cloned().map(json_to_mysql).collect();
        let sql = format!(
            "INSERT INTO `{table}` ({}) VALUES ({placeholders})",
            cols.join(", ")
        );
        let mut inner = self.inner.lock().await;
        let conn = match inner.require_conn().await {
            Ok(c) => c,
            Err(v) => return Ok(v),
        };
        conn.exec_drop(sql, params).await.map_err(|e| e.to_string())?;
        Ok(json!({ "ok": true, "insertId": 0 }))
    }

    async fn delete_rows(
        &self,
        database: &str,
        table: &str,
        rows: Vec<Value>,
    ) -> Result<Value, String> {
        if let Err(v) = self.select_database(database).await {
            return Ok(v);
        }
        let pk_cols = self.get_primary_keys(database, table).await;
        if pk_cols.is_empty() {
            return Ok(json!({ "ok": false, "error": "No primary key on table" }));
        }
        let mut total = 0u64;
        for row in rows {
            let obj = match row.as_object() {
                Some(o) => o,
                None => continue,
            };
            let mut pk_map = Map::new();
            for col in &pk_cols {
                if let Some(v) = obj.get(col) {
                    pk_map.insert(col.clone(), v.clone());
                } else {
                    return Ok(json!({ "ok": false, "error": "Row missing primary key field" }));
                }
            }
            let r = self.delete_row(database, table, pk_map).await?;
            if r.get("ok").and_then(|v| v.as_bool()) == Some(true) {
                total += 1;
            }
        }
        Ok(json!({ "ok": true, "affectedRows": total }))
    }

    async fn export_table(&self, database: &str, table: &str) -> Result<Value, String> {
        if let Err(v) = self.select_database(database).await {
            return Ok(v);
        }
        let mut inner = self.inner.lock().await;
        let conn = match inner.require_conn().await {
            Ok(c) => c,
            Err(v) => return Ok(v),
        };
        let count_rows: Vec<Row> = conn
            .query(format!("SELECT COUNT(*) as cnt FROM `{table}`"))
            .await
            .map_err(|e| e.to_string())?;
        let total = count_rows
            .first()
            .and_then(|r| r.get::<i64, _>(0))
            .unwrap_or(0) as u64;
        let col_rows: Vec<Row> = conn
            .query(format!("SHOW FULL COLUMNS FROM `{table}` FROM `{database}`"))
            .await
            .map_err(|e| e.to_string())?;
        let columns: Vec<String> = col_rows
            .into_iter()
            .filter_map(|r| r.get::<String, _>(0))
            .collect();
        let mut all_rows = Vec::new();
        let batch_size = 5000usize;
        let mut offset = 0usize;
        loop {
            let batch: Vec<Row> = conn
                .exec(
                    format!("SELECT * FROM `{table}` LIMIT ? OFFSET ?"),
                    (batch_size as u64, offset as u64),
                )
                .await
                .map_err(|e| e.to_string())?;
            if batch.is_empty() {
                break;
            }
            offset += batch.len();
            all_rows.extend(batch.iter().map(row_to_json));
        }
        Ok(json!({ "ok": true, "columns": columns, "rows": all_rows, "total": total }))
    }

    async fn export_database_sql(&self, database: &str) -> Result<Value, String> {
        let safe_db = match assert_safe_identifier(database) {
            Some(s) => s,
            None => return Ok(json!({ "ok": false, "error": "Invalid database name" })),
        };
        if let Err(v) = self.select_database(&safe_db).await {
            return Ok(v);
        }
        let tables_val = self.get_tables(&safe_db).await?;
        let tables = tables_val
            .get("tables")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let mut chunks = vec![
            format!("-- MySQL dump generated by Zeus pure Tauri\n-- Database: `{safe_db}`\n\n"),
            format!("CREATE DATABASE IF NOT EXISTS `{safe_db}`;\nUSE `{safe_db}`;\n\n"),
            "SET FOREIGN_KEY_CHECKS=0;\n\n".to_string(),
        ];
        for t in tables {
            let table_name = t.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let safe_table = match assert_safe_identifier(table_name) {
                Some(s) => s,
                None => continue,
            };
            let mut inner = self.inner.lock().await;
            let conn = match inner.require_conn().await {
                Ok(c) => c,
                Err(v) => return Ok(v),
            };
            let create_rows: Vec<Row> = conn
                .query(format!("SHOW CREATE TABLE `{safe_table}`"))
                .await
                .map_err(|e| e.to_string())?;
            drop(inner);
            let create_sql = create_rows
                .first()
                .and_then(|r| r.get::<String, _>(1))
                .unwrap_or_default();
            if create_sql.is_empty() {
                continue;
            }
            chunks.push(format!("--\n-- Table structure for table `{safe_table}`\n--\n\n"));
            chunks.push(format!("DROP TABLE IF EXISTS `{safe_table}`;\n"));
            chunks.push(format!("{create_sql};\n\n"));
            let data = self.export_table(&safe_db, &safe_table).await?;
            if data.get("ok").and_then(|v| v.as_bool()) != Some(true) {
                return Ok(data);
            }
            let columns: Vec<String> = data
                .get("columns")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|c| c.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            let rows = data.get("rows").and_then(|v| v.as_array()).cloned().unwrap_or_default();
            if !rows.is_empty() {
                chunks.push(format!("--\n-- Dumping data for table `{safe_table}`\n--\n\n"));
                chunks.push(format_sql_inserts(&safe_table, &columns, &rows));
                chunks.push("\n\n".to_string());
            }
        }
        chunks.push("SET FOREIGN_KEY_CHECKS=1;\n".to_string());
        Ok(json!({ "ok": true, "sql": chunks.join("") }))
    }

    async fn save_export_table_to_path(
        &self,
        app: &AppHandle,
        database: &str,
        table: &str,
        format: &str,
        file_path: &str,
    ) -> Result<Value, String> {
        let safe_db = match assert_safe_identifier(database) {
            Some(s) => s,
            None => return Ok(json!({ "ok": false, "error": "Invalid database or table name" })),
        };
        let safe_table = match assert_safe_identifier(table) {
            Some(s) => s,
            None => return Ok(json!({ "ok": false, "error": "Invalid database or table name" })),
        };
        let fmt = if format == "csv" { "csv" } else { "sql" };

        emit_export_progress(app, &format!("Preparing {safe_table}…"), None, None, None, None);

        if let Err(v) = self.select_database(&safe_db).await {
            return Ok(v);
        }

        let result = async {
            let mut inner = self.inner.lock().await;
            let conn = inner.require_conn().await.map_err(|v| v.to_string())?;

            let col_rows: Vec<Row> = conn
                .query(format!("SHOW FULL COLUMNS FROM `{safe_table}` FROM `{safe_db}`"))
                .await
                .map_err(|e| e.to_string())?;
            let columns: Vec<String> = col_rows
                .into_iter()
                .filter_map(|r| r.get::<String, _>(0))
                .collect();

            let count_rows: Vec<Row> = conn
                .query(format!("SELECT COUNT(*) as cnt FROM `{safe_table}`"))
                .await
                .map_err(|e| e.to_string())?;
            let total = count_rows
                .first()
                .and_then(|r| r.get::<i64, _>(0))
                .unwrap_or(0)
                .max(0) as u64;

            emit_export_progress(
                app,
                &format!("Exporting {safe_table}…"),
                Some(0),
                Some(total),
                None,
                None,
            );

            let mut file = tokio::fs::File::create(file_path)
                .await
                .map_err(|e| e.to_string())?;

            if fmt == "csv" {
                file.write_all(format!("{}\n", columns.join(",")).as_bytes())
                    .await
                    .map_err(|e| e.to_string())?;
            } else {
                file.write_all(format!("-- Table: {safe_db}.{safe_table}\n\n").as_bytes())
                    .await
                    .map_err(|e| e.to_string())?;
            }

            let mut offset = 0usize;
            let mut exported = 0u64;
            loop {
                let batch: Vec<Row> = conn
                    .exec(
                        format!("SELECT * FROM `{safe_table}` LIMIT ? OFFSET ?"),
                        (DB_EXPORT_BATCH_SIZE as u64, offset as u64),
                    )
                    .await
                    .map_err(|e| e.to_string())?;
                if batch.is_empty() {
                    break;
                }
                let json_rows: Vec<Value> = batch.iter().map(row_to_json).collect();
                if fmt == "csv" {
                    for row in &json_rows {
                        let line = format_csv_row(&columns, row);
                        file.write_all(format!("{line}\n").as_bytes())
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                } else if !json_rows.is_empty() {
                    let chunk = format_sql_inserts(&safe_table, &columns, &json_rows);
                    if !chunk.is_empty() {
                        file.write_all(format!("{chunk}\n").as_bytes())
                            .await
                            .map_err(|e| e.to_string())?;
                    }
                }
                exported += json_rows.len() as u64;
                offset += json_rows.len();
                emit_export_progress(
                    app,
                    &format!("Exporting {safe_table}…"),
                    Some(exported),
                    Some(total),
                    None,
                    None,
                );
                if json_rows.len() < DB_EXPORT_BATCH_SIZE {
                    break;
                }
            }

            file.flush().await.map_err(|e| e.to_string())?;
            Ok::<u64, String>(exported)
        }
        .await;

        match result {
            Ok(total) => Ok(json!({ "ok": true, "total": total, "filePath": file_path })),
            Err(e) => {
                let _ = tokio::fs::remove_file(file_path).await;
                Ok(json!({ "ok": false, "error": e }))
            }
        }
    }

    async fn save_export_database_sql_to_path(
        &self,
        app: &AppHandle,
        database: &str,
        file_path: &str,
    ) -> Result<Value, String> {
        let safe_db = match assert_safe_identifier(database) {
            Some(s) => s,
            None => return Ok(json!({ "ok": false, "error": "Invalid database name" })),
        };

        emit_export_progress(
            app,
            &format!("Preparing {safe_db} dump…"),
            None,
            None,
            None,
            None,
        );

        if let Err(v) = self.select_database(&safe_db).await {
            return Ok(v);
        }

        let tables_val = self.get_tables(&safe_db).await?;
        let tables = tables_val
            .get("tables")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let table_count = tables.len() as u64;

        let result = async {
            let mut file = tokio::fs::File::create(file_path)
                .await
                .map_err(|e| e.to_string())?;
            let ts = export_timestamp();
            file.write_all(
                format!(
                    "-- MySQL dump generated {ts}\n-- Database: `{safe_db}`\n\nCREATE DATABASE IF NOT EXISTS `{safe_db}`;\nUSE `{safe_db}`;\n\nSET FOREIGN_KEY_CHECKS=0;\n\n"
                )
                .as_bytes(),
            )
            .await
            .map_err(|e| e.to_string())?;

            let mut total_rows = 0u64;
            for (i, t) in tables.iter().enumerate() {
                let table_name = t.get("name").and_then(|v| v.as_str()).unwrap_or("");
                let safe_table = match assert_safe_identifier(table_name) {
                    Some(s) => s,
                    None => continue,
                };

                emit_export_progress(
                    app,
                    &format!("Dumping structure for {safe_table}…"),
                    None,
                    None,
                    Some((i + 1) as u64),
                    Some(table_count),
                );

                let mut inner = self.inner.lock().await;
                let conn = inner.require_conn().await.map_err(|v| v.to_string())?;
                let create_rows: Vec<Row> = conn
                    .query(format!("SHOW CREATE TABLE `{safe_table}`"))
                    .await
                    .map_err(|e| e.to_string())?;
                let create_sql = create_rows
                    .first()
                    .and_then(|r| r.get::<String, _>(1))
                    .unwrap_or_default();
                drop(inner);

                if create_sql.is_empty() {
                    continue;
                }

                file.write_all(
                    format!(
                        "--\n-- Table structure for table `{safe_table}`\n--\n\nDROP TABLE IF EXISTS `{safe_table}`;\n{create_sql};\n\n"
                    )
                    .as_bytes(),
                )
                .await
                .map_err(|e| e.to_string())?;

                let data = self.export_table(&safe_db, &safe_table).await?;
                if data.get("ok").and_then(|v| v.as_bool()) != Some(true) {
                    return Err(data
                        .get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Export failed")
                        .to_string());
                }
                let columns: Vec<String> = data
                    .get("columns")
                    .and_then(|v| v.as_array())
                    .map(|a| {
                        a.iter()
                            .filter_map(|c| c.as_str().map(String::from))
                            .collect()
                    })
                    .unwrap_or_default();
                let rows = data.get("rows").and_then(|v| v.as_array()).cloned().unwrap_or_default();
                if !rows.is_empty() {
                    file.write_all(
                        format!("--\n-- Dumping data for table `{safe_table}`\n--\n\n").as_bytes(),
                    )
                    .await
                    .map_err(|e| e.to_string())?;
                    let chunk = format_sql_inserts(&safe_table, &columns, &rows);
                    file.write_all(format!("{chunk}\n\n").as_bytes())
                        .await
                        .map_err(|e| e.to_string())?;
                    total_rows += rows.len() as u64;
                    emit_export_progress(
                        app,
                        &format!("Exporting {safe_table}…"),
                        Some(rows.len() as u64),
                        Some(rows.len() as u64),
                        Some((i + 1) as u64),
                        Some(table_count),
                    );
                }
            }

            file.write_all(b"SET FOREIGN_KEY_CHECKS=1;\n")
                .await
                .map_err(|e| e.to_string())?;
            file.flush().await.map_err(|e| e.to_string())?;
            Ok::<(u64, u64), String>((table_count, total_rows))
        }
        .await;

        match result {
            Ok((table_count, total_rows)) => Ok(json!({
                "ok": true,
                "tableCount": table_count,
                "totalRows": total_rows,
                "filePath": file_path,
            })),
            Err(e) => {
                let _ = tokio::fs::remove_file(file_path).await;
                Ok(json!({ "ok": false, "error": e }))
            }
        }
    }

    async fn save_export_database_csv_to_path(
        &self,
        app: &AppHandle,
        database: &str,
        folder_path: &str,
    ) -> Result<Value, String> {
        let safe_db = match assert_safe_identifier(database) {
            Some(s) => s,
            None => return Ok(json!({ "ok": false, "error": "Invalid database name" })),
        };

        emit_export_progress(
            app,
            &format!("Exporting tables from {safe_db}…"),
            None,
            None,
            None,
            None,
        );

        let tables_val = self.get_tables(&safe_db).await?;
        let tables = tables_val
            .get("tables")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        let table_count = tables.len() as u64;
        let mut total_rows = 0u64;

        for (i, t) in tables.iter().enumerate() {
            let table_name = t.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let safe_table = match assert_safe_identifier(table_name) {
                Some(s) => s,
                None => continue,
            };
            let file_path = std::path::Path::new(folder_path)
                .join(format!("{safe_db}_{safe_table}.csv"))
                .to_string_lossy()
                .into_owned();

            emit_export_progress(
                app,
                &format!("Exporting {safe_table} to CSV…"),
                None,
                None,
                Some((i + 1) as u64),
                Some(table_count),
            );

            let res = self
                .save_export_table_to_path(app, &safe_db, &safe_table, "csv", &file_path)
                .await?;
            if res.get("ok").and_then(|v| v.as_bool()) != Some(true) {
                return Ok(res);
            }
            total_rows += res.get("total").and_then(|v| v.as_u64()).unwrap_or(0);
        }

        Ok(json!({
            "ok": true,
            "tableCount": table_count,
            "totalRows": total_rows,
            "folderPath": folder_path,
        }))
    }

    async fn import_rows(
        &self,
        database: &str,
        table: &str,
        rows: Vec<Value>,
    ) -> Result<Value, String> {
        let safe_db = match assert_safe_identifier(database) {
            Some(s) => s,
            None => return Ok(json!({ "ok": false, "error": "Invalid database or table name" })),
        };
        let safe_table = match assert_safe_identifier(table) {
            Some(s) => s,
            None => return Ok(json!({ "ok": false, "error": "Invalid database or table name" })),
        };
        if rows.is_empty() {
            return Ok(json!({ "ok": false, "error": "No rows to import" }));
        }
        if rows.len() > DB_IMPORT_MAX_ROWS {
            return Ok(json!({
                "ok": false,
                "error": format!("Import limited to {DB_IMPORT_MAX_ROWS} rows per batch"),
            }));
        }
        if let Err(v) = self.select_database(&safe_db).await {
            return Ok(v);
        }
        let structure = self.get_table_structure(&safe_db, &safe_table).await?;
        let valid_cols: std::collections::HashSet<String> = structure
            .get("columns")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|c| c.get("name").and_then(|n| n.as_str()).map(String::from))
                    .collect()
            })
            .unwrap_or_default();
        let mut inserted = 0u64;
        let mut skipped = 0u64;
        for row in rows {
            let obj = match row.as_object() {
                Some(o) => o,
                None => {
                    skipped += 1;
                    continue;
                }
            };
            let filtered: Map<String, Value> = obj
                .iter()
                .filter(|(k, v)| valid_cols.contains(*k) && !v.is_null())
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect();
            if filtered.is_empty() {
                skipped += 1;
                continue;
            }
            let r = self.insert_row(&safe_db, &safe_table, filtered).await?;
            if r.get("ok").and_then(|v| v.as_bool()) == Some(true) {
                inserted += 1;
            }
        }
        Ok(json!({ "ok": true, "inserted": inserted, "skipped": skipped }))
    }

    async fn get_database_schema(&self, database: &str) -> Result<Value, String> {
        if database.contains('`') || database.contains('\0') {
            return Ok(json!({ "ok": false, "error": "Invalid database name" }));
        }
        if let Err(v) = self.select_database(database).await {
            return Ok(v);
        }
        let mut inner = self.inner.lock().await;
        let conn = match inner.require_conn().await {
            Ok(c) => c,
            Err(v) => return Ok(v),
        };
        let col_rows: Vec<Row> = conn
            .exec(
                "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, COLUMN_KEY, ORDINAL_POSITION \
                 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? \
                 ORDER BY TABLE_NAME, ORDINAL_POSITION",
                (database,),
            )
            .await
            .map_err(|e| e.to_string())?;
        let mut table_map: HashMap<String, Vec<Value>> = HashMap::new();
        for r in col_rows {
            let tname = r.get::<String, _>(0).unwrap_or_default();
            let col = json!({
                "name": r.get::<String, _>(1).unwrap_or_default(),
                "type": r.get::<String, _>(2).unwrap_or_default(),
                "key": r.get::<String, _>(3).unwrap_or_default(),
            });
            table_map.entry(tname).or_default().push(col);
        }
        let mut tables: Vec<Value> = table_map
            .into_iter()
            .map(|(name, columns)| json!({ "name": name, "columns": columns }))
            .collect();
        tables.sort_by(|a, b| {
            a.get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .cmp(b.get("name").and_then(|v| v.as_str()).unwrap_or(""))
        });
        let fk_rows: Vec<Row> = conn
            .exec(
                "SELECT CONSTRAINT_NAME, TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, \
                 REFERENCED_COLUMN_NAME, ORDINAL_POSITION \
                 FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE \
                 WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL \
                 ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION",
                (database,),
            )
            .await
            .map_err(|e| e.to_string())?;
        let mut foreign_keys = Vec::new();
        let mut groups: HashMap<String, (String, String, String, Vec<String>, Vec<String>)> =
            HashMap::new();
        for r in fk_rows {
            let child = r.get::<String, _>(1).unwrap_or_default();
            let cname = r.get::<String, _>(0).unwrap_or_default();
            let key = format!("{child}\0{cname}");
            let entry = groups.entry(key).or_insert_with(|| {
                (
                    cname.clone(),
                    child.clone(),
                    r.get::<String, _>(3).unwrap_or_default(),
                    vec![],
                    vec![],
                )
            });
            entry.3.push(r.get::<String, _>(2).unwrap_or_default());
            entry.4.push(r.get::<String, _>(4).unwrap_or_default());
        }
        for (_, (cname, child, parent, child_cols, parent_cols)) in groups {
            foreign_keys.push(json!({
                "constraintName": cname,
                "childTable": child,
                "childColumns": child_cols,
                "parentTable": parent,
                "parentColumns": parent_cols,
            }));
        }
        Ok(json!({ "ok": true, "tables": tables, "foreignKeys": foreign_keys }))
    }
}

fn row_string(r: &Row, idx: usize) -> Option<String> {
    if let Some(s) = r.get::<String, _>(idx) {
        return Some(s);
    }
    r.get::<Vec<u8>, _>(idx)
        .map(|b| String::from_utf8_lossy(&b).into_owned())
}

fn row_string_col(r: &Row, name: &str) -> Option<String> {
    if let Some(s) = r.get::<String, _>(name) {
        return Some(s);
    }
    r.get::<Vec<u8>, _>(name)
        .map(|b| String::from_utf8_lossy(&b).into_owned())
}

fn row_u64(r: &Row, idx: usize) -> u64 {
    if let Some(n) = r.get::<u64, _>(idx) {
        return n;
    }
    if let Some(n) = r.get::<i64, _>(idx) {
        return n.max(0) as u64;
    }
    if let Some(n) = r.get::<i32, _>(idx) {
        return n.max(0) as u64;
    }
    if let Some(n) = r.get::<usize, _>(idx) {
        return n as u64;
    }
    row_string(r, idx)
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}

fn assert_safe_identifier(name: &str) -> Option<String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
    {
        Some(trimmed.to_string())
    } else {
        None
    }
}

fn arg_str(args: &[Value], index: usize) -> Result<String, String> {
    args.get(index)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Missing string argument at index {index}"))
}

/// Skip leading `--` / `#` / `/* */` so default editor templates classify correctly.
fn sql_statement_start(sql: &str) -> &str {
    let mut rest = sql.trim();
    loop {
        rest = rest.trim_start();
        if rest.starts_with("--") || rest.starts_with('#') {
            rest = match rest.find('\n') {
                Some(i) => &rest[i + 1..],
                None => return "",
            };
            continue;
        }
        if rest.starts_with("/*") {
            rest = match rest.find("*/") {
                Some(i) => &rest[i + 2..],
                None => return "",
            };
            continue;
        }
        break;
    }
    rest.trim_start()
}

fn starts_with_keyword(sql: &str, keyword: &str) -> bool {
    if !sql.starts_with(keyword) {
        return false;
    }
    match sql.chars().nth(keyword.len()) {
        None => true,
        Some(c) => !c.is_ascii_alphanumeric() && c != '_',
    }
}

fn is_read_query(sql: &str) -> bool {
    let lower = sql_statement_start(sql).to_lowercase();
    [
        "select", "show", "describe", "desc", "explain", "with", "table",
    ]
    .iter()
    .any(|kw| starts_with_keyword(&lower, kw))
}

fn has_limit_clause(sql: &str) -> bool {
    sql.split(|c: char| !c.is_ascii_alphanumeric() && c != '_')
        .any(|token| token.eq_ignore_ascii_case("limit"))
}

#[cfg(test)]
mod query_classify_tests {
    use super::{has_limit_clause, is_read_query};

    #[test]
    fn read_query_after_line_comment() {
        assert!(is_read_query("-- Write your SQL query here\nSELECT * FROM users"));
    }

    #[test]
    fn read_query_with_cte() {
        assert!(is_read_query(
            "WITH cte AS (SELECT 1 AS n) SELECT * FROM cte"
        ));
    }

    #[test]
    fn write_query_not_read() {
        assert!(!is_read_query("UPDATE users SET active = 1"));
    }

    #[test]
    fn limit_word_not_substring() {
        assert!(!has_limit_clause(
            "SELECT * FROM products WHERE category = 'limit_offers'"
        ));
        assert!(has_limit_clause("SELECT * FROM t LIMIT 10"));
    }
}

fn row_to_json(row: &Row) -> Value {
    let mut obj = Map::new();
    for (i, col) in row.columns_ref().iter().enumerate() {
        let name = col.name_str().to_string();
        let val = row.get::<MysqlValue, _>(i).unwrap_or(MysqlValue::NULL);
        obj.insert(name, mysql_value_to_json(val));
    }
    Value::Object(obj)
}

fn mysql_value_to_json(v: MysqlValue) -> Value {
    match v {
        MysqlValue::NULL => Value::Null,
        MysqlValue::Int(n) => json!(n),
        MysqlValue::UInt(n) => {
            if n <= i64::MAX as u64 {
                json!(n as i64)
            } else {
                Value::String(n.to_string())
            }
        }
        MysqlValue::Float(f) => json!(f),
        MysqlValue::Double(d) => json!(d),
        MysqlValue::Bytes(b) => {
            if let Ok(s) = String::from_utf8(b.clone()) {
                Value::String(s)
            } else {
                Value::String(hex::encode(b))
            }
        }
        MysqlValue::Date(y, m, d, h, mi, s, _) => {
            Value::String(format!("{y:04}-{m:02}-{d:02}T{h:02}:{mi:02}:{s:02}"))
        }
        MysqlValue::Time(neg, d, h, m, s, _) => {
            Value::String(format!("{}{d} {h:02}:{m:02}:{s:02}", if neg { "-" } else { "" }))
        }
    }
}

fn json_to_mysql(v: Value) -> MysqlValue {
    match v {
        Value::Null => MysqlValue::NULL,
        Value::Bool(b) => MysqlValue::Int(if b { 1 } else { 0 }),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                MysqlValue::Int(i)
            } else if let Some(u) = n.as_u64() {
                MysqlValue::UInt(u)
            } else if let Some(f) = n.as_f64() {
                MysqlValue::Double(f)
            } else {
                MysqlValue::NULL
            }
        }
        Value::String(s) => {
            if s.is_empty() {
                MysqlValue::NULL
            } else {
                MysqlValue::Bytes(s.into_bytes())
            }
        }
        _ => MysqlValue::Bytes(v.to_string().into_bytes()),
    }
}

fn export_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

fn emit_export_progress(
    app: &AppHandle,
    message: &str,
    exported_rows: Option<u64>,
    total_rows: Option<u64>,
    table_index: Option<u64>,
    table_count: Option<u64>,
) {
    let mut payload = json!({ "message": message });
    if let Some(v) = exported_rows {
        payload["exportedRows"] = json!(v);
    }
    if let Some(v) = total_rows {
        payload["totalRows"] = json!(v);
    }
    if let Some(v) = table_index {
        payload["tableIndex"] = json!(v);
    }
    if let Some(v) = table_count {
        payload["tableCount"] = json!(v);
    }
    events::emit(app, "db-export-progress", vec![payload]);
}

fn format_csv_cell(value: &Value) -> String {
    let s = match value {
        Value::Null => String::new(),
        Value::String(v) => v.clone(),
        _ => value.to_string(),
    };
    if s.contains(',') || s.contains('"') || s.contains('\n') || s.contains('\r') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s
    }
}

fn format_csv_row(columns: &[String], row: &Value) -> String {
    let obj = row.as_object();
    columns
        .iter()
        .map(|c| {
            format_csv_cell(
                obj.and_then(|o| o.get(c)).unwrap_or(&Value::Null),
            )
        })
        .collect::<Vec<_>>()
        .join(",")
}

fn format_sql_insert_value(value: &Value) -> String {
    match value {
        Value::Null => "NULL".into(),
        Value::Number(n) if n.as_f64().is_some() => n.to_string(),
        Value::Bool(b) => if *b { "1" } else { "0" }.into(),
        Value::String(s) => format!("'{}'", s.replace('\\', "\\\\").replace('\'', "''")),
        _ => format!("'{}'", value.to_string().replace('\'', "''")),
    }
}

fn format_sql_inserts(table: &str, columns: &[String], rows: &[Value]) -> String {
    if rows.is_empty() || columns.is_empty() {
        return String::new();
    }
    let col_list = columns
        .iter()
        .map(|c| format!("`{}`", c.replace('`', "``")))
        .collect::<Vec<_>>()
        .join(", ");
    rows.iter()
        .filter_map(|r| r.as_object())
        .map(|row| {
            let vals = columns
                .iter()
                .map(|c| format_sql_insert_value(row.get(c).unwrap_or(&Value::Null)))
                .collect::<Vec<_>>()
                .join(", ");
            format!(
                "INSERT INTO `{}` ({col_list}) VALUES ({vals});",
                table.replace('`', "``")
            )
        })
        .collect::<Vec<_>>()
        .join("\n")
}
