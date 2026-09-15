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
    restrict_dir_perms(&dir);
    Ok(dir)
}

/// Managed kubeconfigs hold bearer tokens: the directory must not be
/// listable by other local users. On Windows the app-config dir already
/// inherits user-profile ACLs; on Unix we enforce 0700 explicitly.
fn restrict_dir_perms(_dir: &std::path::Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(_dir, fs::Permissions::from_mode(0o700));
    }
}

/// Restricts a file to owner-only access (bearer tokens inside).
fn restrict_file_perms(_path: &std::path::Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(_path, fs::Permissions::from_mode(0o600));
    }
}

/// Upper bound for an imported kubeconfig (they are small YAML files;
/// anything bigger is not a kubeconfig).
const MAX_KUBECONFIG_BYTES: u64 = 2 * 1024 * 1024;

/// True when `target` resolves inside `dir`. Both must exist.
fn is_within_dir(dir: &std::path::Path, target: &std::path::Path) -> bool {
    let (Ok(dir_c), Ok(target_c)) = (fs::canonicalize(dir), fs::canonicalize(target)) else {
        return false;
    };
    target_c.starts_with(dir_c)
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
    let managed = managed_kubeconfigs_dir(&app)?;
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
            // Confinement: settings.json is user-writable, so only resolve
            // kubeconfigs inside the managed dir (no read oracle elsewhere).
            let ctxs = if is_within_dir(&managed, &std::path::PathBuf::from(&path)) {
                crate::kubeconfig::load_kubeconfig_from(&std::path::PathBuf::from(&path))
                    .map(|kc| crate::k8s::cluster_manager::contexts_for(&kc))
                    .unwrap_or_default()
            } else {
                Vec::new()
            };
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
    // Log the filename only: full paths disclose fs layout.
    let display_name = PathBuf::from(&path)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("kubeconfig")
        .to_string();
    info!(correlation_id = %correlation_id, "Adding cluster config: {display_name}");

    // Validate the path exists and is a readable file. symlink_metadata
    // (not metadata) so a symlink "kubeconfig" pointing elsewhere is
    // rejected instead of silently copying the target.
    let pb = PathBuf::from(&path);
    let metadata =
        fs::symlink_metadata(&pb).map_err(|e| format!("Failed to access kubeconfig path: {e}"))?;
    if metadata.file_type().is_symlink() {
        return Err("Kubeconfig path must not be a symlink".to_string());
    }
    if !metadata.is_file() {
        return Err(format!(
            "Kubeconfig path is not a regular file: {}",
            pb.display()
        ));
    }
    if metadata.len() > MAX_KUBECONFIG_BYTES {
        return Err("Kubeconfig file exceeds size limit".to_string());
    }

    // Validate that it's a valid kubeconfig by trying to parse it
    let kubeconfig =
        load_kubeconfig_from(&pb).map_err(|e| format!("Invalid kubeconfig file: {e}"))?;

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
    restrict_file_perms(&dest_path);

    info!(correlation_id = %correlation_id, "Copied kubeconfig to managed storage");

    let mut stored = crate::kubeconfig::load_cluster_configs(
        &app.path()
            .app_config_dir()
            .map_err(|e| format!("Failed to resolve config dir: {e}"))?,
    );

    // Avoid duplicates by checking if we already have this exact managed file path
    // (prevents adding the same managed file multiple times)
    if stored.iter().any(|v| {
        v.get("path").and_then(|p| p.as_str()) == Some(dest_path.to_string_lossy().as_ref())
    }) {
        info!(correlation_id = %correlation_id, "Managed kubeconfig already exists, skipping");
        // Clean up the copied file since we're not using it
        let _ = fs::remove_file(&dest_path);
        return manager.list_configs();
    }

    // Derive a display name from the original filename (without extension)
    let name = pb
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("kubeconfig")
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
    let name = name.trim().to_string();
    if name.is_empty() || name.len() > 100 || name.chars().any(char::is_control) {
        return Err("Invalid config name".to_string());
    }
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

    // If we found the config, remove the managed kubeconfig file.
    // Confinement: only delete inside the managed dir, even if settings.json
    // was tampered with to point elsewhere.
    if let Some(config) = config_to_remove
        && let Some(path) = config.get("path").and_then(|p| p.as_str())
    {
        let managed = managed_kubeconfigs_dir(&app)?;
        let file_path = PathBuf::from(path);
        if file_path.exists() {
            if !is_within_dir(&managed, &file_path) {
                info!(correlation_id = %correlation_id, "Refusing to delete outside managed dir: {}", file_path.display());
            } else {
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
    if let Some(ref id) = id
        && !stored
            .iter()
            .any(|v| v.get("id").and_then(|i| i.as_str()) == Some(id.as_str()))
    {
        return Err("Unknown cluster config id".to_string());
    }
    crate::kubeconfig::save_cluster_configs(&dir, &stored, id.as_deref());
    manager.set_active_config(id.clone())?;
    info!(correlation_id = %correlation_id, "Active cluster config updated successfully");
    manager.list_configs()
}
