use super::events;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::AppHandle;

const MAX_HOSTS: u32 = 4094;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NetInterfaceInfo {
    name: String,
    address: String,
    netmask: String,
    cidr: u8,
    network_cidr: String,
}

pub struct NetScanService {
    cancel: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
}

impl NetScanService {
    pub fn new() -> Self {
        Self {
            cancel: Arc::new(AtomicBool::new(false)),
            running: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn get_interfaces() -> Value {
        json!({ "ok": true, "interfaces": get_ipv4_interfaces() })
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    pub fn start(&self, app: AppHandle, payload: &Value) -> Result<Value, String> {
        if self.running.load(Ordering::SeqCst) {
            return Ok(json!({ "ok": false, "error": "A scan is already running. Stop it first." }));
        }
        let resolved = resolve_scan_ips(payload)?;
        let ips = match resolved {
            ScanIps::Ok(ips) => ips,
            ScanIps::Err(e) => return Ok(json!({ "ok": false, "error": e })),
        };
        let concurrency = payload
            .get("concurrency")
            .and_then(|v| v.as_u64())
            .map(|n| n.min(64).max(1) as usize)
            .unwrap_or(40);
        let total = ips.len();
        self.cancel.store(false, Ordering::SeqCst);
        self.running.store(true, Ordering::SeqCst);

        let cancel = self.cancel.clone();
        let running = self.running.clone();
        tokio::spawn(async move {
            run_scan(app, ips, concurrency, cancel).await;
            running.store(false, Ordering::SeqCst);
            let _ = total;
        });

        Ok(json!({ "ok": true, "total": total }))
    }
}

enum ScanIps {
    Ok(Vec<String>),
    Err(String),
}

/** Shared IP list resolution for net-scan and reader-discovery payloads. */
pub fn resolve_ips_from_payload(payload: &Value) -> Result<Vec<String>, String> {
    match resolve_scan_ips(payload)? {
        ScanIps::Ok(ips) => Ok(ips),
        ScanIps::Err(e) => Err(e),
    }
}

fn resolve_scan_ips(payload: &Value) -> Result<ScanIps, String> {
    let mode = payload
        .get("mode")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    match mode {
        "cidr" => {
            let cidr = payload
                .get("cidr")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match enumerate_cidr(cidr) {
                Some(ips) if !ips.is_empty() => Ok(ScanIps::Ok(ips)),
                _ => Ok(ScanIps::Err(
                    "Invalid CIDR (e.g. 192.168.1.0/24). Max 4094 hosts per scan.".into(),
                )),
            }
        }
        "range" => {
            let start = payload.get("start").and_then(|v| v.as_str()).unwrap_or("");
            let end = payload.get("end").and_then(|v| v.as_str()).unwrap_or("");
            match enumerate_ip_range(start, end) {
                Some(ips) if !ips.is_empty() => Ok(ScanIps::Ok(ips)),
                _ => Ok(ScanIps::Err(
                    "Invalid IP range. Use two IPv4 addresses (e.g. 192.168.1.1 – 192.168.1.254). Max 4094 addresses.".into(),
                )),
            }
        }
        "allSubnets" => match enumerate_all_local_subnets_merged() {
            Some(ips) if !ips.is_empty() => Ok(ScanIps::Ok(ips)),
            _ => Ok(ScanIps::Err(
                "No scannable local IPv4 subnets found, or merged subnets exceed 4094 addresses. Use CIDR or a smaller range.".into(),
            )),
        },
        _ => Ok(ScanIps::Err("Unknown scan mode.".into())),
    }
}

fn ipv4_to_int(ip: &str) -> u32 {
    let p: Vec<u8> = ip.split('.').filter_map(|x| x.parse().ok()).collect();
    if p.len() != 4 {
        return 0;
    }
    (u32::from(p[0]) << 24) | (u32::from(p[1]) << 16) | (u32::from(p[2]) << 8) | u32::from(p[3])
}

fn parse_ipv4_strict(s: &str) -> Option<u32> {
    let s = s.trim();
    let parts: Vec<&str> = s.split('.').collect();
    if parts.len() != 4 {
        return None;
    }
    let mut o = [0u8; 4];
    for (i, part) in parts.iter().enumerate() {
        let n: u16 = part.parse().ok()?;
        if n > 255 {
            return None;
        }
        o[i] = n as u8;
    }
    Some((u32::from(o[0]) << 24) | (u32::from(o[1]) << 16) | (u32::from(o[2]) << 8) | u32::from(o[3]))
}

fn int_to_ipv4(n: u32) -> String {
    format!(
        "{}.{}.{}.{}",
        (n >> 24) & 255,
        (n >> 16) & 255,
        (n >> 8) & 255,
        n & 255
    )
}

fn netmask_to_prefix(mask: &str) -> u8 {
    let n = ipv4_to_int(mask);
    let mut c = 0u8;
    for i in 0..32 {
        if n & (1 << (31 - i)) != 0 {
            c += 1;
        } else {
            break;
        }
    }
    c
}

fn get_ipv4_interfaces() -> Vec<NetInterfaceInfo> {
    let mut out = Vec::new();
    if let Ok(ifaces) = if_addrs::get_if_addrs() {
        for iface in ifaces {
            let if_addrs::IfAddr::V4(v4) = iface.addr else {
                continue;
            };
            if v4.ip.is_loopback() {
                continue;
            }
            let address = v4.ip.to_string();
            let netmask = v4.netmask.to_string();
            let cidr = netmask_to_prefix(&netmask);
            let ip_int = ipv4_to_int(&address);
            let mask_int = ipv4_to_int(&netmask);
            let network_int = ip_int & mask_int;
            out.push(NetInterfaceInfo {
                name: iface.name,
                address,
                netmask,
                cidr,
                network_cidr: format!("{}/{}", int_to_ipv4(network_int), cidr),
            });
        }
    }
    out
}

fn enumerate_cidr(cidr_input: &str) -> Option<Vec<String>> {
    let cidr_input = cidr_input.trim();
    let (base, prefix_str) = cidr_input.split_once('/')?;
    let prefix: u8 = prefix_str.parse().ok()?;
    if !(8..=30).contains(&prefix) {
        return None;
    }
    let ip_int = ipv4_to_int(base);
    if ip_int == 0 && base != "0.0.0.0" {
        return None;
    }
    let mask = (!0u32) << (32 - prefix);
    let network_int = ip_int & mask;
    let host_bits = 32 - u32::from(prefix);
    let host_count = (1u32 << host_bits).saturating_sub(2);
    if host_count < 1 || host_count > MAX_HOSTS {
        return None;
    }
    let mut ips = Vec::with_capacity(host_count as usize);
    for i in 1..=host_count {
        ips.push(int_to_ipv4(network_int + i));
    }
    Some(ips)
}

fn enumerate_ip_range(start_ip: &str, end_ip: &str) -> Option<Vec<String>> {
    let a = parse_ipv4_strict(start_ip)?;
    let b = parse_ipv4_strict(end_ip)?;
    let lo = a.min(b);
    let hi = a.max(b);
    let count = hi - lo + 1;
    if count < 1 || count > MAX_HOSTS {
        return None;
    }
    let mut ips = Vec::with_capacity(count as usize);
    for x in lo..=hi {
        ips.push(int_to_ipv4(x));
    }
    Some(ips)
}

fn enumerate_all_local_subnets_merged() -> Option<Vec<String>> {
    let ifs = get_ipv4_interfaces();
    if ifs.is_empty() {
        return None;
    }
    let mut set = std::collections::BTreeSet::new();
    for i in ifs {
        if let Some(ips) = enumerate_cidr(&i.network_cidr) {
            for ip in ips {
                set.insert(ip);
            }
        }
    }
    if set.is_empty() || set.len() as u32 > MAX_HOSTS {
        return None;
    }
    Some(set.into_iter().collect())
}

async fn run_scan(app: AppHandle, ips: Vec<String>, concurrency: usize, cancel: Arc<AtomicBool>) {
    let total = ips.len();
    let completed = Arc::new(std::sync::atomic::AtomicUsize::new(0));
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
        let completed = completed.clone();
        handles.push(tokio::spawn(async move {
            let _permit = permit;
            if cancel.load(Ordering::SeqCst) {
                return;
            }
            let alive = ping_reachable(&ip, &cancel).await;
            let done = completed.fetch_add(1, Ordering::SeqCst) + 1;
            events::emit(
                &app,
                "net-scan-host",
                vec![json!({
                    "ip": ip,
                    "alive": alive,
                    "hostname": Value::Null,
                    "done": done,
                    "total": total,
                })],
            );

            if !alive || cancel.load(Ordering::SeqCst) {
                return;
            }

            let name = resolve_hostname(&ip, &cancel).await;
            if cancel.load(Ordering::SeqCst) {
                return;
            }
            if let Some(hostname) = name {
                events::emit(
                    &app,
                    "net-scan-host",
                    vec![json!({
                        "ip": ip,
                        "alive": true,
                        "hostname": hostname,
                        "done": done,
                        "total": total,
                    })],
                );
            }
        }));
    }

    for h in handles {
        let _ = h.await;
    }

    if !cancel.load(Ordering::SeqCst) {
        events::emit(&app, "net-scan-done", vec![json!({ "total": total })]);
    }
}

async fn ping_reachable(ip: &str, cancel: &AtomicBool) -> bool {
    if cancel.load(Ordering::SeqCst) {
        return false;
    }
    let args: Vec<&str> = if cfg!(target_os = "windows") {
        vec!["-n", "1", "-w", "1000", ip]
    } else if cfg!(target_os = "macos") {
        vec!["-c", "1", "-W", "1000", ip]
    } else {
        vec!["-c", "1", "-W", "1", ip]
    };

    let output = tokio::time::timeout(
        std::time::Duration::from_secs(4),
        tokio::process::Command::new("ping").args(args).output(),
    )
    .await;

    match output {
        Ok(Ok(out)) => out.status.success(),
        _ => false,
    }
}

fn parse_windows_ping_a_hostname(stdout: &str, target_ip: &str) -> Option<String> {
    let is_ip_quad = |s: &str| {
        let p: Vec<&str> = s.split('.').collect();
        p.len() == 4 && p.iter().all(|x| x.parse::<u8>().is_ok())
    };
    for line in stdout.lines() {
        let t = line.trim();
        if !t.contains(&format!("[{target_ip}]")) {
            continue;
        }
        let lower = t.to_lowercase();
        if lower.starts_with("pinging ") {
            if let Some(idx) = t.find(&format!("[{target_ip}]")) {
                let name = t[8..idx].trim();
                if !name.is_empty() && name != target_ip {
                    return Some(name.to_string());
                }
            }
        }
        if let Some(idx) = t.find(&format!("[{target_ip}]")) {
            let prefix = t[..idx].trim();
            if let Some(name) = prefix.split_whitespace().last() {
                if name != target_ip && !is_ip_quad(name) {
                    return Some(name.to_string());
                }
            }
        }
    }
    None
}

async fn windows_ping_a_for_hostname(ip: &str, cancel: &AtomicBool) -> Option<String> {
    if cancel.load(Ordering::SeqCst) {
        return None;
    }
    let output = tokio::time::timeout(
        std::time::Duration::from_secs(4),
        tokio::process::Command::new("ping")
            .args(["-a", "-n", "1", "-w", "1000", ip])
            .output(),
    )
    .await
    .ok()?
    .ok()?;
    parse_windows_ping_a_hostname(&String::from_utf8_lossy(&output.stdout), ip)
}

async fn resolve_hostname_for_ip(ip: &str) -> Option<String> {
    let addr: std::net::IpAddr = ip.parse().ok()?;
    if let Ok(name) = dns_lookup::lookup_addr(&addr) {
        if !name.is_empty() {
            return Some(name);
        }
    }
    #[cfg(target_os = "linux")]
    {
        if let Ok(output) = tokio::time::timeout(
            std::time::Duration::from_secs(3),
            tokio::process::Command::new("getent").args(["hosts", ip]).output(),
        )
        .await
        {
            if let Ok(out) = output {
                if out.status.success() {
                    let line = String::from_utf8_lossy(&out.stdout);
                    let line = line.trim().lines().next()?;
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        if parts[0] == ip {
                            return Some(parts[1].to_string());
                        }
                        if parts[1] == ip {
                            return Some(parts[0].to_string());
                        }
                    }
                }
            }
        }
    }
    None
}

async fn resolve_hostname(ip: &str, cancel: &AtomicBool) -> Option<String> {
    if cfg!(target_os = "windows") {
        if let Some(name) = windows_ping_a_for_hostname(ip, cancel).await {
            return Some(name);
        }
    }
    resolve_hostname_for_ip(ip).await
}
