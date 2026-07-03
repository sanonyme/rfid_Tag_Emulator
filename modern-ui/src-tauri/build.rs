fn main() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_default();
    let project_env = std::path::Path::new(&manifest_dir).join("..").join(".env");
    let local_env = std::path::Path::new(&manifest_dir).join(".env");

    println!("cargo:rerun-if-changed=../.env");
    println!("cargo:rerun-if-changed=.env");
    println!("cargo:rerun-if-changed=tauri.conf.json");

    for env_path in [&project_env, &local_env] {
        if env_path.is_file() {
            if let Ok(iter) = dotenvy::from_path_iter(env_path) {
                for item in iter.flatten() {
                    apply_embed_var(&item.0, &item.1);
                }
            }
        }
    }

    for (key, embed) in [
        ("ZEUS_ALE_USERNAME", "ZEUS_EMBED_ALE_USERNAME"),
        ("VITE_ALE_USERNAME", "ZEUS_EMBED_ALE_USERNAME"),
        ("ZEUS_ALE_PASSWORD", "ZEUS_EMBED_ALE_PASSWORD"),
        ("VITE_ALE_PASSWORD", "ZEUS_EMBED_ALE_PASSWORD"),
        ("INSTALL_REGISTRY_URL", "ZEUS_EMBED_INSTALL_REGISTRY_URL"),
        ("REGISTRY_TOKEN", "ZEUS_EMBED_REGISTRY_TOKEN"),
        ("ZEUS_RELEASE_OWNER", "ZEUS_EMBED_RELEASE_OWNER"),
        ("ZEUS_RELEASE_REPO", "ZEUS_EMBED_RELEASE_REPO"),
        ("ZEUS_SECOND_RELEASE_OWNER", "ZEUS_EMBED_SECOND_RELEASE_OWNER"),
        ("ZEUS_SECOND_RELEASE_REPO", "ZEUS_EMBED_SECOND_RELEASE_REPO"),
        ("ZEUS_UPDATER_PUBKEY", "ZEUS_EMBED_UPDATER_PUBKEY"),
    ] {
        if let Ok(v) = std::env::var(key) {
            if !v.trim().is_empty() {
                println!("cargo:rustc-env={embed}={}", escape_rustc_env(&v));
            }
        }
    }

    if option_env!("ZEUS_EMBED_UPDATER_PUBKEY").is_none() {
        if let Some(pubkey) = read_updater_pubkey_from_conf(&manifest_dir) {
            println!(
                "cargo:rustc-env=ZEUS_EMBED_UPDATER_PUBKEY={}",
                escape_rustc_env(&pubkey)
            );
        }
    }

    tauri_build::build()
}

fn apply_embed_var(key: &str, value: &str) {
    let embed = match key {
        "ZEUS_ALE_USERNAME" | "VITE_ALE_USERNAME" => Some("ZEUS_EMBED_ALE_USERNAME"),
        "ZEUS_ALE_PASSWORD" | "VITE_ALE_PASSWORD" => Some("ZEUS_EMBED_ALE_PASSWORD"),
        "INSTALL_REGISTRY_URL" => Some("ZEUS_EMBED_INSTALL_REGISTRY_URL"),
        "REGISTRY_TOKEN" => Some("ZEUS_EMBED_REGISTRY_TOKEN"),
        "ZEUS_RELEASE_OWNER" => Some("ZEUS_EMBED_RELEASE_OWNER"),
        "ZEUS_RELEASE_REPO" => Some("ZEUS_EMBED_RELEASE_REPO"),
        "ZEUS_SECOND_RELEASE_OWNER" => Some("ZEUS_EMBED_SECOND_RELEASE_OWNER"),
        "ZEUS_SECOND_RELEASE_REPO" => Some("ZEUS_EMBED_SECOND_RELEASE_REPO"),
        "ZEUS_UPDATER_PUBKEY" => Some("ZEUS_EMBED_UPDATER_PUBKEY"),
        _ => None,
    };
    if let Some(name) = embed {
        if !value.trim().is_empty() {
            println!("cargo:rustc-env={name}={}", escape_rustc_env(value));
        }
    }
}

fn read_updater_pubkey_from_conf(manifest_dir: &str) -> Option<String> {
    let conf_path = std::path::Path::new(manifest_dir).join("tauri.conf.json");
    let raw = std::fs::read_to_string(conf_path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&raw).ok()?;
    value
        .pointer("/plugins/updater/pubkey")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn escape_rustc_env(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
}
