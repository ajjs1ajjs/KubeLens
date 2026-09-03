mod commands;
mod k8s;
mod kubeconfig;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(k8s::cluster_manager::ClusterManager::default())
        .manage(k8s::watch::WatchManager::default())
        .manage(k8s::interactive::LogManager::default())
        .manage(k8s::interactive::TerminalManager::default())
        .manage(k8s::interactive::PortForwardManager::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // Seed the cluster manager from persisted settings.
            let manager = app.state::<k8s::cluster_manager::ClusterManager>();
            let dir = app
                .path()
                .app_config_dir()
                .map_err(|e| format!("Failed to resolve config dir: {e}"))?;
            let stored = kubeconfig::load_cluster_configs(&dir);
            let active = kubeconfig::load_active_config_id(&dir);
            let entries = k8s::cluster_manager::config_entries_from_stored(&stored);
            // Fall back to the first config when no (or an invalid) active
            // config id is persisted, so clusters are always visible.
            let effective_active = match &active {
                Some(id) if entries.iter().any(|e| &e.id == id) => active.clone(),
                _ => entries.first().map(|e| e.id.clone()),
            };
            let _ = manager.set_configs(entries, effective_active);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::clusters::list_clusters,
            commands::clusters::list_cluster_configs,
            commands::clusters::get_cluster_configs,
            commands::clusters::add_cluster_config,
            commands::clusters::rename_cluster_config,
            commands::clusters::remove_cluster_config,
            commands::clusters::set_active_cluster_config,
            commands::clusters::connect_cluster,
            commands::clusters::disconnect_cluster,
            commands::clusters::reload_kubeconfig,
            commands::resources::list_resources,
            commands::resources::get_resource,
            commands::resources::delete_resource,
            commands::resources::apply_yaml,
            commands::resources::scale_resource,
            commands::resources::restart_resource,
            commands::resources::start_watch,
            commands::resources::stop_watch,
            commands::resources::list_namespaces,
            commands::interactive::get_logs,
            commands::interactive::follow_logs,
            commands::interactive::stop_follow_logs,
            commands::interactive::exec_shell,
            commands::interactive::exec_input,
            commands::interactive::stop_exec,
            commands::interactive::start_port_forward,
            commands::interactive::list_port_forwards,
            commands::interactive::stop_port_forward,
            commands::metrics::get_pod_metrics,
            commands::metrics::get_node_metrics,
            commands::helm::list_helm_releases,
            commands::helm::get_helm_release,
            commands::helm::get_helm_release_revision,
            commands::helm::list_helm_revisions,
            commands::helm::uninstall_helm_release,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
