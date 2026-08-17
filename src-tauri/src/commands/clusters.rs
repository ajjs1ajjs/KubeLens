use tauri::{AppHandle, Manager, State};

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::models::ClusterSummary;

/// Lists all contexts from the merged kubeconfig without connecting.
#[tauri::command]
pub fn list_clusters(manager: State<'_, ClusterManager>) -> Result<Vec<ClusterSummary>, String> {
    manager.list_clusters()
}

/// Connects to a context and verifies the API server is reachable.
#[tauri::command]
pub async fn connect_cluster(
    context: String,
    manager: State<'_, ClusterManager>,
) -> Result<ClusterSummary, String> {
    manager.connect(&context).await
}

/// Re-reads kubeconfig files from disk and returns the updated context list.
#[tauri::command]
pub fn reload_kubeconfig(
    manager: State<'_, ClusterManager>,
) -> Result<Vec<ClusterSummary>, String> {
    manager.reload()?;
    manager.list_clusters()
}

/// Returns the persisted custom kubeconfig path, if any.
#[tauri::command]
pub fn get_kubeconfig_path(app: AppHandle) -> Result<Option<String>, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {e}"))?;
    Ok(crate::kubeconfig::load_custom_kubeconfig_path(&dir))
}

/// Sets the custom kubeconfig path, persists it and reloads the cluster list.
#[tauri::command]
pub fn set_kubeconfig_path(
    app: AppHandle,
    path: Option<String>,
    manager: State<'_, ClusterManager>,
) -> Result<Vec<ClusterSummary>, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {e}"))?;
    crate::kubeconfig::save_custom_kubeconfig_path(&dir, path.as_deref());
    let path_buf = path.map(std::path::PathBuf::from);
    manager.set_kubeconfig_path(path_buf)?;
    manager.list_clusters()
}
