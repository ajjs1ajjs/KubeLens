use tauri::State;

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::helm;
use crate::k8s::models::{HelmReleaseDetail, HelmReleaseRevision, HelmReleaseSummary};

/// Lists Helm releases (newest revision per release).
#[tauri::command]
pub async fn list_helm_releases(
    manager: State<'_, ClusterManager>,
    context: String,
) -> Result<Vec<HelmReleaseSummary>, String> {
    helm::list_releases(&manager, &context).await
}

/// Fetches full detail for a Helm release.
#[tauri::command]
pub async fn get_helm_release(
    manager: State<'_, ClusterManager>,
    context: String,
    name: String,
) -> Result<HelmReleaseDetail, String> {
    helm::release_detail(&manager, &context, &name).await
}

/// Fetches detail for a specific revision of a Helm release.
#[tauri::command]
pub async fn get_helm_release_revision(
    manager: State<'_, ClusterManager>,
    context: String,
    name: String,
    version: i32,
) -> Result<HelmReleaseDetail, String> {
    helm::release_detail_at(&manager, &context, &name, version).await
}

/// Lists every stored revision of a Helm release, newest first.
#[tauri::command]
pub async fn list_helm_revisions(
    manager: State<'_, ClusterManager>,
    context: String,
    name: String,
) -> Result<Vec<HelmReleaseRevision>, String> {
    helm::release_revisions(&manager, &context, &name).await
}

/// Deletes every revision of a Helm release.
#[tauri::command]
pub async fn uninstall_helm_release(
    manager: State<'_, ClusterManager>,
    context: String,
    name: String,
) -> Result<(), String> {
    helm::uninstall_release(&manager, &context, &name).await
}
