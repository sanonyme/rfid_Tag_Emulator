use super::{
    ale, events::emit_str, handheld, install_registry, itx, local_fs, log_aggregator, net_scan,
    popout_windows, preferences, reader_discovery, sftp, shell, store, udp_discovery, updater,
    tcp::send_tcp_message,
};
use reqwest::Client;
use serde_json::{json, Value};
use std::sync::Arc;
use tauri::{AppHandle, WebviewWindow};

pub struct AppBackend {
    pub tcp: super::tcp::TcpService,
    pub db: super::db::DbService,
    pub handheld: handheld::HandheldManager,
    pub net_scan: net_scan::NetScanService,
    pub reader_discovery: reader_discovery::ReaderDiscoveryService,
    pub sftp: sftp::SftpService,
    pub udp_discovery: udp_discovery::UdpDiscoveryService,
    pub shell: shell::ShellService,
    pub popout: popout_windows::PopoutService,
    pub updater: Arc<updater::UpdaterService>,
    admin_authenticated: Arc<std::sync::atomic::AtomicBool>,
    http: Client,
}

impl AppBackend {
    pub fn new() -> Self {
        Self {
            tcp: super::tcp::TcpService::new(),
            db: super::db::DbService::new(),
            handheld: handheld::HandheldManager::new(),
            net_scan: net_scan::NetScanService::new(),
            reader_discovery: reader_discovery::ReaderDiscoveryService::new(),
            sftp: sftp::SftpService::new(),
            udp_discovery: udp_discovery::UdpDiscoveryService::new(),
            shell: shell::ShellService::new(),
            popout: popout_windows::PopoutService::new(),
            updater: Arc::new(updater::UpdaterService::new()),
            admin_authenticated: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            http: Client::new(),
        }
    }

    fn not_ported(channel: &str) -> Result<Value, String> {
        Err(format!(
            "Pure Rust backend: `{channel}` not ported yet"
        ))
    }

