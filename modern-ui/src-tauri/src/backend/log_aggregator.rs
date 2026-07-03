use super::events;
use regex::Regex;
use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;

const CURRENT_LOG_SORT_KEY: &str = "9999-99-99-99";

#[derive(Clone, Debug)]
struct ClassifiedLogFile {
    kind: &'static str,
    folder: String,
    filename: String,
    sort_key: String,
    category: Option<String>,
    source_path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CategoryStat {
    name: String,
    files: u64,
    aggregated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    aggregated_bytes: Option<u64>,
}

fn vsbl_hourly_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^vsbl\.(\d{4}-\d{2}-\d{2}-\d{2})\.log$").unwrap())
}

fn category_rotated_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^([a-z0-9_-]+)\.log\.(\d{4}-\d{2}-\d{2}-\d{2})$").unwrap())
}

fn category_current_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^([a-z0-9_-]+)\.log$").unwrap())
}

fn classify_log_filename(name: &str) -> Option<ClassifiedLogFile> {
    let base = name.replace('\\', "/");
    let base = base.rsplit('/').next().unwrap_or(&base);

    if let Some(caps) = vsbl_hourly_re().captures(base) {
        let stamp = caps.get(1)?.as_str().to_string();
        return Some(ClassifiedLogFile {
            kind: "vsbl",
            folder: format!("vsbl.{stamp}"),
            filename: base.to_string(),
            sort_key: stamp,
            category: None,
            source_path: PathBuf::new(),
        });
    }

    if base == "vsbl.log" {
        return Some(ClassifiedLogFile {
            kind: "vsbl",
            folder: "vsbl".into(),
            filename: base.to_string(),
            sort_key: CURRENT_LOG_SORT_KEY.into(),
            category: None,
            source_path: PathBuf::new(),
        });
    }

    if let Some(caps) = category_rotated_re().captures(base) {
        let cat = caps.get(1)?.as_str().to_string();
        let stamp = caps.get(2)?.as_str().to_string();
        return Some(ClassifiedLogFile {
            kind: "category",
            folder: cat.clone(),
            filename: base.to_string(),
            sort_key: stamp,
            category: Some(cat),
            source_path: PathBuf::new(),
        });
    }

    if let Some(caps) = category_current_re().captures(base) {
        let cat = caps.get(1)?.as_str().to_string();
        return Some(ClassifiedLogFile {
            kind: "category",
            folder: cat.clone(),
            filename: base.to_string(),
            sort_key: CURRENT_LOG_SORT_KEY.into(),
            category: Some(cat),
            source_path: PathBuf::new(),
        });
    }

    None
}

fn sort_log_files(files: &mut [ClassifiedLogFile]) {
    files.sort_by(|a, b| {
        a.sort_key
            .cmp(&b.sort_key)
            .then_with(|| a.filename.cmp(&b.filename))
    });
}

fn emit_progress(app: &AppHandle, phase: &str, message: &str, current: Option<u64>, total: Option<u64>) {
    let mut payload = json!({ "phase": phase, "message": message });
    if let Some(v) = current {
        payload["current"] = json!(v);
    }
    if let Some(v) = total {
        payload["total"] = json!(v);
    }
    events::emit(app, "log-aggregator-progress", vec![payload]);
}

