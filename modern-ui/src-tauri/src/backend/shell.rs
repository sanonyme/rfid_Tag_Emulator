use super::events;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

struct ShellSession {
    master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
}

pub struct ShellService {
    sessions: Mutex<HashMap<String, ShellSession>>,
}

impl ShellService {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }

    pub fn start(
        &self,
        app: AppHandle,
        admin: &AtomicBool,
        session_id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        if !admin.load(Ordering::SeqCst) {
            emit_exit(&app, session_id, 1, Some("Admin required"));
            return Ok(());
        }

        self.kill(session_id);

        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: rows.max(1),
                cols: cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let mut cmd = if cfg!(windows) {
            CommandBuilder::new(
                std::env::var("COMSPEC").unwrap_or_else(|_| "cmd.exe".to_string()),
            )
        } else {
            let mut c = CommandBuilder::new(
                std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string()),
            );
            c.arg("-l");
            c
        };

        if let Ok(cwd) = std::env::current_dir() {
            cmd.cwd(cwd);
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| e.to_string())?;
        drop(pair.slave);

        let child = Arc::new(Mutex::new(child));

        let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;
        let master: Arc<Mutex<Box<dyn MasterPty + Send>>> = Arc::new(Mutex::new(pair.master));

        let session_id_owned = session_id.to_string();
        let app_reader = app.clone();
        let sid_reader = session_id_owned.clone();

        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            let mut reader = reader;
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buf[..n]).into_owned();
                        events::emit(
                            &app_reader,
                            "shell-data",
                            vec![json!(sid_reader.clone()), json!(data)],
                        );
                    }
                    Err(_) => break,
                }
            }
        });

        let app_wait = app.clone();
        let sid_wait = session_id_owned.clone();
        let child_wait = Arc::clone(&child);
        std::thread::spawn(move || {
            let status = child_wait.lock().ok().and_then(|mut c| c.wait().ok());
            let code = match status {
                Some(s) => s.exit_code() as i64,
                None => 1,
            };
            emit_exit(&app_wait, &sid_wait, code, None);
        });

        let session = ShellSession {
            master,
            writer: Arc::new(Mutex::new(writer)),
            child,
        };
        self.sessions
            .lock()
            .map_err(|e| e.to_string())?
            .insert(session_id.to_string(), session);

        Ok(())
    }

    pub fn write(&self, admin: &AtomicBool, session_id: &str, data: &str) -> Result<(), String> {
        if !admin.load(Ordering::SeqCst) {
            return Ok(());
        }
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let Some(session) = sessions.get(session_id) else {
            return Ok(());
        };
        let mut writer = session.writer.lock().map_err(|e| e.to_string())?;
        writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn resize(
        &self,
        admin: &AtomicBool,
        session_id: &str,
        cols: u16,
        rows: u16,
    ) -> Result<(), String> {
        if !admin.load(Ordering::SeqCst) {
            return Ok(());
        }
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        let Some(session) = sessions.get(session_id) else {
            return Ok(());
        };
        let master = session.master.lock().map_err(|e| e.to_string())?;
        master
            .resize(PtySize {
                rows: rows.max(1),
                cols: cols.max(1),
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn kill(&self, session_id: &str) {
        if let Ok(mut sessions) = self.sessions.lock() {
            if let Some(session) = sessions.remove(session_id) {
                if let Ok(mut child) = session.child.lock() {
                    let _ = child.kill();
                }
            }
        }
    }
}

fn emit_exit(app: &AppHandle, session_id: &str, code: i64, signal: Option<&str>) {
    events::emit(
        app,
        "shell-exit",
        vec![
            json!(session_id),
            json!(code),
            signal.map(|s| json!(s)).unwrap_or(Value::Null),
        ],
    );
}
