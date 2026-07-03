use super::store;
use reqwest::Client;
use serde_json::{json, Value};

pub async fn itx_api_request(client: &Client, url: &str, body: &str) -> Value {
    let config = store::get_api_config();
    let header_name = config
        .get("headerName")
        .and_then(|v| v.as_str())
        .unwrap_or("itx-apiKey");
    let api_key = config.get("key").and_then(|v| v.as_str()).unwrap_or("");
    if api_key.is_empty() {
        return json!({
            "ok": false,
            "status": 0,
            "statusText": "Missing API key",
            "data": "Enter your API key in the header section above and click Save.",
            "headers": {},
        });
    }
    match client
        .post(url)
        .header("Content-Type", "application/json")
        .header(header_name, api_key)
        .body(if body.is_empty() { "{}".to_string() } else { body.to_string() })
        .send()
        .await
    {
        Ok(res) => {
            let status = res.status().as_u16();
            let status_text = res.status().canonical_reason().unwrap_or("").to_string();
            let ok = res.status().is_success();
            let mut headers = serde_json::Map::new();
            for (k, v) in res.headers() {
                if let Ok(s) = v.to_str() {
                    headers.insert(k.as_str().to_string(), Value::String(s.to_string()));
                }
            }
            let text = res.text().await.unwrap_or_default();
            json!({
                "ok": ok,
                "status": status,
                "statusText": status_text,
                "data": text,
                "headers": headers,
            })
        }
        Err(e) => json!({
            "ok": false,
            "status": 0,
            "statusText": e.to_string(),
            "data": null,
            "headers": {},
        }),
    }
}
