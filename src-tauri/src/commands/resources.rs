use tauri::{AppHandle, State};

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::models::ResourceContext;
use crate::k8s::resources;
use crate::k8s::watch::WatchManager;

/// Lists resources matching the given context.
#[tauri::command]
pub async fn list_resources(
    manager: State<'_, ClusterManager>,
    ctx: ResourceContext,
) -> Result<Vec<serde_json::Value>, String> {
    resources::list(&manager, &ctx).await
}

/// Fetches a single resource by name.
#[tauri::command]
pub async fn get_resource(
    manager: State<'_, ClusterManager>,
    ctx: ResourceContext,
    name: String,
) -> Result<serde_json::Value, String> {
    resources::get(&manager, &ctx, &name).await
}

/// Deletes a resource by name.
#[tauri::command]
pub async fn delete_resource(
    manager: State<'_, ClusterManager>,
    ctx: ResourceContext,
    name: String,
) -> Result<(), String> {
    resources::delete(&manager, &ctx, &name).await
}

/// Applies a YAML manifest using server-side apply.
#[tauri::command]
pub async fn apply_yaml(
    manager: State<'_, ClusterManager>,
    ctx: ResourceContext,
    yaml: String,
) -> Result<serde_json::Value, String> {
    resources::apply_yaml(&manager, &ctx, &yaml).await
}

/// Starts a watch subscription for a resource context, returning its id.
#[tauri::command]
pub async fn start_watch(
    app: AppHandle,
    manager: State<'_, ClusterManager>,
    watch: State<'_, WatchManager>,
    ctx: ResourceContext,
) -> Result<String, String> {
    watch.start(&manager, app, ctx).await
}

/// Stops a watch subscription by id.
#[tauri::command]
pub fn stop_watch(watch: State<'_, WatchManager>, id: String) -> Result<(), String> {
    watch.stop(&id);
    Ok(())
}

/// Lists namespace names available on a context.
#[tauri::command]
pub async fn list_namespaces(
    manager: State<'_, ClusterManager>,
    context: String,
) -> Result<Vec<String>, String> {
    let ctx = ResourceContext {
        context,
        config_id: String::new(),
        group: String::new(),
        version: "v1".into(),
        kind: "Namespace".into(),
        namespaced: false,
        namespace: String::new(),
    };
    let objects = resources::list(&manager, &ctx).await?;
    let mut names: Vec<String> = objects
        .iter()
        .filter_map(|o| o.pointer("/metadata/name").and_then(|v| v.as_str()))
        .map(|s| s.to_string())
        .collect();
    names.sort();
    Ok(names)
}
