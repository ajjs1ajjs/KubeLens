use tauri::State;

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::metrics;
use crate::k8s::models::{NodeMetric, PodMetric, ResourceContext};

/// Fetches CPU/memory usage for pods in the context's namespace.
#[tauri::command]
pub async fn get_pod_metrics(
    manager: State<'_, ClusterManager>,
    ctx: ResourceContext,
) -> Result<Vec<PodMetric>, String> {
    metrics::pod_metrics(&manager, &ctx).await
}

/// Fetches CPU/memory usage for all nodes in the context.
#[tauri::command]
pub async fn get_node_metrics(
    manager: State<'_, ClusterManager>,
    ctx: ResourceContext,
) -> Result<Vec<NodeMetric>, String> {
    metrics::node_metrics(&manager, &ctx).await
}
