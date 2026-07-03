use super::events::{emit, emit_str};
use super::preferences;
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::AppHandle;

#[cfg(all(desktop, not(debug_assertions)))]
const CHECK_INTERVAL_SECS: u64 = 4 * 60 * 60;

pub struct UpdaterService {
    in_progress: AtomicBool,
    #[cfg(desktop)]
    pending: Arc<Mutex<Option<tauri_plugin_updater::Update>>>,
}

impl UpdaterService {
    pub fn new() -> Self {
        Self {
            in_progress: AtomicBool::new(false),
            #[cfg(desktop)]
            pending: Arc::new(Mutex::new(None)),
        }
    }

    #[cfg(all(desktop, not(debug_assertions)))]
    pub fn schedule_background_checks(self: &Arc<Self>, app: AppHandle) {
        let service = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(std::time::Duration::from_secs(4)).await;
            Arc::clone(&service).run_check(app.clone(), false).await;
            let mut interval =
                tokio::time::interval(std::time::Duration::from_secs(CHECK_INTERVAL_SECS));
            interval.tick().await;
            loop {
                interval.tick().await;
                Arc::clone(&service).run_check(app.clone(), false).await;
            }
        });
    }

    pub fn spawn_manual_check(self: &Arc<Self>, app: AppHandle) {
        #[cfg(desktop)]
        {
            let service = Arc::clone(self);
            tauri::async_runtime::spawn(async move {
                service.run_check(app, true).await;
            });
            return;
        }
        #[cfg(not(desktop))]
        {
            emit_str(&app, "checking-for-update", "");
            emit_str(&app, "update-not-available", "");
        }
    }

    pub fn spawn_download(self: &Arc<Self>, app: AppHandle) {
        #[cfg(desktop)]
        {
            let service = Arc::clone(self);
            tauri::async_runtime::spawn(async move {
                service.run_download(app).await;
            });
        }
        #[cfg(not(desktop))]
        let _ = (self, app);
    }

    pub fn quit_and_install(self: &Arc<Self>, app: AppHandle) {
        #[cfg(desktop)]
        {
            let service = Arc::clone(self);
            tauri::async_runtime::spawn(async move {
                service.run_install(app).await;
            });
        }
        #[cfg(not(desktop))]
        let _ = (self, app);
    }

    #[cfg(desktop)]
    async fn run_check(self: Arc<Self>, app: AppHandle, force_emit: bool) {
        if cfg!(debug_assertions) {
            if force_emit {
                emit_str(&app, "checking-for-update", "");
                emit_str(&app, "update-not-available", "");
            }
            return;
        }

        if self.in_progress.swap(true, Ordering::SeqCst) {
            return;
        }

        emit_str(&app, "checking-for-update", "");

        let mut last_error: Option<String> = None;
        let mut check_result: Option<Result<Option<tauri_plugin_updater::Update>, String>> = None;

        for kind in [FeedKind::Primary, FeedKind::Secondary] {
            let updater = match build_updater(&app, kind) {
                Ok(u) => u,
                Err(err) => {
                    last_error = Some(err);
                    continue;
                }
            };
            match updater.check().await {
                Ok(update) => {
                    check_result = Some(Ok(update));
                    break;
                }
                Err(err) => {
                    last_error = Some(err.to_string());
                }
            }
        }

        self.in_progress.store(false, Ordering::SeqCst);

        let result = check_result.unwrap_or_else(|| Err(last_error.unwrap_or_else(|| {
            "Update feed not configured".to_string()
        })));

        match result {
            Ok(Some(update)) => {
                let version = update.version.clone();
                if let Ok(mut pending) = self.pending.lock() {
                    *pending = Some(update);
                }
                emit(
                    &app,
                    "update-available",
                    vec![json!({ "version": version })],
                );
                if preferences::get_auto_update_enabled() {
                    let service = Arc::clone(&self);
                    service.run_download(app).await;
                }
            }
            Ok(None) => emit_str(&app, "update-not-available", ""),
            Err(message) => emit(&app, "update-error", vec![json!(message)]),
        }
    }

    #[cfg(desktop)]
    async fn run_download(self: Arc<Self>, app: AppHandle) {
        let update = {
            let mut pending = match self.pending.lock() {
                Ok(guard) => guard,
                Err(_) => return,
            };
            pending.take()
        };

        let Some(update) = update else {
            emit(
                &app,
                "update-error",
                vec![json!("No pending update to download")],
            );
            return;
        };

        let app_progress = app.clone();
        let mut downloaded: u64 = 0;
        let download_result = update
            .download_and_install(
                move |chunk_length, content_length| {
                    downloaded += chunk_length as u64;
                    let total = content_length.unwrap_or(0) as u64;
                    let percent = if total > 0 {
                        (downloaded as f64 / total as f64) * 100.0
                    } else {
                        0.0
                    };
                    emit(
                        &app_progress,
                        "download-progress",
                        vec![json!({
                            "percent": percent,
                            "transferred": downloaded,
                            "total": total,
                        })],
                    );
                },
                || {},
            )
            .await;

        match download_result {
            Ok(()) => {
                emit(
                    &app,
                    "update-downloaded",
                    vec![json!({ "version": update.version })],
                );
            }
            Err(error) => {
                if let Ok(mut pending) = self.pending.lock() {
                    *pending = None;
                }
                emit(
                    &app,
                    "update-error",
                    vec![json!(error.to_string())],
                );
            }
        }
    }

    #[cfg(desktop)]
    async fn run_install(self: Arc<Self>, app: AppHandle) {
        let _ = self;
        app.request_restart();
    }
}

