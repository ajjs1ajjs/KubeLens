//! Tracks kubeconfig state and caches kube clients per context.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use kube::config::{Config, KubeConfigOptions, Kubeconfig};
use kube::Client;

use crate::k8s::models::{ClusterConfig, ClusterSummary};

/// Tracks kubeconfig state and caches kube clients per context. Cheap to
/// clone; long-lived tasks (log/exec/port-forward) hold their own handle.
#[derive(Clone)]
pub struct ClusterManager {
    /// User-managed cluster configs (each = one kubeconfig file).
    configs: Arc<Mutex<Vec<StoredConfig>>>,
    /// Id of the active config, if any.
    active_config: Arc<Mutex<Option<String>>>,
    clients: Arc<Mutex<HashMap<String, Client>>>,
    /// Preloaded kubeconfig used by tests (fallback when no active config).
    preloaded: Arc<Mutex<Option<Kubeconfig>>>,
}

/// Internal storage entry for a cluster config.
#[derive(Debug, Clone)]
struct StoredConfig {
    id: String,
    name: String,
    path: PathBuf,
}

impl Default for ClusterManager {
    fn default() -> Self {
        Self {
            configs: Arc::new(Mutex::new(Vec::new())),
            active_config: Arc::new(Mutex::new(None)),
            clients: Arc::new(Mutex::new(HashMap::new())),
            preloaded: Arc::new(Mutex::new(None)),
        }
    }
}

impl ClusterManager {
    /// Builds a manager pre-loaded with a single kubeconfig (used by tests to
    /// avoid depending on the `KUBECONFIG` environment variable).
    #[cfg(test)]
    pub fn from_kubeconfig(config: Kubeconfig) -> Self {
        Self {
            configs: Arc::new(Mutex::new(Vec::new())),
            active_config: Arc::new(Mutex::new(None)),
            clients: Arc::new(Mutex::new(HashMap::new())),
            preloaded: Arc::new(Mutex::new(Some(config))),
        }
    }

    /// Returns the active config's path, or None when no custom config is set.
    fn active_path(&self) -> Option<PathBuf> {
        let active_id = self.active_config.lock().unwrap().clone();
        let configs = self.configs.lock().unwrap();
        configs
            .iter()
            .find(|c| Some(c.id.as_str()) == active_id.as_deref())
            .map(|c| c.path.clone())
    }

    /// Loads the merged kubeconfig for the active config (or the environment
    /// default when no custom config is active).
    pub fn config(&self) -> Result<Kubeconfig, String> {
        match self.active_path() {
            Some(path) => crate::kubeconfig::load_kubeconfig_from(&path),
            None => {
                if let Some(c) = &*self.preloaded.lock().unwrap() {
                    return Ok(c.clone());
                }
                crate::kubeconfig::load_kubeconfig()
            }
        }
    }

    /// Re-reads the active kubeconfig from disk and clears cached clients.
    pub fn reload(&self) -> Result<Kubeconfig, String> {
        let config = self.config()?;
        self.clients.lock().unwrap().clear();
        Ok(config)
    }

    /// Sets the full list of managed cluster configs and reloads state.
    pub fn set_configs(
        &self,
        configs: Vec<ClusterConfigEntry>,
        active_id: Option<String>,
    ) -> Result<(), String> {
        *self.configs.lock().unwrap() = configs
            .into_iter()
            .map(|c| StoredConfig {
                id: c.id,
                name: c.name,
                path: PathBuf::from(c.path),
            })
            .collect();
        *self.active_config.lock().unwrap() = active_id;
        *self.preloaded.lock().unwrap() = None;
        self.clients.lock().unwrap().clear();
        Ok(())
    }

    /// Sets which config is active (by id) and reloads.
    pub fn set_active_config(&self, id: Option<String>) -> Result<(), String> {
        *self.active_config.lock().unwrap() = id;
        self.clients.lock().unwrap().clear();
        Ok(())
    }

