//! IPC models shared between the Tauri commands and the frontend.

use serde::{Deserialize, Serialize};

/// A kubeconfig context surfaced to the UI.
#[derive(Debug, Clone, Serialize)]
pub struct ClusterSummary {
    /// Kubeconfig context name (used to address this cluster in commands).
    pub name: String,
    /// Cluster API server URL.
    pub server: String,
    /// Namespace configured on the context, if any.
    pub namespace: Option<String>,
    /// Whether this context is the kubeconfig `current-context`.
    pub current: bool,
    /// Whether the cluster has been reached at least once this session.
    pub connected: bool,
    /// Kubernetes server version, filled after a successful connect.
    pub version: Option<String>,
    /// Last connect/list error, if any.
    pub error: Option<String>,
}

/// Identifies a Kubernetes resource (or a set of resources) to query.
#[derive(Debug, Clone, Deserialize)]
pub struct ResourceContext {
    /// Kubeconfig context (cluster) name.
    pub context: String,
    /// API group, empty for core resources.
    pub group: String,
    /// API version, e.g. `v1`.
    pub version: String,
    /// Resource kind, e.g. `Pod`.
    pub kind: String,
    /// Whether the resource is namespace-scoped.
    pub namespaced: bool,
    /// Namespace to scope the query to; empty means all namespaces.
    #[serde(default)]
    pub namespace: String,
}

/// Event emitted by the backend to a watch subscription.
#[derive(Debug, Clone, Serialize)]
pub struct WatchEvent {
    /// Watch subscription id, used by the frontend to filter events.
    pub id: String,
    /// One of `upsert`, `delete`, `init`, `init-done`, `error`.
    pub action: String,
    /// The affected object for `upsert`/`delete`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub object: Option<serde_json::Value>,
    /// Error detail for the `error` action.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Event emitted by the backend to a log follow subscription.
#[derive(Debug, Clone, Serialize)]
pub struct LogEvent {
    /// Log follow subscription id.
    pub id: String,
    /// One of `line`, `done`, `error`.
    pub action: String,
    /// The log line payload for `line`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<String>,
    /// Error detail for the `error` action.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Event emitted by the backend for exec terminal output.
#[derive(Debug, Clone, Serialize)]
pub struct ExecEvent {
    /// Exec session id.
    pub id: String,
    /// One of `output`, `done`, `error`.
    pub action: String,
    /// Raw output chunk (lossy UTF-8) for `output`.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
    /// Error detail for the `error` action.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// A running port-forward tunnel, reported to the UI.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortForwardInfo {
    /// Tunnel id.
    pub id: String,
    /// Kubeconfig context (cluster) name.
    pub context: String,
    /// Pod name.
    pub name: String,
    /// Remote port on the pod.
    pub remote_port: u16,
    /// Local port on 127.0.0.1.
    pub local_port: u16,
}

/// Result of starting a port-forward tunnel.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortForwardStart {
    /// Tunnel id.
    pub id: String,
    /// Local port on 127.0.0.1.
    pub local_port: u16,
}

/// CPU/memory usage for a single container, from the metrics API.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerMetric {
    /// Container name.
    pub name: String,
    /// CPU usage in millicores.
    pub cpu_millicores: f64,
    /// Memory usage in bytes.
    pub memory_bytes: u64,
}

/// CPU/memory usage snapshot for a Pod, from the metrics API.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PodMetric {
    /// Pod namespace.
    pub namespace: String,
    /// Pod name.
    pub name: String,
    /// Total CPU usage across containers, in millicores.
    pub cpu_millicores: f64,
    /// Total memory usage across containers, in bytes.
    pub memory_bytes: u64,
    /// Per-container usage breakdown.
    pub containers: Vec<ContainerMetric>,
}

/// CPU/memory usage snapshot for a Node, from the metrics API.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeMetric {
    /// Node name.
    pub name: String,
    /// CPU usage in millicores.
    pub cpu_millicores: f64,
    /// Memory usage in bytes.
    pub memory_bytes: u64,
}

/// A Helm release as read from the Helm storage backend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelmReleaseSummary {
    /// Release name.
    pub name: String,
    /// Namespace the release was installed into.
    pub namespace: String,
    /// Storage revision number.
    pub version: i32,
    /// Release status (deployed, failed, pending-upgrade, ...).
    pub status: String,
    /// Chart name.
    pub chart: String,
    /// Chart version.
    pub chart_version: String,
    /// Chart app version.
    pub app_version: String,
    /// Release description.
    pub description: String,
    /// When the release was first deployed.
    pub first_deployed: String,
    /// When the release was last modified.
    pub last_deployed: String,
}

/// Full detail of a Helm release.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelmReleaseDetail {
    /// Summary fields (flattened into the same JSON object).
    #[serde(flatten)]
    pub summary: HelmReleaseSummary,
    /// User-supplied values used for this revision.
    pub values: String,
    /// Rendered Kubernetes manifests.
    pub manifest: String,
    /// Release notes.
    pub notes: String,
}

/// One stored revision of a Helm release.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HelmReleaseRevision {
    /// Release name.
    pub name: String,
    /// Storage revision number.
    pub version: i32,
    /// Release status (deployed, failed, pending-upgrade, ...).
    pub status: String,
    /// Chart name.
    pub chart: String,
    /// Chart version.
    pub chart_version: String,
    /// When this revision was deployed.
    pub last_deployed: String,
}
