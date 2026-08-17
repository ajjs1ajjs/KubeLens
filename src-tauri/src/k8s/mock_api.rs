//! A minimal mock Kubernetes API server used by integration tests.
//!
//! Speaks just enough of the HTTP API for `kube-rs` to authenticate, list,
//! watch, apply, create, replace and delete Pods against it — no TLS, no real
//! cluster required. Keeps an in-memory list of Pods so mutations are visible
//! to subsequent requests.

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex;

fn pod(name: &str) -> serde_json::Value {
    serde_json::json!({
        "apiVersion": "v1",
        "kind": "Pod",
        "metadata": {
            "name": name,
            "namespace": "default",
            "uid": format!("uid-{name}"),
            "resourceVersion": "1",
            "creationTimestamp": "2026-01-01T00:00:00Z",
        },
        "spec": { "containers": [ { "name": "app", "image": "nginx" } ] },
        "status": { "phase": "Running" },
    })
}

fn pod_list(pods: &[serde_json::Value]) -> String {
    serde_json::json!({
        "apiVersion": "v1",
        "kind": "PodList",
        "metadata": { "resourceVersion": "1" },
        "items": pods,
    })
    .to_string()
}

fn pod_metrics_list() -> String {
    let item = |name: &str, cpu: &str, memory: &str, sidecar: bool| {
        let mut containers = vec![serde_json::json!({
            "name": "app",
            "usage": { "cpu": cpu, "memory": memory },
        })];
        if sidecar {
            containers.push(serde_json::json!({
                "name": "sidecar",
                "usage": { "cpu": "25m", "memory": "32Mi" },
            }));
        }
        serde_json::json!({
            "metadata": { "name": name, "namespace": "default" },
            "timestamp": "2026-01-01T00:00:00Z",
            "window": "30s",
            "containers": containers,
        })
    };
    serde_json::json!({
        "apiVersion": "metrics.k8s.io/v1beta1",
        "kind": "PodMetricsList",
        "metadata": { "resourceVersion": "1" },
        "items": [
            item("pod-a", "100m", "64Mi", true),
            item("pod-b", "250m", "128Mi", false),
        ],
    })
    .to_string()
}

fn node_metrics_list() -> String {
    serde_json::json!({
        "apiVersion": "metrics.k8s.io/v1beta1",
        "kind": "NodeMetricsList",
        "metadata": { "resourceVersion": "1" },
        "items": [
            {
                "metadata": { "name": "node-1" },
                "timestamp": "2026-01-01T00:00:00Z",
                "window": "30s",
                "usage": { "cpu": "1500m", "memory": "4Gi" },
            }
        ],
    })
    .to_string()
}

/// Helm release storage secrets served by the mock.
fn mock_secrets() -> Vec<serde_json::Value> {
    use crate::k8s::helm;
    let web = helm::mock_release_secret(
        "web",
        "default",
        1,
        helm::ReleaseStatus::Deployed,
        "nginx",
        "4.1.0",
    );
    let db = helm::mock_release_secret(
        "postgres",
        "default",
        2,
        helm::ReleaseStatus::Failed,
        "postgresql",
        "12.5.0",
    );
    vec![
        serde_json::to_value(&web).expect("serialize secret"),
        serde_json::to_value(&db).expect("serialize secret"),
    ]
}

fn secret_list(label_selector: Option<&str>) -> String {
    let items = match label_selector {
        Some(selector) => mock_secrets()
            .into_iter()
            .filter(|s| matches_label_selector(s, selector))
            .collect(),
        None => mock_secrets(),
    };
    serde_json::json!({
        "apiVersion": "v1",
        "kind": "SecretList",
        "metadata": { "resourceVersion": "1" },
        "items": items,
    })
    .to_string()
}

/// Extracts `labelSelector=...` from a query string, keeping the value
/// URL-decoded enough to match `k=v` pairs.
fn parse_label_selector(query: &str) -> Option<String> {
    query.split('&').find_map(|kv| {
        let (key, value) = kv.split_once('=')?;
        if key == "labelSelector" {
            Some(value.replace("%2C", ",").replace("%3D", "="))
        } else {
            None
        }
    })
}

