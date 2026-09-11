use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager, State};
use tracing::info;
use uuid::Uuid;

use crate::k8s::cluster_manager::{ClusterManager, config_entries_from_stored};
use crate::k8s::models::{ClusterConfig, ClusterSummary};
use crate::kubeconfig::load_kubeconfig_from;
use crate::logging::correlation_id;

/// Returns the path to the managed kubeconfigs storage directory.
fn managed_kubeconfigs_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let mut dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {e}"))?;
    dir.push("managed_kubeconfigs");
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create managed kubeconfigs directory: {e}"))?;
    Ok(dir)
}

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

/// Connects to a context and verifies the API server is reachable. When
/// \config_id\ is non-empty the client is built from that config, allowing
/// several clusters (across configs) to be connected at once.
#[tauri::command]
pub async fn connect_cluster(
    context: String,
    config_id: Option<String>,
    manager: State<'_, ClusterManager>,
) -> Result<ClusterSummary, String> {
    manager
        .connect_for(config_id.as_deref().filter(|s| !s.is_empty()), &context)
        .await
}
#[tauri::command]
pub fn disconnect_cluster(
    context: String,
    config_id: Option<String>,
    manager: State<'_, ClusterManager>,
) -> Result<(), String> {
    manager.disconnect(config_id.as_deref().filter(|s| !s.is_empty()), &context);
    Ok(())
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
    let correlation_id = correlation_id();
    info!(correlation_id = %correlation_id, "Adding cluster config from path: {path}");

    // Validate the path exists and is a readable file
    let pb = PathBuf::from(&path);
    let metadata = fs::metadata(&pb)
        .map_err(|e| format!("Failed to access kubeconfig path: {e}"))?;
    if !metadata.is_file() {
        return Err(format!(
            "Kubeconfig path is not a regular file: {}",
            pb.display()
        ));
    }

    // Validate that it's a valid kubeconfig by trying to parse it
    let kubeconfig = load_kubeconfig_from(&pb)
        .map_err(|e| format!("Invalid kubeconfig file: {e}"))?;

    // Create managed storage directory for kubeconfigs
    let managed_dir = managed_kubeconfigs_dir(&app)?;

    // Generate a UUID for this config
    let id = Uuid::new_v4().to_string();
    
    // Create the destination path: <managed_dir>/<uuid>.kubeconfig
    let mut dest_path = managed_dir.clone();
    dest_path.push(format!("{}.kubeconfig", id));
    
    // Copy the file to managed storage
    fs::copy(&pb, &dest_path)
        .map_err(|e| format!("Failed to copy kubeconfig to managed storage: {e}"))?;
    
    info!(correlation_id = %correlation_id, "Copied kubeconfig to managed storage: {}", dest_path.display());

    let mut stored = crate::kubeconfig::load_cluster_configs(&app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {e}"))?);
    
    // Avoid duplicates by checking if we already have this exact managed file path
    // (prevents adding the same managed file multiple times)
    if stored
        .iter()
        .any(|v| v.get("path").and_then(|p| p.as_str()) == Some(dest_path.to_string_lossy().as_ref()))
    {
        info!(correlation_id = %correlation_id, "Managed kubeconfig already exists, skipping");
        // Clean up the copied file since we're not using it
        let _ = fs::remove_file(&dest_path);
        return manager.list_configs();
    }
    
    // Derive a display name from the original filename (without extension)
    let name = pb.file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_else(|| "kubeconfig")
        .to_string();
    
    // Get contexts from the kubeconfig for the config details
    let contexts = crate::k8s::cluster_manager::contexts_for(&kubeconfig);
    
    // Store the config with path pointing to the copied file in managed storage
    stored.push(serde_json::json!({
        "id": id,
        "name": name,
        "path": dest_path.to_string_lossy().as_ref(),
        "contexts": contexts
    }));
    
    // Auto-activate this config when no config is active yet
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {e}"))?;
    let mut active = crate::kubeconfig::load_active_config_id(&dir);
    if active.is_none() {
        active = Some(id.clone());
    }
    
    crate::kubeconfig::save_cluster_configs(&dir, &stored, active.as_deref());
    manager.set_configs(config_entries_from_stored(&stored), active)?;
    
    info!(correlation_id = %correlation_id, config_id = %id, name = %name, "Cluster config added successfully");
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
    manager.set_configs(config_entries_from_stored(&stored), active)?;
    manager.list_configs()
}

/// Removes a cluster config and returns the config list.
#[tauri::command]
pub fn remove_cluster_config(
    app: AppHandle,
    id: String,
    manager: State<'_, ClusterManager>,
) -> Result<Vec<ClusterConfig>, String> {
    let correlation_id = correlation_id();
    info!(correlation_id = %correlation_id, config_id = %id, "Removing cluster config");

    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {e}"))?;
    let mut stored = crate::kubeconfig::load_cluster_configs(&dir);
    
    // Find the config to get its path for cleanup
    let config_to_remove = stored
        .iter()
        .find(|v| v.get("id").and_then(|i| i.as_str()) == Some(id.as_str()))
        .cloned();
    
    // Remove the config from the list
    stored.retain(|v| v.get("id").and_then(|i| i.as_str()) != Some(id.as_str()));
    
    let mut active = crate::kubeconfig::load_active_config_id(&dir);
    if active.as_deref() == Some(id.as_str()) {
        active = None;
    }
    
    crate::kubeconfig::save_cluster_configs(&dir, &stored, active.as_deref());
    manager.set_configs(config_entries_from_stored(&stored), active)?;
    
    // If we found the config, remove the managed kubeconfig file
    if let Some(config) = config_to_remove {
        if let Some(path) = config.get("path").and_then(|p| p.as_str()) {
            let file_path = PathBuf::from(path);
            if file_path.exists() {
                let _ = fs::remove_file(&file_path);
                info!(correlation_id = %correlation_id, "Removed managed kubeconfig file: {}", file_path.display());
            }
        }
    }
    
    info!(correlation_id = %correlation_id, "Cluster config removed successfully");
    manager.list_configs()
}

/// Sets the active cluster config and returns the config list.
#[tauri::command]
pub fn set_active_cluster_config(
    app: AppHandle,
    id: Option<String>,
    manager: State<'_, ClusterManager>,
) -> Result<Vec<ClusterConfig>, String> {
    let correlation_id = correlation_id();
    info!(correlation_id = %correlation_id, config_id = ?id, "Setting active cluster config");

    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("Failed to resolve config dir: {e}"))?;
    let stored = crate::kubeconfig::load_cluster_configs(&dir);
    crate::kubeconfig::save_cluster_configs(&dir, &stored, id.as_deref());
    manager.set_active_config(id.clone())?;
    info!(correlation_id = %correlation_id, "Active cluster config updated successfully");
    manager.list_configs()
}
