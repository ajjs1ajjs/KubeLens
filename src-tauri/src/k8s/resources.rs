//! Typed/dynamic Kubernetes resource access via the kube-rs client.

use kube::Client;
use kube::api::{
    Api, ApiResource, DeleteParams, DynamicObject, GroupVersionKind, ListParams, Patch, PatchParams,
};

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::models::ResourceContext;

/// Shape limits for frontend-supplied resource coordinates. The API server
/// is authoritative, but absurd values should not even leave the backend.
const MAX_NAME_LEN: usize = 253;
const MAX_KIND_LEN: usize = 63;
const MAX_REPLICAS: i32 = 10_000;

/// Validates a resource context's shape (lengths, kind charset, namespace).
fn validate_ctx(ctx: &ResourceContext) -> Result<(), String> {
    if ctx.version.is_empty() || ctx.version.len() > MAX_KIND_LEN {
        return Err("Invalid resource version".to_string());
    }
    if ctx.kind.is_empty()
        || ctx.kind.len() > MAX_KIND_LEN
        || !ctx.kind.bytes().all(|b| b.is_ascii_alphabetic())
    {
        return Err("Invalid resource kind".to_string());
    }
    if ctx.namespace.len() > MAX_NAME_LEN {
        return Err("Invalid namespace".to_string());
    }
    if ctx.context.len() > MAX_NAME_LEN || ctx.config_id.len() > MAX_NAME_LEN {
        return Err("Invalid cluster reference".to_string());
    }
    Ok(())
}

/// Validates a resource name (DNS subdomain, the common case for object names).
fn validate_name(name: &str) -> Result<(), String> {
    let ok = !name.is_empty()
        && name.len() <= MAX_NAME_LEN
        && name
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'.')
        && !name.starts_with(['-', '.'])
        && !name.ends_with(['-', '.']);
    if ok {
        Ok(())
    } else {
        Err("Invalid resource name".to_string())
    }
}

/// Builds the `ApiResource` descriptor for a resource context.
pub fn api_resource(ctx: &ResourceContext) -> ApiResource {
    let gvk = GroupVersionKind::gvk(&ctx.group, &ctx.version, &ctx.kind);
    ApiResource::from_gvk(&gvk)
}

/// Builds a dynamic API handle for the resource context.
///
/// Namespaced resources are scoped to `ctx.namespace` when one is set;
/// otherwise (or for cluster-scoped resources) all namespaces are queried.
pub fn api(client: &Client, ctx: &ResourceContext) -> Api<DynamicObject> {
    let ar = api_resource(ctx);
    if ctx.namespaced && !ctx.namespace.is_empty() {
        Api::namespaced_with(client.clone(), &ctx.namespace, &ar)
    } else {
        Api::all_with(client.clone(), &ar)
    }
}

/// Lists resources matching the context, returning full objects.
pub async fn list(
    manager: &ClusterManager,
    ctx: &ResourceContext,
) -> Result<Vec<serde_json::Value>, String> {
    validate_ctx(ctx)?;
    let client = manager.client_ctx(ctx).await?;
    let api = api(&client, ctx);
    let list = api.list(&ListParams::default()).await.map_err(kube_error)?;
    list.items
        .iter()
        .map(|item| serde_json::to_value(item).map_err(|e| format!("Failed to serialize: {e}")))
        .collect()
}

/// Fetches a single resource by name.
pub async fn get(
    manager: &ClusterManager,
    ctx: &ResourceContext,
    name: &str,
) -> Result<serde_json::Value, String> {
    validate_ctx(ctx)?;
    validate_name(name)?;
    let client = manager.client_ctx(ctx).await?;
    let api = api(&client, ctx);
    let object = api.get(name).await.map_err(kube_error)?;
    serde_json::to_value(&object).map_err(|e| format!("Failed to serialize: {e}"))
}

