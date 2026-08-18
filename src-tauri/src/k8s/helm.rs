//! Helm release management via the Helm 3 storage backend.
//!
//! Helm stores each release revision as a Secret labelled `owner=helm` with the
//! payload under `data.release` as base64(gzip(protobuf(Release))). We read
//! those secrets with the standard kube client, so no `helm` binary or cluster
//! Tiller is required.

use k8s_openapi::api::core::v1::Secret;
use kube::api::{Api, DeleteParams, ListParams, ObjectList};
use prost::Message;

use crate::k8s::cluster_manager::ClusterManager;
use crate::k8s::models::{HelmReleaseDetail, HelmReleaseRevision, HelmReleaseSummary};

#[cfg(test)]
use k8s_openapi::apimachinery::pkg::apis::meta::v1::ObjectMeta;

/// Label Helm puts on every release storage secret.
const OWNER_LABEL: &str = "owner=helm";

fn releases_api(client: &kube::Client) -> Api<Secret> {
    Api::all(client.clone())
}

/// Lists every Helm release revision across all namespaces and returns the
/// newest revision per release.
pub async fn list_releases(
    manager: &ClusterManager,
    context: &str,
) -> Result<Vec<HelmReleaseSummary>, String> {
    let client = manager.client(context).await?;
    let api = releases_api(&client);
    let list: ObjectList<Secret> = api
        .list(&ListParams {
            label_selector: Some(OWNER_LABEL.to_string()),
            ..Default::default()
        })
        .await
        .map_err(kube_error)?;

    let mut releases = Vec::new();
    for secret in list.items {
        if secret.type_.as_deref() != Some("helm.sh/release.v1") {
            continue;
        }
        if let Ok(release) = decode_release_secret(&secret) {
            releases.push(release);
        }
    }

    // Keep the highest `version` (revision) per release name.
    releases.sort_by(|a, b| a.name.cmp(&b.name).then(b.version.cmp(&a.version)));
    let mut seen = std::collections::HashSet::new();
    releases.retain(|r| seen.insert(r.name.clone()));
    releases.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(releases)
}

/// Fetches the full detail (values, manifest, notes) for the newest revision
/// of a release.
pub async fn release_detail(
    manager: &ClusterManager,
    context: &str,
    name: &str,
) -> Result<HelmReleaseDetail, String> {
    let client = manager.client(context).await?;
    let secrets = revision_secrets(&client, name).await?;
    let (_, secret) = secrets
        .into_iter()
        .next()
        .ok_or_else(|| format!("Helm release {name} not found"))?;
    let summary = decode_release_secret(&secret)?;
    let payload = decode_payload(&secret)?.ok_or_else(|| "Release payload is empty".to_string())?;

    Ok(HelmReleaseDetail {
        summary,
        values: payload.config,
        manifest: payload.manifest,
        notes: payload.notes,
    })
}

/// Fetches the detail for a specific revision of a release.
pub async fn release_detail_at(
    manager: &ClusterManager,
    context: &str,
    name: &str,
    version: i32,
) -> Result<HelmReleaseDetail, String> {
    let client = manager.client(context).await?;
    let secrets = revision_secrets(&client, name).await?;
    let (_, secret) = secrets
        .into_iter()
        .find(|(v, _)| *v == version)
        .ok_or_else(|| format!("Helm release {name} has no revision {version}"))?;
    let summary = decode_release_secret(&secret)?;
    let payload = decode_payload(&secret)?.ok_or_else(|| "Release payload is empty".to_string())?;

    Ok(HelmReleaseDetail {
        summary,
        values: payload.config,
        manifest: payload.manifest,
        notes: payload.notes,
    })
}

/// Lists every stored revision of a release, newest first.
pub async fn release_revisions(
    manager: &ClusterManager,
    context: &str,
    name: &str,
) -> Result<Vec<HelmReleaseRevision>, String> {
    let client = manager.client(context).await?;
    let secrets = revision_secrets(&client, name).await?;
    let mut revisions = Vec::new();
    for (version, secret) in secrets {
        let summary = decode_release_secret(&secret)?;
        revisions.push(HelmReleaseRevision {
            name: summary.name,
            version,
            status: summary.status,
            chart: summary.chart,
            chart_version: summary.chart_version,
            last_deployed: summary.last_deployed,
        });
    }
    Ok(revisions)
}

