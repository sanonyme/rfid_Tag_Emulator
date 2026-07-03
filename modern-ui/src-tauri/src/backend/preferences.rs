use super::paths;
use serde_json::Value;
use std::fs;

const PREFERENCES_FILE: &str = "app-preferences.json";

#[derive(serde::Serialize, serde::Deserialize, Clone)]
struct AppPreferences {
    #[serde(rename = "autoUpdateEnabled", default = "default_auto_update")]
    auto_update_enabled: bool,
}

fn default_auto_update() -> bool {
    true
}

fn preferences_path() -> std::io::Result<std::path::PathBuf> {
    Ok(paths::ensure_data_dir()?.join(PREFERENCES_FILE))
}

fn read_preferences() -> AppPreferences {
    let path = match preferences_path() {
        Ok(p) => p,
        Err(_) => return AppPreferences { auto_update_enabled: true },
    };
    if !path.exists() {
        return AppPreferences {
            auto_update_enabled: true,
        };
    }
    match fs::read_to_string(&path) {
        Ok(raw) => serde_json::from_str(&raw).unwrap_or(AppPreferences {
            auto_update_enabled: true,
        }),
        Err(_) => AppPreferences {
            auto_update_enabled: true,
        },
    }
}

fn write_preferences(prefs: &AppPreferences) {
    if let Ok(path) = preferences_path() {
        let _ = fs::write(path, serde_json::to_string_pretty(prefs).unwrap_or_default());
    }
}

pub fn get_auto_update_enabled() -> bool {
    read_preferences().auto_update_enabled
}

pub fn set_auto_update_enabled(value: bool) -> Value {
    let mut prefs = read_preferences();
    prefs.auto_update_enabled = value;
    write_preferences(&prefs);
    Value::Bool(prefs.auto_update_enabled)
}
