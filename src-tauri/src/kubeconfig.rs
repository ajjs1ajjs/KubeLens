//! Locating and loading kubeconfig files.

use std::path::{Path, PathBuf};

use kube::config::Kubeconfig;

/// Path separator used in the `KUBECONFIG` environment variable.
pub fn path_separator() -> char {
    #[cfg(windows)]
    {
        ';'
    }
    #[cfg(not(windows))]
    {
        ':'
    }
}

/// Returns the kubeconfig files that should be loaded.
///
/// Honors the `KUBECONFIG` environment variable (a path-separated list of
/// files) and falls back to `~/.kube/config`.
pub fn kubeconfig_paths(env: Option<&str>, home: Option<&Path>) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = Vec::new();

    if let Some(raw) = env {
        for part in raw.split(path_separator()) {
            if !part.is_empty() {
                paths.push(PathBuf::from(part));
            }
        }
    }

    if paths.is_empty() {
        if let Some(home) = home {
            paths.push(home.join(".kube").join("config"));
        }
    }

    paths
}

fn user_home() -> Option<PathBuf> {
    #[cfg(windows)]
    let var = "USERPROFILE";
    #[cfg(not(windows))]
    let var = "HOME";
    std::env::var(var).ok().map(PathBuf::from)
}

/// Loads and merges all kubeconfig files for the current user.
pub fn load_kubeconfig() -> Result<Kubeconfig, String> {
    load_kubeconfig_with(
        std::env::var("KUBECONFIG").ok().as_deref(),
        user_home().as_deref(),
    )
}

/// Loads a single explicit kubeconfig file (used for a user-chosen path).
pub fn load_kubeconfig_from(path: &Path) -> Result<Kubeconfig, String> {
    if !path.exists() {
        return Err(format!(
            "Kubeconfig file does not exist: {}",
            path.display()
        ));
    }
    Kubeconfig::read_from(path).map_err(|e| format!("Failed to parse {}: {e}", path.display()))
}

/// Filename used to persist the user-chosen kubeconfig path.
const SETTINGS_FILE: &str = "settings.json";

/// Reads the persisted custom kubeconfig path, if any.
pub fn load_custom_kubeconfig_path(config_dir: &Path) -> Option<String> {
    let path = config_dir.join(SETTINGS_FILE);
    if !path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&path).ok()?;
    let value: serde_json::Value = serde_json::from_str(&content).ok()?;
    value
        .get("kubeconfigPath")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// Persists (or clears, when `path` is `None`) the custom kubeconfig path.
pub fn save_custom_kubeconfig_path(config_dir: &Path, path: Option<&str>) {
    let path_buf = config_dir.join(SETTINGS_FILE);
    let _ = std::fs::create_dir_all(config_dir);
    let mut settings = if path_buf.exists() {
        std::fs::read_to_string(&path_buf)
            .ok()
            .and_then(|c| serde_json::from_str::<serde_json::Value>(&c).ok())
            .unwrap_or_else(|| serde_json::json!({}))
    } else {
        serde_json::json!({})
    };
    match path {
        Some(p) if !p.is_empty() => {
            settings["kubeconfigPath"] = serde_json::Value::String(p.to_string());
        }
        _ => {
            settings.as_object_mut().map(|o| o.remove("kubeconfigPath"));
        }
    }
    if let Ok(content) = serde_json::to_string_pretty(&settings) {
        let _ = std::fs::write(&path_buf, content);
    }
}

/// Loads and merges the kubeconfig files described by `env`/`home`.
///
/// Split out for testability; `load_kubeconfig` reads the real environment.
pub fn load_kubeconfig_with(env: Option<&str>, home: Option<&Path>) -> Result<Kubeconfig, String> {
    let paths = kubeconfig_paths(env, home);

    if paths.is_empty() {
        return Err("No kubeconfig found. Set KUBECONFIG or create ~/.kube/config.".into());
    }

    let mut configs = Vec::new();
    for path in &paths {
        if path.exists() {
            let config = Kubeconfig::read_from(path)
                .map_err(|e| format!("Failed to parse {}: {e}", path.display()))?;
            configs.push(config);
        }
    }

    if configs.is_empty() {
        let joined = paths
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ");
        return Err(format!("No kubeconfig file exists at: {joined}"));
    }

    Ok(merge_kubeconfigs(configs))
}

