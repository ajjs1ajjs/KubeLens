//! Shared helpers for Kubernetes integration tests that run against the
//! in-process mock API server.

use kube::config::Kubeconfig;

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::mock_api;
use crate::k8s::models::ResourceContext;

pub const CTX: &str = "mock-ctx";

/// Writes a kubeconfig pointing at the mock server and returns a manager
/// pre-loaded with it. Each call uses a unique temp directory so tests can
/// run in parallel without clobbering each other (no `KUBECONFIG` env var
/// involved).
pub async fn manager_with_mock(server: &mock_api::MockApiServer) -> ClusterManager {
    let dir = std::env::temp_dir().join(format!("kubelens-mock-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("config.yaml");
    let content = format!(
        r#"
apiVersion: v1
kind: Config
clusters:
- name: mock-cluster
  cluster:
    server: http://{}:{}
contexts:
- name: {CTX}
  context:
    cluster: mock-cluster
    user: mock-user
users:
- name: mock-user
  user:
    token: test-token
current-context: {CTX}
"#,
        server.addr.ip(),
        server.addr.port()
    );
    std::fs::write(&path, &content).unwrap();
    let kubeconfig: Kubeconfig = serde_yaml::from_str(&content).unwrap();
    ClusterManager::from_kubeconfig(kubeconfig)
}

/// Returns a namespaced Pod resource context for the mock cluster.
pub fn pod_ctx() -> ResourceContext {
    ResourceContext {
        context: CTX.into(),
        config_id: String::new(),
        group: String::new(),
        version: "v1".into(),
        kind: "Pod".into(),
        namespaced: true,
        namespace: "default".into(),
    }
}
