use tauri::{AppHandle, State};

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::models::ResourceContext;
use crate::k8s::resources;
use crate::k8s::watch::WatchManager;
use crate::ratelimit::check_rate_limit;
use kube::api::ListParams;

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
    let key = format!("{}:{}", ctx.config_id, ctx.context);
    check_rate_limit("mutating", &key)?;
    resources::delete(&manager, &ctx, &name).await
}

/// Applies a YAML manifest using server-side apply.
#[tauri::command]
pub async fn apply_yaml(
    manager: State<'_, ClusterManager>,
    ctx: ResourceContext,
    yaml: String,
) -> Result<serde_json::Value, String> {
    let key = format!("{}:{}", ctx.config_id, ctx.context);
    check_rate_limit("mutating", &key)?;
    resources::apply_yaml(&manager, &ctx, &yaml).await
}

/// Scales a workload to the given replica count.
#[tauri::command]
pub async fn scale_resource(
    manager: State<'_, ClusterManager>,
    ctx: ResourceContext,
    name: String,
    replicas: i32,
) -> Result<(), String> {
    let key = format!("{}:{}", ctx.config_id, ctx.context);
    check_rate_limit("mutating", &key)?;
    resources::scale(&manager, &ctx, &name, replicas).await
}

/// Triggers a rolling restart by patching a restart annotation.
#[tauri::command]
pub async fn restart_resource(
    manager: State<'_, ClusterManager>,
    ctx: ResourceContext,
    name: String,
) -> Result<(), String> {
    let key = format!("{}:{}", ctx.config_id, ctx.context);
    check_rate_limit("mutating", &key)?;
    resources::restart(&manager, &ctx, &name).await
}

/// Starts a watch subscription for a resource context, returning its id.
#[tauri::command]
pub async fn start_watch(
    app: AppHandle,
    manager: State<'_, ClusterManager>,
    watch: State<'_, WatchManager>,
    ctx: ResourceContext,
) -> Result<String, String> {
    let key = format!("{}:{}", ctx.config_id, ctx.context);
    check_rate_limit("watch", &key)?;
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
    config_id: Option<String>,
) -> Result<Vec<String>, String> {
    let ctx = ResourceContext {
        context,
        config_id: config_id.unwrap_or_default(),
        group: String::new(),
        version: "v1".into(),
        kind: "Namespace".into(),
        namespaced: false,
        namespace: String::new(),
    };
    let client = manager.client_ctx(&ctx).await?;
    let api = resources::api(&client, &ctx);
    // Use pagination to avoid fetching all namespaces at once on large clusters.
    let list = api
        .list(&ListParams {
            limit: Some(500),
            ..Default::default()
        })
        .await
        .map_err(crate::k8s::resources::kube_error)?;
    let mut names: Vec<String> = list
        .items
        .iter()
        .filter_map(|o| {
            let val = serde_json::to_value(o).ok()?;
            val.pointer("/metadata/name")?.as_str().map(String::from)
        })
        .collect();
    names.sort();
    Ok(names)
}
