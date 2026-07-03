use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use rand::RngCore;
use serde_json::{json, Value};
use std::{
    fs,
    path::PathBuf,
};

fn data_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".zeus-rfid-emulator")
}

fn ensure_data_dir() -> std::io::Result<PathBuf> {
    let dir = data_dir();
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn secrets_path() -> std::io::Result<PathBuf> {
    Ok(ensure_data_dir()?.join("secrets.json"))
}

fn api_config_path() -> std::io::Result<PathBuf> {
    Ok(ensure_data_dir()?.join("api-config.json"))
}

fn derive_key() -> [u8; 32] {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    data_dir().hash(&mut hasher);
    "zeus-pure-tauri-secrets".hash(&mut hasher);
    let h = hasher.finish();
    let mut key = [0u8; 32];
    key[..8].copy_from_slice(&h.to_le_bytes());
    key[8..16].copy_from_slice(&h.to_be_bytes());
    key[16..24].copy_from_slice(&(h.rotate_left(17)).to_le_bytes());
    key[24..32].copy_from_slice(&(h.rotate_right(11)).to_le_bytes());
    key
}

fn encrypt(value: &str) -> Result<String, String> {
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let mut iv = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut iv);
    let nonce = Nonce::from_slice(&iv);
    let ciphertext = cipher
        .encrypt(nonce, value.as_bytes())
        .map_err(|e| e.to_string())?;
    let mut out = iv.to_vec();
    out.extend(ciphertext);
    Ok(base64_encode(&out))
}

fn decrypt(encoded: &str) -> Result<String, String> {
    let data = base64_decode(encoded)?;
    if data.len() < 12 {
        return Err("Invalid secret blob".into());
    }
    let (iv, ciphertext) = data.split_at(12);
    let key = derive_key();
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(iv);
    let plain = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decrypt failed".to_string())?;
    String::from_utf8(plain).map_err(|e| e.to_string())
}

fn base64_encode(data: &[u8]) -> String {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    STANDARD.encode(data)
}

fn base64_decode(s: &str) -> Result<Vec<u8>, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    STANDARD.decode(s).map_err(|e| e.to_string())
}

pub fn safe_store_set(key: &str, value: &str) -> Result<Value, String> {
    let path = secrets_path().map_err(|e| e.to_string())?;
    let mut data: serde_json::Map<String, Value> = if path.exists() {
        serde_json::from_str(&fs::read_to_string(&path).unwrap_or_default()).unwrap_or_default()
    } else {
        serde_json::Map::new()
    };
    data.insert(key.to_string(), Value::String(encrypt(value)?));
    fs::write(&path, serde_json::to_string(&data).unwrap()).map_err(|e| e.to_string())?;
    Ok(Value::Bool(true))
}

pub fn safe_store_get(key: &str) -> Result<Value, String> {
    let path = secrets_path().map_err(|e| e.to_string())?;
    if !path.exists() {
        return Ok(Value::Null);
    }
    let data: serde_json::Map<String, Value> =
        serde_json::from_str(&fs::read_to_string(&path).map_err(|e| e.to_string())?)
            .unwrap_or_default();
    match data.get(key) {
        Some(Value::String(enc)) => Ok(Value::String(decrypt(enc)?)),
        _ => Ok(Value::Null),
    }
}

pub fn safe_store_delete(key: &str) -> Result<Value, String> {
    let path = secrets_path().map_err(|e| e.to_string())?;
    if !path.exists() {
        return Ok(Value::Null);
    }
    let mut data: serde_json::Map<String, Value> =
        serde_json::from_str(&fs::read_to_string(&path).map_err(|e| e.to_string())?)
            .unwrap_or_default();
    data.remove(key);
    fs::write(&path, serde_json::to_string(&data).unwrap()).map_err(|e| e.to_string())?;
    Ok(Value::Null)
}

pub fn get_api_config() -> Value {
    let path = match api_config_path() {
        Ok(p) => p,
        Err(_) => {
            return json!({ "headerName": "itx-apiKey", "key": "" });
        }
    };
    if !path.exists() {
        return json!({ "headerName": "itx-apiKey", "key": "" });
    }
    let raw = fs::read_to_string(path).unwrap_or_default();
    let config: Value = serde_json::from_str(&raw).unwrap_or(json!({}));
    json!({
        "headerName": config.get("headerName").and_then(|v| v.as_str()).unwrap_or("itx-apiKey"),
        "key": config.get("key").and_then(|v| v.as_str()).unwrap_or(""),
    })
}

pub fn save_api_config(header_name: &str, key: &str) -> Result<Value, String> {
    let path = api_config_path().map_err(|e| e.to_string())?;
    fs::write(
        &path,
        serde_json::to_string(&json!({
            "headerName": if header_name.is_empty() { "itx-apiKey" } else { header_name },
            "key": key,
        }))
        .unwrap(),
    )
    .map_err(|e| e.to_string())?;
    Ok(Value::Null)
}
