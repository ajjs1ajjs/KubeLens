import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useTerminal } from "./use-terminal";
import type { ExecEvent, ResourceContext } from "@/lib/k8s/types";

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

let eventHandler: ((e: { payload: ExecEvent }) => void) | undefined;
let unlisten: ReturnType<typeof vi.fn>;

beforeEach(() => {
  invokeMock.mockReset();
  listenMock.mockReset();
  eventHandler = undefined;
  unlisten = vi.fn();
  listenMock.mockImplementation((_name: string, handler: (e: { payload: ExecEvent }) => void) => {
    eventHandler = handler;
    return Promise.resolve(unlisten);
  });
});

describe("useTerminal", () => {
  it("starts a session and forwards input", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "exec_shell") return Promise.resolve("exec-1");
      if (cmd === "exec_input") return Promise.resolve(undefined);
      if (cmd === "stop_exec") return Promise.resolve(undefined);
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => useTerminal(ctx, "pod-a"), {});
    await waitFor(() => expect(result.current?.status).toBe("open"));
    expect(invokeMock).toHaveBeenCalledWith("exec_shell", {
      ctx,
      name: "pod-a",
      container: null,
      command: ["/bin/sh"],
    });

    act(() => {
      eventHandler?.({ payload: { id: "exec-1", action: "output", data: "hello\n" } });
    });
    await waitFor(() => expect(result.current?.output).toBe("hello\n"));

    act(() => {
      result.current?.write("echo hi\n");
    });
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("exec_input", { id: "exec-1", data: "echo hi\n" }),
    );
  });

  it("marks the session closed on done", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "exec_shell") return Promise.resolve("exec-1");
      if (cmd === "stop_exec") return Promise.resolve(undefined);
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => useTerminal(ctx, "pod-a"), {});
    await waitFor(() => expect(result.current?.status).toBe("open"));

    act(() => {
      eventHandler?.({ payload: { id: "exec-1", action: "done" } });
    });
    await waitFor(() => expect(result.current?.status).toBe("closed"));
  });

  it("surfaces session errors", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "exec_shell") return Promise.resolve("exec-1");
      if (cmd === "stop_exec") return Promise.resolve(undefined);
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => useTerminal(ctx, "pod-a"), {});
    await waitFor(() => expect(result.current?.status).toBe("open"));

    act(() => {
      eventHandler?.({ payload: { id: "exec-1", action: "error", error: "no shell" } });
    });
    await waitFor(() => expect(result.current?.status).toBe("closed"));
    expect(result.current?.error).toBe("no shell");
  });

  it("cleans up the session on unmount", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "exec_shell") return Promise.resolve("exec-1");
      if (cmd === "stop_exec") return Promise.resolve(undefined);
      throw new Error(`unexpected ${cmd}`);
    });

    const { unmount } = renderHook(() => useTerminal(ctx, "pod-a"), {});
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("exec_shell", expect.anything()));

    unmount();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("stop_exec", { id: "exec-1" }));
    await waitFor(() => expect(unlisten).toHaveBeenCalled());
  });
});
