//! Interactive workloads: pod logs, exec terminal and port-forwarding.

use std::collections::HashMap;
use std::sync::Mutex;

use futures::channel::mpsc;
use futures::AsyncBufReadExt;
use futures::StreamExt;
use k8s_openapi::api::core::v1::Pod;
use kube::api::{Api, AttachParams, LogParams};
use kube::Client;
use tauri::Emitter;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::models::{ExecEvent, LogEvent, PortForwardInfo, PortForwardStart, ResourceContext};

/// Event names used for log/exec traffic between backend and frontend.
pub const LOG_EVENT: &str = "kubelens://logs";
pub const EXEC_EVENT: &str = "kubelens://exec-output";

/// Builds a namespaced Pod API handle for interactive workloads.
fn pod_api(client: &Client, ctx: &ResourceContext) -> Api<Pod> {
    Api::namespaced(client.clone(), &ctx.namespace)
}

/// Fetches a pod's logs (no follow) as a single text blob.
pub async fn pod_logs(
    manager: &ClusterManager,
    ctx: &ResourceContext,
    name: &str,
    container: Option<String>,
    tail_lines: Option<i64>,
) -> Result<String, String> {
    let client = manager.client_ctx(ctx).await?;
    let api = pod_api(&client, ctx);
    let params = LogParams {
        container,
        tail_lines,
        ..Default::default()
    };
    let reader = api.log_stream(name, &params).await.map_err(kube_err)?;
    let mut text = String::new();
    // Drain the buffered reader line by line so big outputs stay bounded.
    let mut lines = reader.lines();
    while let Some(line) = lines.next().await {
        let line = line.map_err(io_err)?;
        text.push_str(&line);
        text.push('\n');
    }
    Ok(text)
}

/// Emits pod log lines in follow mode. Split from `LogManager` so it can be
/// exercised against the mock API server without a Tauri application.
pub async fn stream_logs<F>(
    manager: &ClusterManager,
    ctx: ResourceContext,
    id: String,
    name: String,
    container: Option<String>,
    emit: F,
) where
    F: Fn(LogEvent) + Send + 'static,
{
    let result: Result<(), String> = async {
        let client = manager.client_ctx(&ctx).await?;
        let api = pod_api(&client, &ctx);
        let params = LogParams {
            container,
            follow: true,
            ..Default::default()
        };
        let reader = api.log_stream(&name, &params).await.map_err(kube_err)?;
        let mut lines = reader.lines();
        while let Some(line) = lines.next().await {
            let line = line.map_err(io_err)?;
            emit(LogEvent {
                id: id.clone(),
                action: "line".into(),
                line: Some(line),
                error: None,
            });
        }
        Ok(())
    }
    .await;

    match result {
        Ok(()) => emit(LogEvent {
            id,
            action: "done".into(),
            line: None,
            error: None,
        }),
        Err(error) => emit(LogEvent {
            id,
            action: "error".into(),
            line: None,
            error: Some(error),
        }),
    }
}

/// Manages follow-log subscriptions.
pub struct LogManager {
    tasks: Mutex<HashMap<String, tokio::task::AbortHandle>>,
}

impl Default for LogManager {
    fn default() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
        }
    }
}

impl LogManager {
    /// Starts following pod logs, emitting lines as [`LOG_EVENT`].
    pub async fn start(
        &self,
        manager: &ClusterManager,
        app: tauri::AppHandle,
        ctx: ResourceContext,
        name: String,
        container: Option<String>,
    ) -> Result<String, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let emit_app = app.clone();
        let manager = manager.clone();
        let task_id = id.clone();
        let task = tokio::spawn(async move {
            stream_logs(&manager, ctx, task_id, name, container, move |event| {
                let _ = emit_app.emit(LOG_EVENT, event);
            })
            .await;
        });
        let abort_handle = task.abort_handle();
        self.tasks.lock().unwrap().insert(id.clone(), abort_handle);
        Ok(id)
    }

    /// Stops a follow-log subscription.
    pub fn stop(&self, id: &str) {
        if let Some(handle) = self.tasks.lock().unwrap().remove(id) {
            handle.abort();
        }
    }
}

/// Manages exec terminal sessions (stdin/stdout bridged to the pod).
pub struct TerminalManager {
    tasks: Mutex<HashMap<String, tokio::task::AbortHandle>>,
    inputs: Mutex<HashMap<String, mpsc::UnboundedSender<String>>>,
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
            inputs: Mutex::new(HashMap::new()),
        }
    }
}

impl TerminalManager {
    /// Starts an exec session in a pod container, emitting output as
    /// [`EXEC_EVENT`] events. Returns the session id.
    pub async fn start(
        &self,
        manager: &ClusterManager,
        app: tauri::AppHandle,
        ctx: ResourceContext,
        name: String,
        container: Option<String>,
        command: Vec<String>,
    ) -> Result<String, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let (input_tx, input_rx) = mpsc::unbounded::<String>();
        self.inputs.lock().unwrap().insert(id.clone(), input_tx);

