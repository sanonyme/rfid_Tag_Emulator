use super::{events, local_fs};
use async_trait::async_trait;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use russh::client;
use russh_sftp::client::SftpSession;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::Mutex;
use tauri::AppHandle;
use uuid::Uuid;

const READ_MAX_BYTES: u64 = 2 * 1024 * 1024;
const MAX_FIND_MATCHES: usize = 5000;

struct SshHandler;

#[async_trait]
impl client::Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &russh::keys::key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
    }
}

struct SessionInner {
    #[allow(dead_code)]
    handle: client::Handle<SshHandler>,
    sftp: SftpSession,
}

pub struct SftpService {
    sessions: Arc<Mutex<HashMap<String, Arc<Mutex<SessionInner>>>>>,
    /// Cancel flags live outside the session mutex so Stop works during long finds.
    find_cancel_flags: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl SftpService {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            find_cancel_flags: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub async fn invoke(
        &self,
        app: &AppHandle,
        channel: &str,
        args: &[Value],
        admin: bool,
    ) -> Result<Value, String> {
        match channel {
            "sftp-connect" => {
                self.connect(
                    &arg_str(args, 0)?,
                    arg_u64(args, 1) as u16,
                    &arg_str(args, 2)?,
                    &arg_str(args, 3)?,
                )
                .await
            }
            "sftp-disconnect" => {
                self.disconnect(&arg_str(args, 0)?).await;
                Ok(Value::Null)
            }
            "sftp-readdir" => self.readdir(&arg_str(args, 0)?, &arg_str(args, 1)?).await,
            "sftp-read-file" => self.read_file(&arg_str(args, 0)?, &arg_str(args, 1)?).await,
            "sftp-write-file" => {
                self.write_file(&arg_str(args, 0)?, &arg_str(args, 1)?, &arg_str(args, 2)?)
                    .await
            }
            "sftp-write-text-file" => {
                self.write_text_file(&arg_str(args, 0)?, &arg_str(args, 1)?, &arg_str(args, 2)?)
                    .await
            }
            "sftp-mkdir" => self.mkdir(&arg_str(args, 0)?, &arg_str(args, 1)?).await,
            "sftp-rename" => {
                self.rename(&arg_str(args, 0)?, &arg_str(args, 1)?, &arg_str(args, 2)?)
                    .await
            }
            "sftp-unlink" => self.unlink(&arg_str(args, 0)?, &arg_str(args, 1)?).await,
            "sftp-rmrf" => {
                if !admin {
                    return Ok(json!({ "ok": false, "error": "Admin login required" }));
                }
                self.rmrf(&arg_str(args, 0)?, &arg_str(args, 1)?).await
            }
            "sftp-stat" => self.stat(&arg_str(args, 0)?, &arg_str(args, 1)?).await,
            "sftp-calculate-size" => {
                self.calculate_size(&arg_str(args, 0)?, &arg_str(args, 1)?)
                    .await
            }
            "sftp-set-attributes" => {
                self.set_attributes(
                    &arg_str(args, 0)?,
                    &arg_str(args, 1)?,
                    args.get(2).cloned().unwrap_or(json!({})),
                    args.get(3).cloned(),
                )
                .await
            }
            "sftp-find-files" => {
                self.find_files(
                    app.clone(),
                    arg_str(args, 0)?,
                    args.get(1).cloned().unwrap_or(json!({})),
                    arg_str(args, 2)?,
                )
                .await
            }
            "sftp-find-cancel" => {
                self.find_cancel(&arg_str(args, 0)?).await;
                Ok(Value::Null)
            }
            "sftp-download-to-path" => {
                self.download_to_path(
                    app,
                    &arg_str(args, 0)?,
                    &arg_str(args, 1)?,
                    &arg_str(args, 2)?,
                    &arg_str(args, 3)?,
                    args.get(4).and_then(|v| v.as_str()),
                )
                .await
            }
            "sftp-upload-from-local" => {
                self.upload_from_local(
                    app,
                    &arg_str(args, 0)?,
                    &arg_str(args, 1)?,
                    &arg_str(args, 2)?,
                    &arg_str(args, 3)?,
                    args.get(4).and_then(|v| v.as_str()),
                )
                .await
            }
            "sftp-copy-remote-file" => {
                self.copy_remote_file(
                    app,
                    &arg_str(args, 0)?,
                    &arg_str(args, 1)?,
                    &arg_str(args, 2)?,
                    &arg_str(args, 3)?,
                )
                .await
            }
            _ => Err(format!("Unknown SFTP channel `{channel}`")),
        }
    }

    async fn session(&self, session_id: &str) -> Result<Arc<Mutex<SessionInner>>, String> {
        self.sessions
            .lock()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| "Not connected".to_string())
    }

