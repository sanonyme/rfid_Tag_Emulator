use super::events::emit;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

pub const MAIN_WINDOW_LABEL: &str = "main";
const POPOUT_PREFIX: &str = "popout-";

pub struct PopoutService {
    pending_init: Mutex<HashMap<String, Value>>,
}

impl PopoutService {
    pub fn new() -> Self {
        Self {
            pending_init: Mutex::new(HashMap::new()),
        }
    }

    fn popout_label(tab_id: &str) -> String {
        format!("{POPOUT_PREFIX}{tab_id}")
    }

    fn tab_id_from_label(label: &str) -> Option<String> {
        label.strip_prefix(POPOUT_PREFIX).map(str::to_string)
    }

    fn list_popouts(app: &AppHandle) -> Vec<String> {
        app.webview_windows()
            .keys()
            .filter_map(|label| Self::tab_id_from_label(label))
            .collect()
    }

    pub fn get_window_info(&self, app: &AppHandle, caller_label: &str) -> Value {
        let popped = Self::list_popouts(app);
        if let Some(tab_id) = Self::tab_id_from_label(caller_label) {
            return json!({
                "role": "popout",
                "tabId": tab_id,
                "poppedTabs": popped,
            });
        }
        if caller_label == MAIN_WINDOW_LABEL {
            return json!({
                "role": "main",
                "tabId": Value::Null,
                "poppedTabs": popped,
            });
        }
        json!({
            "role": "unknown",
            "tabId": Value::Null,
            "poppedTabs": popped,
        })
    }

    pub fn open(
        &self,
        app: &AppHandle,
        tab_id: &str,
        title: &str,
        init_state: Value,
    ) -> Result<Value, String> {
        let id = tab_id.to_string();
        self.pending_init
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id.clone(), init_state);

        let label = Self::popout_label(&id);
        if let Some(existing) = app.get_webview_window(&label) {
            let _ = existing.set_focus();
            return Ok(json!({ "ok": true, "focused": true }));
        }

        let min_w = if id == "fixed" { 880.0 } else { 640.0 };
        let min_h = if id == "fixed" { 560.0 } else { 480.0 };
        let window_title = format!("{} — Zeus", title.trim());
        let hash = format!("#popout={}", urlencoding::encode(&id));

        let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::App(format!("/{hash}").into()))
            .title(window_title)
            .inner_size(1100.0, 820.0)
            .min_inner_size(min_w, min_h)
            .decorations(false)
            .build()
            .map_err(|e| e.to_string())?;

        let app_events = app.clone();
        let tab_for_events = id.clone();
        window.on_window_event(move |event| {
            if let WindowEvent::Destroyed = event {
                if let Some(backend) = app_events.try_state::<super::AppBackend>() {
                    backend.popout.remove_pending(&tab_for_events);
                }
                emit(
                    &app_events,
                    "popout-closed",
                    vec![Value::String(tab_for_events.clone())],
                );
            }
        });

        Ok(json!({ "ok": true, "focused": false }))
    }

    pub fn dock(&self, app: &AppHandle, tab_id: &str) -> Result<Value, String> {
        let label = Self::popout_label(tab_id);
        if let Some(win) = app.get_webview_window(&label) {
            win.close().map_err(|e| e.to_string())?;
        }
        Ok(json!({ "ok": true }))
    }

    pub fn get_init_state(&self, caller_label: &str) -> Value {
        Self::tab_id_from_label(caller_label)
            .and_then(|id| {
                self.pending_init
                    .lock()
                    .ok()
                    .and_then(|map| map.get(&id).cloned())
            })
            .map_or(Value::Null, |v| v)
    }

    pub fn list(&self, app: &AppHandle) -> Value {
        Value::Array(
            Self::list_popouts(app)
                .into_iter()
                .map(Value::String)
                .collect(),
        )
    }

    pub fn broadcast_state(&self, app: &AppHandle, state: Value, connected: bool) {
        emit(
            app,
            "popout-state-update",
            vec![state, Value::Bool(connected)],
        );
    }

    pub fn remove_pending(&self, tab_id: &str) {
        if let Ok(mut map) = self.pending_init.lock() {
            map.remove(tab_id);
        }
    }
}
