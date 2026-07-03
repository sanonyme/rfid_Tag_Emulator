use super::events;
use super::net_scan;
use regex::Regex;
use reqwest::Client;
use serde::Serialize;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, OnceLock};
use tauri::AppHandle;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream as TokioTcpStream;

const DEFAULT_PORTS: [u16; 7] = [5084, 5085, 80, 443, 23, 10001, 14150];
const HTTP_PATHS: [&str; 4] = ["/", "/cgi-bin/login.cgi", "/web/", "/api/v1/system/info"];
const LLRP_CAPABILITIES_MSG: [u8; 11] = [0x04, 0x01, 0x00, 0x00, 0x00, 0x0b, 0x00, 0x00, 0x00, 0x01, 0x00];

struct VendorDef {
    slug: &'static str,
    label: &'static str,
    keywords: &'static [&'static str],
}

const VENDORS: [VendorDef; 20] = [
    VendorDef { slug: "impinj", label: "Impinj", keywords: &["impinj", "speedway", "octane", "r700", "r720", "r420", "r120", "xarray", "xspan", "xportal", "itemsense"] },
    VendorDef { slug: "zebra", label: "Zebra / Motorola", keywords: &["zebra technologies", "zebra rfid", "motorola solutions", "symbol technologies", "fx7500", "fx9500", "fx9600", "fx7400", "atr7000", "rfd8500", "rfd40", "rfd90", "mc3300r"] },
    VendorDef { slug: "alien", label: "Alien Technology", keywords: &["alien technology", "alientech", "alr-", "alr990", "alr-f800", "alr-h450"] },
    VendorDef { slug: "thingmagic", label: "ThingMagic / JADAK", keywords: &["thingmagic", "jadak", "mercury", "m6e", "sargas", "nano"] },
    VendorDef { slug: "caen", label: "CAEN RFID", keywords: &["caen rfid", "caen-rfid", "leonardo", "quattro", "compact"] },
    VendorDef { slug: "nordicid", label: "Nordic ID", keywords: &["nordic id", "nordicid", "sampo", "nur-"] },
    VendorDef { slug: "honeywell", label: "Honeywell / Intermec", keywords: &["honeywell", "intermec", "if61", "if2", "if5", "if9", "if61"] },
    VendorDef { slug: "sick", label: "SICK", keywords: &["sick ag", "sick rfid", "rfu6"] },
    VendorDef { slug: "feig", label: "FEIG Electronic", keywords: &["feig", "obid", "isc.", "isc mr"] },
    VendorDef { slug: "kathrein", label: "Kathrein", keywords: &["kathrein", "crosswave", "smart shelf"] },
    VendorDef { slug: "csl", label: "CSL", keywords: &["csl", "convergence systems", "cs468", "cs778"] },
    VendorDef { slug: "invengo", label: "Invengo", keywords: &["invengo", "xc-rf8", "xc-af1", "xcra", "xc-af"] },
    VendorDef { slug: "nedap", label: "Nedap", keywords: &["nedap", "upass", "transit standard", "transit ultimate", "transit entry"] },
    VendorDef { slug: "turck", label: "Turck", keywords: &["turck", "tn-uhf", "tn-q", "bl ident"] },
    VendorDef { slug: "balluff", label: "Balluff", keywords: &["balluff", "bis v", "bis u", "bis m"] },
    VendorDef { slug: "seuic", label: "SEUIC / AUTOID", keywords: &["seuic", "autoid", "uf3", "uf40", "uf42", "uf31"] },
    VendorDef { slug: "siemens", label: "Siemens SIMATIC RF", keywords: &["simatic rf", "siemens rfid", "simatic rf600", "simatic rf200"] },
    VendorDef { slug: "chainway", label: "Chainway", keywords: &["chainway", "urx", "ur4", "uhf reader chainway"] },
    VendorDef { slug: "bluebird", label: "Bluebird / Pidion", keywords: &["bluebird", "pidion"] },
    VendorDef { slug: "chafon", label: "Chafon", keywords: &["chafon", "cf-ru", "cf-rxxx"] },
];

