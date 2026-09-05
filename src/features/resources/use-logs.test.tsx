import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLogs } from "./use-logs";
import type { LogEvent, ResourceContext } from "@/lib/k8s/types";

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

const ctx: ResourceContext = {
  context: "ctx-a",
  group: "",
  version: "v1",
  kind: "Pod",
  namespaced: true,
  namespace: "default",
};

let eventHandler: ((e: { payload: LogEvent }) => void) | undefined;
let unlisten: ReturnType<typeof vi.fn>;

beforeEach(() => {
  invokeMock.mockReset();
  listenMock.mockReset();
  eventHandler = undefined;
  unlisten = vi.fn();
  listenMock.mockImplementation((_name: string, handler: (e: { payload: LogEvent }) => void) => {
    eventHandler = handler;
    return Promise.resolve(unlisten);
  });
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useLogs", () => {
  it("fetches full logs on mount", async () => {
    invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "get_logs") return Promise.resolve("line 1\nline 2\n");
      throw new Error(`unexpected invoke: ${cmd} ${JSON.stringify(args)}`);
    });

    const { result } = renderHook(() => useLogs(ctx, "pod-a"), { wrapper });
    await waitFor(() => expect(result.current.text).toBe("line 1\nline 2\n"));
  });

  it("starts following logs and appends live lines", async () => {
    invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "get_logs") return Promise.resolve("existing\n");
      if (cmd === "follow_logs") return Promise.resolve("logs-1");
      if (cmd === "stop_follow_logs") return Promise.resolve(undefined);
      throw new Error(`unexpected invoke: ${cmd} ${JSON.stringify(args)}`);
    });

    const { result } = renderHook(() => useLogs(ctx, "pod-a"), { wrapper });
    await waitFor(() => expect(result.current.text).toBe("existing\n"));

    act(() => {
      result.current.startFollowing();
    });
    await waitFor(() => expect(result.current.following).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("follow_logs", { ctx, name: "pod-a", container: null });

    act(() => {
      eventHandler?.({ payload: { id: "logs-1", action: "line", line: "live-1" } });
    });
    await waitFor(() => expect(result.current.liveLines).toEqual(["live-1"]));

    act(() => {
      result.current.stopFollowing();
    });
    expect(invokeMock).toHaveBeenCalledWith("stop_follow_logs", { id: "logs-1" });
    expect(unlisten).toHaveBeenCalled();
  });

  it("surfaces follow errors", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_logs") return Promise.resolve("");
      if (cmd === "follow_logs") return Promise.resolve("logs-1");
      if (cmd === "stop_follow_logs") return Promise.resolve(undefined);
      return Promise.reject(new Error(`unexpected ${cmd}`));
    });

    const { result } = renderHook(() => useLogs(ctx, "pod-a"), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => {
      result.current.startFollowing();
    });
    await waitFor(() => expect(result.current.following).toBe(true));

    act(() => {
      eventHandler?.({ payload: { id: "logs-1", action: "error", error: "denied" } });
    });
    await waitFor(() => expect(result.current.followError).toBe("denied"));
  });

  it("reports fetch errors", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_logs") return Promise.reject(new Error("boom"));
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => useLogs(ctx, "pod-a"), { wrapper });
    await waitFor(() => expect(result.current.error).toBe("Error: boom"));
  });
});
