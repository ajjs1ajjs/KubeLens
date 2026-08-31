use serde::Serialize;

use crate::kubeconfig;

#[derive(Serialize)]
pub struct AppInfo {
    pub name: &'static str,
    pub version: &'static str,
    pub platform: &'static str,
    pub default_kubeconfig: Option<String>,
}

#[tauri::command]
pub fn app_info() -> AppInfo {
    let home = std::env::var_os("USERPROFILE")
        .map(std::path::PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(std::path::PathBuf::from));

    let paths =
        kubeconfig::kubeconfig_paths(std::env::var("KUBECONFIG").ok().as_deref(), home.as_deref());

    let platform = std::env::consts::OS;
    let platform_windows = platform == "windows";

    AppInfo {
        name: env!("CARGO_PKG_NAME"),
        version: env!("CARGO_PKG_VERSION"),
        platform: if platform_windows { "windows" } else { "unsupported" },
        default_kubeconfig: paths.first().map(|p| p.to_string_lossy().into_owned()),
    }
}