const GENERIC_HINTS: [&str; 11] = [
    "llrp", "uhf reader", "uhf rfid", "rfid reader", "rain rfid", "epcglobal", "epc gen2",
    "gen2 reader", "tag reader", "rfid-reader", "fixed reader",
];

const PEN_MAP: [(u32, &str); 12] = [
    (25882, "impinj"), (161, "zebra"), (388, "zebra"), (17996, "alien"), (14958, "thingmagic"),
    (10789, "caen"), (20232, "nordicid"), (1571, "honeywell"), (10617, "feig"), (9525, "kathrein"),
    (26554, "csl"), (34750, "invengo"),
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReaderResult {
    ip: String,
    vendor: String,
    vendor_label: String,
    confidence: String,
    open_ports: Vec<u16>,
    reason: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    server: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pen: Option<u32>,
}

struct HttpProbe {
    title: Option<String>,
    server: Option<String>,
    status: Option<u16>,
    body_snippet: Option<String>,
    headers_blob: Option<String>,
    url: String,
}

pub struct ReaderDiscoveryService {
    cancel: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
    http: Client,
}

impl ReaderDiscoveryService {
    pub fn new() -> Self {
        let http = Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            cancel: Arc::new(AtomicBool::new(false)),
            running: Arc::new(AtomicBool::new(false)),
            http,
        }
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub fn start(&self, app: AppHandle, payload: &Value) -> Result<Value, String> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(json!({ "ok": false, "error": "Reader discovery already running. Stop it first." }));
        }

        let ips = match net_scan::resolve_ips_from_payload(payload) {
            Ok(ips) if !ips.is_empty() => ips,
            Ok(_) => return Ok(json!({ "ok": false, "error": "No hosts to scan." })),
            Err(e) => return Ok(json!({ "ok": false, "error": e })),
        };

        let total = ips.len();
        let concurrency = payload
            .get("concurrency")
            .and_then(|v| v.as_u64())
            .map(|n| n.min(80).max(1) as usize)
            .unwrap_or(48);
        let timeout_ms = payload
            .get("timeoutMs")
            .and_then(|v| v.as_u64())
            .map(|n| n.min(8000).max(400))
            .unwrap_or(1200);

        self.cancel.store(false, Ordering::SeqCst);
        self.running.store(true, Ordering::SeqCst);

        let cancel = self.cancel.clone();
        let running = self.running.clone();
        let http = self.http.clone();

        tokio::spawn(async move {
            run_discovery(app, ips, concurrency, timeout_ms, cancel.clone(), http).await;
            running.store(false, Ordering::SeqCst);
        });

        Ok(json!({ "ok": true, "total": total }))
    }
}

