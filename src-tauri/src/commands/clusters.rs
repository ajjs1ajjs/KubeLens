use tauri::State;

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
