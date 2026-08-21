use tauri::State;

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::helm;
use crate::k8s::models::{HelmReleaseDetail, HelmReleaseRevision, HelmReleaseSummary};

/// Lists Helm releases (newest revision per release).
#[tauri::command]
pub async fn list_helm_releases(
    manager: State<'_, ClusterManager>,
    context: String,
    config_id: Option<String>,
) -> Result<Vec<HelmReleaseSummary>, String> {
    helm::list_releases(
        &manager,
        config_id.as_deref().filter(|s| !s.is_empty()),
        &context,
    )
    .await
}

/// Fetches full detail for a Helm release.
#[tauri::command]
pub async fn get_helm_release(
    manager: State<'_, ClusterManager>,
    context: String,
    name: String,
    config_id: Option<String>,
) -> Result<HelmReleaseDetail, String> {
    helm::release_detail(
        &manager,
        config_id.as_deref().filter(|s| !s.is_empty()),
        &context,
        &name,
    )
    .await
}

/// Fetches detail for a specific revision of a Helm release.
#[tauri::command]
pub async fn get_helm_release_revision(
    manager: State<'_, ClusterManager>,
    context: String,
    name: String,
    version: i32,
    config_id: Option<String>,
) -> Result<HelmReleaseDetail, String> {
    helm::release_detail_at(
        &manager,
        config_id.as_deref().filter(|s| !s.is_empty()),
        &context,
        &name,
        version,
    )
    .await
}

/// Lists every stored revision of a Helm release, newest first.
#[tauri::command]
pub async fn list_helm_revisions(
    manager: State<'_, ClusterManager>,
    context: String,
    name: String,
    config_id: Option<String>,
) -> Result<Vec<HelmReleaseRevision>, String> {
    helm::release_revisions(
        &manager,
        config_id.as_deref().filter(|s| !s.is_empty()),
        &context,
        &name,
    )
    .await
}

/// Deletes every revision of a Helm release.
#[tauri::command]
pub async fn uninstall_helm_release(
    manager: State<'_, ClusterManager>,
    context: String,
    name: String,
    config_id: Option<String>,
) -> Result<(), String> {
    helm::uninstall_release(
        &manager,
        config_id.as_deref().filter(|s| !s.is_empty()),
        &context,
        &name,
    )
    .await
}