/// Lists the release storage secrets for a name, sorted newest revision first.
async fn revision_secrets(client: &kube::Client, name: &str) -> Result<Vec<(i32, Secret)>, String> {
    let api = releases_api(client);
    let list: ObjectList<Secret> = api
        .list(&ListParams {
            label_selector: Some(format!("{OWNER_LABEL},name={name}")),
            ..Default::default()
        })
        .await
        .map_err(kube_error)?;

    let mut versions: Vec<(i32, Secret)> = list
        .items
        .into_iter()
        .filter(|s| s.type_.as_deref() == Some("helm.sh/release.v1"))
        .filter_map(|s| {
            s.metadata
                .labels
                .as_ref()
                .and_then(|l| l.get("version"))
                .and_then(|v| v.parse::<i32>().ok())
                .map(|v| (v, s))
        })
        .collect();
    versions.sort_by_key(|b| std::cmp::Reverse(b.0));
    Ok(versions)
}

/// Deletes every revision of a release from the storage backend.
pub async fn uninstall_release(
    manager: &ClusterManager,
    context: &str,
    name: &str,
) -> Result<(), String> {
    let client = manager.client(context).await?;
    let api = releases_api(&client);
    let list: ObjectList<Secret> = api
        .list(&ListParams {
            label_selector: Some(format!("{OWNER_LABEL},name={name}")),
            ..Default::default()
        })
        .await
        .map_err(kube_error)?;

    let mut deleted = 0usize;
    for secret in list.items {
        let name = secret
            .metadata
            .name
            .clone()
            .ok_or_else(|| "Release secret missing name".to_string())?;
        api.delete(&name, &DeleteParams::default())
            .await
            .map_err(kube_error)?;
        deleted += 1;
    }
    if deleted == 0 {
        return Err(format!("Helm release {name} not found"));
    }
    Ok(())
}

struct DecodedPayload {
    status: String,
    chart_name: String,
    chart_version: String,
    app_version: String,
    first_deployed: String,
    last_deployed: String,
    config: String,
    manifest: String,
    notes: String,
    description: String,
}

/// Decodes `data.release` (base64 → gzip → protobuf) into a summary.
fn decode_release_secret(secret: &Secret) -> Result<HelmReleaseSummary, String> {
    let payload = decode_payload(secret)?.ok_or_else(|| "Release payload is empty".to_string())?;
    let metadata = secret
        .metadata
        .labels
        .as_ref()
        .ok_or_else(|| "Release secret missing labels".to_string())?;

    Ok(HelmReleaseSummary {
        name: metadata.get("name").cloned().unwrap_or_default(),
        namespace: secret.metadata.namespace.clone().unwrap_or_default(),
        version: metadata
            .get("version")
            .and_then(|v| v.parse().ok())
            .unwrap_or(0),
        status: payload.status,
        chart: payload.chart_name,
        chart_version: payload.chart_version,
        app_version: payload.app_version,
        description: payload.description,
        first_deployed: payload.first_deployed,
        last_deployed: payload.last_deployed,
    })
}

/// Decodes and decompresses the release secret payload.
fn decode_payload(secret: &Secret) -> Result<Option<DecodedPayload>, String> {
    let data = secret
        .data
        .as_ref()
        .ok_or_else(|| "Release secret missing data".to_string())?;
    let encoded = data
        .get("release")
        .ok_or_else(|| "Release secret missing data.release".to_string())?;

    use base64::Engine as _;
    let gzipped = base64::engine::general_purpose::STANDARD
        .decode(&encoded.0)
        .map_err(|e| format!("Release payload is not valid base64: {e}"))?;

    let mut decoder = flate2::read::GzDecoder::new(&gzipped[..]);
    let mut raw = Vec::new();
    std::io::Read::read_to_end(&mut decoder, &mut raw)
        .map_err(|e| format!("Release payload is not valid gzip: {e}"))?;

    let release = Release::decode(&raw[..]).map_err(|e| format!("Invalid release payload: {e}"))?;
    Ok(Some(release.into()))
}

/// Minimal `hapi.release.v1.Release` protobuf layout (subset we consume).
#[derive(Clone, PartialEq, ::prost::Message)]
struct Release {
    #[prost(string, tag = "1")]
    name: String,
    #[prost(message, optional, tag = "2")]
    info: Option<Info>,
    #[prost(message, optional, tag = "3")]
    chart: Option<Chart>,
    #[prost(message, optional, tag = "4")]
    config: Option<Config>,
    #[prost(string, tag = "5")]
    manifest: String,
    #[prost(int32, tag = "7")]
    version: i32,
}