    async fn connect(
        &self,
        host: &str,
        port: u16,
        username: &str,
        password: &str,
    ) -> Result<Value, String> {
        let host = host.trim().to_string();
        let port = if port > 0 { port } else { 22 };
        let username = username.trim().to_string();
        let password = password.to_string();
        let config = Arc::new(client::Config::default());
        let connect = client::connect(config, (host.as_str(), port), SshHandler);
        let mut handle = tokio::time::timeout(Duration::from_secs(25), connect)
            .await
            .map_err(|_| "Connection timed out".to_string())?
            .map_err(|e| e.to_string())?;

        let ok = handle
            .authenticate_password(&username, &password)
            .await
            .map_err(|e| e.to_string())?;
        if !ok {
            return Ok(json!({ "ok": false, "error": "Authentication failed" }));
        }

        let channel = handle
            .channel_open_session()
            .await
            .map_err(|e| e.to_string())?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .map_err(|e| e.to_string())?;
        let sftp = SftpSession::new(channel.into_stream())
            .await
            .map_err(|e| e.to_string())?;

        let session_id = Uuid::new_v4().to_string();
        let find_cancel = Arc::new(AtomicBool::new(false));
        self.find_cancel_flags
            .lock()
            .await
            .insert(session_id.clone(), find_cancel);
        let inner = Arc::new(Mutex::new(SessionInner {
            handle,
            sftp,
        }));
        self.sessions
            .lock()
            .await
            .insert(session_id.clone(), inner);
        Ok(json!({ "ok": true, "sessionId": session_id }))
    }

    async fn disconnect(&self, session_id: &str) {
        self.sessions.lock().await.remove(session_id);
        self.find_cancel_flags.lock().await.remove(session_id);
    }

    async fn readdir(&self, session_id: &str, remote_path: &str) -> Result<Value, String> {
        let dir = normalize_remote_path(remote_path);
        let session = self.session(session_id).await?;
        let inner = session.lock().await;
        let mut entries: Vec<Value> = Vec::new();
        let rd = inner.sftp.read_dir(&dir).await.map_err(|e| e.to_string())?;
        for entry in rd {
            let name = entry.file_name().to_string();
            if name == "." || name == ".." {
                continue;
            }
            let meta = entry.metadata();
            let is_folder = meta.is_dir();
            entries.push(json!({
                "name": name,
                "type": if is_folder { "folder" } else { "file" },
                "size": meta.size,
                "mtime": meta.mtime,
                "mode": meta.permissions,
                "uid": meta.uid,
                "gid": meta.gid,
            }));
        }
        entries.sort_by(|a, b| {
            let ta = a.get("type").and_then(|v| v.as_str()).unwrap_or("");
            let tb = b.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if ta != tb {
                return if ta == "folder" {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Greater
                };
            }
            let na = a.get("name").and_then(|v| v.as_str()).unwrap_or("");
            let nb = b.get("name").and_then(|v| v.as_str()).unwrap_or("");
            na.to_lowercase().cmp(&nb.to_lowercase())
        });
        Ok(json!({ "ok": true, "entries": entries }))
    }

    async fn read_file(&self, session_id: &str, remote_path: &str) -> Result<Value, String> {
        let p = normalize_remote_path(remote_path);
        let session = self.session(session_id).await?;
        let inner = session.lock().await;
        let meta = inner.sftp.metadata(&p).await.map_err(|e| e.to_string())?;
        if meta.is_dir() {
            return Ok(json!({ "ok": false, "error": "Path is a directory" }));
        }
        let size = meta.len();
        if size > READ_MAX_BYTES {
            return Ok(json!({
                "ok": false,
                "error": format!("File too large ({size} bytes). Maximum for preview is {READ_MAX_BYTES} bytes.")
            }));
        }
        let buf = inner.sftp.read(&p).await.map_err(|e| e.to_string())?;
        let size = buf.len() as u64;
        if is_mostly_text(&buf) {
            Ok(json!({
                "ok": true,
                "text": String::from_utf8_lossy(&buf),
                "isBinary": false,
                "size": size
            }))
        } else {
            let preview = &buf[..buf.len().min(512)];
            Ok(json!({
                "ok": true,
                "isBinary": true,
                "size": size,
                "previewBase64": STANDARD.encode(preview)
            }))
        }
    }

