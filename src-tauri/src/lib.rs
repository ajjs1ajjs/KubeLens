mod commands;
mod k8s;
mod kubeconfig;

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
        .invoke_handler(tauri::generate_handler![
            commands::app::app_info,
            commands::clusters::list_clusters,
            commands::clusters::connect_cluster,
            commands::clusters::reload_kubeconfig,
            commands::clusters::get_kubeconfig_path,
            commands::clusters::set_kubeconfig_path,
            commands::resources::list_resources,
            commands::resources::get_resource,
            commands::resources::delete_resource,
            commands::resources::apply_yaml,
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
            commands::helm::uninstall_helm_release,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
