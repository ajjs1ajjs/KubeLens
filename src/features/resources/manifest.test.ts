import { describe, expect, it } from "vitest";
import { load } from "js-yaml";
import { manifestFromObject, manifestTemplate } from "./manifest";
import type { K8sObject, ResourceContext } from "@/lib/k8s/types";
import { findResourceType } from "./resource-types";

const ctx: ResourceContext = {
  context: "ctx-a",
  group: "",
  version: "v1",
  kind: "Pod",
  namespaced: true,
  namespace: "default",
};

describe("manifestTemplate", () => {
  it("builds a Pod manifest with apiVersion/kind/name", () => {
    const meta = findResourceType("Pod");
    if (!meta) throw new Error("Pod meta missing");

    const manifest = manifestTemplate(meta, ctx);
    expect(manifest).toContain("apiVersion: v1");
    expect(manifest).toContain("kind: Pod");
    expect(manifest).toContain("namespace: default");
  });

  it("omits namespace for cluster-scoped resources", () => {
    const meta = findResourceType("Node");
    if (!meta) throw new Error("Node meta missing");

    const manifest = manifestTemplate(meta, ctx);
    expect(manifest).not.toContain("namespace");
  });

  it("seeds a Deployment template with containers", () => {
    const meta = findResourceType("Deployment");
    if (!meta) throw new Error("Deployment meta missing");

    const manifest = manifestTemplate(meta, ctx);
    expect(manifest).toContain("kind: Deployment");
    expect(manifest).toContain("image: nginx");
  });
});

describe("manifestFromObject", () => {
  it("serializes an object to YAML that round-trips", () => {
    const object: K8sObject = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: { name: "pod-a", namespace: "default" },
      spec: { containers: [{ name: "app", image: "nginx" }] },
    };

    const manifest = manifestFromObject(object);
    expect(manifest).toContain("kind: Pod");

    const parsed = load(manifest) as Record<string, unknown>;
    const parsedMeta = parsed.metadata as Record<string, unknown>;
    const parsedSpec = parsed.spec as { containers?: Array<{ image?: string }> };
    expect(parsedMeta.name).toBe("pod-a");
    expect(parsedSpec.containers?.[0]?.image).toBe("nginx");
  });
});
