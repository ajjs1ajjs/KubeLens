//! Typed/dynamic Kubernetes resource access via the kube-rs client.

use kube::api::{
    Api, ApiResource, DeleteParams, DynamicObject, GroupVersionKind, ListParams, Patch, PatchParams,
};
use kube::Client;

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::models::ResourceContext;

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
    let client = manager.client(&ctx.context).await?;
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
    let client = manager.client(&ctx.context).await?;
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
    let client = manager.client(&ctx.context).await?;
    let api = api(&client, ctx);
    let _ = api
        .delete(name, &DeleteParams::default())
        .await
        .map_err(kube_error)?;
    Ok(())
}

/// Parses a YAML document into a JSON value.
pub fn parse_yaml(yaml: &str) -> Result<serde_json::Value, String> {
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
    let name = manifest_name(&value)?;

    // Server-side apply takes the user's document as-is (minus status).
    let mut body = value.clone();
    if let Some(obj) = body.as_object_mut() {
        obj.remove("status");
    }
    let object: DynamicObject = serde_json::from_value(body)
        .map_err(|e| format!("Manifest is not a valid Kubernetes object: {e}"))?;

    let client = manager.client(&ctx.context).await?;
    let api = api(&client, ctx);
    let params = PatchParams::apply("kubelens").force();
    let applied = api
        .patch(&name, &params, &Patch::Apply(&object))
        .await
        .map_err(|err| match &err {
            kube::Error::Api(resp) if resp.code == 404 => format!(
                "Resource {name} does not exist in this context — it may be cluster-scoped or in a different namespace"
            ),
            _ => kube_error(err),
        })?;

    serde_json::to_value(&applied).map_err(|e| format!("Failed to serialize: {e}"))
}

fn kube_error(err: kube::Error) -> String {
    format!("Kubernetes API error: {err}")
}

#[cfg(test)]
mod tests {
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
}