#[derive(Clone, PartialEq, ::prost::Message)]
struct Info {
    #[prost(enumeration = "ReleaseStatus", tag = "1")]
    status: i32,
    #[prost(string, tag = "2")]
    first_deployed: String,
    #[prost(string, tag = "3")]
    last_deployed: String,
    #[prost(string, tag = "4")]
    description: String,
    #[prost(string, tag = "6")]
    notes: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, ::prost::Enumeration)]
#[repr(i32)]
pub(crate) enum ReleaseStatus {
    Unknown = 0,
    Deployed = 1,
    Uninstalled = 2,
    Superseded = 3,
    Failed = 4,
    Uninstalling = 5,
    PendingInstall = 6,
    PendingUpgrade = 7,
    PendingRollback = 8,
}

impl ReleaseStatus {
    fn as_str(self) -> &'static str {
        match self {
            ReleaseStatus::Unknown => "unknown",
            ReleaseStatus::Deployed => "deployed",
            ReleaseStatus::Uninstalled => "uninstalled",
            ReleaseStatus::Superseded => "superseded",
            ReleaseStatus::Failed => "failed",
            ReleaseStatus::Uninstalling => "uninstalling",
            ReleaseStatus::PendingInstall => "pending-install",
            ReleaseStatus::PendingUpgrade => "pending-upgrade",
            ReleaseStatus::PendingRollback => "pending-rollback",
        }
    }
}

/// `hapi.chart.Chart`: metadata is a base64-encoded YAML of the chart's
/// `Metadata` struct.
#[derive(Clone, PartialEq, ::prost::Message)]
struct Chart {
    #[prost(string, tag = "1")]
    metadata: String,
}

/// `hapi.chart.Config`: the user-supplied values as raw JSON.
#[derive(Clone, PartialEq, ::prost::Message)]
struct Config {
    #[prost(bytes, tag = "1")]
    values: Vec<u8>,
    #[prost(bytes, tag = "2")]
    raw: Vec<u8>,
}

impl From<Release> for DecodedPayload {
    fn from(release: Release) -> Self {
        let chart_meta = release
            .chart
            .and_then(|c| decode_chart_metadata(&c.metadata).ok())
            .unwrap_or_default();
        let (status, description, notes, first_deployed, last_deployed) = release
            .info
            .map(|i| {
                let status = ReleaseStatus::try_from(i.status)
                    .unwrap_or(ReleaseStatus::Unknown)
                    .as_str()
                    .to_string();
                (
                    status,
                    i.description,
                    i.notes,
                    i.first_deployed,
                    i.last_deployed,
                )
            })
            .unwrap_or_else(|| {
                (
                    "unknown".into(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                )
            });

        let config = release
            .config
            .map(|c| {
                let raw = String::from_utf8_lossy(&c.raw);
                let values = String::from_utf8_lossy(&c.values);
                let chosen = if raw.trim().is_empty() { values } else { raw };
                chosen.into_owned()
            })
            .unwrap_or_default();

        DecodedPayload {
            config,
            manifest: release.manifest,
            notes,
            description,
            status,
            chart_name: chart_meta.name,
            chart_version: chart_meta.version,
            app_version: chart_meta.app_version,
            first_deployed,
            last_deployed,
        }
    }
}

#[derive(Default)]
struct ChartMetadata {
    name: String,
    version: String,
    app_version: String,
}

/// Decodes the base64-encoded chart metadata YAML.
fn decode_chart_metadata(encoded: &str) -> Result<ChartMetadata, String> {
    use base64::Engine as _;
    let yaml = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("Chart metadata is not valid base64: {e}"))?;
    let value: serde_yaml::Value = serde_yaml::from_slice(&yaml)
        .map_err(|e| format!("Chart metadata is not valid YAML: {e}"))?;
    let get = |key: &str| {
        value
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string()
    };
    Ok(ChartMetadata {
        name: get("name"),
        version: get("version"),
        app_version: get("appVersion"),
    })
}

fn kube_error(err: kube::Error) -> String {
    format!("Kubernetes API error: {err}")
}