async fn run_discovery(
    app: AppHandle,
    ips: Vec<String>,
    concurrency: usize,
    timeout_ms: u64,
    cancel: Arc<AtomicBool>,
    http: Client,
) {
    let total = ips.len();
    let done = Arc::new(AtomicUsize::new(0));
    let found = Arc::new(AtomicUsize::new(0));
    let semaphore = Arc::new(tokio::sync::Semaphore::new(concurrency.max(1)));

    let mut handles = Vec::new();
    for ip in ips {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        let permit = match semaphore.clone().acquire_owned().await {
            Ok(p) => p,
            Err(_) => break,
        };
        let app = app.clone();
        let cancel = cancel.clone();
        let done = done.clone();
        let found = found.clone();
        let http = http.clone();
        handles.push(tokio::spawn(async move {
            let _permit = permit;
            if cancel.load(Ordering::SeqCst) {
                return;
            }

            let mut open_ports = Vec::new();
            for port in DEFAULT_PORTS {
                if cancel.load(Ordering::SeqCst) {
                    return;
                }
                if tcp_probe(&ip, port, timeout_ms, &cancel).await {
                    open_ports.push(port);
                }
            }

            let mut http_info = None;
            let mut https_info = None;
            let mut llrp_hit = None;

            if open_ports.contains(&80) {
                http_info = http_probe(&http, &ip, false, timeout_ms, &cancel).await;
            }
            if open_ports.contains(&443) {
                https_info = http_probe(&http, &ip, true, timeout_ms, &cancel).await;
            }
            if open_ports.contains(&5084) {
                llrp_hit = llrp_vendor_probe(&ip, timeout_ms.max(1500), &cancel).await;
            }

            let reader = fingerprint_reader(&ip, &open_ports, http_info.as_ref(), https_info.as_ref(), llrp_hit.as_ref());
            let done_n = done.fetch_add(1, Ordering::SeqCst) + 1;
            if reader.is_some() {
                found.fetch_add(1, Ordering::SeqCst);
            }
            let found_n = found.load(Ordering::SeqCst);

            events::emit(
                &app,
                "reader-discovery-host",
                vec![json!({
                    "ip": ip,
                    "done": done_n,
                    "total": total,
                    "found": found_n,
                    "openPorts": open_ports,
                    "reader": reader,
                })],
            );
        }));
    }

    for h in handles {
        let _ = h.await;
    }

    if !cancel.load(Ordering::SeqCst) {
        events::emit(
            &app,
            "reader-discovery-done",
            vec![json!({
                "total": total,
                "found": found.load(Ordering::SeqCst),
            })],
        );
    }
}

async fn tcp_probe(ip: &str, port: u16, timeout_ms: u64, cancel: &AtomicBool) -> bool {
    if cancel.load(Ordering::SeqCst) {
        return false;
    }
    let addr = format!("{ip}:{port}");
    tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        TokioTcpStream::connect(&addr),
    )
    .await
    .is_ok()
}

async fn llrp_vendor_probe(ip: &str, timeout_ms: u64, cancel: &AtomicBool) -> Option<(u32, &'static str)> {
    if cancel.load(Ordering::SeqCst) {
        return None;
    }
    let addr = format!("{ip}:5084");
    let mut stream = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        TokioTcpStream::connect(&addr),
    )
    .await
    .ok()?
    .ok()?;

    if stream.write_all(&LLRP_CAPABILITIES_MSG).await.is_err() {
        return None;
    }

    let mut buf = Vec::new();
    let mut chunk = [0u8; 1024];
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_millis(timeout_ms);
    while buf.len() < 4096 && tokio::time::Instant::now() < deadline {
        if cancel.load(Ordering::SeqCst) {
            return None;
        }
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        let n = match tokio::time::timeout(remaining, stream.read(&mut chunk)).await {
            Ok(Ok(n)) => n,
            _ => break,
        };
        if n == 0 {
            break;
        }
        buf.extend_from_slice(&chunk[..n]);
        if let Some(hit) = scan_for_pen(&buf) {
            return Some(hit);
        }
    }
    scan_for_pen(&buf)
}

fn scan_for_pen(buf: &[u8]) -> Option<(u32, &'static str)> {
    let limit = buf.len().min(512);
    for &(pen, vendor) in &PEN_MAP {
        for i in 0..limit.saturating_sub(3) {
            if buf[i] != 0 || buf[i + 1] != 0 {
                continue;
            }
            let val = (u32::from(buf[i + 2]) << 8) | u32::from(buf[i + 3]);
            if val == pen {
                return Some((pen, vendor));
            }
        }
    }
    None
}

fn title_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)<title[^>]*>([\s\S]*?)</title>").unwrap())
}

fn parse_title(html: &str) -> Option<String> {
    let cap = title_re().captures(html)?;
    let t = cap.get(1)?.as_str().split_whitespace().collect::<Vec<_>>().join(" ");
    if t.is_empty() { None } else { Some(t) }
}