    async fn write_file(
        &self,
        session_id: &str,
        remote_path: &str,
        base64_data: &str,
    ) -> Result<Value, String> {
        let p = normalize_remote_path(remote_path);
        let data = STANDARD
            .decode(base64_data)
            .map_err(|_| "Invalid base64 payload".to_string())?;
        let session = self.session(session_id).await?;
        let inner = session.lock().await;
        inner
            .sftp
            .write(&p, &data)
            .await
            .map_err(|e| e.to_string())?;
        Ok(json!({ "ok": true }))
    }

    async fn write_text_file(
        &self,
        session_id: &str,
        remote_path: &str,
        text: &str,
    ) -> Result<Value, String> {
        self.write_file(session_id, remote_path, &STANDARD.encode(text.as_bytes()))
            .await
    }

    async fn mkdir(&self, session_id: &str, remote_path: &str) -> Result<Value, String> {
        let p = normalize_remote_path(remote_path);
        let session = self.session(session_id).await?;
        let inner = session.lock().await;
        inner
            .sftp
            .create_dir(&p)
            .await
            .map_err(|e| e.to_string())?;
        Ok(json!({ "ok": true }))
    }

    async fn rename(
        &self,
        session_id: &str,
        old_path: &str,
        new_path: &str,
    ) -> Result<Value, String> {
        let a = normalize_remote_path(old_path);
        let b = normalize_remote_path(new_path);
        let session = self.session(session_id).await?;
        let inner = session.lock().await;
        inner
            .sftp
            .rename(&a, &b)
            .await
            .map_err(|e| e.to_string())?;
        Ok(json!({ "ok": true }))
    }

    async fn unlink(&self, session_id: &str, remote_path: &str) -> Result<Value, String> {
        let p = normalize_remote_path(remote_path);
        let session = self.session(session_id).await?;
        let inner = session.lock().await;
        inner
            .sftp
            .remove_file(&p)
            .await
            .map_err(|e| e.to_string())?;
        Ok(json!({ "ok": true }))
    }

    async fn rmrf(&self, session_id: &str, remote_path: &str) -> Result<Value, String> {
        let p = normalize_remote_path(remote_path);
        let session = self.session(session_id).await?;
        let inner = session.lock().await;
        rmrf_recursive(&inner.sftp, &p).await?;
        Ok(json!({ "ok": true }))
    }

    async fn stat(&self, session_id: &str, remote_path: &str) -> Result<Value, String> {
        let p = normalize_remote_path(remote_path);
        let session = self.session(session_id).await?;
        let inner = session.lock().await;
        let meta = inner.sftp.metadata(&p).await.map_err(|e| e.to_string())?;
        Ok(json!({
            "ok": true,
            "stat": {
                "path": p,
                "isDirectory": meta.is_dir(),
                "size": meta.len(),
                "mode": meta.permissions.unwrap_or(0),
                "uid": meta.uid.unwrap_or(0),
                "gid": meta.gid.unwrap_or(0),
                "mtime": meta.mtime,
            }
        }))
    }

    async fn calculate_size(&self, session_id: &str, remote_path: &str) -> Result<Value, String> {
        let p = normalize_remote_path(remote_path);
        let session = self.session(session_id).await?;
        let inner = session.lock().await;
        let meta = inner.sftp.metadata(&p).await.map_err(|e| e.to_string())?;
        if !meta.is_dir() {
            return Ok(json!({
                "ok": true,
                "size": meta.len(),
                "fileCount": 1
            }));
        }
        let mut total_size = 0u64;
        let mut file_count = 0u64;
        walk_size(&inner.sftp, &p, &mut total_size, &mut file_count).await?;
        Ok(json!({ "ok": true, "size": total_size, "fileCount": file_count }))
    }

