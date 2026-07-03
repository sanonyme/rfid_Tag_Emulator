use super::paths;
use reqwest::Client;
use serde_json::{json, Value};
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

const STATE_FILE: &str = "install-registry.json";
const MIN_INTERVAL_MS: u64 = 24 * 60 * 60 * 1000;
const SEND_NOW_COOLDOWN_MS: u64 = 60_000;

#[derive(serde::Serialize, serde::Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
struct InstallRegistryPayload {
    machine_id: String,
    mac_address: Option<String>,
    version: String,
    os: String,
    arch: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct RegistryState {
    #[serde(default = "default_enabled")]
    enabled: bool,
    last_sent_at: Option<u64>,
    last_manual_send_at: Option<u64>,
    last_sent_status: Option<String>,
    last_sent_error: Option<String>,
}

fn default_enabled() -> bool {
    true
}

fn registry_url() -> String {
    std::env::var("INSTALL_REGISTRY_URL")
        .unwrap_or_else(|_| option_env!("ZEUS_EMBED_INSTALL_REGISTRY_URL").unwrap_or("").to_string())
        .trim()
        .to_string()
}

fn registry_token() -> String {
    std::env::var("REGISTRY_TOKEN")
        .unwrap_or_else(|_| option_env!("ZEUS_EMBED_REGISTRY_TOKEN").unwrap_or("").to_string())
        .trim()
        .to_string()
}

fn state_path() -> std::io::Result<std::path::PathBuf> {
    Ok(paths::ensure_data_dir()?.join(STATE_FILE))
}

fn read_state() -> RegistryState {
    let path = match state_path() {
        Ok(p) => p,
        Err(_) => return RegistryState {
            enabled: true,
            last_sent_at: None,
            last_manual_send_at: None,
            last_sent_status: None,
            last_sent_error: None,
        },
    };
    if !path.exists() {
        return RegistryState {
            enabled: true,
            last_sent_at: None,
            last_manual_send_at: None,
            last_sent_status: None,
            last_sent_error: None,
        };
    }
    fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or(RegistryState {
            enabled: true,
            last_sent_at: None,
            last_manual_send_at: None,
            last_sent_status: None,
            last_sent_error: None,
        })
}

fn write_state(s: &RegistryState) {
    if let Ok(path) = state_path() {
        let _ = fs::write(path, serde_json::to_string_pretty(s).unwrap_or_default());
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn primary_mac() -> Option<String> {
    mac_address::get_mac_address()
        .ok()
        .flatten()
        .map(|m| m.to_string())
}

fn machine_id_string() -> String {
    machine_uid::get().unwrap_or_default()
}

fn current_payload() -> InstallRegistryPayload {
    InstallRegistryPayload {
        machine_id: machine_id_string(),
        mac_address: primary_mac(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

fn send_now_cooldown_ms(s: &RegistryState) -> u64 {
    match s.last_manual_send_at {
        None => 0,
        Some(t) => SEND_NOW_COOLDOWN_MS.saturating_sub(now_ms().saturating_sub(t)),
    }
}

pub fn get_status() -> Value {
    let url = registry_url();
    let s = read_state();
    json!({
        "enabled": s.enabled,
        "endpoint": if url.is_empty() { Value::Null } else { Value::String(url) },
        "lastSentAt": s.last_sent_at,
        "sendNowAfterMs": send_now_cooldown_ms(&s),
        "lastSentStatus": s.last_sent_status,
        "lastSentError": s.last_sent_error,
        "hasToken": !registry_token().is_empty(),
        "nextPayload": current_payload(),
    })
}

pub fn set_enabled(value: bool) -> Value {
    let mut s = read_state();
    s.enabled = value;
    write_state(&s);
    Value::Bool(s.enabled)
}

pub async fn send_now(client: &Client, force: bool) -> Value {
    let url = registry_url();
    if url.is_empty() {
        let mut s = read_state();
        s.last_sent_status = Some("disabled".into());
        s.last_sent_error = Some("INSTALL_REGISTRY_URL not set".into());
        write_state(&s);
        return json!({ "status": "disabled", "error": "INSTALL_REGISTRY_URL not set" });
    }
    let mut s = read_state();
    if !s.enabled {
        s.last_sent_status = Some("disabled".into());
        s.last_sent_error = Some("disabled by user".into());
        write_state(&s);
        return json!({ "status": "disabled", "error": "disabled by user" });
    }

    let payload = current_payload();
    if payload.machine_id.is_empty() {
        s.last_sent_status = Some("error".into());
        s.last_sent_error = Some("no machine id".into());
        write_state(&s);
        return json!({ "status": "error", "error": "no machine id", "payload": payload });
    }

    let now = now_ms();
    if force {
        if let Some(last) = s.last_manual_send_at {
            if now.saturating_sub(last) < SEND_NOW_COOLDOWN_MS {
                return json!({
                    "status": "skipped",
                    "error": "Send now: please wait before sending again.",
                    "sendNowAfterMs": send_now_cooldown_ms(&s),
                    "payload": payload,
                });
            }
        }
        s.last_manual_send_at = Some(now);
        write_state(&s);
    } else if let Some(last) = s.last_sent_at {
        if now.saturating_sub(last) < MIN_INTERVAL_MS {
            return json!({ "status": "skipped", "payload": payload });
        }
    }

    let mut req = client.post(&url).header("Content-Type", "application/json");
    let token = registry_token();
    if !token.is_empty() {
        req = req.header("Authorization", format!("Bearer {token}"));
    }

    match req.json(&payload).send().await {
        Ok(res) => {
            let status = res.status();
            if status.is_success() {
                let mut s = read_state();
                s.last_sent_at = Some(now);
                s.last_sent_status = Some("success".into());
                s.last_sent_error = None;
                write_state(&s);
                json!({ "status": "success", "payload": payload })
            } else {
                let err_text = res.text().await.unwrap_or_default();
                let msg = format!(
                    "HTTP {}: {}",
                    status,
                    err_text.chars().take(200).collect::<String>()
                );
                let mut s = read_state();
                s.last_sent_at = Some(now);
                s.last_sent_status = Some("error".into());
                s.last_sent_error = Some(msg.clone());
                write_state(&s);
                json!({ "status": "error", "error": msg, "payload": payload })
            }
        }
        Err(e) => {
            let msg = e.to_string();
            let mut s = read_state();
            s.last_sent_at = Some(now);
            s.last_sent_status = Some("error".into());
            s.last_sent_error = Some(msg.clone());
            write_state(&s);
            json!({ "status": "error", "error": msg, "payload": payload })
        }
    }
}
