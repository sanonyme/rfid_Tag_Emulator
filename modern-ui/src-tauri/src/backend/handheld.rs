use super::events::emit_port_str;
use super::handheld_recipe::{count_recipe_tags, iterate_recipe_tags, HandheldTag};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncWriteExt, BufWriter};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration, Instant};
use tauri::AppHandle;

fn now_string() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let secs = now.as_secs();
    let ms = now.subsec_millis();
    let days = secs / 86400;
    let day_time = secs % 86400;
    let h = day_time / 3600;
    let m = (day_time % 3600) / 60;
    let s = day_time % 60;
    // Approximate calendar date from unix epoch (good enough for handheld wire format)
    let (y, mo, d) = unix_to_ymd(days);
    format!("{y:04}-{mo:02}-{d:02} {h:02}:{m:02}:{s:02}.{ms:03}")
}

fn unix_to_ymd(days: u64) -> (i32, u32, u32) {
    let mut y = 1970i32;
    let mut remaining = days as i64;
    loop {
        let days_in_year = if is_leap(y) { 366 } else { 365 };
        if remaining < days_in_year {
            break;
        }
        remaining -= days_in_year;
        y += 1;
    }
    let months = [31, if is_leap(y) { 29 } else { 28 }, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let mut mo = 1u32;
    for &md in &months {
        if remaining < md {
            return (y, mo, remaining as u32 + 1);
        }
        remaining -= md;
        mo += 1;
    }
    (y, 12, 31)
}

fn is_leap(y: i32) -> bool {
    (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
}

fn handheld_rssi(tag: &HandheldTag) -> f64 {
    tag.rssi
        .parse::<f64>()
        .ok()
        .filter(|n| n.is_finite())
        .unwrap_or(70.0)
}

fn format_broadcast_line(tag: &HandheldTag, date: &str) -> String {
    format!(
        "{{\"epc\":\"{}\",\"tid\":\"{}\",\"date\":\"{}\",\"rssi\":{}}}\r\n",
        tag.epc.replace('\\', "\\\\").replace('"', "\\\""),
        tag.tid.replace('\\', "\\\\").replace('"', "\\\""),
        date,
        handheld_rssi(tag)
    )
}

fn format_payload(tags: &[HandheldTag]) -> String {
    let date = now_string();
    tags.iter()
        .map(|t| format_broadcast_line(t, &date))
        .collect()
}

struct PortServer {
    port: u16,
    running: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
    clients: Arc<Mutex<Vec<TcpStream>>>,
    listener_task: Mutex<Option<tokio::task::JoinHandle<()>>>,
    send_lock: Mutex<()>,
}

impl PortServer {
    fn new(port: u16) -> Self {
        Self {
            port,
            running: Arc::new(AtomicBool::new(false)),
            cancel: Arc::new(AtomicBool::new(false)),
            clients: Arc::new(Mutex::new(Vec::new())),
            listener_task: Mutex::new(None),
            send_lock: Mutex::new(()),
        }
    }

    async fn start(&self, app: AppHandle) {
        if self.running.load(Ordering::SeqCst) {
            emit_port_str(
                &app,
                "handheld-started",
                self.port,
                &format!("Handheld server already running on port {}", self.port),
            );
            return;
        }

        let addr = format!("0.0.0.0:{}", self.port);
        let listener = match TcpListener::bind(&addr).await {
            Ok(l) => l,
            Err(e) => {
                emit_port_str(
                    &app,
                    "handheld-error",
                    self.port,
                    &format!("Server error: {e}"),
                );
                return;
            }
        };

        self.running.store(true, Ordering::SeqCst);
        let running = Arc::clone(&self.running);
        let clients = Arc::clone(&self.clients);
        let port = self.port;
        let app2 = app.clone();

        let handle = tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((stream, addr)) => {
                        let client_addr = format!("{}:{}", addr.ip(), addr.port());
                        emit_port_str(
                            &app2,
                            "handheld-progress",
                            port,
                            &format!(
                                "Handheld device connected from {client_addr} (Total: {})",
                                clients.lock().await.len() + 1
                            ),
                        );
                        let mut list = clients.lock().await;
                        list.push(stream);
                    }
                    Err(e) => {
                        if running.load(Ordering::SeqCst) {
                            emit_port_str(
                                &app2,
                                "handheld-error",
                                port,
                                &format!("Server error: {e}"),
                            );
                        }
                        break;
                    }
                }
            }
        });

        *self.listener_task.lock().await = Some(handle);
        emit_port_str(
            &app,
            "handheld-started",
            self.port,
            &format!("Handheld server listening on port {}", self.port),
        );
    }

    async fn stop(&self, app: &AppHandle) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(h) = self.listener_task.lock().await.take() {
            h.abort();
        }
        let mut list = self.clients.lock().await;
        for mut c in list.drain(..) {
            let _ = c.shutdown().await;
        }
        emit_port_str(app, "handheld-stopped", self.port, "Handheld server stopped");
    }

    fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    fn cancel_send(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    async fn broadcast_batch(&self, tags: &[HandheldTag]) -> i32 {
        if tags.is_empty() {
            return 0;
        }
        let payload = format_payload(tags);
        let mut list = self.clients.lock().await;
        let snapshot: Vec<_> = list.drain(..).collect();
        drop(list);

        let mut kept = Vec::new();
        let mut sent = 0;
        for mut stream in snapshot {
            if self.cancel.load(Ordering::SeqCst) {
                kept.push(stream);
                return -1;
            }
            let mut writer = BufWriter::new(&mut stream);
            if writer.write_all(payload.as_bytes()).await.is_ok() {
                if writer.flush().await.is_ok() {
                    kept.push(stream);
                    sent += tags.len() as i32;
                    continue;
                }
            }
            let _ = stream.shutdown().await;
        }
        *self.clients.lock().await = kept;
        sent / tags.len().max(1) as i32
    }

    async fn send_tags(&self, app: AppHandle, tags: Vec<HandheldTag>, delay_ms: u64, verbose: bool) {
        let _guard = self.send_lock.lock().await;
        self.cancel.store(false, Ordering::SeqCst);

        if !self.is_running() || self.clients.lock().await.is_empty() {
            let msg = format!(
                "No handheld connected on port {} (Server running: {}, Connected clients: {})",
                self.port,
                self.is_running(),
                self.clients.lock().await.len()
            );
            emit_port_str(&app, "handheld-complete", self.port, &msg);
            return;
        }

        let total = tags.len();
        let mut last_progress = Instant::now() - Duration::from_secs(1);
        let mut sent_total = 0i32;

        for (i, tag) in tags.iter().enumerate() {
            if self.cancel.load(Ordering::SeqCst) {
                emit_port_str(&app, "handheld-complete", self.port, "Stopped: Cancelled by user");
                return;
            }
            let batch = self.broadcast_batch(std::slice::from_ref(tag)).await;
            if batch < 0 {
                emit_port_str(&app, "handheld-complete", self.port, "Stopped: Cancelled by user");
                return;
            }
            sent_total += 1;

            if verbose {
                let now = Instant::now();
                if i == 0
                    || i + 1 == total
                    || now.duration_since(last_progress) >= Duration::from_millis(120)
                    || (i + 1) % 50 == 0
                {
                    last_progress = now;
                    emit_port_str(
                        &app,
                        "handheld-progress",
                        self.port,
                        &format!(
                            "Sent ({}/{}): {} @rssi={}",
                            i + 1,
                            total,
                            tag.epc,
                            handheld_rssi(tag)
                        ),
                    );
                }
            }

            if delay_ms > 0 && i + 1 < total {
                let step = Duration::from_millis(delay_ms);
                let start = Instant::now();
                while start.elapsed() < step {
                    if self.cancel.load(Ordering::SeqCst) {
                        emit_port_str(
                            &app,
                            "handheld-complete",
                            self.port,
                            "Stopped: Cancelled by user",
                        );
                        return;
                    }
                    sleep(Duration::from_millis(10)).await;
                }
            }
        }

        emit_port_str(
            &app,
            "handheld-complete",
            self.port,
            &format!("Broadcasted {sent_total} EPC(s) to handheld clients"),
        );
    }

    async fn send_recipe(&self, app: AppHandle, recipe: Value, delay_ms: u64, verbose: bool) {
        let total = count_recipe_tags(&recipe);
        if total == 0 {
            emit_port_str(&app, "handheld-complete", self.port, "No EPCs to send");
            return;
        }
        let tags = iterate_recipe_tags(&recipe);
        self.send_tags(app, tags, delay_ms, verbose).await;
    }
}

