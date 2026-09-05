use tauri::{AppHandle, State};

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::interactive::{LogManager, PortForwardManager, TerminalManager};
use crate::k8s::models::{PortForwardInfo, PortForwardStart, ResourceContext};

/// Fetches a pod's logs (no follow) as a single text blob.
#[tauri::command]
pub async fn get_logs(
    manager: State<'_, ClusterManager>,
    ctx: ResourceContext,
    name: String,
    container: Option<String>,
    tail_lines: Option<i64>,
) -> Result<String, String> {
    crate::k8s::interactive::pod_logs(&manager, &ctx, &name, container, tail_lines).await
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
    logs.start(&manager, app, ctx, name, container).await
}

/// Stops a follow-log subscription by id.
#[tauri::command]
pub fn stop_follow_logs(logs: State<'_, LogManager>, id: String) -> Result<(), String> {
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
    forwards.stop(&id);
    Ok(())
}