/// Deletes a resource by name.
pub async fn delete(
    manager: &ClusterManager,
    ctx: &ResourceContext,
    name: &str,
) -> Result<(), String> {
    validate_ctx(ctx)?;
    validate_name(name)?;
    let client = manager.client_ctx(ctx).await?;
    let api = api(&client, ctx);
    let _ = api
        .delete(name, &DeleteParams::default())
        .await
        .map_err(kube_error)?;
    Ok(())
}

/// Parses a YAML document into a JSON value.
pub fn parse_yaml(yaml: &str) -> Result<serde_json::Value, String> {
    const MAX_YAML_SIZE: usize = 1024 * 1024; // 1 MB
    if yaml.len() > MAX_YAML_SIZE {
        return Err("YAML document exceeds 1 MB limit".into());
    }
    serde_yaml::from_str::<serde_json::Value>(yaml)
        .map_err(|e| format!("Failed to parse YAML: {e}"))
}

/// Validates that a manifest carries the apiVersion/kind/name Kubernetes
/// resources must have, returning the object name.
fn manifest_name(value: &serde_json::Value) -> Result<String, String> {
    let missing = |field: &str| format!("Manifest is missing {field}");
    value
        .pointer("/apiVersion")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| missing("apiVersion"))?;
    value
        .pointer("/kind")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| missing("kind"))?;
    value
        .pointer("/metadata/name")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .ok_or_else(|| missing("metadata.name"))
}

/// Applies a YAML manifest using server-side apply (`kubectl apply` semantics).
///
/// Creates the resource when it does not exist yet and merges the desired
/// state otherwise. Returns the applied object.
pub async fn apply_yaml(
    manager: &ClusterManager,
    ctx: &ResourceContext,
    yaml: &str,
) -> Result<serde_json::Value, String> {
    let value = parse_yaml(yaml)?;
    if !value.is_object() {
        return Err("Manifest must be a single YAML document object".to_string());
    }
    validate_ctx(ctx)?;
    let name = manifest_name(&value)?;
    validate_name(&name)?;

    // Cross-check the manifest against the context it is applied into: the
    // manifest's own GVK/namespace win for scoping, the caller's `ctx` only
    // decides which cluster client to use. A manifest for another namespace
    // or kind must not silently land in the wrong place.
    let gvk = || {
        let api_version = value
            .pointer("/apiVersion")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let kind = value
            .pointer("/kind")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let mut parts = api_version.splitn(2, '/');
        let (group, version) = match (parts.next(), parts.next()) {
            (Some(g), Some(v)) => (g.to_string(), v.to_string()),
            (Some(v), None) => (String::new(), v.to_string()),
            _ => (String::new(), String::new()),
        };
        (group, version, kind.to_string())
    };
    let (group, version, kind) = gvk();
    if group != ctx.group || version != ctx.version || kind != ctx.kind {
        return Err(
            "Manifest apiVersion/kind does not match the selected resource type".to_string(),
        );
    }
    if let Some(ns) = value
        .pointer("/metadata/namespace")
        .and_then(|v| v.as_str())
        && !ns.is_empty()
        && ns != ctx.namespace
    {
        return Err("Manifest namespace does not match the selected namespace".to_string());
    }

    // Server-side apply takes the user's document as-is (minus status).
    let mut body = value.clone();
    if let Some(obj) = body.as_object_mut() {
        obj.remove("status");
    }
    let object: DynamicObject = serde_json::from_value(body)
        .map_err(|e| format!("Manifest is not a valid Kubernetes object: {e}"))?;

    let client = manager.client_ctx(ctx).await?;
    let api = api(&client, ctx);
    // No `.force()`: stomping other field managers' conflicts silently is
    // wrong — surface 409s so the user can decide.
    let params = PatchParams::apply("kubelens");
    let applied = api
        .patch(&name, &params, &Patch::Apply(&object))
        .await
        .map_err(|err| match &err {
            kube::Error::Api(resp) if resp.code == 404 => {
                "Resource does not exist in this context".to_string()
            }
            kube::Error::Api(resp) if resp.code == 409 => {
                "Apply conflict: another manager owns conflicting fields".to_string()
            }
            _ => kube_error(err),
        })?;

    serde_json::to_value(&applied).map_err(|e| format!("Failed to serialize: {e}"))
}