    async fn set_attributes(
        &self,
        session_id: &str,
        remote_path: &str,
        attrs: Value,
        options: Option<Value>,
    ) -> Result<Value, String> {
        let p = normalize_remote_path(remote_path);
        let mode = attrs.get("mode").and_then(|v| v.as_u64()).map(|n| n as u32);
        let uid = attrs.get("uid").and_then(|v| v.as_u64()).map(|n| n as u32);
        let gid = attrs.get("gid").and_then(|v| v.as_u64()).map(|n| n as u32);
        let recursive = options
            .as_ref()
            .and_then(|o| o.get("recursive"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        let add_x = options
            .as_ref()
            .and_then(|o| o.get("addXToDirectories"))
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let session = self.session(session_id).await?;
        let inner = session.lock().await;
        let root_meta = inner.sftp.metadata(&p).await.map_err(|e| e.to_string())?;
        let paths = if recursive && root_meta.is_dir() {
            collect_remote_paths_recursive(&inner.sftp, &p).await?
        } else {
            vec![p.clone()]
        };

        for target in paths {
            let meta = inner
                .sftp
                .metadata(&target)
                .await
                .map_err(|e| e.to_string())?;
            let mut set_mode = mode;
            if let Some(m) = set_mode {
                if add_x && meta.is_dir() {
                    set_mode = Some(apply_add_x_to_directory(m));
                }
            }
            let mut new_meta = meta.clone();
            if let Some(u) = uid {
                new_meta.uid = Some(u);
            }
            if let Some(g) = gid {
                new_meta.gid = Some(g);
            }
            if let Some(m) = set_mode {
                new_meta.permissions = Some(m);
            }
            if uid.is_some() || gid.is_some() || set_mode.is_some() {
                inner
                    .sftp
                    .set_metadata(&target, new_meta)
                    .await
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(json!({ "ok": true }))
    }

    async fn find_cancel(&self, session_id: &str) {
        if let Some(cancel) = self.find_cancel_flags.lock().await.get(session_id) {
            cancel.store(true, Ordering::SeqCst);
        }
    }

    async fn find_cancel_flag(&self, session_id: &str) -> Result<Arc<AtomicBool>, String> {
        self.find_cancel_flags
            .lock()
            .await
            .get(session_id)
            .cloned()
            .ok_or_else(|| "Not connected".to_string())
    }

    async fn find_files(
        &self,
        app: AppHandle,
        session_id: String,
        options: Value,
        operation_id: String,
    ) -> Result<Value, String> {
        let cancel = self.find_cancel_flag(&session_id).await?;
        cancel.store(false, Ordering::SeqCst);
        let session = self.session(&session_id).await?;
        let inner = session.lock().await;
        run_find(&app, &inner.sftp, &options, &operation_id, &cancel).await
    }

    async fn download_to_path(
        &self,
        app: &AppHandle,
        session_id: &str,
        remote_path: &str,
        local_path: &str,
        operation_id: &str,
        local_root: Option<&str>,
    ) -> Result<Value, String> {
        let safe = resolve_local_path(local_path, local_root)?;
        let p = normalize_remote_path(remote_path);
        let session = self.session(session_id).await?;
        let inner = session.lock().await;
        match stream_download(&inner.sftp, &p, &safe, app, operation_id).await {
            Ok(v) => Ok(v),
            Err(e) => {
                let _ = std::fs::remove_file(&safe);
                Err(e)
            }
        }
    }

    async fn upload_from_local(
        &self,
        app: &AppHandle,
        session_id: &str,
        local_path: &str,
        remote_path: &str,
        operation_id: &str,
        local_root: Option<&str>,
    ) -> Result<Value, String> {
        let safe = resolve_local_path(local_path, local_root)?;
        let p = normalize_remote_path(remote_path);
        let session = self.session(session_id).await?;
        let inner = session.lock().await;
        stream_upload(&inner.sftp, &safe, &p, app, operation_id).await
    }

    async fn copy_remote_file(
        &self,
        app: &AppHandle,
        session_id: &str,
        remote_src: &str,
        remote_dest: &str,
        operation_id: &str,
    ) -> Result<Value, String> {
        let a = normalize_remote_path(remote_src);
        let b = normalize_remote_path(remote_dest);
        let session = self.session(session_id).await?;
        let inner = session.lock().await;
        copy_remote(&inner.sftp, &a, &b, app, operation_id).await
    }
}

use std::time::Duration;

fn resolve_local_path(local_path: &str, local_root: Option<&str>) -> Result<String, String> {
    if let Some(root) = local_root.filter(|r| !r.trim().is_empty()) {
        let safe = local_fs::assert_path_under_root(root.trim(), local_path)
            .ok_or_else(|| "Path outside local root".to_string())?;
        Ok(safe.to_string_lossy().to_string())
    } else {
        Ok(Path::new(local_path)
            .canonicalize()
            .unwrap_or_else(|_| Path::new(local_path).to_path_buf())
            .to_string_lossy()
            .to_string())
    }
}

fn normalize_remote_path(p: &str) -> String {
    if p.is_empty() || p == "." {
        return "/".to_string();
    }
    let s = p.replace('\\', "/");
    let mut stack: Vec<&str> = Vec::new();
    for part in s.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            stack.pop();
        } else {
            stack.push(part);
        }
    }
    if stack.is_empty() {
        "/".to_string()
    } else {
        format!("/{}", stack.join("/"))
    }
}

fn is_mostly_text(buf: &[u8]) -> bool {
    if buf.is_empty() {
        return true;
    }
    let sample = &buf[..buf.len().min(8000)];
    let mut bad = 0usize;
    for &b in sample {
        if b == 0 {
            return false;
        }
        if b < 9 || (b > 13 && b < 32 && b != 27) {
            bad += 1;
        }
    }
    bad * 100 / sample.len() < 2
}

async fn rmrf_recursive(sftp: &SftpSession, path: &str) -> Result<(), String> {
    let meta = sftp.metadata(path).await.map_err(|e| e.to_string())?;
    if meta.is_dir() {
        let rd = sftp.read_dir(path).await.map_err(|e| e.to_string())?;
        for entry in rd {
            let name = entry.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let full = join_posix(path, &name);
            Box::pin(rmrf_recursive(sftp, &full)).await?;
        }
        sftp.remove_dir(path).await.map_err(|e| e.to_string())?;
    } else {
        sftp.remove_file(path).await.map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn walk_size(
    sftp: &SftpSession,
    dir: &str,
    total_size: &mut u64,
    file_count: &mut u64,
) -> Result<(), String> {
    let rd = sftp.read_dir(dir).await.map_err(|e| e.to_string())?;
    for entry in rd {
        let name = entry.file_name();
        if name == "." || name == ".." {
            continue;
        }
        let full = join_posix(dir, &name);
        if entry.metadata().is_dir() {
            Box::pin(walk_size(sftp, &full, total_size, file_count)).await?;
        } else {
            let meta = sftp.metadata(&full).await.map_err(|e| e.to_string())?;
            *total_size += meta.len();
            *file_count += 1;
        }
    }
    Ok(())
}

async fn collect_remote_paths_recursive(sftp: &SftpSession, dir: &str) -> Result<Vec<String>, String> {
    let mut out = vec![dir.to_string()];
    let rd = sftp.read_dir(dir).await.map_err(|e| e.to_string())?;
    for entry in rd {
        let name = entry.file_name();
        if name == "." || name == ".." {
            continue;
        }
        let full = join_posix(dir, &name);
        if entry.metadata().is_dir() {
            let nested = Box::pin(collect_remote_paths_recursive(sftp, &full)).await?;
            out.extend(nested.into_iter().skip(1));
        } else {
            out.push(full);
        }
    }
    Ok(out)
}

fn join_posix(dir: &str, name: &str) -> String {
    if dir.ends_with('/') {
        format!("{dir}{name}")
    } else {
        format!("{dir}/{name}")
    }
}

fn apply_add_x_to_directory(mode: u32) -> u32 {
    let perm = mode & 0o777;
    let x_bits = (perm & 0o444) >> 2;
    (mode & !0o777) | (perm | x_bits)
}

fn emit_transfer_progress(app: &AppHandle, operation_id: &str, loaded: u64, total: u64) {
    events::emit(
        app,
        "sftp-transfer-progress",
        vec![json!({
            "operationId": operation_id,
            "loaded": loaded,
            "total": total,
        })],
    );
}

async fn stream_download(
    sftp: &SftpSession,
    remote_path: &str,
    local_path: &str,
    app: &AppHandle,
    operation_id: &str,
) -> Result<Value, String> {
    let meta = sftp
        .metadata(remote_path)
        .await
        .map_err(|e| e.to_string())?;
    if meta.is_dir() {
        return Ok(json!({ "ok": false, "error": "Cannot download a directory" }));
    }
    let total = meta.len();
    let mut remote = sftp.open(remote_path).await.map_err(|e| e.to_string())?;
    let mut local = tokio::fs::File::create(local_path)
        .await
        .map_err(|e| e.to_string())?;
    let mut loaded = 0u64;
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = remote.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        local
            .write_all(&buf[..n])
            .await
            .map_err(|e| e.to_string())?;
        loaded += n as u64;
        emit_transfer_progress(app, operation_id, loaded, total);
    }
    emit_transfer_progress(app, operation_id, total.max(loaded), total.max(loaded));
    Ok(json!({ "ok": true }))
}

async fn stream_upload(
    sftp: &SftpSession,
    local_path: &str,
    remote_path: &str,
    app: &AppHandle,
    operation_id: &str,
) -> Result<Value, String> {
    let meta = tokio::fs::metadata(local_path)
        .await
        .map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Ok(json!({ "ok": false, "error": "Not a file" }));
    }
    let total = meta.len();
    let mut local = tokio::fs::File::open(local_path)
        .await
        .map_err(|e| e.to_string())?;
    let mut remote = sftp.create(remote_path).await.map_err(|e| e.to_string())?;
    let mut loaded = 0u64;
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = local.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        remote
            .write_all(&buf[..n])
            .await
            .map_err(|e| e.to_string())?;
        loaded += n as u64;
        emit_transfer_progress(app, operation_id, loaded, total);
    }
    emit_transfer_progress(app, operation_id, total, total);
    Ok(json!({ "ok": true }))
}

async fn copy_remote(
    sftp: &SftpSession,
    remote_src: &str,
    remote_dest: &str,
    app: &AppHandle,
    operation_id: &str,
) -> Result<Value, String> {
    let meta = sftp.metadata(remote_src).await.map_err(|e| e.to_string())?;
    if meta.is_dir() {
        return Ok(json!({ "ok": false, "error": "Use download for folders" }));
    }
    let total = meta.len();
    let mut src = sftp.open(remote_src).await.map_err(|e| e.to_string())?;
    let mut dest = sftp
        .create(remote_dest)
        .await
        .map_err(|e| e.to_string())?;
    let mut loaded = 0u64;
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = src.read(&mut buf).await.map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        dest.write_all(&buf[..n])
            .await
            .map_err(|e| e.to_string())?;
        loaded += n as u64;
        emit_transfer_progress(app, operation_id, loaded, total);
    }
    emit_transfer_progress(app, operation_id, total.max(loaded), total.max(loaded));
    Ok(json!({ "ok": true }))
}