    /// Lists all managed configs with their contexts, without connecting.
    pub fn list_configs(&self) -> Result<Vec<ClusterConfig>, String> {
        let active_id = self.active_config.lock().unwrap().clone();
        let configs = self.configs.lock().unwrap();
        let mut out = Vec::new();
        for stored in configs.iter() {
            let kubeconfig = match crate::kubeconfig::load_kubeconfig_from(&stored.path) {
                Ok(c) => c,
                Err(_e) => {
                    out.push(ClusterConfig {
                        id: stored.id.clone(),
                        name: stored.name.clone(),
                        path: stored.path.display().to_string(),
                        active: Some(stored.id.as_str()) == active_id.as_deref(),
                        contexts: vec![],
                    });
                    continue;
                }
            };
            out.push(ClusterConfig {
                id: stored.id.clone(),
                name: stored.name.clone(),
                path: stored.path.display().to_string(),
                active: Some(stored.id.as_str()) == active_id.as_deref(),
                contexts: contexts_for(&kubeconfig),
            });
        }
        Ok(out)
    }

    /// Lists all contexts from the active config without connecting.
    pub fn list_clusters(&self) -> Result<Vec<ClusterSummary>, String> {
        let config = self.config()?;
        Ok(contexts_for(&config))
    }

    /// Connects to a context in a specific config (or the active one when
    /// `config_id` is `None`), verifying the API server is reachable.
    pub async fn connect_for(
        &self,
        config_id: Option<&str>,
        context: &str,
    ) -> Result<ClusterSummary, String> {
        let client = self.client_for(config_id, context).await?;
        let version = client
            .apiserver_version()
            .await
            .map(|v| v.git_version)
            .map_err(|e| format!("Connectivity check to '{context}' failed: {e}"))?;

        Ok(ClusterSummary {
            name: context.to_string(),
            server: String::new(),
            namespace: Some(client.default_namespace().to_string()),
            current: false,
            connected: true,
            version: Some(version),
            error: None,
        })
    }

    /// Returns a client for the context described by a `ResourceContext`,
    /// resolving the owning config when `config_id` is set.
    pub async fn client_ctx(
        &self,
        ctx: &crate::k8s::models::ResourceContext,
    ) -> Result<Client, String> {
        let config_id = (!ctx.config_id.is_empty()).then_some(ctx.config_id.as_str());
        self.client_for(config_id, &ctx.context).await
    }

    /// Returns a cached `kube::Client` for a context in a specific config
    /// (or the active config when `config_id` is `None`), building on demand.
    pub async fn client_for(
        &self,
        config_id: Option<&str>,
        context: &str,
    ) -> Result<Client, String> {
        let key = match config_id {
            Some(id) => format!("{id}::{context}"),
            None => context.to_string(),
        };
        if let Some(c) = self.clients.lock().unwrap().get(&key) {
            return Ok(c.clone());
        }

        let config = match config_id {
            Some(id) => self.config_by_id(id)?,
            None => self.config()?,
        };
        let options = KubeConfigOptions {
            context: Some(context.to_string()),
            ..Default::default()
        };
        let kube_config = Config::from_custom_kubeconfig(config, &options)
            .await
            .map_err(|e| format!("Failed to load kubeconfig for context '{context}': {e}"))?;
        let client = Client::try_from(kube_config)
            .map_err(|e| format!("Failed to build client for context '{context}': {e}"))?;

        self.clients.lock().unwrap().insert(key, client.clone());
        Ok(client)
    }

    /// Loads the kubeconfig for a specific managed config by id.
    fn config_by_id(&self, config_id: &str) -> Result<Kubeconfig, String> {
        let configs = self.configs.lock().unwrap();
        let path = configs
            .iter()
            .find(|c| c.id == config_id)
            .map(|c| c.path.clone())
            .ok_or_else(|| format!("Cluster config not found: {config_id}"))?;
        crate::kubeconfig::load_kubeconfig_from(&path)
    }

    /// Drops the cached client for a context (in a specific config, or the
    /// active one when `config_id` is `None`).
    pub fn disconnect(&self, config_id: Option<&str>, context: &str) {
        let key = match config_id {
            Some(id) => format!("{id}::{context}"),
            None => context.to_string(),
        };
        self.clients.lock().unwrap().remove(&key);
    }
}

