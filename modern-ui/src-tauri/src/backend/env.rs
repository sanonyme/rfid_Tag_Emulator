use std::path::PathBuf;

/// Load `.env` into the process environment (mirrors Electron main.ts).
pub fn load_dotenv() {
    for path in dotenv_paths() {
        if path.is_file() {
            let _ = dotenvy::from_path(&path);
        }
    }
}

fn dotenv_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    // Packaged app: `.env` beside the executable (Electron parity).
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            paths.push(dir.join(".env"));
        }
    }

    // Dev / build tree: `modern-ui/.env` (parent of src-tauri).
    if let Ok(manifest) = std::env::var("CARGO_MANIFEST_DIR") {
        paths.push(PathBuf::from(&manifest).join("..").join(".env"));
        paths.push(PathBuf::from(&manifest).join(".env"));
    }

    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join(".env"));
    }

    paths
}
