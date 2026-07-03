use serde_json::{json, Value};
use std::path::{Path, PathBuf};

#[derive(serde::Serialize)]
struct LocalListEntry {
    name: String,
    #[serde(rename = "type")]
    entry_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mtime: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    mode: Option<u32>,
}

fn norm_root(root: &Path) -> PathBuf {
    let r = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    if r.to_string_lossy().ends_with(std::path::MAIN_SEPARATOR) {
        r
    } else {
        let mut s = r.to_string_lossy().to_string();
        s.push(std::path::MAIN_SEPARATOR);
        PathBuf::from(s)
    }
}

pub fn assert_path_under_root(root: &str, target: &str) -> Option<PathBuf> {
    let resolved_root = Path::new(root).canonicalize().ok()?;
    let resolved = Path::new(target).canonicalize().ok()?;
    let norm = norm_root(&resolved_root);
    if resolved == resolved_root || resolved.starts_with(&norm) {
        Some(resolved)
    } else {
        None
    }
}

pub fn local_readdir(root: &str, dir_path: &str) -> Value {
    let Some(safe) = assert_path_under_root(root, dir_path) else {
        return json!({ "ok": false, "error": "Path outside local root" });
    };
    let meta = match std::fs::metadata(&safe) {
        Ok(m) if m.is_dir() => m,
        Ok(_) => return json!({ "ok": false, "error": "Not a directory" }),
        Err(e) => return json!({ "ok": false, "error": e.to_string() }),
    };
    let _ = meta;
    let read = match std::fs::read_dir(&safe) {
        Ok(r) => r,
        Err(e) => return json!({ "ok": false, "error": e.to_string() }),
    };
    let mut entries: Vec<LocalListEntry> = Vec::new();
    for item in read.flatten() {
        let name = item.file_name().to_string_lossy().to_string();
        if name == "." || name == ".." {
            continue;
        }
        if let Ok(st) = item.metadata() {
            entries.push(LocalListEntry {
                name,
                entry_type: if st.is_dir() { "folder" } else { "file" }.into(),
                size: st.is_file().then_some(st.len()),
                mtime: st
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs() as i64),
                mode: Some(st.permissions().readonly() as u32),
            });
        }
    }
    entries.sort_by(|a, b| {
        if a.entry_type != b.entry_type {
            return if a.entry_type == "folder" {
                std::cmp::Ordering::Less
            } else {
                std::cmp::Ordering::Greater
            };
        }
        a.name.to_lowercase().cmp(&b.name.to_lowercase())
    });
    json!({ "ok": true, "entries": entries })
}

pub fn local_path_parent(root: &str, cwd: &str) -> Value {
    let Some(safe_cwd) = assert_path_under_root(root, cwd) else {
        return json!({ "ok": false, "error": "Path outside local root" });
    };
    let resolved_root = Path::new(root)
        .canonicalize()
        .unwrap_or_else(|_| Path::new(root).to_path_buf());
    if safe_cwd == resolved_root {
        return json!({ "ok": true, "parent": Value::Null });
    }
    let parent = safe_cwd.parent().map(|p| p.to_path_buf()).unwrap_or(resolved_root.clone());
    let safe_parent = assert_path_under_root(root, &parent.to_string_lossy());
    json!({
        "ok": true,
        "parent": safe_parent
            .map(|p| Value::String(p.to_string_lossy().to_string()))
            .unwrap_or_else(|| Value::String(resolved_root.to_string_lossy().to_string()))
    })
}

pub fn local_write_file_base64(root: &str, file_path: &str, base64_data: &str) -> Value {
    let Some(safe) = assert_path_under_root(root, file_path) else {
        return json!({ "ok": false, "error": "Path outside local root" });
    };
    use base64::{engine::general_purpose::STANDARD, Engine as _};
    let buf = match STANDARD.decode(base64_data) {
        Ok(b) => b,
        Err(_) => return json!({ "ok": false, "error": "Invalid base64" }),
    };
    match std::fs::write(&safe, buf) {
        Ok(()) => json!({ "ok": true }),
        Err(e) => json!({ "ok": false, "error": e.to_string() }),
    }
}
