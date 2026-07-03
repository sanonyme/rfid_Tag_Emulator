use base64::{engine::general_purpose::STANDARD, Engine as _};
use reqwest::Client;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::Duration;

const EDGE_PASSWORD_SALT: &str = "QGFjdGl2ZQ==";

fn embedded_ale_username() -> String {
    option_env!("ZEUS_EMBED_ALE_USERNAME")
        .unwrap_or("")
        .trim()
        .to_string()
}

fn embedded_ale_password() -> String {
    option_env!("ZEUS_EMBED_ALE_PASSWORD")
        .unwrap_or("")
        .trim()
        .to_string()
}

fn env_var(keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Ok(v) = std::env::var(key) {
            let t = v.trim().to_string();
            if !t.is_empty() {
                return Some(t);
            }
        }
    }
    None
}

pub fn get_ale_credentials() -> Option<(String, String)> {
    let username = env_var(&["ZEUS_ALE_USERNAME", "VITE_ALE_USERNAME"])
        .unwrap_or_else(embedded_ale_username);
    let password = env_var(&["ZEUS_ALE_PASSWORD", "VITE_ALE_PASSWORD"])
        .unwrap_or_else(embedded_ale_password);
    if username.is_empty() || password.is_empty() {
        return None;
    }
    Some((username, password))
}

pub fn password_looks_hashed(value: &str) -> bool {
    let t = value.trim();
    t.len() == 64 && t.chars().all(|c| c.is_ascii_hexdigit())
}

pub fn resolve_ale_secret(password: &str) -> String {
    let trimmed = password.trim();
    if password_looks_hashed(trimmed) {
        return trimmed.to_string();
    }
    let mut hasher = Sha256::new();
    hasher.update(format!("{trimmed}{EDGE_PASSWORD_SALT}").as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn make_ale_basic_auth_header(username: &str, password: &str) -> String {
    let secret = resolve_ale_secret(password);
    let token = STANDARD.encode(format!("{}:{}", username.trim(), secret));
    format!("Basic {token}")
}

pub fn ale_get_credential_meta() -> Value {
    match get_ale_credentials() {
        Some((username, password)) => json!({
            "ok": true,
            "username": username,
            "passwordIsHashed": password_looks_hashed(&password),
        }),
        None => json!({
            "ok": false,
            "error": "Set ZEUS_ALE_USERNAME and ZEUS_ALE_PASSWORD in modern-ui/.env"
        }),
    }
}

pub fn ale_get_basic_auth_header() -> Value {
    match get_ale_credentials() {
        Some((username, password)) => json!({
            "ok": true,
            "username": username,
            "header": make_ale_basic_auth_header(&username, &password),
        }),
        None => json!({ "ok": false, "error": "ALE credentials not configured" }),
    }
}

fn ale_response_value(
    ok: bool,
    status: u16,
    status_text: &str,
    data: Value,
    headers: serde_json::Map<String, Value>,
) -> Value {
    json!({
        "ok": ok,
        "status": status,
        "statusText": status_text,
        "data": data,
        "headers": headers,
    })
}

pub async fn run_ale_request(client: &Client, url: &str, options: &Value) -> Value {
    let timeout_ms = options
        .get("timeoutMs")
        .and_then(|v| v.as_u64())
        .filter(|&n| n > 0)
        .unwrap_or(8000);

    let mut body = options.get("body").and_then(|v| v.as_str()).map(String::from);
    if url.contains("/ALE/api/auth") {
        if let Some(ref b) = body {
            if let Ok(mut parsed) = serde_json::from_str::<Value>(b) {
                if let Some(obj) = parsed.as_object_mut() {
                    let inject = obj.get("username").and_then(|v| v.as_str()) == Some("use_env_vars")
                        || obj.get("password").and_then(|v| v.as_str()) == Some("use_env_vars");
                    if inject {
                        if let Some((user, pass)) = get_ale_credentials() {
                            obj.insert("username".into(), Value::String(user));
                            obj.insert(
                                "password".into(),
                                Value::String(resolve_ale_secret(&pass)),
                            );
                            body = Some(parsed.to_string());
                        }
                    }
                }
            }
        }
    }

    let method = options
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("GET");
    let mut req = match method.to_uppercase().as_str() {
        "POST" => client.post(url),
        "PUT" => client.put(url),
        "DELETE" => client.delete(url),
        "PATCH" => client.patch(url),
        _ => client.get(url),
    };
    req = req.timeout(Duration::from_millis(timeout_ms));

    if let Some(headers) = options.get("headers").and_then(|v| v.as_object()) {
        for (k, v) in headers {
            if let Some(s) = v.as_str() {
                req = req.header(k.as_str(), s);
            }
        }
    }
    if let Some(b) = body {
        req = req.body(b);
    }

    match req.send().await {
        Ok(res) => {
            let status = res.status().as_u16();
            let status_text = res.status().canonical_reason().unwrap_or("").to_string();
            let ok = res.status().is_success();
            let mut header_map = serde_json::Map::new();
            for (k, v) in res.headers() {
                if let Ok(s) = v.to_str() {
                    header_map.insert(k.as_str().to_string(), Value::String(s.to_string()));
                }
            }
            if let Some(sc) = header_map.get("set-cookie").and_then(|v| v.as_str()) {
                let trimmed = sc.split(';').next().unwrap_or(sc).trim();
                header_map.insert("set-cookie".into(), Value::String(trimmed.to_string()));
            }
            let text = res.text().await.unwrap_or_default();
            ale_response_value(ok, status, &status_text, Value::String(text), header_map)
        }
        Err(e) => {
            let mut msg = e.to_string();
            if e.is_timeout() {
                msg = format!(
                    "Connection timed out after {}s. Check that the server is reachable at the given IP and port (try http://IP:port in a browser).",
                    timeout_ms / 1000
                );
            } else if msg.contains("Connection refused") {
                msg = "Connection refused. Server may be down, or the port is wrong (try 80, 8080, or 8081).".into();
            } else if msg.contains("timed out") || msg.contains("dns") {
                msg = "Host unreachable. Check network, firewall, and that the IP is correct.".into();
            }
            ale_response_value(false, 0, &msg, Value::Null, serde_json::Map::new())
        }
    }
}

pub async fn ale_request_batch(client: &Client, requests: &[Value]) -> Value {
    let mut out = Vec::new();
    for req in requests {
        let url = req.get("url").and_then(|v| v.as_str()).unwrap_or("");
        let options = req.get("options").cloned().unwrap_or(json!({}));
        out.push(run_ale_request(client, url, &options).await);
    }
    Value::Array(out)
}
