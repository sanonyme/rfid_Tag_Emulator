mod backend;

use backend::AppBackend;

#[tauri::command]
fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

#[tauri::command]
async fn zeus_invoke(
    webview: tauri::WebviewWindow,
    app: tauri::AppHandle,
    state: tauri::State<'_, AppBackend>,
    channel: String,
    args: Vec<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    state.invoke(&app, &webview, &channel, args).await
}

#[tauri::command]
async fn zeus_send(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppBackend>,
    channel: String,
    args: Vec<serde_json::Value>,
) -> Result<(), String> {
    state.send(&app, &channel, args).await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    backend::env::load_dotenv();
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(all(desktop, not(debug_assertions)))]
            {
                use tauri::Manager;
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                let backend = app.state::<AppBackend>();
                backend
                    .updater
                    .schedule_background_checks(app.handle().clone());
            }
            #[cfg(not(all(desktop, not(debug_assertions))))]
            let _ = app;
            Ok(())
        })
        .manage(AppBackend::new())
        .invoke_handler(tauri::generate_handler![get_platform, zeus_invoke, zeus_send])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
