use serde_json::Value;
use tauri::{AppHandle, Emitter};

#[derive(Clone, serde::Serialize)]
pub struct ZeusEventPayload {
    pub channel: String,
    pub args: Vec<Value>,
}

pub fn emit(app: &AppHandle, channel: &str, args: Vec<Value>) {
    let _ = app.emit(
        "zeus-event",
        ZeusEventPayload {
            channel: channel.to_string(),
            args,
        },
    );
}

pub fn emit_str(app: &AppHandle, channel: &str, message: &str) {
    emit(app, channel, vec![Value::String(message.to_string())]);
}

pub fn emit_port_str(app: &AppHandle, channel: &str, port: u16, message: &str) {
    emit(
        app,
        channel,
        vec![
            Value::Number(port.into()),
            Value::String(message.to_string()),
        ],
    );
}