        let emit_app = app.clone();
        let manager = manager.clone();
        let task_id = id.clone();
        let task = tokio::spawn(async move {
            run_exec(
                &manager,
                ctx,
                task_id,
                name,
                container,
                command,
                input_rx,
                move |event| {
                    let _ = emit_app.emit(EXEC_EVENT, event);
                },
            )
            .await;
        });
        let abort_handle = task.abort_handle();
        self.tasks.lock().unwrap().insert(id.clone(), abort_handle);
        Ok(id)
    }

    /// Forwards a chunk of terminal input to the pod's stdin.
    pub fn input(&self, id: &str, data: String) -> Result<(), String> {
        let senders = self.inputs.lock().unwrap();
        let sender = senders
            .get(id)
            .ok_or_else(|| "No active terminal session with that id".to_string())?;
        sender
            .unbounded_send(data)
            .map_err(|_| "Terminal session is closing".to_string())
    }

    /// Stops an exec session.
    pub fn stop(&self, id: &str) {
        self.inputs.lock().unwrap().remove(id);
        if let Some(handle) = self.tasks.lock().unwrap().remove(id) {
            handle.abort();
        }
    }
}

/// Runs one exec session: pipes pod stdout/stderr to `emit` and stdin from
/// `input_rx`. Testable without a Tauri application.
#[allow(clippy::too_many_arguments)]
async fn run_exec<F>(
    manager: &ClusterManager,
    ctx: ResourceContext,
    id: String,
    name: String,
    container: Option<String>,
    command: Vec<String>,
    mut input_rx: mpsc::UnboundedReceiver<String>,
    emit: F,
) where
    F: Fn(ExecEvent) + Send + 'static,
{
    let setup = async {
        let client = manager.client_ctx(&ctx).await?;
        let api: Api<Pod> = pod_api(&client, &ctx);
        let params = AttachParams {
            container,
            stdin: true,
            stdout: true,
            stderr: true,
            tty: true,
            ..Default::default()
        };
        let attached = api.exec(&name, command, &params).await.map_err(kube_err)?;
        Ok::<_, String>(attached)
    };

    let mut attached = match setup.await {
        Ok(a) => a,
        Err(error) => {
            emit(ExecEvent {
                id: id.clone(),
                action: "error".into(),
                data: None,
                error: Some(error),
            });
            emit(ExecEvent {
                id,
                action: "done".into(),
                data: None,
                error: None,
            });
            return;
        }
    };

    let mut stdin = match attached.stdin() {
        Some(s) => s,
        None => {
            emit(ExecEvent {
                id: id.clone(),
                action: "error".into(),
                data: None,
                error: Some("Pod did not attach stdin".into()),
            });
            emit(ExecEvent {
                id,
                action: "done".into(),
                data: None,
                error: None,
            });
            return;
        }
    };
    let mut stdout = attached.stdout();
    let mut stderr = attached.stderr();

    let mut out_buf = vec![0u8; 8192];
    let mut err_buf = vec![0u8; 8192];
    loop {
        tokio::select! {
            input = input_rx.next() => {
                match input {
                    Some(data) => {
                        if stdin.write_all(data.as_bytes()).await.is_err() {
                            break;
                        }
                        let _ = stdin.flush().await;
                    }
                    None => break,
                }
            }
            read = read_opt(stdout.as_mut(), &mut out_buf) => {
                match read {
                    Ok(0) => break,
                    Ok(n) => {
                        emit(ExecEvent {
                            id: id.clone(),
                            action: "output".into(),
                            data: Some(String::from_utf8_lossy(&out_buf[..n]).into_owned()),
                            error: None,
                        });
                    }
                    Err(_) => break,
                }
            }
            read = read_opt(stderr.as_mut(), &mut err_buf) => {
                match read {
                    Ok(0) => break,
                    Ok(n) => {
                        emit(ExecEvent {
                            id: id.clone(),
                            action: "output".into(),
                            data: Some(String::from_utf8_lossy(&err_buf[..n]).into_owned()),
                            error: None,
                        });
                    }
                    Err(_) => break,
                }
            }
        }
    }

    emit(ExecEvent {
        id,
        action: "done".into(),
        data: None,
        error: None,
    });
}

/// Reads from a stream if present, otherwise waits forever so the `select!`
/// branch stays inert for sessions without that channel.
async fn read_opt<R: tokio::io::AsyncRead + Unpin>(
    stream: Option<&mut R>,
    buf: &mut [u8],
) -> std::io::Result<usize> {
    match stream {
        Some(s) => s.read(buf).await,
        None => futures::future::pending::<std::io::Result<usize>>().await,
    }
}

/// Manages port-forward tunnels.
pub struct PortForwardManager {
    tasks: Mutex<HashMap<String, tokio::task::AbortHandle>>,
    forwards: Mutex<HashMap<String, PortForwardInfo>>,
}

impl Default for PortForwardManager {
    fn default() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
            forwards: Mutex::new(HashMap::new()),
        }
    }
}

