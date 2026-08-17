import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { formatCpu, formatMemory, toPodMetricLookup, usePodMetrics } from "./use-metrics";
import type { PodMetric, ResourceContext } from "@/lib/k8s/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;

const ctx: ResourceContext = {
  context: "ctx-a",
  group: "",
  version: "v1",
  kind: "Pod",
  namespaced: true,
  namespace: "default",
};

const podA: PodMetric = {
  namespace: "default",
  name: "pod-a",
  cpuMillicores: 125,
  memoryBytes: 128 << 20,
  containers: [
    { name: "app", cpuMillicores: 100, memoryBytes: 64 << 20 },
    { name: "sidecar", cpuMillicores: 25, memoryBytes: 64 << 20 },
  ],
};

beforeEach(() => {
  invokeMock.mockReset();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("formatCpu", () => {
  it("formats millicores", () => {
    expect(formatCpu(125)).toBe("125m");
    expect(formatCpu(1000)).toBe("1.00");
    expect(formatCpu(2500)).toBe("2.50");
    expect(formatCpu(1)).toBe("1m");
  });
});

describe("formatMemory", () => {
  it("formats bytes", () => {
    expect(formatMemory(128 << 20)).toBe("128 Mi");
    expect(formatMemory(1 << 30)).toBe("1.0 Gi");
    expect(formatMemory(512 << 10)).toBe("512 KiB");
    expect(formatMemory(100)).toBe("100 B");
  });
});

describe("usePodMetrics", () => {
  it("fetches pod metrics", async () => {
    invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "get_pod_metrics") return Promise.resolve([podA]);
      throw new Error(`unexpected invoke: ${cmd} ${JSON.stringify(args)}`);
    });

    const { result } = renderHook(() => usePodMetrics(ctx), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(invokeMock).toHaveBeenCalledWith("get_pod_metrics", { ctx });
  });

  it("stays disabled without a context", async () => {
    const { result } = renderHook(() => usePodMetrics(null), { wrapper });
    expect(result.current.isFetching).toBe(false);
  });
});

describe("toPodMetricLookup", () => {
  it("builds a name lookup", () => {
    const lookup = toPodMetricLookup([podA]);
    expect(lookup.byName.get("pod-a")).toBe(podA);
    expect(lookup.list).toHaveLength(1);
    expect(toPodMetricLookup(undefined).list).toHaveLength(0);
  });
});
