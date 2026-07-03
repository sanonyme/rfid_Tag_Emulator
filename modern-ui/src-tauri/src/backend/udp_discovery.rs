use super::events;
use regex::Regex;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::AppHandle;
use tokio::net::UdpSocket;
use tokio::sync::Mutex;
use tokio::task::JoinHandle;

struct UdpDiscoveryState {
    socket: Arc<UdpSocket>,
    stop_task: Option<JoinHandle<()>>,
}

pub struct UdpDiscoveryService {
    state: Arc<Mutex<Option<UdpDiscoveryState>>>,
}

impl UdpDiscoveryService {
    pub fn new() -> Self {
        Self {
            state: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn start(
        &self,
        app: AppHandle,
        local_port: u16,
        listen_duration_ms: u64,
    ) -> Result<Value, String> {
        if self.state.lock().await.is_some() {
            return Ok(json!({
                "ok": false,
                "error": "UDP discovery is already running. Stop it first."
            }));
        }

        let addr = format!("0.0.0.0:{local_port}");
        let socket = UdpSocket::bind(&addr)
            .await
            .map_err(|e| e.to_string())?;
        let _ = socket.set_broadcast(true);
        let socket = Arc::new(socket);

        let app_recv = app.clone();
        let socket_recv = socket.clone();
        tokio::spawn(async move {
            let mut buf = vec![0u8; 65535];
            loop {
                match socket_recv.recv_from(&mut buf).await {
                    Ok((len, from)) => {
                        let raw = String::from_utf8_lossy(&buf[..len]).to_string();
                        events::emit(
                            &app_recv,
                            "udp-discovery-raw",
                            vec![json!({
                                "data": raw,
                                "from": from.ip().to_string(),
                                "fromPort": from.port(),
                                "timestamp": chrono_timestamp_ms(),
                            })],
                        );
                        if let Some(device) = parse_heartbeat(&raw, &from.ip().to_string()) {
                            events::emit(&app_recv, "udp-discovery-device", vec![device]);
                        }
                    }
                    Err(_) => break,
                }
            }
        });

        events::emit(
            &app,
            "udp-discovery-started",
            vec![json!({ "port": local_port })],
        );

        let stop_task = if listen_duration_ms > 0 {
            let state_ref = self.state.clone();
            let app_stop = app.clone();
            Some(tokio::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(listen_duration_ms)).await;
                let mut guard = state_ref.lock().await;
                if guard.is_some() {
                    *guard = None;
                    events::emit(
                        &app_stop,
                        "udp-discovery-stopped",
                        vec![json!({ "reason": "timeout" })],
                    );
                }
            }))
        } else {
            None
        };

        *self.state.lock().await = Some(UdpDiscoveryState {
            socket,
            stop_task,
        });

        Ok(json!({ "ok": true }))
    }

    pub async fn stop(&self) -> Value {
        if let Some(state) = self.state.lock().await.take() {
            if let Some(task) = state.stop_task {
                task.abort();
            }
        }
        json!({ "ok": true })
    }

    pub async fn send_probe(
        &self,
        target_ip: &str,
        target_port: u16,
        message: &str,
    ) -> Result<Value, String> {
        let guard = self.state.lock().await;
        let Some(state) = guard.as_ref() else {
            return Ok(json!({
                "ok": false,
                "error": "UDP discovery socket is not running. Start discovery first."
            }));
        };
        let addr = format!("{target_ip}:{target_port}");
        state
            .socket
            .send_to(message.as_bytes(), &addr)
            .await
            .map_err(|e| e.to_string())?;
        Ok(json!({ "ok": true }))
    }

    pub async fn is_running(&self) -> Value {
        json!(self.state.lock().await.is_some())
    }
}

fn chrono_timestamp_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn extract_property_value(xml: &str, prop_name: &str) -> String {
    let re = match Regex::new(&format!(
        r"(?s)<CProperty>\s*<Name>{prop_name}</Name>\s*<Value>([^<]*)</Value>\s*</CProperty>"
    )) {
        Ok(r) => r,
        Err(_) => return String::new(),
    };
    re.captures(xml)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string())
        .unwrap_or_default()
}

fn parse_heartbeat(data: &str, remote_addr: &str) -> Option<Value> {
    if !data.contains("CEdgeHeartBeatModel") {
        return None;
    }
    let ip = {
        let v = extract_property_value(data, "IPAddress");
        if v.is_empty() {
            remote_addr.to_string()
        } else {
            v
        }
    };
    let port_str = extract_property_value(data, "Port");
    let port = port_str.parse::<u64>().unwrap_or(0);
    let guid = extract_xml_value(data, "Guid");
    let mac = extract_xml_value(data, "MACAddress");
    let version = extract_xml_value(data, "Version");
    let last_pd_update = extract_xml_value(data, "LastPDUpdate");
    let errors = extract_xml_value(data, "Errors");
    let name = if !extract_property_value(data, "showDashBoardInfo").is_empty() {
        format!("Edge ({})", if mac.is_empty() { &ip } else { &mac })
    } else {
        "Edge Device".to_string()
    };
    Some(json!({
        "ip": ip,
        "port": port,
        "guid": guid,
        "mac": mac,
        "version": version,
        "lastPDUpdate": last_pd_update,
        "errors": errors,
        "name": name,
        "raw": data,
        "discoveredAt": chrono_timestamp_ms(),
    }))
}

// Option-style helpers for extract_xml_value without ? in non-Option fn
fn extract_xml_value(xml: &str, tag: &str) -> String {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    match (xml.find(&open), xml.find(&close)) {
        (Some(start), Some(end)) if end > start => {
            xml[start + open.len()..end].trim().to_string()
        }
        _ => String::new(),
    }
}
