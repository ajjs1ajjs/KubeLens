import { describe, expect, it } from "vitest";
import { buildTopology, layoutTopology, nodeKindColor } from "./topology";
import type { K8sObject } from "@/lib/k8s/types";

function obj(kind: string, name: string, extra: Record<string, unknown> = {}): K8sObject {
  return { apiVersion: "v1", kind, metadata: { name, namespace: "default" }, ...extra };
}

describe("buildTopology", () => {
  it("links ingress to service", () => {
    const objects = [
      obj("Ingress", "web", {
        spec: {
          rules: [{ http: { paths: [{ backend: { service: { name: "web-svc" } } }] } }],
        },
      }),
      obj("Service", "web-svc"),
    ];
    const graph = buildTopology(objects);
    expect(graph.edges).toContainEqual({
      id: "Ingress:web->Service:web-svc",
      from: "Ingress:web",
      to: "Service:web-svc",
    });
  });

  it("links service to workload by selector match", () => {
    const objects = [
      obj("Service", "web-svc", { spec: { selector: { app: "web" } } }),
      obj("Deployment", "web", {
        spec: { template: { metadata: { labels: { app: "web" } } } },
      }),
    ];
    const graph = buildTopology(objects);
    expect(graph.edges).toContainEqual({
      id: "Service:web-svc->Deployment:web",
      from: "Service:web-svc",
      to: "Deployment:web",
    });
  });

  it("does not link service to non-matching workload", () => {
    const objects = [
      obj("Service", "web-svc", { spec: { selector: { app: "other" } } }),
      obj("Deployment", "web", {
        spec: { template: { metadata: { labels: { app: "web" } } } },
      }),
    ];
    const graph = buildTopology(objects);
    expect(graph.edges).toHaveLength(0);
  });

  it("links workload to configmap, secret and pvc", () => {
    const objects = [
      obj("Deployment", "web", {
        spec: {
          template: {
            spec: {
              containers: [
                {
                  envFrom: [{ configMapRef: { name: "web-cm" } }],
                  env: [{ valueFrom: { secretKeyRef: { name: "web-secret" } } }],
                },
              ],
              volumes: [{ persistentVolumeClaim: { claimName: "web-pvc" } }],
            },
          },
        },
      }),
      obj("ConfigMap", "web-cm"),
      obj("Secret", "web-secret"),
      obj("PersistentVolumeClaim", "web-pvc"),
    ];
    const graph = buildTopology(objects);
    expect(graph.edges).toContainEqual({
      id: "Deployment:web->ConfigMap:web-cm",
      from: "Deployment:web",
      to: "ConfigMap:web-cm",
    });
    expect(graph.edges).toContainEqual({
      id: "Deployment:web->Secret:web-secret",
      from: "Deployment:web",
      to: "Secret:web-secret",
    });
    expect(graph.edges).toContainEqual({
      id: "Deployment:web->PersistentVolumeClaim:web-pvc",
      from: "Deployment:web",
      to: "PersistentVolumeClaim:web-pvc",
    });
  });

  it("skips unsupported kinds and namespaced duplicates", () => {
    const objects = [
      obj("Deployment", "web", { spec: { template: { metadata: { labels: { app: "web" } } } } }),
      obj("Namespace", "default"),
      obj("Deployment", "web"), // duplicate name
    ];
    const graph = buildTopology(objects);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].resourceKind).toBe("Deployment");
  });

  it("assigns layers by kind", () => {
    const objects = [
      obj("Ingress", "i"),
      obj("Service", "s"),
      obj("Deployment", "d"),
      obj("ConfigMap", "c"),
    ];
    const graph = buildTopology(objects);
    const byKind = new Map(graph.nodes.map((n) => [n.resourceKind, n.layer]));
    expect(byKind.get("Ingress")).toBe(0);
    expect(byKind.get("Service")).toBe(1);
    expect(byKind.get("Deployment")).toBe(2);
    expect(byKind.get("ConfigMap")).toBe(3);
  });
});

describe("layoutTopology", () => {
  it("positions nodes on distinct rows within a layer", () => {
    const graph = buildTopology([
      obj("Deployment", "a"),
      obj("Deployment", "b"),
      obj("Deployment", "c"),
    ]);
    const { nodes } = layoutTopology(graph);
    const ys = nodes.map((n) => n.y);
    expect(new Set(ys).size).toBe(3);
    expect(nodes.every((n) => n.x === 2 * 180)).toBe(true);
  });

  it("computes positive metrics", () => {
    const graph = buildTopology([obj("Deployment", "a"), obj("Service", "s")]);
    const { metrics } = layoutTopology(graph);
    expect(metrics.width).toBeGreaterThan(0);
    expect(metrics.height).toBeGreaterThan(0);
  });
});

describe("nodeKindColor", () => {
  it("returns a color for every kind", () => {
    for (const kind of ["ingress", "service", "workload", "configmap", "secret", "pvc"] as const) {
      expect(nodeKindColor(kind)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
