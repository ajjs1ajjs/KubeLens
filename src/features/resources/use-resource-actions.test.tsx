import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useResourceActions } from "./use-resource-actions";
import type { ResourceContext } from "@/lib/k8s/types";

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

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useResourceActions", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("deletes a resource and reports success", async () => {
    invokeMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useResourceActions(ctx), { wrapper });
    act(() => {
      result.current.remove.mutate("pod-a");
    });

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("delete_resource", { ctx, name: "pod-a" }),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Resource deleted"));
  });

  it("applies a manifest and reports success", async () => {
    invokeMock.mockResolvedValue({
      apiVersion: "v1",
      kind: "Pod",
      metadata: { name: "pod-a" },
    });
    const yaml = "apiVersion: v1\nkind: Pod\nmetadata:\n  name: pod-a\n";

    const { result } = renderHook(() => useResourceActions(ctx), { wrapper });
    act(() => {
      result.current.apply.mutate(yaml);
    });

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("apply_yaml", { ctx, yaml }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Manifest applied"));
  });

  it("surfaces failures as error toasts", async () => {
    invokeMock.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useResourceActions(ctx), { wrapper });
    act(() => {
      result.current.remove.mutate("pod-a");
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Error: boom"));
  });
});
