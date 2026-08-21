//! Long-running Kubernetes watch subscriptions streamed to the frontend.

use std::collections::HashMap;
use std::sync::Mutex;

use futures::StreamExt;
use kube::api::{Api, DynamicObject};
use kube::runtime::reflector;
use kube::runtime::watcher;
use kube::runtime::WatchStreamExt;
use tauri::{AppHandle, Emitter};

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::models::{ResourceContext, WatchEvent};
use crate::k8s::resources;

/// Event name used for all watch traffic between backend and frontend.
pub const WATCH_EVENT: &str = "kubelens://watch";

pub struct WatchManager {
    tasks: Mutex<HashMap<String, tokio::task::AbortHandle>>,
}

impl Default for WatchManager {
    fn default() -> Self {
        Self {
            tasks: Mutex::new(HashMap::new()),
        }
    }
}

impl WatchManager {
    /// Starts a watch subscription for a resource context.
    ///
    /// Returns a subscription id; events are emitted under [`WATCH_EVENT`]
    /// tagged with that id.
    pub async fn start(
        &self,
        manager: &ClusterManager,
        app: AppHandle,
        ctx: ResourceContext,
    ) -> Result<String, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let client = manager.client_ctx(&ctx).await?;
        let api = resources::api(&client, &ctx);

        let emit_app = app.clone();
        let task_id = id.clone();
        let task = tokio::spawn(async move {
            stream_watch(api, ctx, task_id, move |event| {
                let _ = emit_app.emit(WATCH_EVENT, event);
            })
            .await;
        });
        let abort_handle = task.abort_handle();

        self.tasks.lock().unwrap().insert(id.clone(), abort_handle);
        Ok(id)
    }

    /// Stops and cancels a watch subscription.
    pub fn stop(&self, id: &str) {
        if let Some(handle) = self.tasks.lock().unwrap().remove(id) {
            handle.abort();
        }
    }
}

/// Runs a reflector-backed watch and forwards events to `emit`.
///
/// Split from [`WatchManager::start`] so it can be exercised against a mock
/// API server without a running Tauri application.
async fn stream_watch<F>(api: Api<DynamicObject>, ctx: ResourceContext, id: String, emit: F)
where
    F: Fn(WatchEvent) + Send + 'static,
{
    let store = reflector::store::Writer::<DynamicObject>::new(resources::api_resource(&ctx));
    let rf = reflector(
        store,
        watcher(api, watcher::Config::default()).default_backoff(),
    );
    let mut rf = Box::pin(rf);

    while let Some(event) = rf.next().await {
        let payload = match &event {
            Ok(watcher::Event::Apply(obj)) | Ok(watcher::Event::InitApply(obj)) => {
                Some(WatchEvent {
                    id: id.clone(),
                    action: "upsert".into(),
                    object: serde_json::to_value(obj).ok(),
                    error: None,
                })
            }
            Ok(watcher::Event::Delete(obj)) => Some(WatchEvent {
                id: id.clone(),
                action: "delete".into(),
                object: serde_json::to_value(obj).ok(),
                error: None,
            }),
            Ok(watcher::Event::InitDone) => Some(WatchEvent {
                id: id.clone(),
                action: "init-done".into(),
                object: None,
                error: None,
            }),
            Ok(watcher::Event::Init) => None,
            Err(err) => Some(WatchEvent {
                id: id.clone(),
                action: "error".into(),
                object: None,
                error: Some(format!("Watch failed: {err}")),
            }),
        };

        if let Some(payload) = payload {
            emit(payload);
        }
    }

    emit(WatchEvent {
        id,
        action: "error".into(),
        object: None,
        error: Some("Watch stream ended unexpectedly".into()),
    });
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use futures::channel::mpsc;
    use futures::StreamExt;

    use crate::k8s::mock_api;
    use crate::k8s::testsupport::{manager_with_mock, pod_ctx, CTX};

    #[tokio::test]
    async fn lists_resources_from_api() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();

        let objects = crate::k8s::resources::list(&manager, &ctx)
            .await
            .expect("list");
        assert_eq!(objects.len(), 2);
        assert_eq!(
            objects[0]
                .pointer("/metadata/name")
                .and_then(|v| v.as_str()),
            Some("pod-a")
        );
    }

    #[tokio::test]
    async fn deletes_resource() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();

        crate::k8s::resources::delete(&manager, &ctx, "pod-a")
            .await
            .expect("delete");
    }

    #[tokio::test]
    async fn watch_streams_live_events() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let ctx = pod_ctx();
        let client = manager.client_for(None, CTX).await.expect("client");
        let api = crate::k8s::resources::api(&client, &ctx);

        let (tx, mut rx) = mpsc::unbounded::<crate::k8s::models::WatchEvent>();
        let task = tokio::spawn(crate::k8s::watch::stream_watch(
            api,
            ctx,
            "watch-1".into(),
            move |event| {
                let _ = tx.unbounded_send(event);
            },
        ));

        let mut upserts = 0;
        let mut saw_init_done = false;
        let deadline = tokio::time::timeout(Duration::from_secs(10), async {
            while let Some(event) = rx.next().await {
                match event.action.as_str() {
                    "upsert" => upserts += 1,
                    "init-done" => saw_init_done = true,
                    _ => {}
                }
                if upserts >= 3 && saw_init_done {
                    break;
                }
            }
        })
        .await;
        assert!(deadline.is_ok(), "timed out waiting for watch events");

        task.abort();
    }
}