async fn run_find(
    app: &AppHandle,
    sftp: &SftpSession,
    options: &Value,
    operation_id: &str,
    cancel: &AtomicBool,
) -> Result<Value, String> {
    let mut ctx = FindCtx {
        app: app.clone(),
        operation_id: operation_id.to_string(),
        patterns: parse_find_patterns(
            options
                .get("pattern")
                .and_then(|v| v.as_str())
                .unwrap_or("*"),
        ),
        recursive: options
            .get("recursive")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        case_sensitive: options
            .get("caseSensitive")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        files_only: options
            .get("filesOnly")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        folders_only: options
            .get("foldersOnly")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        scanned_dirs: 0,
        match_count: 0,
        limit_reached: false,
    };
    let root = normalize_remote_path(
        options
            .get("rootPath")
            .and_then(|v| v.as_str())
            .unwrap_or("/"),
    );

    let root_meta = sftp.metadata(&root).await.map_err(|e| e.to_string())?;
    if !root_meta.is_dir() {
        let name = Path::new(&root)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(&root)
            .to_string();
        ctx.consider(
            &root,
            &name,
            false,
            root_meta.size,
            root_meta.mtime,
        );
        ctx.emit_progress(&root);
        return Ok(json!({
            "ok": true,
            "matchCount": ctx.match_count,
            "cancelled": cancel.load(Ordering::SeqCst),
            "limitReached": ctx.limit_reached.then_some(true),
        }));
    }

    ctx.walk(sftp, &root, cancel).await?;
    ctx.emit_progress(&root);

    Ok(json!({
        "ok": true,
        "matchCount": ctx.match_count,
        "cancelled": cancel.load(Ordering::SeqCst),
        "limitReached": ctx.limit_reached.then_some(true),
    }))
}

