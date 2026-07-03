use std::path::PathBuf;

pub fn zeus_data_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".zeus-rfid-emulator")
}

pub fn ensure_data_dir() -> std::io::Result<PathBuf> {
    let dir = zeus_data_dir();
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}