/// Merges kubeconfig files into a single config.
///
/// Follows client-go semantics: first file wins for entries with duplicate
/// names; the current-context from the first file that sets it is kept.
pub fn merge_kubeconfigs(configs: Vec<Kubeconfig>) -> Kubeconfig {
    let mut iter = configs.into_iter();
    let mut out = iter.next().unwrap_or_default();

    for config in iter {
        for cluster in config.clusters {
            if !out.clusters.iter().any(|c| c.name == cluster.name) {
                out.clusters.push(cluster);
            }
        }
        for ctx in config.contexts {
            if !out.contexts.iter().any(|c| c.name == ctx.name) {
                out.contexts.push(ctx);
            }
        }
        for user in config.auth_infos {
            if !out.auth_infos.iter().any(|u| u.name == user.name) {
                out.auth_infos.push(user);
            }
        }
        if out.current_context.is_none() {
            out.current_context = config.current_context;
        }
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_config(dir: &Path, name: &str, content: &str) -> PathBuf {
        let path = dir.join(name);
        std::fs::write(&path, content).unwrap();
        path
    }

    fn temp_dir() -> PathBuf {
        let dir = std::env::temp_dir().join(format!("kubelens-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn falls_back_to_default_path_when_env_is_missing() {
        let home = Path::new("/home/test");
        let paths = kubeconfig_paths(None, Some(home));
        assert_eq!(paths, vec![home.join(".kube").join("config")]);
    }

    #[test]
    fn honors_kubeconfig_env() {
        let sep = path_separator();
        let raw = format!("/a/config{sep}/b/config");
        let paths = kubeconfig_paths(Some(&raw), None);
        assert_eq!(
            paths,
            vec![PathBuf::from("/a/config"), PathBuf::from("/b/config")]
        );
    }

    #[test]
    fn ignores_empty_entries_in_env() {
        let sep = path_separator();
        let raw = format!("/a/config{sep}{sep}/b/config");
        let paths = kubeconfig_paths(Some(&raw), None);
        assert_eq!(
            paths,
            vec![PathBuf::from("/a/config"), PathBuf::from("/b/config")]
        );
    }

    #[test]
    fn empty_env_falls_back_to_default() {
        let home = Path::new("/home/test");
        let paths = kubeconfig_paths(Some(""), Some(home));
        assert_eq!(paths, vec![home.join(".kube").join("config")]);
    }

    #[test]
    fn merges_multiple_kubeconfig_files() {
        let dir = temp_dir();
        let a = write_config(
            &dir,
            "a.yaml",
            r#"
apiVersion: v1
kind: Config
clusters:
- name: cluster-a
  cluster:
    server: https://a.example.com
contexts:
- name: ctx-a
  context:
    cluster: cluster-a
    user: user-a
    namespace: ns-a
users:
- name: user-a
  user:
    token: token-a
current-context: ctx-a
"#,
        );
        let b = write_config(
            &dir,
            "b.yaml",
            r#"
apiVersion: v1
kind: Config
clusters:
- name: cluster-b
  cluster:
    server: https://b.example.com
contexts:
- name: ctx-b
  context:
    cluster: cluster-b
    user: user-b
users:
- name: user-b
  user:
    token: token-b
"#,
        );

        let ca = Kubeconfig::read_from(&a).unwrap();
        let cb = Kubeconfig::read_from(&b).unwrap();
        let merged = merge_kubeconfigs(vec![ca, cb]);

        assert_eq!(merged.contexts.len(), 2);
        assert_eq!(merged.clusters.len(), 2);
        assert_eq!(merged.auth_infos.len(), 2);
        assert_eq!(merged.current_context.as_deref(), Some("ctx-a"));
        assert_eq!(
            merged.contexts[0]
                .context
                .as_ref()
                .and_then(|c| c.namespace.as_deref()),
            Some("ns-a")
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn first_file_wins_for_duplicate_names() {
        let dir = temp_dir();
        let a = write_config(
            &dir,
            "a.yaml",
            r#"
apiVersion: v1
kind: Config
clusters:
- name: cluster-a
  cluster:
    server: https://first.example.com
contexts:
- name: ctx-a
  context:
    cluster: cluster-a
    user: user-a
users:
- name: user-a
  user:
    token: first
"#,
        );
        let b = write_config(
            &dir,
            "b.yaml",
            r#"
apiVersion: v1
kind: Config
clusters:
- name: cluster-a
  cluster:
    server: https://second.example.com
contexts:
- name: ctx-a
  context:
    cluster: cluster-a
    user: user-a
users:
- name: user-a
  user:
    token: second
"#,
        );

        let ca = Kubeconfig::read_from(&a).unwrap();
        let cb = Kubeconfig::read_from(&b).unwrap();
        let merged = merge_kubeconfigs(vec![ca, cb]);

        assert_eq!(merged.contexts.len(), 1);
        assert_eq!(merged.clusters.len(), 1);
        assert_eq!(merged.auth_infos.len(), 1);
        assert_eq!(
            merged.clusters[0]
                .cluster
                .as_ref()
                .and_then(|c| c.server.as_ref())
                .map(|s| s.as_str()),
            Some("https://first.example.com")
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_kubeconfig_errors_when_no_files_exist() {
        let home = Path::new("C:/nonexistent-kubelens-home");
        let result = load_kubeconfig_with(Some("C:/nope-1.yaml"), Some(home));
        assert!(result.is_err());
    }

    #[test]
    fn load_kubeconfig_parses_existing_files() {
        let dir = temp_dir();
        let a = write_config(
            &dir,
            "config.yaml",
            r#"
apiVersion: v1
kind: Config
clusters:
- name: cluster-a
  cluster:
    server: https://a.example.com
contexts:
- name: ctx-a
  context:
    cluster: cluster-a
    user: user-a
users:
- name: user-a
  user:
    token: token-a
current-context: ctx-a
"#,
        );

        let config = load_kubeconfig_with(Some(a.to_str().unwrap()), None).unwrap();
        assert_eq!(config.contexts.len(), 1);
        assert_eq!(config.current_context.as_deref(), Some("ctx-a"));

        let _ = std::fs::remove_dir_all(&dir);
    }
}