struct FindCtx {
    app: AppHandle,
    operation_id: String,
    patterns: Vec<String>,
    recursive: bool,
    case_sensitive: bool,
    files_only: bool,
    folders_only: bool,
    scanned_dirs: usize,
    match_count: usize,
    limit_reached: bool,
}

impl FindCtx {
    fn emit_progress(&self, current_dir: &str) {
        events::emit(
            &self.app,
            "sftp-find-progress",
            vec![json!({
                "operationId": self.operation_id,
                "scannedDirs": self.scanned_dirs,
                "matchCount": self.match_count,
                "currentDir": current_dir,
                "limitReached": if self.limit_reached { Value::Bool(true) } else { Value::Null },
            })],
        );
    }

    fn consider(
        &mut self,
        full_path: &str,
        name: &str,
        is_folder: bool,
        size: Option<u64>,
        mtime: Option<u32>,
    ) {
        if self.files_only && is_folder {
            return;
        }
        if self.folders_only && !is_folder {
            return;
        }
        if !name_matches_find_pattern(name, &self.patterns, self.case_sensitive) {
            return;
        }
        self.match_count += 1;
        events::emit(
            &self.app,
            "sftp-find-match",
            vec![json!({
                "operationId": self.operation_id,
                "match": {
                    "path": full_path,
                    "name": name,
                    "type": if is_folder { "folder" } else { "file" },
                    "size": size,
                    "mtime": mtime,
                }
            })],
        );
        if self.match_count >= MAX_FIND_MATCHES {
            self.limit_reached = true;
        }
    }

