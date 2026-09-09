use tauri::{AppHandle, State};
use tracing::{info, warn};

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::interactive::{LogManager, PortForwardManager, TerminalManager};
use crate::k8s::models::{PortForwardInfo, PortForwardStart, ResourceContext};
use crate::logging::correlation_id;
use crate::ratelimit::check_rate_limit;

/// Fetches a pod's logs (no follow) as a single text blob.
#[tauri::command]
pub async fn get_logs(
    manager: State<'_, ClusterManager>,
    ctx: ResourceContext,
    name: String,
    container: Option<String>,
    tail_lines: Option<i64>,
) -> Result<String, String> {
    let correlation_id = correlation_id();
    info!(correlation_id = %correlation_id, pod = %name, container = ?container, "Fetching pod logs");
    let result =
        crate::k8s::interactive::pod_logs(&manager, &ctx, &name, container, tail_lines).await;
    if result.is_err() {
        warn!(correlation_id = %correlation_id, "Failed to fetch pod logs");
    }
    result
}

/// Starts following pod logs, returning the subscription id. Lines arrive as
/// `kubelens://logs` events.
#[tauri::command]
pub async fn follow_logs(
    app: AppHandle,
    manager: State<'_, ClusterManager>,
    logs: State<'_, LogManager>,
    ctx: ResourceContext,
    name: String,
    container: Option<String>,
) -> Result<String, String> {
    let correlation_id = correlation_id();
    let key = format!("{}:{}", ctx.config_id, ctx.context);
    check_rate_limit("logs", &key)?;
    info!(correlation_id = %correlation_id, pod = %name, container = ?container, "Starting log follow");
    logs.start(&manager, app, ctx, name, container).await
}

/// Stops a follow-log subscription by id.
#[tauri::command]
pub fn stop_follow_logs(logs: State<'_, LogManager>, id: String) -> Result<(), String> {
    let correlation_id = correlation_id();
    info!(correlation_id = %correlation_id, log_id = %id, "Stopping log follow");
    logs.stop(&id);
    Ok(())
}

/// Starts an exec terminal session in a pod, returning the session id. Output
/// arrives as `kubelens://exec-output` events.
#[tauri::command]
pub async fn exec_shell(
    app: AppHandle,
    manager: State<'_, ClusterManager>,
    terminals: State<'_, TerminalManager>,
    ctx: ResourceContext,
    name: String,
    container: Option<String>,
    command: Vec<String>,
) -> Result<String, String> {
    let correlation_id = correlation_id();
    let key = format!("{}:{}", ctx.config_id, ctx.context);
    check_rate_limit("exec", &key)?;
    info!(correlation_id = %correlation_id, pod = %name, container = ?container, command = ?command, "Starting exec session");
    terminals
        .start(&manager, app, ctx, name, container, command)
        .await
}

/// Sends a chunk of input to an exec terminal session.
#[tauri::command]
pub fn exec_input(
    terminals: State<'_, TerminalManager>,
    id: String,
    data: String,
) -> Result<(), String> {
    terminals.input(&id, data)
}

/// Terminates an exec terminal session.
#[tauri::command]
pub fn stop_exec(terminals: State<'_, TerminalManager>, id: String) -> Result<(), String> {
    let correlation_id = correlation_id();
    info!(correlation_id = %correlation_id, exec_id = %id, "Stopping exec session");
    terminals.stop(&id);
    Ok(())
}

/// Starts a port-forward tunnel to a pod, returning the assigned local port.
#[tauri::command]
pub async fn start_port_forward(
    manager: State<'_, ClusterManager>,
    forwards: State<'_, PortForwardManager>,
    ctx: ResourceContext,
    name: String,
    remote_port: u16,
) -> Result<PortForwardStart, String> {
    let correlation_id = correlation_id();
    let key = format!("{}:{}", ctx.config_id, ctx.context);
    check_rate_limit("port_forward", &key)?;
    info!(correlation_id = %correlation_id, pod = %name, remote_port = remote_port, "Starting port forward");
    forwards.start(&manager, ctx, name, remote_port).await
}

/// Lists active port-forward tunnels.
#[tauri::command]
pub fn list_port_forwards(forwards: State<'_, PortForwardManager>) -> Vec<PortForwardInfo> {
    forwards.list()
}

/// Stops a port-forward tunnel by id.
#[tauri::command]
pub fn stop_port_forward(
    forwards: State<'_, PortForwardManager>,
    id: String,
) -> Result<(), String> {
    let correlation_id = correlation_id();
    info!(correlation_id = %correlation_id, port_forward_id = %id, "Stopping port forward");
    forwards.stop(&id);
    Ok(())
}
