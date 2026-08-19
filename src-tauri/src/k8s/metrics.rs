//! CPU/memory usage metrics from the metrics-server API (`metrics.k8s.io/v1beta1`).

use kube::api::{Api, ApiResource, DynamicObject, GroupVersionKind, ListParams};

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::models::{ContainerMetric, NodeMetric, PodMetric, ResourceContext};

fn metrics_resource(kind: &str, plural: &str) -> ApiResource {
    let gvk = GroupVersionKind::gvk("metrics.k8s.io", "v1beta1", kind);
    ApiResource::from_gvk_with_plural(&gvk, plural)
}

/// Fetches pod CPU/memory usage for a namespace (or all namespaces when the
/// context has no namespace). Returns an empty list if metrics-server is not
/// installed or metrics are not yet available.
pub async fn pod_metrics(
    manager: &ClusterManager,
    ctx: &ResourceContext,
) -> Result<Vec<PodMetric>, String> {
    let client = manager.client_ctx(ctx).await?;
    let resource = metrics_resource("PodMetrics", "pods");
    let api = if ctx.namespace.is_empty() {
        Api::all_with(client.clone(), &resource)
    } else {
        Api::namespaced_with(client.clone(), &ctx.namespace, &resource)
    };
    let list = api
        .list(&ListParams::default())
        .await
        .map_err(|err| metrics_error("pods", err))?;
    Ok(list
        .items
        .into_iter()
        .filter_map(|item| parse_pod_metric(item).ok())
        .collect())
}

/// Fetches node CPU/memory usage.
pub async fn node_metrics(
    manager: &ClusterManager,
    ctx: &ResourceContext,
) -> Result<Vec<NodeMetric>, String> {
    let client = manager.client_ctx(ctx).await?;
    let resource = metrics_resource("NodeMetrics", "nodes");
    let api = Api::all_with(client, &resource);
    let list = api
        .list(&ListParams::default())
        .await
        .map_err(|err| metrics_error("nodes", err))?;
    Ok(list
        .items
        .into_iter()
        .filter_map(|item| parse_node_metric(item).ok())
        .collect())
}

fn parse_pod_metric(item: DynamicObject) -> Result<PodMetric, String> {
    let name = item
        .metadata
        .name
        .clone()
        .ok_or_else(|| "pod metric missing name".to_string())?;
    let namespace = item.metadata.namespace.clone().unwrap_or_default();
    let containers_value = item
        .data
        .get("containers")
        .ok_or_else(|| format!("pod {name} metric missing containers"))?;
    let containers: Vec<serde_json::Value> = serde_json::from_value(containers_value.clone())
        .map_err(|e| format!("invalid containers for {name}: {e}"))?;

    let mut parsed = Vec::new();
    for container in containers {
        let cname = container
            .pointer("/name")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let usage = container.get("usage").cloned().unwrap_or_default();
        parsed.push(ContainerMetric {
            name: cname,
            cpu_millicores: usage_cpu_millicores(&usage),
            memory_bytes: usage_memory_bytes(&usage),
        });
    }

    let cpu_millicores = parsed.iter().map(|c| c.cpu_millicores).sum();
    let memory_bytes = parsed.iter().map(|c| c.memory_bytes).sum();
    Ok(PodMetric {
        namespace,
        name,
        cpu_millicores,
        memory_bytes,
        containers: parsed,
    })
}

fn parse_node_metric(item: DynamicObject) -> Result<NodeMetric, String> {
    let name = item
        .metadata
        .name
        .clone()
        .ok_or_else(|| "node metric missing name".to_string())?;
    let usage = item.data.get("usage").cloned().unwrap_or_default();
    Ok(NodeMetric {
        name,
        cpu_millicores: usage_cpu_millicores(&usage),
        memory_bytes: usage_memory_bytes(&usage),
    })
}

/// Reads the `cpu` quantity from a `usage` object and converts to millicores.
fn usage_cpu_millicores(usage: &serde_json::Value) -> f64 {
    usage
        .get("cpu")
        .and_then(|v| v.as_str())
        .and_then(quantity_to_millicores)
        .unwrap_or(0.0)
}

/// Reads the `memory` quantity from a `usage` object and converts to bytes.
fn usage_memory_bytes(usage: &serde_json::Value) -> u64 {
    usage
        .get("memory")
        .and_then(|v| v.as_str())
        .and_then(quantity_to_bytes)
        .unwrap_or(0)
}