    pub async fn invoke(
        &self,
        app: &AppHandle,
        caller: &WebviewWindow,
        channel: &str,
        args: Vec<Value>,
    ) -> Result<Value, String> {
        if channel.starts_with("db-") {
            return self.db.invoke(app, channel, &args).await;
        }
        if channel.starts_with("sftp-") {
            let admin = self.admin_authenticated.load(std::sync::atomic::Ordering::SeqCst);
            return self.sftp.invoke(app, channel, &args, admin).await;
        }

        match channel {
            "net-scan-get-interfaces" => Ok(net_scan::NetScanService::get_interfaces()),
            "net-scan-start" => self.net_scan.start(app.clone(), args.first().unwrap_or(&json!({}))),
            "net-scan-cancel" => {
                self.net_scan.cancel();
                Ok(json!({ "ok": true }))
            }

            "udp-discovery-start" => {
                let local_port = arg_u64(&args, 0) as u16;
                let listen_ms = arg_u64(&args, 1);
                self.udp_discovery
                    .start(app.clone(), local_port, listen_ms)
                    .await
            }
            "udp-discovery-stop" => Ok(self.udp_discovery.stop().await),
            "udp-discovery-send-probe" => {
                let target_ip = arg_str(&args, 0)?;
                let target_port = arg_u64(&args, 1) as u16;
                let message = arg_str(&args, 2)?;
                self.udp_discovery
                    .send_probe(&target_ip, target_port, &message)
                    .await
            }
            "udp-discovery-is-running" => Ok(self.udp_discovery.is_running().await),

            "reader-discovery-start" => {
                self.reader_discovery
                    .start(app.clone(), args.first().unwrap_or(&json!({})))
            }
            "reader-discovery-cancel" => {
                self.reader_discovery.cancel();
                Ok(json!({ "ok": true }))
            }

            "log-aggregator-run" => {
                Ok(log_aggregator::run_log_aggregator(
                    app,
                    &arg_str(&args, 0)?,
                    &arg_str(&args, 1)?,
                )
                .await)
            }
            "log-aggregator-show-output" => {
                Ok(log_aggregator::show_output_folder(&arg_str(&args, 0)?))
            }

            "tcp-connect" => {
                let host = arg_str(&args, 0)?;
                let port = arg_u64(&args, 1) as u16;
                Ok(self.tcp.connect(app, &host, port).await)
            }
            "tcp-is-connected" => Ok(Value::Bool(self.tcp.is_connected())),

            "labelary-render" => {
                let zpl = arg_str(&args, 0)?;
                let dpmm = arg_u64(&args, 1);
                let width = arg_f64(&args, 2)?;
                let height = arg_f64(&args, 3)?;
                let d = match dpmm {
                    6 | 8 | 12 | 24 => dpmm,
                    _ => 8,
                };
                let url = format!(
                    "http://api.labelary.com/v1/printers/{d}dpmm/labels/{width}x{height}/0/"
                );
                let res = self
                    .http
                    .post(&url)
                    .header("Accept", "image/png")
                    .header("Content-Type", "application/x-www-form-urlencoded")
                    .body(zpl)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;
                if !res.status().is_success() {
                    let t = res.text().await.unwrap_or_default();
                    return Err(t.chars().take(900).collect());
                }
                let bytes = res.bytes().await.map_err(|e| e.to_string())?;
                use base64::{engine::general_purpose::STANDARD, Engine as _};
                Ok(Value::String(STANDARD.encode(bytes)))
            }

            "safe-store-set" => store::safe_store_set(&arg_str(&args, 0)?, &arg_str(&args, 1)?),
            "safe-store-get" => store::safe_store_get(&arg_str(&args, 0)?),
            "safe-store-delete" => store::safe_store_delete(&arg_str(&args, 0)?),
            "get-api-config" => Ok(store::get_api_config()),
            "save-api-config" => store::save_api_config(&arg_str(&args, 0)?, &arg_str(&args, 1)?),

            "admin-login" => {
                let user = arg_str(&args, 0)?;
                let pass = arg_str(&args, 1)?;
                let expected_user = std::env::var("ZEUS_ADMIN_USER").unwrap_or_else(|_| "admin".into());
                let expected_pass = std::env::var("ZEUS_ADMIN_PASS").unwrap_or_else(|_| "admin".into());
                if user.trim() == expected_user.trim() && pass == expected_pass {
                    self.admin_authenticated.store(true, std::sync::atomic::Ordering::SeqCst);
                    Ok(json!({ "ok": true }))
                } else {
                    Ok(json!({ "ok": false, "error": "Invalid username or password" }))
                }
            }
            "admin-logout" => {
                self.admin_authenticated.store(false, std::sync::atomic::Ordering::SeqCst);
                Ok(json!({ "ok": true }))
            }
            "admin-is-authenticated" => Ok(json!({
                "ok": self.admin_authenticated.load(std::sync::atomic::Ordering::SeqCst)
            })),

            "get-auto-update-enabled" => Ok(Value::Bool(preferences::get_auto_update_enabled())),
            "set-auto-update-enabled" => Ok(preferences::set_auto_update_enabled(arg_bool(&args, 0))),

            "install-registry-get-status" => Ok(install_registry::get_status()),
            "install-registry-set-enabled" => Ok(install_registry::set_enabled(arg_bool(&args, 0))),
            "install-registry-send-now" => {
                Ok(install_registry::send_now(&self.http, true).await)
            }

            "local-readdir" => Ok(local_fs::local_readdir(&arg_str(&args, 0)?, &arg_str(&args, 1)?)),
            "local-write-file-base64" => Ok(local_fs::local_write_file_base64(
                &arg_str(&args, 0)?,
                &arg_str(&args, 1)?,
                &arg_str(&args, 2)?,
            )),
            "local-path-parent" => Ok(local_fs::local_path_parent(&arg_str(&args, 0)?, &arg_str(&args, 1)?)),

            "handheld-is-running" => {
                let port = arg_u64(&args, 0) as u16;
                let port = if port == 0 { 10472 } else { port };
                Ok(Value::Bool(self.handheld.is_running(port).await))
            }

            "ale-get-credential-meta" => Ok(ale::ale_get_credential_meta()),
            "ale-get-basic-auth-header" => Ok(ale::ale_get_basic_auth_header()),
            "ale-request" => {
                let url = arg_str(&args, 0)?;
                let options = args.get(1).cloned().unwrap_or(json!({}));
                Ok(ale::run_ale_request(&self.http, &url, &options).await)
            }
            "ale-request-batch" => {
                let requests = args
                    .first()
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                Ok(ale::ale_request_batch(&self.http, &requests).await)
            }

            "itx-api-request" => {
                let url = arg_str(&args, 0)?;
                let body = arg_str(&args, 1).unwrap_or_default();
                Ok(itx::itx_api_request(&self.http, &url, &body).await)
            }

            "popout-get-window-info" => {
                Ok(self.popout.get_window_info(app, caller.label()))
            }
            "popout-open" => {
                let tab_id = arg_str(&args, 0)?;
                let title = arg_str(&args, 1).unwrap_or_else(|_| tab_id.clone());
                let init_state = args.get(2).cloned().unwrap_or(json!({}));
                self.popout.open(app, &tab_id, &title, init_state)
            }
            "popout-dock" => {
                let tab_id = arg_str(&args, 0)?;
                self.popout.dock(app, &tab_id)
            }
            "popout-get-init-state" => Ok(self.popout.get_init_state(caller.label())),
            "popout-list" => Ok(self.popout.list(app)),

            _ => Self::not_ported(channel),
        }
    }