async fn http_probe_once(http: &Client, ip: &str, secure: bool, path: &str, timeout_ms: u64, cancel: &AtomicBool) -> Option<HttpProbe> {
    if cancel.load(Ordering::SeqCst) {
        return None;
    }
    let scheme = if secure { "https" } else { "http" };
    let url = format!("{scheme}://{ip}{path}");
    let res = tokio::time::timeout(
        std::time::Duration::from_millis(timeout_ms),
        http.get(&url).send(),
    )
    .await
    .ok()?
    .ok()?;
    let status = res.status().as_u16();
    let headers_blob = res
        .headers()
        .iter()
        .map(|(k, v)| format!("{}: {}", k, v.to_str().unwrap_or("")))
        .collect::<Vec<_>>()
        .join("\n");
    let server = res.headers().get("server").and_then(|v| v.to_str().ok()).map(str::to_string);
    let body = res.text().await.unwrap_or_default();
    let body_snippet = body.chars().take(4096).collect::<String>();
    Some(HttpProbe {
        title: parse_title(&body),
        server,
        status: Some(status),
        body_snippet: Some(body_snippet),
        headers_blob: Some(headers_blob),
        url,
    })
}

fn probe_mentions_vendor(p: &HttpProbe) -> bool {
    let blob = vendor_blob(
        p.title.as_deref(),
        p.server.as_deref(),
        p.body_snippet.as_deref(),
        p.headers_blob.as_deref(),
    );
    VENDORS.iter().any(|v| v.keywords.iter().any(|k| blob.contains(k)))
}

async fn http_probe(http: &Client, ip: &str, secure: bool, timeout_ms: u64, cancel: &AtomicBool) -> Option<HttpProbe> {
    let mut best: Option<HttpProbe> = None;
    for path in HTTP_PATHS {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        let Some(p) = http_probe_once(http, ip, secure, path, timeout_ms, cancel).await else {
            continue;
        };
        if best.is_none() {
            best = Some(HttpProbe {
                title: p.title.clone(),
                server: p.server.clone(),
                status: p.status,
                body_snippet: p.body_snippet.clone(),
                headers_blob: p.headers_blob.clone(),
                url: p.url.clone(),
            });
        }
        if probe_mentions_vendor(&p) {
            return Some(HttpProbe {
                title: p.title.or_else(|| best.as_ref().and_then(|b| b.title.clone())),
                server: p.server.or_else(|| best.as_ref().and_then(|b| b.server.clone())),
                status: p.status,
                body_snippet: p.body_snippet,
                headers_blob: p.headers_blob,
                url: p.url,
            });
        }
    }
    best
}

