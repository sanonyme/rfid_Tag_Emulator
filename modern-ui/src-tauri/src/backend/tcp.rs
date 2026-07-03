use super::events::emit_str;
use serde_json::Value;
use std::{
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc,
    },
    time::Duration,
};
use tauri::AppHandle;
use tokio::{
    io::AsyncWriteExt,
    net::TcpStream,
    sync::Mutex,
    time::sleep,
};

pub struct TcpService {
    stream: Arc<Mutex<Option<TcpStream>>>,
    connected: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
    generation: Arc<AtomicU64>,
}

impl TcpService {
    pub fn new() -> Self {
        Self {
            stream: Arc::new(Mutex::new(None)),
            connected: Arc::new(AtomicBool::new(false)),
            cancel: Arc::new(AtomicBool::new(false)),
            generation: Arc::new(AtomicU64::new(0)),
        }
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::SeqCst)
    }

    pub async fn connect(&self, app: &AppHandle, host: &str, port: u16) -> Value {
        if self.connected.load(Ordering::SeqCst) {
            let msg = "Already connected";
            emit_str(app, "tcp-error", msg);
            return serde_json::json!({ "ok": false, "error": msg });
        }

        let gen = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        {
            let mut guard = self.stream.lock().await;
            *guard = None;
        }
        self.connected.store(false, Ordering::SeqCst);

        let addr = format!("{host}:{port}");
        let connect = tokio::time::timeout(Duration::from_secs(15), TcpStream::connect(&addr)).await;

        match connect {
            Ok(Ok(stream)) => {
                if self.generation.load(Ordering::SeqCst) != gen {
                    return serde_json::json!({ "ok": false, "error": "Connection cancelled" });
                }
                *self.stream.lock().await = Some(stream);
                self.connected.store(true, Ordering::SeqCst);
                let message = format!("Connected to {host}:{port}");
                emit_str(app, "tcp-connected", &message);
                serde_json::json!({ "ok": true, "message": message })
            }
            Ok(Err(e)) => {
                let err = format!("Connection error: {e}");
                emit_str(app, "tcp-error", &err);
                serde_json::json!({ "ok": false, "error": e.to_string() })
            }
            Err(_) => {
                let err = "Connection timed out";
                emit_str(app, "tcp-error", err);
                serde_json::json!({ "ok": false, "error": err })
            }
        }
    }

    pub async fn disconnect(&self, app: &AppHandle) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        self.connected.store(false, Ordering::SeqCst);
        let mut guard = self.stream.lock().await;
        *guard = None;
        emit_str(app, "tcp-disconnected", "Disconnected successfully");
    }

    pub fn cancel_send(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub async fn send_tags(
        &self,
        app: AppHandle,
        tags: Vec<Value>,
        driver_code: String,
        delay_ms: u64,
    ) {
        if !self.connected.load(Ordering::SeqCst) {
            emit_str(&app, "tcp-error", "Not connected to server");
            return;
        }

        self.cancel.store(false, Ordering::SeqCst);
        let total = tags.len();
        let mut count = 0usize;

        for tag in tags {
            if self.cancel.load(Ordering::SeqCst) {
                emit_str(&app, "tcp-complete", "Stopped: Cancelled by user");
                return;
            }
            if !self.connected.load(Ordering::SeqCst) {
                emit_str(&app, "tcp-complete", "Stopped: Connection lost");
                return;
            }

            let message = format_tcp_tag_message(&tag, &driver_code);
            let write_result = {
                let mut guard = self.stream.lock().await;
                match guard.as_mut() {
                    Some(stream) => stream.write_all(message.as_bytes()).await,
                    None => {
                        self.connected.store(false, Ordering::SeqCst);
                        emit_str(&app, "tcp-complete", "Stopped: Connection lost");
                        return;
                    }
                }
            };

            if let Err(e) = write_result {
                self.connected.store(false, Ordering::SeqCst);
                emit_str(&app, "tcp-error", &format!("Send error: {e}"));
                return;
            }

            count += 1;
            let epc = tag.get("epc").and_then(|v| v.as_str()).unwrap_or("");
            let rssi = tag.get("rssi").and_then(|v| v.as_str()).unwrap_or("");
            emit_str(
                &app,
                "tcp-progress",
                &format!("Sent ({count}/{total}): {epc} @rssi={rssi}"),
            );

            if delay_ms > 0 && count < total {
                let step = delay_ms.min(50);
                let mut waited = 0u64;
                while waited < delay_ms {
                    if self.cancel.load(Ordering::SeqCst) {
                        emit_str(&app, "tcp-complete", "Stopped: Cancelled by user");
                        return;
                    }
                    sleep(Duration::from_millis(step)).await;
                    waited += step;
                }
            }
        }

        emit_str(
            &app,
            "tcp-complete",
            &format!("Successfully sent {count} tag(s)"),
        );
    }

    pub fn clone_refs(&self) -> Self {
        Self {
            stream: Arc::clone(&self.stream),
            connected: Arc::clone(&self.connected),
            cancel: Arc::clone(&self.cancel),
            generation: Arc::clone(&self.generation),
        }
    }
}

fn format_tcp_tag_message(tag: &Value, driver: &str) -> String {
    let epc = tag.get("epc").and_then(|v| v.as_str()).unwrap_or("");
    let tid = tag.get("tid").and_then(|v| v.as_str()).unwrap_or("");
    let uid = tag.get("uid").and_then(|v| v.as_str()).unwrap_or("");
    let antenna = tag.get("antenna").and_then(|v| v.as_u64()).unwrap_or(1);
    let rssi = tag.get("rssi").and_then(|v| v.as_str()).unwrap_or("-45.0");
    format!(
        "driver={driver} epc={epc} @tid={tid} uid={uid} antenna={antenna} @rssi={rssi}\n"
    )
}

pub async fn send_tcp_message(host: &str, port: u16, message: &str) -> Result<(), String> {
    let addr = format!("{host}:{port}");
    let mut stream = tokio::time::timeout(Duration::from_secs(10), TcpStream::connect(&addr))
        .await
        .map_err(|_| "Connection timed out".to_string())?
        .map_err(|e| e.to_string())?;
    stream
        .write_all(message.as_bytes())
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}