/// Builds a helm release storage Secret for the mock API server.
#[cfg(test)]
pub(crate) fn mock_release_secret(
    name: &str,
    namespace: &str,
    revision: i32,
    status: ReleaseStatus,
    chart_name: &str,
    chart_version: &str,
) -> Secret {
    use base64::Engine as _;
    let metadata_yaml = serde_yaml::to_string(&serde_json::json!({
        "name": chart_name,
        "version": chart_version,
        "appVersion": "1.2.3",
        "description": "test chart",
    }))
    .unwrap();
    let encoded_meta = base64::engine::general_purpose::STANDARD.encode(metadata_yaml.as_bytes());

    let release = Release {
        name: name.to_string(),
        info: Some(Info {
            status: status as i32,
            first_deployed: "2026-01-01T00:00:00Z".to_string(),
            last_deployed: "2026-01-02T00:00:00Z".to_string(),
            description: "Install complete".to_string(),
            notes: "Release ready.".to_string(),
        }),
        chart: Some(Chart {
            metadata: encoded_meta,
        }),
        config: Some(Config {
            values: br#"{"replicas":2}"#.to_vec(),
            raw: Vec::new(),
        }),
        manifest: "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: cfg\n".to_string(),
        version: revision,
    };

    let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    std::io::Write::write_all(&mut encoder, &release.encode_to_vec()).unwrap();
    let gzipped = encoder.finish().unwrap();
    let encoded = base64::engine::general_purpose::STANDARD.encode(gzipped);

    Secret {
        metadata: ObjectMeta {
            name: Some(format!("sh.helm.release.v1.{name}.v{revision}")),
            namespace: Some(namespace.to_string()),
            labels: Some(
                [
                    ("owner".to_string(), "helm".to_string()),
                    ("name".to_string(), name.to_string()),
                    ("status".to_string(), status.as_str().to_string()),
                    ("version".to_string(), revision.to_string()),
                ]
                .into_iter()
                .collect(),
            ),
            ..Default::default()
        },
        data: Some(
            [(
                "release".to_string(),
                k8s_openapi::ByteString(encoded.into_bytes()),
            )]
            .into_iter()
            .collect(),
        ),
        type_: Some("helm.sh/release.v1".to_string()),
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::k8s::mock_api;
    use crate::k8s::testsupport::{manager_with_mock, CTX};

    #[test]
    fn decodes_release_payload() {
        let secret = mock_release_secret(
            "web",
            "default",
            3,
            ReleaseStatus::Deployed,
            "nginx",
            "4.1.0",
        );
        let payload = decode_payload(&secret).unwrap().unwrap();
        assert_eq!(payload.status, "deployed");
        assert_eq!(payload.description, "Install complete");
        assert_eq!(payload.notes, "Release ready.");
        assert!(payload.manifest.contains("kind: ConfigMap"));
        assert_eq!(payload.config, r#"{"replicas":2}"#);

        let summary = decode_release_secret(&secret).unwrap();
        assert_eq!(summary.name, "web");
        assert_eq!(summary.version, 3);
        assert_eq!(summary.chart, "nginx");
        assert_eq!(summary.chart_version, "4.1.0");
        assert_eq!(summary.app_version, "1.2.3");
    }

    #[tokio::test]
    async fn lists_and_inspects_releases_against_mock() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let releases = super::list_releases(&manager, CTX).await.expect("list");
        assert!(!releases.is_empty());
        let web = releases
            .iter()
            .find(|r| r.name == "web")
            .expect("web release");
        assert_eq!(web.chart, "nginx");
        assert_eq!(web.status, "deployed");
    }

    #[tokio::test]
    async fn fetches_release_detail_against_mock() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let detail = super::release_detail(&manager, CTX, "web")
            .await
            .expect("detail");
        assert_eq!(detail.summary.name, "web");
        assert!(detail.manifest.contains("kind: ConfigMap"));
        assert_eq!(detail.values, r#"{"replicas":2}"#);
        assert_eq!(detail.notes, "Release ready.");
    }

    #[tokio::test]
    async fn lists_all_revisions_against_mock() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let revisions = super::release_revisions(&manager, CTX, "web")
            .await
            .expect("revisions");
        // Newest first.
        assert_eq!(revisions[0].version, 2);
        assert_eq!(revisions[0].status, "deployed");
        assert_eq!(revisions[1].version, 1);
        assert_eq!(revisions[1].status, "superseded");
    }

    #[tokio::test]
    async fn fetches_detail_at_specific_revision_against_mock() {
        let server = mock_api::MockApiServer::start().await;
        let manager = manager_with_mock(&server).await;
        let detail = super::release_detail_at(&manager, CTX, "web", 1)
            .await
            .expect("detail");
        assert_eq!(detail.summary.version, 1);
        assert_eq!(detail.summary.status, "superseded");
        assert!(detail.manifest.contains("kind: ConfigMap"));
    }
}