    async fn walk(
        &mut self,
        sftp: &SftpSession,
        dir_path: &str,
        cancel: &AtomicBool,
    ) -> Result<(), String> {
        if cancel.load(Ordering::SeqCst) || self.limit_reached {
            return Ok(());
        }
        self.scanned_dirs += 1;
        self.emit_progress(dir_path);
        let rd = sftp.read_dir(dir_path).await.map_err(|e| e.to_string())?;
        for entry in rd {
            if cancel.load(Ordering::SeqCst) || self.limit_reached {
                return Ok(());
            }
            let name = entry.file_name();
            if name == "." || name == ".." {
                continue;
            }
            let full = join_posix(dir_path, &name);
            let meta = entry.metadata();
            let is_folder = meta.is_dir();
            self.consider(&full, &name, is_folder, meta.size, meta.mtime);
            if is_folder && self.recursive && !self.limit_reached && !cancel.load(Ordering::SeqCst) {
                Box::pin(self.walk(sftp, &full, cancel)).await?;
            }
        }
        Ok(())
    }
}

fn parse_find_patterns(pattern: &str) -> Vec<String> {
    let parts: Vec<String> = pattern
        .split(';')
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect();
    if parts.is_empty() {
        vec!["*".to_string()]
    } else {
        parts
    }
}

fn glob_to_regex(pattern: &str, case_sensitive: bool) -> regex::Regex {
    let mut re = String::from("^");
    for ch in pattern.chars() {
        match ch {
            '*' => re.push_str(".*"),
            '?' => re.push('.'),
            c if ".+^${}()|[]\\".contains(c) => {
                re.push('\\');
                re.push(c);
            }
            c => re.push(c),
        }
    }
    re.push('$');
    let mut builder = regex::RegexBuilder::new(&re);
    builder.case_insensitive(!case_sensitive);
    builder
        .build()
        .unwrap_or_else(|_| regex::Regex::new("^$").unwrap())
}

fn name_matches_find_pattern(name: &str, patterns: &[String], case_sensitive: bool) -> bool {
    patterns
        .iter()
        .any(|p| glob_to_regex(p, case_sensitive).is_match(name))
}

fn arg_str(args: &[Value], index: usize) -> Result<String, String> {
    args.get(index)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Missing string argument at index {index}"))
}

fn arg_u64(args: &[Value], index: usize) -> u64 {
    args.get(index).and_then(|v| v.as_u64()).unwrap_or(0)
}
