import { describe, expect, it } from "vitest";
import { parseQuantity, podResources } from "./pod-resources";
import type { K8sObject } from "@/lib/k8s/types";

describe("parseQuantity", () => {
  it("parses CPU quantities", () => {
    expect(parseQuantity("100m", "cpu")).toBe(100);
    expect(parseQuantity("1", "cpu")).toBe(1000);
    expect(parseQuantity("0.5", "cpu")).toBe(500);
    expect(parseQuantity("2", "cpu")).toBe(2000);
    expect(parseQuantity("250m", "cpu")).toBe(250);
  });

  it("parses memory quantities", () => {
    expect(parseQuantity("128Mi", "memory")).toBe(128 * 1024 ** 2);
    expect(parseQuantity("1Gi", "memory")).toBe(1024 ** 3);
    expect(parseQuantity("512Ki", "memory")).toBe(512 * 1024);
    expect(parseQuantity("100", "memory")).toBe(100);
    expect(parseQuantity("1.5Gi", "memory")).toBe(Math.round(1.5 * 1024 ** 3));
  });

  it("returns undefined for invalid input", () => {
    expect(parseQuantity("", "cpu")).toBeUndefined();
    expect(parseQuantity("abc", "cpu")).toBeUndefined();
    expect(parseQuantity(undefined, "memory")).toBeUndefined();
    expect(parseQuantity("5X", "cpu")).toBeUndefined();
  });

  it("accepts numeric input", () => {
    expect(parseQuantity(2, "cpu")).toBe(2000);
    expect(parseQuantity(1024, "memory")).toBe(1024);
  });
});

describe("podResources", () => {
  const pod: K8sObject = {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: "web", namespace: "default" },
    spec: {
      containers: [
        {
          name: "app",
          resources: {
            requests: { cpu: "100m", memory: "64Mi" },
            limits: { cpu: "500m", memory: "128Mi" },
          },
        },
        {
          name: "sidecar",
          resources: {
            requests: { cpu: "50m" },
          },
        },
      ],
    },
  };

  it("extracts per-container requests and limits", () => {
    const resources = podResources(pod);
    const app = resources.containers.find((c) => c.name === "app")!;
    expect(app.cpuRequest).toBe(100);
    expect(app.cpuLimit).toBe(500);
    expect(app.memoryRequest).toBe(64 * 1024 ** 2);
    expect(app.memoryLimit).toBe(128 * 1024 ** 2);

    const sidecar = resources.containers.find((c) => c.name === "sidecar")!;
    expect(sidecar.cpuRequest).toBe(50);
    expect(sidecar.memoryLimit).toBeUndefined();
  });

  it("aggregates totals across containers", () => {
    const resources = podResources(pod);
    expect(resources.cpuRequest).toBe(150);
    expect(resources.cpuLimit).toBe(500);
    expect(resources.memoryRequest).toBe(64 * 1024 ** 2);
    expect(resources.memoryLimit).toBe(128 * 1024 ** 2);
  });

  it("handles pods without resource blocks", () => {
    const bare: K8sObject = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: { name: "bare" },
      spec: { containers: [{ name: "c" }] },
    };
    const resources = podResources(bare);
    expect(resources.cpuRequest).toBeUndefined();
    expect(resources.cpuLimit).toBeUndefined();
    expect(resources.containers[0].cpuRequest).toBeUndefined();
  });

  it("handles missing spec", () => {
    const empty: K8sObject = { apiVersion: "v1", kind: "Pod", metadata: { name: "x" } };
    expect(podResources(empty).containers).toEqual([]);
  });
});
