use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::models::{ClusterConfig, ClusterSummary};

/// Lists all contexts from the active kubeconfig without connecting.
#[tauri::command]
pub fn list_clusters(manager: State<'_, ClusterManager>) -> Result<Vec<ClusterSummary>, String> {
    manager.list_clusters()
}

/// Lists all managed cluster configs with their contexts.
#[tauri::command]
pub fn list_cluster_configs(
    manager: State<'_, ClusterManager>,
) -> Result<Vec<ClusterConfig>, String> {
    manager.list_configs()
}

/// Connects to a context and verifies the API server is reachable.
#[tauri::command]
pub async fn connect_cluster(
    context: String,
    manager: State<'_, ClusterManager>,
) -> Result<ClusterSummary, String> {
    manager.connect(&context).await
}

/// Re-reads the active kubeconfig from disk and returns the updated context list.
#[tauri::command]
pub fn reload_kubeconfig(
    manager: State<'_, ClusterManager>,
) -> Result<Vec<ClusterSummary>, String> {
    manager.reload()?;
    manager.list_clusters()
}

/// Returns the persisted list of cluster configs (no backend state change).
#[tauri::command]
pub fn get_cluster_configs(app: AppHandle) -> Result<Vec<ClusterConfig>, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {e}"))?;
    let stored = crate::kubeconfig::load_cluster_configs(&dir);
    let active = crate::kubeconfig::load_active_config_id(&dir);
    let configs: Vec<ClusterConfig> = stored
        .iter()
        .filter_map(|v| {
            let id = v.get("id")?.as_str()?.to_string();
            let name = v
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string();
            let path = v.get("path")?.as_str()?.to_string();
            let ctxs = crate::kubeconfig::load_kubeconfig_from(&std::path::PathBuf::from(&path))
                .map(|kc| crate::k8s::cluster_manager::contexts_for(&kc))
                .unwrap_or_default();
            Some(ClusterConfig {
                id,
                name,
                path,
                active: active.as_deref() == Some(v.get("id")?.as_str()?),
                contexts: ctxs,
            })
        })
        .collect();
    Ok(configs)
}

/// Adds a cluster config from a path, persists it and returns the config list.
#[tauri::command]
pub fn add_cluster_config(
    app: AppHandle,
    path: String,
    manager: State<'_, ClusterManager>,
) -> Result<Vec<ClusterConfig>, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {e}"))?;
    let mut stored = crate::kubeconfig::load_cluster_configs(&dir);
    // Avoid duplicates by path.
    if stored
        .iter()
        .any(|v| v.get("path").and_then(|p| p.as_str()) == Some(path.as_str()))
    {
        return manager.list_configs();
    }
    let id = Uuid::new_v4().to_string();
    let name = default_name(&path);
    stored.push(serde_json::json!({ "id": id, "name": name, "path": path }));
    let active = crate::kubeconfig::load_active_config_id(&dir);
    crate::kubeconfig::save_cluster_configs(&dir, &stored, active.as_deref());
    manager.set_configs(parse_stored(&stored), active)?;
    manager.list_configs()
}

/// Renames a cluster config and returns the config list.
#[tauri::command]
pub fn rename_cluster_config(
    app: AppHandle,
    id: String,
    name: String,
    manager: State<'_, ClusterManager>,
) -> Result<Vec<ClusterConfig>, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {e}"))?;
    let mut stored = crate::kubeconfig::load_cluster_configs(&dir);
    if let Some(item) = stored
        .iter_mut()
        .find(|v| v.get("id").and_then(|i| i.as_str()) == Some(id.as_str()))
    {
        item["name"] = serde_json::Value::String(name);
    }
    let active = crate::kubeconfig::load_active_config_id(&dir);
    crate::kubeconfig::save_cluster_configs(&dir, &stored, active.as_deref());
    manager.set_configs(parse_stored(&stored), active)?;
    manager.list_configs()
}

/// Removes a cluster config and returns the config list.
#[tauri::command]
pub fn remove_cluster_config(
    app: AppHandle,
    id: String,
    manager: State<'_, ClusterManager>,
) -> Result<Vec<ClusterConfig>, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {e}"))?;
    let mut stored = crate::kubeconfig::load_cluster_configs(&dir);
    stored.retain(|v| v.get("id").and_then(|i| i.as_str()) != Some(id.as_str()));
    let mut active = crate::kubeconfig::load_active_config_id(&dir);
    if active.as_deref() == Some(id.as_str()) {
        active = None;
    }
    crate::kubeconfig::save_cluster_configs(&dir, &stored, active.as_deref());
    manager.set_configs(parse_stored(&stored), active)?;
    manager.list_configs()
}

/// Sets the active cluster config and returns the config list.
#[tauri::command]
pub fn set_active_cluster_config(
    app: AppHandle,
    id: Option<String>,
    manager: State<'_, ClusterManager>,
) -> Result<Vec<ClusterConfig>, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {e}"))?;
    let stored = crate::kubeconfig::load_cluster_configs(&dir);
    crate::kubeconfig::save_cluster_configs(&dir, &stored, id.as_deref());
    manager.set_active_config(id.clone())?;
    manager.list_configs()
}

fn parse_stored(
    stored: &[serde_json::Value],
) -> Vec<crate::k8s::cluster_manager::ClusterConfigEntry> {
    stored
        .iter()
        .filter_map(|v| {
            Some(crate::k8s::cluster_manager::ClusterConfigEntry {
                id: v.get("id")?.as_str()?.to_string(),
                name: v
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_string(),
                path: v.get("path")?.as_str()?.to_string(),
            })
        })
        .collect()
}

fn default_name(path: &str) -> String {
    let pb = std::path::Path::new(path);
    pb.file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "kubeconfig".to_string())
}
