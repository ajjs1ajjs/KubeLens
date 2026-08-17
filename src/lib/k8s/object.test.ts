import { describe, expect, it, vi } from "vitest";
import {
  formatAge,
  meta,
  nodeReady,
  nodeRoles,
  objectUid,
  podSummary,
  readPath,
  readyReplicas,
} from "./object";

const pod = {
  apiVersion: "v1",
  kind: "Pod",
  metadata: {
    name: "web-0",
    namespace: "default",
    uid: "uid-1",
    creationTimestamp: "2026-01-01T00:00:00Z",
    labels: { app: "web" },
    annotations: { note: "x" },
  },
  status: {
    phase: "Running",
    containerStatuses: [
      { ready: true, restartCount: 1 },
      { ready: false, restartCount: 2 },
    ],
  },
};

describe("object helpers", () => {
  it("extracts metadata", () => {
    expect(meta(pod).name).toBe("web-0");
    expect(meta(pod).namespace).toBe("default");
    expect(meta(pod).labels).toEqual({ app: "web" });
    expect(meta(pod).annotations).toEqual({ note: "x" });
  });

  it("falls back gracefully for objects without metadata", () => {
    expect(meta({}).name).toBe("");
    expect(meta({}).labels).toEqual({});
    expect(objectUid({})).toBe("/");
  });

  it("computes a stable uid", () => {
    expect(objectUid(pod)).toBe("uid-1");
  });

  it("reads nested JSON paths", () => {
    expect(readPath(pod, "/status/phase")).toBe("Running");
    expect(readPath(pod, "/metadata/name")).toBe("web-0");
    expect(readPath(pod, "/missing")).toBeUndefined();
  });

  it("summarizes pod readiness and restarts", () => {
    expect(podSummary(pod).ready).toBe("1/2");
    expect(podSummary(pod).restarts).toBe(3);
  });

  it("reads replica summaries", () => {
    const deploy = { status: { readyReplicas: 2, replicas: 3 } };
    expect(readyReplicas(deploy)).toBe("2/3");
    expect(readyReplicas(pod)).toBeUndefined();
  });

  it("reads node readiness and roles", () => {
    const node = {
      status: { conditions: [{ type: "Ready", status: "True" }] },
      metadata: {
        labels: {
          "node-role.kubernetes.io/control-plane": "",
          "node-role.kubernetes.io/worker": "",
        },
      },
    };
    expect(nodeReady(node)).toBe(true);
    expect(nodeRoles(node)).toContain("worker");
    expect(nodeRoles(node)).toContain("control-plane");
  });

  it("formats ages from timestamps", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:01:00Z"));
    expect(formatAge("2026-01-01T00:00:55Z")).toBe("5s");
    expect(formatAge("2026-01-01T00:00:00Z")).toBe("1m");
    vi.useRealTimers();
  });

  it("handles missing or invalid timestamps", () => {
    expect(formatAge(undefined)).toBe("—");
    expect(formatAge("not-a-date")).toBe("—");
  });
});