/// Checks a secret's metadata.labels against a comma-separated `k=v,k2=v2`
/// selector. Only equality constraints are supported (enough for the tests).
fn matches_label_selector(secret: &serde_json::Value, selector: &str) -> bool {
    let labels = match secret
        .pointer("/metadata/labels")
        .and_then(|v| v.as_object())
    {
        Some(labels) => labels,
        None => return selector.is_empty(),
    };
    selector.split(',').all(|pair| {
        let (key, value) = pair.split_once('=').unwrap_or(("", ""));
        labels.get(key).and_then(|v| v.as_str()) == Some(value)
    })
}

fn secret_by_name(name: &str) -> Option<serde_json::Value> {
    mock_secrets()
        .into_iter()
        .find(|s| s.pointer("/metadata/name").and_then(|v| v.as_str()) == Some(name))
}

fn status(code: u16, message: &str) -> String {
    serde_json::json!({
        "kind": "Status",
        "apiVersion": "v1",
        "status": if code == 200 { "Success" } else { "Failure" },
        "code": code,
        "message": message,
    })
    .to_string()
}

type PodStore = Arc<Mutex<Vec<serde_json::Value>>>;

pub struct MockApiServer {
    pub addr: SocketAddr,
    pub pods: PodStore,
}

impl MockApiServer {
    /// Starts the mock server on an ephemeral port, seeded with two Pods.
    pub async fn start() -> MockApiServer {
        let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
        let addr = listener.local_addr().expect("local addr");
        let pods: PodStore = Arc::new(Mutex::new(vec![pod("pod-a"), pod("pod-b")]));
        tokio::spawn(accept_loop(listener, pods.clone()));
        MockApiServer { addr, pods }
    }
}

async fn accept_loop(listener: TcpListener, pods: PodStore) {
    loop {
        let Ok((stream, _)) = listener.accept().await else {
            return;
        };
        tokio::spawn(handle_connection(stream, pods.clone()));
    }
}

async fn handle_connection(mut stream: TcpStream, pods: PodStore) {
    let mut request = Vec::new();
    let mut buf = [0u8; 4096];
    let mut headers_end = None;

    // Read until the request head (\r\n\r\n) is complete.
    while headers_end.is_none() {
        let n = match stream.read(&mut buf).await {
            Ok(0) => return,
            Ok(n) => n,
            Err(_) => return,
        };
        request.extend_from_slice(&buf[..n]);
        headers_end = find_headers_end(&request);
    }
    let headers_end = headers_end.unwrap();

    let head = String::from_utf8_lossy(&request[..headers_end]);
    let first_line = head.lines().next().unwrap_or_default();
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or_default();
    let target = parts.next().unwrap_or_default();
    let path = target.split('?').next().unwrap_or(target);
    let query = target.split_once('?').map(|(_, q)| q).unwrap_or_default();
    let is_watch = target.contains("watch=true");
    let follow_logs = target.contains("follow=true");
    let label_selector = parse_label_selector(query);
    let path = path.trim_end_matches('/').to_string();

    // Read the request body based on Content-Length, if any.
    let content_length = head
        .lines()
        .find_map(|l| {
            l.split_once(':')
                .filter(|(k, _)| k.eq_ignore_ascii_case("content-length"))
                .map(|(_, v)| v.trim().parse::<usize>().unwrap_or(0))
        })
        .unwrap_or(0);

    let body = if content_length > 0 {
        let mut body = request[headers_end..].to_vec();
        while body.len() < content_length {
            let n = match stream.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };
            body.extend_from_slice(&buf[..n]);
        }
        String::from_utf8_lossy(&body).into_owned()
    } else {
        String::new()
    };

    let response = handle_request(
        &pods,
        method,
        &path,
        is_watch,
        follow_logs,
        label_selector.as_deref(),
        &body,
    )
    .await;

    match response {
        Response::Json(status, json) => {
            let _ = stream
                .write_all(http_response(status, json).as_bytes())
                .await;
        }
        Response::Watch => {
            stream_watch(stream).await;
        }
        Response::LogStream => {
            stream_log_stream(stream).await;
        }
    }
}

