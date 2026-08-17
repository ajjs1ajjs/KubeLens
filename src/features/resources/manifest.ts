import { dump } from "js-yaml";
import type { K8sObject, ResourceContext } from "@/lib/k8s/types";
import { resourceApiVersion, type ResourceTypeMeta } from "./resource-types";

/** Serializes a Kubernetes object back to YAML for editing. */
export function manifestFromObject(object: K8sObject): string {
  return dump(object, { noRefs: true });
}

/** Builds a starter manifest for creating a new resource of the given kind. */
export function manifestTemplate(meta: ResourceTypeMeta, ctx: ResourceContext): string {
  const manifest: Record<string, unknown> = {
    apiVersion: resourceApiVersion(meta),
    kind: meta.kind,
    metadata: {
      name: "",
      ...(meta.namespaced && ctx.namespace ? { namespace: ctx.namespace } : {}),
    },
  };

  if (meta.kind === "Pod") {
    manifest.spec = { containers: [{ name: "app", image: "nginx" }] };
  } else if (meta.kind === "Service") {
    manifest.spec = {
      selector: {},
      ports: [{ port: 80, targetPort: 80 }],
    };
  } else if (meta.kind === "Deployment" || meta.kind === "StatefulSet") {
    manifest.spec = {
      replicas: 1,
      selector: { matchLabels: { app: "" } },
      template: {
        metadata: { labels: { app: "" } },
        spec: { containers: [{ name: "app", image: "nginx" }] },
      },
    };
  } else if (meta.kind === "ConfigMap") {
    manifest.data = {};
  } else if (meta.kind === "Secret") {
    manifest.type = "Opaque";
    manifest.data = {};
  }

  return dump(manifest);
}