pub fn kube_error(err: kube::Error) -> String {
    // Generic user-facing message: raw server errors leak topology and
    // internals to the renderer. Detail stays in server-side logs.
    match &err {
        kube::Error::Api(resp) => format!("Kubernetes API error (code {})", resp.code),
        _ => "Kubernetes request failed".to_string(),
    }
}

/// Patches `spec.replicas` on a scalable workload (Deployment, StatefulSet,
/// ReplicaSet) using a strategic merge patch.
pub async fn scale(
    manager: &ClusterManager,
    ctx: &ResourceContext,
    name: &str,
    replicas: i32,
) -> Result<(), String> {
    if !(0..=MAX_REPLICAS).contains(&replicas) {
        return Err(format!("Replicas must be between 0 and {MAX_REPLICAS}"));
    }
    validate_ctx(ctx)?;
    validate_name(name)?;
    let client = manager.client_ctx(ctx).await?;
    let api = api(&client, ctx);
    let body = serde_json::json!({ "spec": { "replicas": replicas } });
    let patch = Patch::Merge(&body);
    let params = PatchParams::default();
    api.patch(name, &params, &patch).await.map_err(kube_error)?;
    Ok(())
}

/// Triggers a rollout restart by patching an annotation on the pod template.
/// For Deployments/StatefulSets/DaemonSets, the controller recreates pods on
/// the next reconciliation when the annotation changes.
pub async fn restart(
    manager: &ClusterManager,
    ctx: &ResourceContext,
    name: &str,
) -> Result<(), String> {
    validate_ctx(ctx)?;
    validate_name(name)?;
    let client = manager.client_ctx(ctx).await?;
    let api = api(&client, ctx);
    let now = chrono_now();
    let body = match ctx.kind.as_str() {
        "Deployment" | "StatefulSet" | "DaemonSet" => serde_json::json!({
            "spec": {
                "template": {
                    "metadata": {
                        "annotations": {
                            "kubectl.kubernetes.io/restartedAt": now
                        }
                    }
                }
            }
        }),
        "CronJob" => serde_json::json!({
            "spec": {
                "jobTemplate": {
                    "spec": {
                        "template": {
                            "metadata": {
                                "annotations": {
                                    "kubectl.kubernetes.io/restartedAt": now
                                }
                            }
                        }
                    }
                }
            }
        }),
        _ => {
            return Err(format!(
                "Restart is not supported for kind {}. Delete and recreate it manually.",
                ctx.kind
            ));
        }
    };
    let patch = Patch::Merge(&body);
    let params = PatchParams::default();
    api.patch(name, &params, &patch).await.map_err(kube_error)?;
    Ok(())
}

fn chrono_now() -> String {
    // RFC3339 like kubectl's restartedAt (epoch seconds break some tooling).
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| {
            // Minimal RFC3339 UTC formatter without pulling chrono.
            let secs = d.as_secs();
            format_rfc3339(secs)
        })
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

/// Days-since-epoch to RFC3339 UTC. Leap seconds ignored (same as kubectl).
fn format_rfc3339(secs: u64) -> String {
    const DAYS: [u8; 12] = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let days = secs / 86400;
    let time = secs % 86400;
    let (mut y, mut d) = (1970u64, days);
    loop {
        let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
        let year_days = if leap { 366 } else { 365 };
        if d < year_days {
            break;
        }
        d -= year_days;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let mut m = 0;
    while m < 12 {
        let dim = DAYS[m as usize] as u64 + if m == 1 && leap { 1 } else { 0 };
        if d < dim {
            break;
        }
        d -= dim;
        m += 1;
    }
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y,
        m + 1,
        d + 1,
        time / 3600,
        (time % 3600) / 60,
        time % 60
    )
}

#[cfg(test)]
mod tests {
    use super::{format_rfc3339, validate_ctx, validate_name};
    use crate::k8s::mock_api;
    use crate::k8s::resources;
    use crate::k8s::testsupport::{manager_with_mock, pod_ctx};