enum Response {
    Json(&'static str, String),
    Watch,
    LogStream,
}

async fn handle_request(
    pods: &PodStore,
    method: &str,
    path: &str,
    is_watch: bool,
    follow_logs: bool,
    label_selector: Option<&str>,
    body: &str,
) -> Response {
    // Metrics-server style endpoints (group metrics.k8s.io/v1beta1).
    if path.contains("/apis/metrics.k8s.io/v1beta1") {
        if path.ends_with("/pods") || path.ends_with("/pods/") {
            return Response::Json("200 OK", pod_metrics_list());
        }
        if path.ends_with("/nodes") || path.ends_with("/nodes/") {
            return Response::Json("200 OK", node_metrics_list());
        }
    }
    // Helm storage backend: release secrets (core/v1 Secrets).
    if path.ends_with("/secrets") || path.ends_with("/secrets/") {
        return Response::Json("200 OK", secret_list(label_selector));
    }
    if path.contains("/secrets/") {
        let name = path.rsplit('/').next().unwrap_or_default();
        if let Some(secret) = secret_by_name(name) {
            return Response::Json("200 OK", secret.to_string());
        }
        return not_found();
    }
    match (method, path, is_watch) {
        ("GET", "/version", _) => Response::Json(
            "200 OK",
            serde_json::json!({
                "major": "1",
                "minor": "30",
                "gitVersion": "v1.30.0",
            })
            .to_string(),
        ),
        ("GET", p, false) if p.ends_with("/pods") => {
            let items = pods.lock().await.clone();
            Response::Json("200 OK", pod_list(&items))
        }
        ("GET", p, true) if p.ends_with("/pods") => Response::Watch,
        ("GET", p, _) if p.ends_with("/log") => {
            if follow_logs {
                Response::LogStream
            } else {
                Response::Json("200 OK", "line 1\nline 2\nline 3\n".to_string())
            }
        }
        ("GET", p, _) if p.ends_with("/pods/pod-a") => {
            let state = pods.lock().await.clone();
            let pod = state
                .into_iter()
                .find(|p| p.pointer("/metadata/name").and_then(|v| v.as_str()) == Some("pod-a"));
            match pod {
                Some(pod) => Response::Json("200 OK", pod.to_string()),
                None => not_found(),
            }
        }
        ("POST", p, _) if p.ends_with("/pods") => {
            let parsed = match parse_body(body) {
                Ok(v) => v,
                Err(e) => return Response::Json("400 Bad Request", status(400, &e)),
            };
            pods.lock().await.push(parsed.clone());
            Response::Json("201 Created", parsed.to_string())
        }
        ("PUT", p, _) if p.ends_with("/pods/pod-a") => {
            let parsed = match parse_body(body) {
                Ok(v) => v,
                Err(e) => return Response::Json("400 Bad Request", status(400, &e)),
            };
            replace_pod(pods, parsed).await
        }
        ("PATCH", p, _) if p.ends_with("/pods/pod-a") || p.ends_with("/pods/pod-c") => {
            let parsed = match parse_body(body) {
                Ok(v) => v,
                Err(e) => return Response::Json("400 Bad Request", status(400, &e)),
            };
            upsert_pod(pods, parsed).await
        }
        ("DELETE", p, _) if p.ends_with("/pods/pod-a") => {
            pods.lock()
                .await
                .retain(|p| p.pointer("/metadata/name").and_then(|v| v.as_str()) != Some("pod-a"));
            Response::Json("200 OK", status(200, "deleted"))
        }
        _ => not_found(),
    }
}

async fn replace_pod(pods: &PodStore, parsed: serde_json::Value) -> Response {
    let name = parsed
        .pointer("/metadata/name")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let mut state = pods.lock().await;
    if let Some(existing) = state
        .iter_mut()
        .find(|p| p.pointer("/metadata/name").and_then(|v| v.as_str()) == Some(name.as_str()))
    {
        *existing = parsed.clone();
    } else {
        state.push(parsed.clone());
    }
    Response::Json("200 OK", parsed.to_string())
}

async fn upsert_pod(pods: &PodStore, parsed: serde_json::Value) -> Response {
    let name = parsed
        .pointer("/metadata/name")
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string();
    let mut state = pods.lock().await;
    if let Some(existing) = state
        .iter_mut()
        .find(|p| p.pointer("/metadata/name").and_then(|v| v.as_str()) == Some(name.as_str()))
    {
        merge_object(existing, &parsed);
        return Response::Json("200 OK", existing.clone().to_string());
    }
    state.push(parsed.clone());
    Response::Json("201 Created", parsed.to_string())
}

/// Shallow-merge applied fields into the existing object (mimics server-side
/// apply well enough for tests).
fn merge_object(existing: &mut serde_json::Value, patch: &serde_json::Value) {
    if let (Some(target), Some(source)) = (existing.as_object_mut(), patch.as_object()) {
        for (key, value) in source {
            target.insert(key.clone(), value.clone());
        }
    }
}

fn not_found() -> Response {
    Response::Json("404 Not Found", status(404, "not found"))
}

/// Parses a request body that may be JSON or YAML.
fn parse_body(body: &str) -> Result<serde_json::Value, String> {
    let trimmed = body.trim();
    if trimmed.is_empty() {
        return Err("Empty request body".to_string());
    }
    if let Ok(value) = serde_json::from_str::<serde_json::Value>(trimmed) {
        return Ok(value);
    }
    serde_yaml::from_str::<serde_json::Value>(trimmed)
        .map_err(|e| format!("Invalid JSON/YAML body: {e}"))
}

/// Returns a plain HTTP response with the given status and JSON body.
fn http_response(reason: &str, body: String) -> String {
    format!(
        "HTTP/1.1 {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    )
}

/// Serves a Kubernetes watch stream (chunked, newline-delimited events) and
/// keeps the connection open so the watcher stays connected.
async fn stream_watch(mut stream: TcpStream) {
    let head = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\nConnection: keep-alive\r\n\r\n";
    if stream.write_all(head.as_bytes()).await.is_err() {
        return;
    }

    let events = [
        serde_json::json!({ "type": "ADDED", "object": pod("pod-c") }).to_string(),
        serde_json::json!({ "type": "MODIFIED", "object": pod("pod-a") }).to_string(),
    ];

    for payload in events {
        let chunk = format!("{payload}\n");
        let _ = write_chunk(&mut stream, chunk.as_bytes()).await;
    }

    // Hold the connection open; the watcher keeps reading and the test
    // terminates the task when it is done.
    tokio::time::sleep(Duration::from_secs(30)).await;
}

/// Serves a pod log stream in follow mode (chunked, newline-delimited text).
/// Emits a few lines then keeps the connection open until the caller aborts.
async fn stream_log_stream(mut stream: TcpStream) {
    let head = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nTransfer-Encoding: chunked\r\nConnection: keep-alive\r\n\r\n";
    if stream.write_all(head.as_bytes()).await.is_err() {
        return;
    }

    for line in ["line 1\n", "line 2\n", "line 3\n"] {
        let _ = write_chunk(&mut stream, line.as_bytes()).await;
        tokio::time::sleep(Duration::from_millis(50)).await;
    }

    tokio::time::sleep(Duration::from_secs(30)).await;
}

async fn write_chunk(stream: &mut TcpStream, data: &[u8]) -> std::io::Result<()> {
    stream
        .write_all(format!("{:X}\r\n", data.len()).as_bytes())
        .await?;
    stream.write_all(data).await?;
    stream.write_all(b"\r\n").await
}

fn find_headers_end(request: &[u8]) -> Option<usize> {
    request
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .map(|i| i + 4)
}
