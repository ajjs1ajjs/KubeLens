//! Tracks kubeconfig state and caches kube clients per context.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use kube::config::{Config, KubeConfigOptions, Kubeconfig};
use kube::Client;

use crate::k8s::models::ClusterSummary;

/// Tracks kubeconfig state and caches kube clients per context. Cheap to
/// clone; long-lived tasks (log/exec/port-forward) hold their own handle.
#[derive(Clone)]
pub struct ClusterManager {
    config: Arc<Mutex<Option<Kubeconfig>>>,
    clients: Arc<Mutex<HashMap<String, Client>>>,
    custom_kubeconfig: Arc<Mutex<Option<std::path::PathBuf>>>,
}

impl Default for ClusterManager {
    fn default() -> Self {
        Self {
            config: Arc::new(Mutex::new(None)),
            clients: Arc::new(Mutex::new(HashMap::new())),
            custom_kubeconfig: Arc::new(Mutex::new(None)),
        }
    }
}

impl ClusterManager {
    /// Builds a manager pre-loaded with a kubeconfig (used by tests to avoid
    /// depending on the `KUBECONFIG` environment variable).
    #[cfg(test)]
    pub fn from_kubeconfig(config: Kubeconfig) -> Self {
        Self {
            config: Arc::new(Mutex::new(Some(config))),
            clients: Arc::new(Mutex::new(HashMap::new())),
            custom_kubeconfig: Arc::new(Mutex::new(None)),
        }
    }

    /// Returns the merged kubeconfig, loading it on first use.
    pub fn config(&self) -> Result<Kubeconfig, String> {
        if let Some(c) = &*self.config.lock().unwrap() {
            return Ok(c.clone());
        }
        self.reload()
    }

    /// Re-reads the kubeconfig from disk and clears cached clients.
    pub fn reload(&self) -> Result<Kubeconfig, String> {
        let config = self.load_kubeconfig()?;
        *self.config.lock().unwrap() = Some(config.clone());
        self.clients.lock().unwrap().clear();
        Ok(config)
    }

    /// Sets a custom kubeconfig path (or clears it when `None`) and reloads.
    pub fn set_kubeconfig_path(&self, path: Option<std::path::PathBuf>) -> Result<Kubeconfig, String> {
        *self.custom_kubeconfig.lock().unwrap() = path;
        self.reload()
    }

    /// Returns the active kubeconfig, using the custom path when one is set.
    fn load_kubeconfig(&self) -> Result<Kubeconfig, String> {
        let custom = self.custom_kubeconfig.lock().unwrap().clone();
        match custom {
            Some(path) => crate::kubeconfig::load_kubeconfig_from(&path),
            None => crate::kubeconfig::load_kubeconfig(),
        }
    }

    /// Lists all contexts without connecting to any cluster.
    pub fn list_clusters(&self) -> Result<Vec<ClusterSummary>, String> {
        let config = self.config()?;
        let current = config.current_context.clone().unwrap_or_default();

        Ok(config
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
            .collect())
    }

    /// Connects to a context, verifying the API server is reachable.
    pub async fn connect(&self, context: &str) -> Result<ClusterSummary, String> {
        let client = self.client(context).await?;
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

    /// Returns a cached `kube::Client` for a context, building one on demand.
    pub async fn client(&self, context: &str) -> Result<Client, String> {
        if let Some(c) = self.clients.lock().unwrap().get(context) {
            return Ok(c.clone());
        }

        let config = self.config()?;
        let options = KubeConfigOptions {
            context: Some(context.to_string()),
            ..Default::default()
        };
        let kube_config = Config::from_custom_kubeconfig(config, &options)
            .await
            .map_err(|e| format!("Failed to load kubeconfig for context '{context}': {e}"))?;
        let client = Client::try_from(kube_config)
            .map_err(|e| format!("Failed to build client for context '{context}': {e}"))?;

        self.clients
            .lock()
            .unwrap()
            .insert(context.to_string(), client.clone());
        Ok(client)
    }
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
}
