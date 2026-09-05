import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmPage } from "./HelmPage";
import { useClusterStore } from "@/features/clusters/cluster-store";
import type { HelmReleaseSummary } from "@/lib/k8s/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { invoke } from "@tauri-apps/api/core";

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;

const release: HelmReleaseSummary = {
  name: "web",
  namespace: "default",
  version: 3,
  status: "deployed",
  chart: "nginx",
  chartVersion: "4.1.0",
  appVersion: "1.2.3",
  description: "Install complete",
  firstDeployed: "2026-01-01T00:00:00Z",
  lastDeployed: "2026-01-02T00:00:00Z",
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function mockActiveCluster() {
  useClusterStore.setState({
    clusters: [
      {
        id: "c1",
        name: "ctx-a",
        server: "https://cluster",
        namespace: "default",
        current: true,
        connected: true,
        version: "v1.30.0",
      },
    ],
    activeClusterId: "c1",
  });
}

describe("HelmPage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    mockActiveCluster();
  });

  it("renders releases in a table", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_helm_releases") return Promise.resolve([release]);
      if (cmd === "get_helm_release") {
        return Promise.resolve({
          ...release,
          values: "{}",
          manifest: "kind: ConfigMap",
          notes: "",
        });
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(<HelmPage />, { wrapper });
    await screen.findByText("web");
    expect(screen.getByText("default")).toBeInTheDocument();
    expect(screen.getByText("deployed")).toBeInTheDocument();
    expect(screen.getByText("nginx (4.1.0)")).toBeInTheDocument();
  });

  it("shows an empty state when there are no releases", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_helm_releases") return Promise.resolve([]);
      throw new Error(`unexpected ${cmd}`);
    });

    render(<HelmPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("No Helm releases found.")).toBeInTheDocument());
  });

  it("shows an error state on failure", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_helm_releases") return Promise.reject(new Error("no access"));
      throw new Error(`unexpected ${cmd}`);
    });

    render(<HelmPage />, { wrapper });
    await waitFor(() =>
      expect(screen.getByText("Failed to load Helm releases")).toBeInTheDocument(),
    );
  });
});