pub struct HandheldManager {
    servers: Mutex<HashMap<u16, Arc<PortServer>>>,
}

impl HandheldManager {
    pub fn new() -> Self {
        Self {
            servers: Mutex::new(HashMap::new()),
        }
    }

    async fn get_or_create(&self, port: u16) -> Arc<PortServer> {
        let mut map = self.servers.lock().await;
        map.entry(port)
            .or_insert_with(|| Arc::new(PortServer::new(port)))
            .clone()
    }

    pub async fn start(&self, app: AppHandle, port: u16) {
        self.get_or_create(port).await.start(app).await;
    }

    pub async fn stop(&self, app: &AppHandle, port: u16) {
        let server = self.get_or_create(port).await;
        server.stop(app).await;
        self.servers.lock().await.remove(&port);
    }

    pub async fn is_running(&self, port: u16) -> bool {
        self.servers
            .lock()
            .await
            .get(&port)
            .map(|s| s.is_running())
            .unwrap_or(false)
    }

    pub async fn cancel_send(&self, port: u16) {
        if let Some(s) = self.servers.lock().await.get(&port) {
            s.cancel_send();
        }
    }

    pub async fn send_epcs(
        &self,
        app: AppHandle,
        port: u16,
        tags: Vec<HandheldTag>,
        delay_ms: u64,
        verbose: bool,
    ) {
        let server = self.get_or_create(port).await;
        tokio::spawn(async move {
            server.send_tags(app, tags, delay_ms, verbose).await;
        });
    }

    pub async fn send_recipe(
        &self,
        app: AppHandle,
        port: u16,
        recipe: Value,
        delay_ms: u64,
        verbose: bool,
    ) {
        let server = self.get_or_create(port).await;
        tokio::spawn(async move {
            server.send_recipe(app, recipe, delay_ms, verbose).await;
        });
    }
}

pub fn parse_handheld_tags(arr: &[Value]) -> Vec<HandheldTag> {
    arr.iter()
        .filter_map(|v| {
            let epc = v.get("epc")?.as_str()?.to_string();
            let tid = v
                .get("tid")
                .and_then(|t| t.as_str())
                .unwrap_or(&epc)
                .to_string();
            let rssi = v
                .get("rssi")
                .and_then(|r| r.as_str())
                .unwrap_or("70")
                .to_string();
            Some(HandheldTag { epc, tid, rssi })
        })
        .collect()
}