    pub async fn send(&self, app: &AppHandle, channel: &str, args: Vec<Value>) -> Result<(), String> {
        match channel {
            "tcp-disconnect" => {
                self.tcp.disconnect(app).await;
                Ok(())
            }
            "tcp-send-tags" => {
                let tags = args
                    .first()
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();
                let driver = arg_str(&args, 1).unwrap_or_else(|_| "llrp".into());
                let delay = arg_u64(&args, 2);
                let app = app.clone();
                let tcp = self.tcp.clone_refs();
                tokio::spawn(async move {
                    tcp.send_tags(app, tags, driver, delay).await;
                });
                Ok(())
            }
            "tcp-cancel-send" => {
                self.tcp.cancel_send();
                Ok(())
            }

            "handheld-start" => {
                let port = arg_u64(&args, 0) as u16;
                let port = if port == 0 { 10472 } else { port };
                self.handheld.start(app.clone(), port).await;
                Ok(())
            }
            "handheld-stop" => {
                let port = arg_u64(&args, 0) as u16;
                let port = if port == 0 { 10472 } else { port };
                self.handheld.stop(app, port).await;
                Ok(())
            }
            "handheld-send-epcs" => {
                let port = arg_u64(&args, 0) as u16;
                let tags = handheld::parse_handheld_tags(
                    args.get(1).and_then(|v| v.as_array()).map(|a| a.as_slice()).unwrap_or(&[]),
                );
                let delay = arg_u64(&args, 2);
                let verbose = args.get(3).and_then(|v| v.as_bool()).unwrap_or(true);
                self.handheld
                    .send_epcs(app.clone(), port, tags, delay, verbose)
                    .await;
                Ok(())
            }
            "handheld-send-recipe" => {
                let port = arg_u64(&args, 0) as u16;
                let recipe = args.get(1).cloned().unwrap_or(json!({}));
                let delay = arg_u64(&args, 2);
                let verbose = args.get(3).and_then(|v| v.as_bool()).unwrap_or(true);
                self.handheld
                    .send_recipe(app.clone(), port, recipe, delay, verbose)
                    .await;
                Ok(())
            }
            "handheld-cancel-send" => {
                let port = arg_u64(&args, 0) as u16;
                let port = if port == 0 { 10472 } else { port };
                self.handheld.cancel_send(port).await;
                Ok(())
            }

            "ocr-send" => {
                let host = arg_str(&args, 0)?;
                let message = arg_str(&args, 1)?;
                let app = app.clone();
                tokio::spawn(async move {
                    match send_tcp_message(&host, 10482, &format!("{message}\n")).await {
                        Ok(()) => emit_str(&app, "ocr-success", &format!("Sent: {message}")),
                        Err(e) => emit_str(&app, "ocr-error", &format!("Error: {e}")),
                    }
                });
                Ok(())
            }

            "custom-send" => {
                let host = arg_str(&args, 0)?;
                let port = arg_u64(&args, 1) as u16;
                let message = arg_str(&args, 2)?;
                let app = app.clone();
                tokio::spawn(async move {
                    match send_tcp_message(&host, port, &format!("{message}\n")).await {
                        Ok(()) => emit_str(&app, "custom-success", &format!("Sent to {port}: {message}")),
                        Err(e) => emit_str(&app, "custom-error", &format!("Error: {e}")),
                    }
                });
                Ok(())
            }

            "check-for-update" => {
                self.updater.spawn_manual_check(app.clone());
                Ok(())
            }
            "start-download" => {
                self.updater.spawn_download(app.clone());
                Ok(())
            }
            "quit-and-install" => {
                self.updater.quit_and_install(app.clone());
                Ok(())
            }

            "shell-start" => {
                let session_id = arg_str(&args, 0)?;
                let cols = arg_u64(&args, 1) as u16;
                let rows = arg_u64(&args, 2) as u16;
                self.shell.start(
                    app.clone(),
                    &self.admin_authenticated,
                    &session_id,
                    if cols == 0 { 80 } else { cols },
                    if rows == 0 { 24 } else { rows },
                )
            }
            "shell-write" => {
                let session_id = arg_str(&args, 0)?;
                let data = arg_str(&args, 1)?;
                self.shell
                    .write(&self.admin_authenticated, &session_id, &data)
            }
            "shell-resize" => {
                let session_id = arg_str(&args, 0)?;
                let cols = arg_u64(&args, 1) as u16;
                let rows = arg_u64(&args, 2) as u16;
                self.shell
                    .resize(&self.admin_authenticated, &session_id, cols, rows)
            }
            "shell-kill" => {
                let session_id = arg_str(&args, 0)?;
                self.shell.kill(&session_id);
                Ok(())
            }

            "popout-broadcast-state" => {
                let state = args.first().cloned().unwrap_or(json!({}));
                let connected = args.get(1).and_then(|v| v.as_bool()).unwrap_or(false);
                self.popout.broadcast_state(app, state, connected);
                Ok(())
            }

            _ => Self::not_ported(channel).map(|_| ()),
        }
    }
}

fn arg_str(args: &[Value], index: usize) -> Result<String, String> {
    args.get(index)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Missing string argument at index {index}"))
}

fn arg_u64(args: &[Value], index: usize) -> u64 {
    args.get(index).and_then(|v| v.as_u64()).unwrap_or(0)
}

fn arg_f64(args: &[Value], index: usize) -> Result<f64, String> {
    args.get(index)
        .and_then(|v| v.as_f64())
        .ok_or_else(|| format!("Missing number argument at index {index}"))
}

fn arg_bool(args: &[Value], index: usize) -> bool {
    args.get(index).and_then(|v| v.as_bool()).unwrap_or(false)
}
