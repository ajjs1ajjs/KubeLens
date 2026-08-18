import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  releaseStatusTone,
  useHelmRelease,
  useHelmReleaseRevision,
  useHelmReleases,
  useHelmRevisions,
  useUninstallHelmRelease,
} from "./use-helm";
import type { HelmReleaseDetail, HelmReleaseSummary } from "@/lib/k8s/types";

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

const summary: HelmReleaseSummary = {
  name: "web",
  namespace: "default",
  version: 1,
  status: "deployed",
  chart: "nginx",
  chartVersion: "4.1.0",
  appVersion: "1.2.3",
  description: "Install complete",
  firstDeployed: "2026-01-01T00:00:00Z",
  lastDeployed: "2026-01-02T00:00:00Z",
};

const detail: HelmReleaseDetail = {
  ...summary,
  values: '{"replicas":2}',
  manifest: "apiVersion: v1\nkind: ConfigMap",
  notes: "Release ready.",
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

describe("useHelmReleases", () => {
  it("lists releases for the context", async () => {
    invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "list_helm_releases") return Promise.resolve([summary]);
      throw new Error(`unexpected invoke: ${cmd} ${JSON.stringify(args)}`);
    });

    const { result } = renderHook(() => useHelmReleases("ctx-a"), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(invokeMock).toHaveBeenCalledWith("list_helm_releases", { context: "ctx-a" });
  });
});

describe("useHelmRelease", () => {
  it("fetches release detail", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_helm_release") return Promise.resolve(detail);
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => useHelmRelease("ctx-a", "web"), { wrapper });
    await waitFor(() => expect(result.current.data?.notes).toBe("Release ready."));
    expect(invokeMock).toHaveBeenCalledWith("get_helm_release", { context: "ctx-a", name: "web" });
  });

  it("stays disabled without a name", async () => {
    const { result } = renderHook(() => useHelmRelease("ctx-a", null), { wrapper });
    expect(result.current.isFetching).toBe(false);
  });
});

describe("useUninstallHelmRelease", () => {
  it("uninstalls and reports success", async () => {
    invokeMock.mockResolvedValue(undefined);

    const { result } = renderHook(() => useUninstallHelmRelease("ctx-a"), { wrapper });
    act(() => {
      result.current.mutate("web");
    });
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("uninstall_helm_release", {
        context: "ctx-a",
        name: "web",
      }),
    );
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Release "web" uninstalled'));
  });

  it("surfaces failures as error toasts", async () => {
    invokeMock.mockRejectedValue(new Error("boom"));

    const { result } = renderHook(() => useUninstallHelmRelease("ctx-a"), { wrapper });
    act(() => {
      result.current.mutate("web");
    });
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Error: boom"));
  });
});

describe("releaseStatusTone", () => {
  it("maps statuses to tones", () => {
    expect(releaseStatusTone("deployed")).toBe("green");
    expect(releaseStatusTone("failed")).toBe("red");
    expect(releaseStatusTone("pending-upgrade")).toBe("yellow");
    expect(releaseStatusTone("unknown")).toBe("gray");
  });
});

describe("useHelmRevisions", () => {
  it("lists revisions for a release", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_helm_revisions") {
        return Promise.resolve([
          {
            name: "web",
            version: 2,
            status: "deployed",
            chart: "nginx",
            chartVersion: "4.2.0",
            lastDeployed: "2026-01-02T00:00:00Z",
          },
          {
            name: "web",
            version: 1,
            status: "superseded",
            chart: "nginx",
            chartVersion: "4.1.0",
            lastDeployed: "2026-01-01T00:00:00Z",
          },
        ]);
      }
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => useHelmRevisions("ctx-a", "web"), { wrapper });
    await waitFor(() => expect(result.current.data).toHaveLength(2));
    expect(invokeMock).toHaveBeenCalledWith("list_helm_revisions", {
      context: "ctx-a",
      name: "web",
    });
  });
});

describe("useHelmReleaseRevision", () => {
  it("fetches a specific revision", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "get_helm_release_revision") {
        return Promise.resolve({ ...detail, version: 1, status: "superseded" });
      }
      throw new Error(`unexpected ${cmd}`);
    });

    const { result } = renderHook(() => useHelmReleaseRevision("ctx-a", "web", 1), { wrapper });
    await waitFor(() => expect(result.current.data?.version).toBe(1));
    expect(invokeMock).toHaveBeenCalledWith("get_helm_release_revision", {
      context: "ctx-a",
      name: "web",
      version: 1,
    });
  });
});