fn vendor_blob(title: Option<&str>, server: Option<&str>, body: Option<&str>, headers: Option<&str>) -> String {
    [title, server, body, headers]
        .into_iter()
        .flatten()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn vendor_label(slug: &str) -> String {
    VENDORS
        .iter()
        .find(|v| v.slug == slug)
        .map(|v| v.label.to_string())
        .unwrap_or_else(|| slug.to_string())
}

fn fingerprint_reader(
    ip: &str,
    open_ports: &[u16],
    http_info: Option<&HttpProbe>,
    https_info: Option<&HttpProbe>,
    llrp_hit: Option<&(u32, &str)>,
) -> Option<ReaderResult> {
    let llrp_open = open_ports.contains(&5084) || open_ports.contains(&5085);
    let feig_open = open_ports.contains(&10001);
    let impinj_rest_open = open_ports.contains(&14150);

    let blob = vendor_blob(
        http_info.and_then(|h| h.title.as_deref()),
        http_info.and_then(|h| h.server.as_deref()),
        http_info.and_then(|h| h.body_snippet.as_deref()),
        http_info.and_then(|h| h.headers_blob.as_deref()),
    ) + " "
        + &vendor_blob(
            https_info.and_then(|h| h.title.as_deref()),
            https_info.and_then(|h| h.server.as_deref()),
            https_info.and_then(|h| h.body_snippet.as_deref()),
            https_info.and_then(|h| h.headers_blob.as_deref()),
        );

    let mut best: Option<(&VendorDef, usize, Vec<&str>)> = None;
    for v in &VENDORS {
        let hits: Vec<&str> = v.keywords.iter().copied().filter(|k| blob.contains(k)).collect();
        let score = hits.len();
        if score > 0 && best.as_ref().map(|b| score > b.1).unwrap_or(true) {
            best = Some((v, score, hits));
        }
    }

    let title = https_info.and_then(|h| h.title.clone()).or_else(|| http_info.and_then(|h| h.title.clone()));
    let server = https_info.and_then(|h| h.server.clone()).or_else(|| http_info.and_then(|h| h.server.clone()));
    let url = https_info
        .filter(|h| h.status.unwrap_or(0) > 0)
        .map(|h| h.url.clone())
        .or_else(|| http_info.filter(|h| h.status.unwrap_or(0) > 0).map(|h| h.url.clone()));

    if let Some((pen, slug)) = llrp_hit {
        let mut reasons = vec![format!("LLRP reported vendor via IANA PEN {pen} → {}", vendor_label(slug))];
        if let Some((v, _, hits)) = &best {
            if v.slug == *slug {
                reasons.push(format!("HTTP fingerprint also matched: {}", hits.iter().take(3).copied().collect::<Vec<_>>().join(", ")));
            } else {
                reasons.push(format!("(HTTP hinted {}, but LLRP PEN is authoritative)", v.label));
            }
        }
        return Some(ReaderResult {
            ip: ip.to_string(),
            vendor: (*slug).to_string(),
            vendor_label: vendor_label(slug).to_string(),
            confidence: "high".into(),
            open_ports: open_ports.to_vec(),
            reason: reasons.join("; "),
            title,
            server,
            url,
            pen: Some(*pen),
        });
    }

    if let Some((v, score, hits)) = best {
        let confidence = if llrp_open && score >= 1 {
            "high"
        } else if score >= 2 {
            "high"
        } else if score >= 1 {
            "medium"
        } else {
            "low"
        };
        let mut reasons = Vec::new();
        if llrp_open {
            reasons.push("LLRP port (5084/5085) open".into());
        }
        if feig_open && v.slug == "feig" {
            reasons.push("Feig/OBID port 10001 open".into());
        }
        if impinj_rest_open && v.slug == "impinj" {
            reasons.push("Impinj port 14150 open".into());
        }
        reasons.push(format!(
            "matched {} keyword{}: {}",
            v.label,
            if hits.len() > 1 { "s" } else { "" },
            hits.iter().take(3).copied().collect::<Vec<_>>().join(", ")
        ));
        return Some(ReaderResult {
            ip: ip.to_string(),
            vendor: v.slug.to_string(),
            vendor_label: v.label.to_string(),
            confidence: confidence.into(),
            open_ports: open_ports.to_vec(),
            reason: reasons.join("; "),
            title,
            server,
            url,
            pen: None,
        });
    }

    let generic = |reason: &str| ReaderResult {
        ip: ip.to_string(),
        vendor: "generic".into(),
        vendor_label: "Generic RFID reader".into(),
        confidence: if llrp_open { "medium" } else { "low" }.into(),
        open_ports: open_ports.to_vec(),
        reason: reason.into(),
        title,
        server,
        url,
        pen: None,
    };

    if llrp_open {
        return Some(generic("LLRP port (5084/5085) open — RAIN/UHF RFID reader likely. Vendor could not be identified from HTTP fingerprint."));
    }
    if feig_open && (open_ports.contains(&80) || open_ports.contains(&443)) {
        return Some(generic("Port 10001 open alongside web UI — often used by Feig/Balluff/Turck readers or serial-over-TCP RFID devices."));
    }
    if impinj_rest_open {
        return Some(generic("Port 14150 open — used by Impinj R700 REST-style API and some OEM readers."));
    }
    if GENERIC_HINTS.iter().any(|h| blob.contains(h)) && (open_ports.contains(&80) || open_ports.contains(&443)) {
        return Some(generic("Web UI text mentions RFID/UHF/LLRP but no vendor keyword matched."));
    }

    None
}