/// Extracts context summaries from a kubeconfig without connecting.
pub fn contexts_for(config: &Kubeconfig) -> Vec<ClusterSummary> {
    let current = config.current_context.clone().unwrap_or_default();
    config
        .contexts
        .iter()
        .map(|nc| {
            let ctx = nc.context.as_ref();
            let server = config
                .clusters
                .iter()
                .find(|c| ctx.is_some_and(|cx| cx.cluster == c.name))
                .and_then(|c| c.cluster.as_ref())
                .and_then(|c| c.server.clone())
                .unwrap_or_default();
            ClusterSummary {
                name: nc.name.clone(),
                server,
                namespace: ctx.and_then(|cx| cx.namespace.clone()),
                current: nc.name == current,
                connected: false,
                version: None,
                error: None,
            }
        })
        .collect()
}

/// A config entry used to build the managed config list (id/name/path).
pub struct ClusterConfigEntry {
    pub id: String,
    pub name: String,
    pub path: String,
}

/// Converts persisted `[{id,name,path}]` JSON entries into config entries.
pub fn config_entries_from_stored(stored: &[serde_json::Value]) -> Vec<ClusterConfigEntry> {
    stored
        .iter()
        .filter_map(|v| {
            Some(ClusterConfigEntry {
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

/// Derives a display name from a kubeconfig file path (its file stem).
pub fn default_config_name(path: &str) -> String {
    std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "kubeconfig".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn list_clusters_maps_contexts_and_server() {
        let dir = std::env::temp_dir().join(format!("kubelens-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.yaml");
        std::fs::write(
            &path,
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
    namespace: team-x
users:
- name: user-a
  user:
    token: token-a
current-context: ctx-a
"#,
        )
        .unwrap();

        std::env::set_var("KUBECONFIG", path.to_str().unwrap());
        let manager = ClusterManager::default();
        let clusters = manager.list_clusters().unwrap();

        assert_eq!(clusters.len(), 1);
        assert_eq!(clusters[0].name, "ctx-a");
        assert_eq!(clusters[0].server, "https://a.example.com");
        assert_eq!(clusters[0].namespace.as_deref(), Some("team-x"));
        assert!(clusters[0].current);
        assert!(!clusters[0].connected);
        std::env::remove_var("KUBECONFIG");
        let _ = std::fs::remove_dir_all(&dir);
    }

    fn write_config(dir: &std::path::Path, name: &str, server: &str) -> std::path::PathBuf {
        let path = dir.join(name);
        std::fs::write(
            &path,
            format!(
                r#"
apiVersion: v1
kind: Config
clusters:
- name: {server}-cluster
  cluster:
    server: https://{server}.example.com
contexts:
- name: {server}-ctx
  context:
    cluster: {server}-cluster
    user: {server}-user
users:
- name: {server}-user
  user:
    token: {server}-token
current-context: {server}-ctx
"#
            ),
        )
        .unwrap();
        path
    }

    #[test]
    fn lists_multiple_configs_with_contexts() {
        let dir = std::env::temp_dir().join(format!("kubelens-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let a = write_config(&dir, "a.yaml", "alpha");
        let b = write_config(&dir, "b.yaml", "beta");

        let manager = ClusterManager::default();
        manager
            .set_configs(
                vec![
                    ClusterConfigEntry {
                        id: "cfg-a".into(),
                        name: "Alpha".into(),
                        path: a.display().to_string(),
                    },
                    ClusterConfigEntry {
                        id: "cfg-b".into(),
                        name: "Beta".into(),
                        path: b.display().to_string(),
                    },
                ],
                Some("cfg-b".into()),
            )
            .unwrap();

        let configs = manager.list_configs().unwrap();
        assert_eq!(configs.len(), 2);
        let beta = configs.iter().find(|c| c.id == "cfg-b").unwrap();
        assert!(beta.active);
        assert_eq!(beta.contexts.len(), 1);
        assert_eq!(beta.contexts[0].name, "beta-ctx");
        let alpha = configs.iter().find(|c| c.id == "cfg-a").unwrap();
        assert!(!alpha.active);

        // Active config drives list_clusters.
        let clusters = manager.list_clusters().unwrap();
        assert_eq!(clusters.len(), 1);
        assert_eq!(clusters[0].name, "beta-ctx");

        // Switching active config updates list_clusters.
        manager.set_active_config(Some("cfg-a".into())).unwrap();
        let clusters = manager.list_clusters().unwrap();
        assert_eq!(clusters[0].name, "alpha-ctx");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