#[cfg(desktop)]
enum FeedKind {
    Primary,
    Secondary,
}

#[cfg(desktop)]
fn build_updater(app: &AppHandle, kind: FeedKind) -> Result<tauri_plugin_updater::Updater, String> {
    use tauri_plugin_updater::UpdaterExt;

    let (owner, repo) = match kind {
        FeedKind::Primary => (read_release_owner(), read_release_repo()),
        FeedKind::Secondary => (read_second_release_owner(), read_second_release_repo()),
    };
    if owner.is_empty() || repo.is_empty() {
        return Err(format!(
            "Update feed not configured ({owner}/{repo})"
        ));
    }

    let pubkey = read_updater_pubkey();
    if pubkey.is_empty() {
        return Err("Updater public key not configured (ZEUS_UPDATER_PUBKEY)".into());
    }

    let endpoint = format!(
        "https://github.com/{owner}/{repo}/releases/latest/download/latest.json"
    );

    let endpoint: tauri::Url = endpoint
        .parse()
        .map_err(|e| format!("Invalid update endpoint: {e}"))?;

    app.updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| e.to_string())?
        .pubkey(pubkey)
        .build()
        .map_err(|e| e.to_string())
}

#[cfg(desktop)]
fn read_release_owner() -> String {
    std::env::var("ZEUS_RELEASE_OWNER")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| option_env!("ZEUS_EMBED_RELEASE_OWNER").map(str::to_string))
        .unwrap_or_default()
        .trim()
        .to_string()
}

#[cfg(desktop)]
fn read_release_repo() -> String {
    std::env::var("ZEUS_RELEASE_REPO")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| option_env!("ZEUS_EMBED_RELEASE_REPO").map(str::to_string))
        .unwrap_or_default()
        .trim()
        .to_string()
}

#[cfg(desktop)]
fn read_second_release_owner() -> String {
    std::env::var("ZEUS_SECOND_RELEASE_OWNER")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| option_env!("ZEUS_EMBED_SECOND_RELEASE_OWNER").map(str::to_string))
        .unwrap_or_default()
        .trim()
        .to_string()
}

#[cfg(desktop)]
fn read_second_release_repo() -> String {
    std::env::var("ZEUS_SECOND_RELEASE_REPO")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| option_env!("ZEUS_EMBED_SECOND_RELEASE_REPO").map(str::to_string))
        .unwrap_or_default()
        .trim()
        .to_string()
}

#[cfg(desktop)]
fn read_updater_pubkey() -> String {
    std::env::var("ZEUS_UPDATER_PUBKEY")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| option_env!("ZEUS_EMBED_UPDATER_PUBKEY").map(str::to_string))
        .unwrap_or_default()
        .trim()
        .to_string()
}
