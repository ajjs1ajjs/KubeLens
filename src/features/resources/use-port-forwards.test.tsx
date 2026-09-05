import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { usePortForwards } from "./use-port-forwards";
import type { PortForwardInfo, ResourceContext } from "@/lib/k8s/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { invoke } from "@tauri-apps/api/core";
import { toast } from "sonner";

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;
const toastSuccess = toast.success as unknown as ReturnType<typeof vi.fn>;
const toastError = toast.error as unknown as ReturnType<typeof vi.fn>;

const ctx: ResourceContext = {
  context: "ctx-a",
  group: "",
  version: "v1",
  kind: "Pod",
  namespaced: true,
  namespace: "default",
};

const forward: PortForwardInfo = {
  id: "pf-1",
  context: "ctx-a",
  name: "pod-a",
  remotePort: 8080,
  localPort: 51234,
};

beforeEach(() => {
  invokeMock.mockReset();
  toastSuccess.mockReset();
  toastError.mockReset();
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("usePortForwards", () => {
  it("lists active forwards", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_port_forwards") return Promise.resolve([forward]);
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => usePortForwards(ctx), { wrapper });
    await waitFor(() => expect(result.current.forwards).toEqual([forward]));
  });

  it("starts a forward and refreshes the list", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_port_forwards") return Promise.resolve([]);
      if (cmd === "start_port_forward") return Promise.resolve({ id: "pf-2", localPort: 51235 });
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => usePortForwards(ctx), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => {
      result.current.start.mutate({ name: "pod-a", remotePort: 8080 });
    });

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("start_port_forward", {
        ctx,
        name: "pod-a",
        remotePort: 8080,
      }),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Port 51235 forwarded"));
  });

  it("stops a forward and reports success", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_port_forwards") return Promise.resolve([forward]);
      if (cmd === "stop_port_forward") return Promise.resolve(undefined);
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => usePortForwards(ctx), { wrapper });
    await waitFor(() => expect(result.current.forwards).toHaveLength(1));

    act(() => {
      result.current.stop.mutate("pf-1");
    });

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("stop_port_forward", { id: "pf-1" }),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Port forward stopped"));
  });

  it("surfaces start failures as error toasts", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_port_forwards") return Promise.resolve([]);
      if (cmd === "start_port_forward") return Promise.reject(new Error("no permission"));
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => usePortForwards(ctx), { wrapper });
    await waitFor(() => expect(result.current.isPending).toBe(false));

    act(() => {
      result.current.start.mutate({ name: "pod-a", remotePort: 8080 });
    });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Error: no permission"));
  });
});
