import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TOPOLOGY_KINDS, useTopology } from "./use-topology";
import type { K8sObject, ResourceContext } from "@/lib/k8s/types";

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

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const service: K8sObject = {
  apiVersion: "v1",
  kind: "Service",
  metadata: { name: "api", namespace: "default" },
  spec: { selector: { app: "api" } },
};
const deployment: K8sObject = {
  apiVersion: "apps/v1",
  kind: "Deployment",
  metadata: { name: "api", namespace: "default" },
  spec: { template: { metadata: { labels: { app: "api" } } } },
};

describe("useTopology", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("fetches all graph kinds and builds the graph", async () => {
    invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "list_resources") {
        const kind = (args as { ctx?: ResourceContext }).ctx?.kind;
        if (kind === "Service") return Promise.resolve([service]);
        if (kind === "Deployment") return Promise.resolve([deployment]);
        return Promise.resolve([]);
      }
      throw new Error(`unexpected invoke: ${cmd} ${JSON.stringify(args)}`);
    });

    const { result } = renderHook(() => useTopology(ctx), { wrapper });
    await waitFor(() => expect(result.current.graph.nodes.length).toBeGreaterThanOrEqual(2));
    expect(result.current.graph.edges).toContainEqual({
      id: "Service:api->Deployment:api",
      from: "Service:api",
      to: "Deployment:api",
    });
    expect(result.current.graph.metrics.width).toBeGreaterThan(0);
  });

  it("requests every topology kind", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_resources") return Promise.resolve([]);
      throw new Error(`unexpected ${cmd}`);
    });

    renderHook(() => useTopology(ctx), { wrapper });
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(TOPOLOGY_KINDS.length));
  });

  it("stays disabled without a context", async () => {
    const { result } = renderHook(() => useTopology(null), { wrapper });
    expect(result.current.isFetching).toBe(false);
  });
});
