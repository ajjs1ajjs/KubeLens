import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useResourceList } from "./use-resource-list";
import { meta } from "@/lib/k8s/object";
import type { K8sObject, ResourceContext } from "@/lib/k8s/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;
const listenMock = listen as unknown as ReturnType<typeof vi.fn>;

const makePod = (name: string): K8sObject => ({
  apiVersion: "v1",
  kind: "Pod",
  metadata: { name, namespace: "default", uid: `uid-${name}` },
  status: { phase: "Running" },
});

const ctx: ResourceContext = {
  context: "ctx-a",
  group: "",
  version: "v1",
  kind: "Pod",
  namespaced: true,
  namespace: "default",
};

let eventHandler:
  | ((event: {
      payload: { id: string; action: string; object?: K8sObject; error?: string };
    }) => void)
  | undefined;
let unlisten: ReturnType<typeof vi.fn>;

beforeEach(() => {
  invokeMock.mockReset();
  listenMock.mockReset();
  eventHandler = undefined;
  unlisten = vi.fn();
  listenMock.mockImplementation(
    (
      _name: string,
      handler: (e: {
        payload: { id: string; action: string; object?: K8sObject; error?: string };
      }) => void,
    ) => {
      eventHandler = handler;
      return Promise.resolve(unlisten);
    },
  );
});

function mockApi() {
  invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
    if (cmd === "list_resources") return Promise.resolve([makePod("a"), makePod("b")]);
    if (cmd === "start_watch") return Promise.resolve("watch-1");
    if (cmd === "stop_watch") return Promise.resolve(undefined);
    throw new Error(`unexpected invoke: ${cmd} ${JSON.stringify(args)}`);
  });
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useResourceList", () => {
  it("loads the initial resource list", async () => {
    mockApi();
    const { result } = renderHook(() => useResourceList(ctx), { wrapper });

    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(invokeMock).toHaveBeenCalledWith("list_resources", { ctx });
  });

  it("applies watch upserts and deletes to the cached list", async () => {
    mockApi();
    const { result } = renderHook(() => useResourceList(ctx), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(2));

    act(() => {
      eventHandler?.({ payload: { id: "watch-1", action: "upsert", object: makePod("c") } });
    });
    await waitFor(() => expect(result.current.data).toHaveLength(3));

    act(() => {
      eventHandler?.({ payload: { id: "watch-1", action: "delete", object: makePod("a") } });
    });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(result.current.data?.some((o) => meta(o).name === "a")).toBe(false);
  });

  it("upserts replace objects with the same uid", async () => {
    mockApi();
    const { result } = renderHook(() => useResourceList(ctx), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(2));

    act(() => {
      eventHandler?.({
        payload: {
          id: "watch-1",
          action: "upsert",
          object: { ...makePod("a"), status: { phase: "Succeeded" } },
        },
      });
    });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    const updated = result.current.data?.find((o) => meta(o).name === "a");
    expect((updated?.status as { phase?: string }).phase).toBe("Succeeded");
  });

  it("starts a watch and stops it on unmount", async () => {
    mockApi();
    const { result, unmount } = renderHook(() => useResourceList(ctx), { wrapper });
    await waitFor(() => expect(result.current.watch).toBe("watching"));
    expect(invokeMock).toHaveBeenCalledWith("start_watch", { ctx });

    unmount();
    await waitFor(() => expect(unlisten).toHaveBeenCalled());
    expect(invokeMock).toHaveBeenCalledWith("stop_watch", { id: "watch-1" });
  });

  it("reports watch failures", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_resources") return Promise.resolve([]);
      if (cmd === "start_watch") return Promise.reject(new Error("no access"));
      if (cmd === "stop_watch") return Promise.resolve(undefined);
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });

    const { result } = renderHook(() => useResourceList(ctx), { wrapper });
    await waitFor(() => expect(result.current.watch).toBe("error"));
  });

  it("reconnects after a watch error event", async () => {
    let startCalls = 0;
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_resources") return Promise.resolve([]);
      if (cmd === "start_watch") {
        startCalls += 1;
        return Promise.resolve(`watch-${startCalls}`);
      }
      if (cmd === "stop_watch") return Promise.resolve(undefined);
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });

    const { result } = renderHook(() => useResourceList(ctx), { wrapper });
    await waitFor(() => expect(result.current.watch).toBe("watching"));

    // Simulate the backend ending the watch with an error.
    act(() => {
      eventHandler?.({ payload: { id: "watch-1", action: "error", error: "stream ended" } });
    });
    await waitFor(() => expect(result.current.watch).toBe("error"));

    // It should reconnect after the backoff delay and go back to watching.
    await waitFor(() => expect(result.current.watch).toBe("watching"), { timeout: 5000 });
    expect(startCalls).toBeGreaterThanOrEqual(2);
  });
});