/// Parses a Kubernetes CPU quantity ("100m", "1", "0.5", "150000000n") to
/// millicores.
pub fn quantity_to_millicores(raw: &str) -> Option<f64> {
    let (number, suffix) = split_quantity(raw)?;
    let multiplier = match suffix {
        "" => 1000.0, // plain cores: "1" core = 1000m
        "m" => 1.0,   // "100m" is already millicores
        "n" => 0.000001,
        "u" => 0.001,
        _ => return None,
    };
    let value: f64 = number.parse().ok()?;
    Some(value * multiplier)
}

/// Parses a Kubernetes memory quantity ("128Mi", "1Gi", "134217728") to bytes.
pub fn quantity_to_bytes(raw: &str) -> Option<u64> {
    let (number, suffix) = split_quantity(raw)?;
    let multiplier: u64 = match suffix {
        "" => 1,
        "Ki" => 1 << 10,
        "Mi" => 1 << 20,
        "Gi" => 1 << 30,
        "Ti" => 1 << 40,
        "Pi" => 1 << 50,
        "Ei" => 1 << 60,
        "k" => 1_000,
        "M" => 1_000_000,
        "G" => 1_000_000_000,
        "T" => 1_000_000_000_000,
        _ => return None,
    };
    let value: f64 = number.parse().ok()?;
    Some((value * multiplier as f64) as u64)
}

/// Splits a quantity string into its numeric part and its (binary/decimal)
/// suffix, lower-cased for comparison.
fn split_quantity(raw: &str) -> Option<(&str, &str)> {
    let raw = raw.trim();
    let split = raw
        .find(|c: char| c.is_ascii_alphabetic())
        .unwrap_or(raw.len());
    let (number, suffix) = raw.split_at(split);
    if number.is_empty() {
        return None;
    }
    Some((number, suffix))
}

fn metrics_error(what: &str, err: kube::Error) -> String {
    format!("Failed to fetch {what} metrics: {err}")
}

#[cfg(test)]
mod tests {
    use super::{quantity_to_bytes, quantity_to_millicores};

    #[test]
    fn parses_cpu_quantities() {
        assert_eq!(quantity_to_millicores("100m"), Some(100.0));
        assert_eq!(quantity_to_millicores("1"), Some(1000.0));
        assert_eq!(quantity_to_millicores("0.5"), Some(500.0));
        assert_eq!(quantity_to_millicores("150000000n"), Some(150.0));
        assert_eq!(quantity_to_millicores("2000m"), Some(2000.0));
        assert_eq!(quantity_to_millicores("garbage"), None);
    }

    #[test]
    fn parses_memory_quantities() {
        assert_eq!(quantity_to_bytes("128Mi"), Some(128 << 20));
        assert_eq!(quantity_to_bytes("1Gi"), Some(1 << 30));
        assert_eq!(quantity_to_bytes("512Ki"), Some(512 << 10));
        assert_eq!(quantity_to_bytes("1048576"), Some(1_048_576));
        assert_eq!(
            quantity_to_bytes("1.5Gi"),
            Some((1.5 * (1 << 30) as f64) as u64)
        );
        assert_eq!(quantity_to_bytes("oops"), None);
    }

    use crate::k8s::metrics;
    use crate::k8s::mock_api;
    use crate::k8s::testsupport::{manager_with_mock, pod_ctx};

    #[tokio::test]
    async fn fetches_pod_metrics() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();

        let metrics = metrics::pod_metrics(&manager, &ctx)
            .await
            .expect("pod metrics");
        let pod_a = metrics.iter().find(|m| m.name == "pod-a").expect("pod-a");
        assert_eq!(pod_a.cpu_millicores, 125.0, "100m + 25m sidecar");
        assert_eq!(pod_a.memory_bytes, (64 << 20) + (32 << 20));
        assert_eq!(pod_a.containers.len(), 2);

        let pod_b = metrics.iter().find(|m| m.name == "pod-b").expect("pod-b");
        assert_eq!(pod_b.cpu_millicores, 250.0);
        assert_eq!(pod_b.containers.len(), 1);
    }

    #[tokio::test]
    async fn fetches_node_metrics() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();

        let metrics = metrics::node_metrics(&manager, &ctx)
            .await
            .expect("node metrics");
        let node = metrics.iter().find(|m| m.name == "node-1").expect("node-1");
        assert_eq!(node.cpu_millicores, 1500.0);
        assert_eq!(node.memory_bytes, 4 << 30);
    }
}