    fn pod_yaml(name: &str, image: &str) -> String {
        format!(
            r#"
apiVersion: v1
kind: Pod
metadata:
  name: {name}
  namespace: default
  labels:
    app: {name}
spec:
  containers:
    - name: app
      image: {image}
"#
        )
    }

    async fn pod_names(server: &mock_api::MockApiServer) -> Vec<String> {
        let state = server.pods.lock().await;
        state
            .iter()
            .map(|p| {
                p.pointer("/metadata/name")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string()
            })
            .collect()
    }

    #[tokio::test]
    async fn applies_new_resource() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();

        resources::apply_yaml(&manager, &ctx, &pod_yaml("pod-c", "nginx:1.25"))
            .await
            .expect("apply new pod");

        assert!(pod_names(&server).await.contains(&"pod-c".to_string()));
    }

    #[tokio::test]
    async fn applies_update_to_existing_resource() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();

        resources::apply_yaml(&manager, &ctx, &pod_yaml("pod-a", "nginx:1.27"))
            .await
            .expect("apply update");

        let state = server.pods.lock().await;
        let pod = state
            .iter()
            .find(|p| p.pointer("/metadata/name").and_then(|v| v.as_str()) == Some("pod-a"))
            .expect("pod-a present");
        assert_eq!(
            pod.pointer("/spec/containers/0/image")
                .and_then(|v| v.as_str()),
            Some("nginx:1.27")
        );
    }

    #[tokio::test]
    async fn rejects_invalid_manifest() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();

        let err = resources::apply_yaml(&manager, &ctx, "this: [is: not")
            .await
            .expect_err("invalid yaml");
        assert!(err.contains("YAML"), "unexpected error: {err}");

        let err = resources::apply_yaml(&manager, &ctx, "spec: {}")
            .await
            .expect_err("missing metadata.name");
        assert!(
            err.contains("Manifest is missing"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn validates_context_and_name_shapes() {
        let mut ctx = crate::k8s::testsupport::pod_ctx();
        assert!(validate_ctx(&ctx).is_ok());
        assert!(validate_name("web-2").is_ok());
        ctx.kind = "P@d".into();
        assert!(validate_ctx(&ctx).is_err());
        ctx.kind = "Pod".into();
        ctx.namespace = "a".repeat(300);
        assert!(validate_ctx(&ctx).is_err());
        for bad in [
            "",
            "UPPER",
            "has space",
            "a/b",
            "-x",
            "x-",
            &"a".repeat(300),
        ] {
            assert!(validate_name(bad).is_err(), "should reject: {bad}");
        }
    }

    #[test]
    fn formats_rfc3339() {
        assert_eq!(format_rfc3339(0), "1970-01-01T00:00:00Z");
        assert_eq!(format_rfc3339(1_700_000_000), "2023-11-14T22:13:20Z");
        assert_eq!(format_rfc3339(951_782_400), "2000-02-29T00:00:00Z");
    }

    #[tokio::test]
    async fn rejects_cross_namespace_apply() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();

        let other_ns =
            pod_yaml("pod-c", "nginx:1.25").replace("namespace: default", "namespace: other");
        let err = resources::apply_yaml(&manager, &ctx, &other_ns)
            .await
            .expect_err("cross-namespace apply");
        assert!(err.contains("namespace"), "unexpected error: {err}");

        let wrong_kind = pod_yaml("pod-c", "nginx:1.25").replace("kind: Pod", "kind: Deployment");
        let err = resources::apply_yaml(&manager, &ctx, &wrong_kind)
            .await
            .expect_err("cross-kind apply");
        assert!(err.contains("kind"), "unexpected error: {err}");
    }

    #[tokio::test]
    async fn rejects_bad_replica_count() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();

        let err = resources::scale(&manager, &ctx, "pod-a", -1)
            .await
            .expect_err("negative replicas");
        assert!(err.contains("between 0"), "unexpected error: {err}");

        let err = resources::scale(&manager, &ctx, "pod-a", 10_001)
            .await
            .expect_err("absurd replicas");
        assert!(err.contains("between 0"), "unexpected error: {err}");
    }
}