fn extract_zip_sync(zip_path: &Path, dest_dir: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(outpath) = entry.enclosed_name().map(|p| dest_dir.join(p)) else {
            continue;
        };
        if entry.is_dir() {
            std::fs::create_dir_all(&outpath).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = outpath.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut outfile = std::fs::File::create(&outpath).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut outfile).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn list_extracted_log_files(root_dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut out = Vec::new();
    for entry in walkdir::WalkDir::new(root_dir).into_iter().filter_map(|e| e.ok()) {
        if !entry.file_type().is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy();
        if classify_log_filename(&name).is_some() {
            out.push(entry.path().to_path_buf());
        }
    }
    Ok(out)
}

async fn concat_files(output_path: &Path, input_paths: &[PathBuf]) -> Result<(), String> {
    let mut out = tokio::fs::File::create(output_path)
        .await
        .map_err(|e| e.to_string())?;
    for input in input_paths {
        let mut data = tokio::fs::read(input).await.map_err(|e| e.to_string())?;
        tokio::io::AsyncWriteExt::write_all(&mut out, &mut data)
            .await
            .map_err(|e| e.to_string())?;
    }
    out.flush().await.map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn run_log_aggregator(
    app: &AppHandle,
    zip_path: &str,
    output_dir: &str,
) -> Value {
    let started = Instant::now();
    let zip_path = PathBuf::from(zip_path);
    let output_dir = PathBuf::from(output_dir);

    if !zip_path.is_file() {
        return json!({ "ok": false, "error": "Zip path is not a file" });
    }

    if tokio::fs::create_dir_all(&output_dir).await.is_err() {
        return json!({ "ok": false, "error": "Failed to create output directory" });
    }

    let temp_dir = match tempfile_dir("zeus-logagg-") {
        Ok(d) => d,
        Err(e) => return json!({ "ok": false, "error": e }),
    };

    let result = async {
        emit_progress(app, "extract", "Extracting zip…", None, None);
        let zip_clone = zip_path.clone();
        let temp_clone = temp_dir.clone();
        tokio::task::spawn_blocking(move || extract_zip_sync(&zip_clone, &temp_clone))
            .await
            .map_err(|e| e.to_string())??;

        let extracted_paths = list_extracted_log_files(&temp_dir)?;
        if extracted_paths.is_empty() {
            return Err("No recognizable log files found in the zip".to_string());
        }

        let mut classified = Vec::new();
        for source_path in extracted_paths {
            let name = source_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            if let Some(mut info) = classify_log_filename(&name) {
                info.source_path = source_path;
                classified.push(info);
            }
        }

        let mut categories: HashMap<String, Vec<ClassifiedLogFile>> = HashMap::new();
        let mut vsbl = Vec::new();
        for file in classified {
            if file.kind == "vsbl" {
                vsbl.push(file);
            } else {
                let cat = file.category.clone().unwrap_or_else(|| file.folder.clone());
                categories.entry(cat).or_default().push(file);
            }
        }
        for list in categories.values_mut() {
            sort_log_files(list);
        }

        let total_moves = vsbl.len()
            + categories.values().map(|v| v.len()).sum::<usize>();
        let mut move_index = 0u64;

        emit_progress(app, "organize", "Organizing log files…", Some(0), Some(total_moves as u64));

        for file in &vsbl {
            let folder_path = output_dir.join(&file.folder);
            tokio::fs::create_dir_all(&folder_path)
                .await
                .map_err(|e| e.to_string())?;
            let dest_path = folder_path.join(&file.filename);
            tokio::fs::rename(&file.source_path, &dest_path)
                .await
                .map_err(|e| e.to_string())?;
            move_index += 1;
            emit_progress(
                app,
                "organize",
                &format!("Placed {}", file.filename),
                Some(move_index),
                Some(total_moves as u64),
            );
        }

        let mut category_stats = Vec::new();
        let mut aggregate_jobs: Vec<(String, Vec<PathBuf>)> = Vec::new();

        let mut cat_names: Vec<String> = categories.keys().cloned().collect();
        cat_names.sort();

        for category in cat_names {
            let files = categories.remove(&category).unwrap_or_default();
            let folder_path = output_dir.join(&category);
            tokio::fs::create_dir_all(&folder_path)
                .await
                .map_err(|e| e.to_string())?;

            let mut moved_paths = Vec::new();
            for file in &files {
                let dest_path = folder_path.join(&file.filename);
                tokio::fs::rename(&file.source_path, &dest_path)
                    .await
                    .map_err(|e| e.to_string())?;
                moved_paths.push(dest_path);
                move_index += 1;
                emit_progress(
                    app,
                    "organize",
                    &format!("Placed {}", file.filename),
                    Some(move_index),
                    Some(total_moves as u64),
                );
            }

            let aggregated = files.len() >= 2;
            if aggregated {
                aggregate_jobs.push((category.clone(), moved_paths.clone()));
            }
            category_stats.push(CategoryStat {
                name: category,
                files: moved_paths.len() as u64,
                aggregated,
                aggregated_bytes: None,
            });
        }

        let total_agg = aggregate_jobs.len() as u64;
        for (i, (category, paths)) in aggregate_jobs.into_iter().enumerate() {
            let agg_path = output_dir
                .join(&category)
                .join(format!("aggregated_{category}.log"));
            emit_progress(
                app,
                "aggregate",
                &format!("Merging {category} logs…"),
                Some((i + 1) as u64),
                Some(total_agg),
            );
            concat_files(&agg_path, &paths).await?;
            if let Ok(meta) = tokio::fs::metadata(&agg_path).await {
                if let Some(stat) = category_stats.iter_mut().find(|c| c.name == category) {
                    stat.aggregated_bytes = Some(meta.len());
                }
            }
        }

        category_stats.sort_by(|a, b| a.name.cmp(&b.name));
        emit_progress(app, "done", "Done", None, None);

        Ok(json!({
            "ok": true,
            "outputDir": output_dir.to_string_lossy(),
            "stats": {
                "filesProcessed": move_index,
                "categories": category_stats,
                "vsblFolders": vsbl.len(),
                "durationMs": started.elapsed().as_millis() as u64,
                "usedGitBash": false,
                "extractMethod": "zip",
            }
        }))
    }
    .await;

    let _ = tokio::fs::remove_dir_all(&temp_dir).await;

    match result {
        Ok(v) => v,
        Err(e) => json!({ "ok": false, "error": e }),
    }
}

pub fn show_output_folder(output_dir: &str) -> Value {
    let path = PathBuf::from(output_dir);
    if !path.is_dir() {
        return json!({ "ok": false, "error": "Invalid path" });
    }
    #[cfg(target_os = "windows")]
    {
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", "", &path.to_string_lossy()])
            .spawn();
    }
    #[cfg(target_os = "macos")]
    {
        let _ = std::process::Command::new("open").arg(&path).spawn();
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let _ = std::process::Command::new("xdg-open").arg(&path).spawn();
    }
    json!({ "ok": true })
}

fn tempfile_dir(prefix: &str) -> Result<PathBuf, String> {
    let mut dir = std::env::temp_dir();
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    dir.push(format!("{prefix}{nanos}"));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}