impl PortForwardManager {
    /// Starts a port-forward tunnel to a pod and binds a local port.
    pub async fn start(
        &self,
        manager: &ClusterManager,
        ctx: ResourceContext,
        name: String,
        remote_port: u16,
    ) -> Result<PortForwardStart, String> {
        let client = manager.client_ctx(&ctx).await?;
        let api = pod_api(&client, &ctx);
        let mut pf = api
            .portforward(&name, &[remote_port])
            .await
            .map_err(kube_err)?;
        let stream = pf
            .take_stream(remote_port)
            .ok_or_else(|| "Port-forward stream was not available".to_string())?;
        let mut pod_duplex = stream;

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| format!("Failed to bind local port: {e}"))?;
        let local_port = listener
            .local_addr()
            .map_err(|e| format!("Failed to read local port: {e}"))?
            .port();

        let id = uuid::Uuid::new_v4().to_string();
        let task = tokio::spawn(async move {
            loop {
                let Ok((mut conn, _)) = listener.accept().await else {
                    break;
                };
                // Proxy one connection at a time; `copy_bidirectional` handles
                // both directions and closes cleanly when either side EOFs.
                let _ = tokio::io::copy_bidirectional(&mut conn, &mut pod_duplex).await;
            }
        });
        let abort_handle = task.abort_handle();
        self.tasks.lock().unwrap().insert(id.clone(), abort_handle);
        self.forwards.lock().unwrap().insert(
            id.clone(),
            PortForwardInfo {
                id: id.clone(),
                context: ctx.context,
                name,
                remote_port,
                local_port,
            },
        );
        Ok(PortForwardStart { id, local_port })
    }

    /// Lists active tunnels.
    pub fn list(&self) -> Vec<PortForwardInfo> {
        let mut forwards: Vec<PortForwardInfo> =
            self.forwards.lock().unwrap().values().cloned().collect();
        forwards.sort_by_key(|f| f.local_port);
        forwards
    }

    /// Stops a tunnel.
    pub fn stop(&self, id: &str) {
        self.forwards.lock().unwrap().remove(id);
        if let Some(handle) = self.tasks.lock().unwrap().remove(id) {
            handle.abort();
        }
    }
}

fn kube_err(err: kube::Error) -> String {
    format!("Kubernetes API error: {err}")
}

fn io_err(err: std::io::Error) -> String {
    format!("Pod logs error: {err}")
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use futures::channel::mpsc;
    use futures::StreamExt;

    use crate::k8s::interactive;
    use crate::k8s::mock_api;
    use crate::k8s::testsupport::{manager_with_mock, pod_ctx};

    #[tokio::test]
    async fn fetches_pod_logs() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();

        let logs = interactive::pod_logs(&manager, &ctx, "pod-a", None, Some(100))
            .await
            .expect("logs");
        assert!(logs.contains("line 1"), "unexpected logs: {logs}");
    }

    #[tokio::test]
    async fn streams_following_logs() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();

        let (tx, mut rx) = mpsc::unbounded::<crate::k8s::models::LogEvent>();
        let manager = manager.clone();
        let task = tokio::spawn(async move {
            interactive::stream_logs(
                &manager,
                ctx,
                "logs-1".into(),
                "pod-a".into(),
                None,
                move |event| {
                    let _ = tx.unbounded_send(event);
                },
            )
            .await;
        });

        let mut lines = Vec::new();
        let deadline = tokio::time::timeout(Duration::from_secs(10), async {
            while let Some(event) = rx.next().await {
                if event.action == "line" {
                    lines.push(event.line.unwrap_or_default());
                }
                if lines.len() >= 3 {
                    break;
                }
            }
        })
        .await;
        assert!(deadline.is_ok(), "timed out waiting for log lines");
        assert!(lines[0].contains("line 1"));
        assert!(lines.iter().any(|l| l.contains("line 3")));

        task.abort();
    }

    #[tokio::test]
    async fn exec_fails_cleanly_without_websocket_support() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();

        let (tx, mut rx) = mpsc::unbounded::<crate::k8s::models::ExecEvent>();
        let manager = manager.clone();
        let task = tokio::spawn(async move {
            crate::k8s::interactive::run_exec(
                &manager,
                ctx,
                "exec-1".into(),
                "pod-a".into(),
                None,
                vec!["sh".into()],
                futures::channel::mpsc::unbounded::<String>().1,
                move |event| {
                    let _ = tx.unbounded_send(event);
                },
            )
            .await;
        });

        let mut saw_error = false;
        let mut saw_done = false;
        let deadline = tokio::time::timeout(Duration::from_secs(10), async {
            while let Some(event) = rx.next().await {
                match event.action.as_str() {
                    "error" => saw_error = true,
                    "done" => saw_done = true,
                    _ => {}
                }
                if saw_error && saw_done {
                    break;
                }
            }
        })
        .await;
        assert!(deadline.is_ok(), "timed out waiting for exec result");
        assert!(saw_error, "expected exec to fail against the mock server");
        assert!(saw_done);

        task.abort();
    }

    #[tokio::test]
    async fn port_forward_fails_cleanly_without_tunnel_support() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();

        let err = interactive::PortForwardManager::default()
            .start(&manager, ctx, "pod-a".into(), 8080)
            .await
            .expect_err("port-forward should fail against mock");
        assert!(err.contains("API"), "unexpected error: {err}");
    }
}
