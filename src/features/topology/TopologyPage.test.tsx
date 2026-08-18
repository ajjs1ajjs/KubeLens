import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TopologyPage } from "./TopologyPage";
import { useClusterStore } from "@/features/clusters/cluster-store";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { invoke } from "@tauri-apps/api/core";

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;

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
    activeNamespace: "default",
  });
}

describe("TopologyPage", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    mockActiveCluster();
  });

  it("renders the graph with nodes and edges", async () => {
    invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "list_resources") {
        const kind = (args as { ctx?: { kind: string } }).ctx?.kind;
        if (kind === "Service") {
          return Promise.resolve([
            {
              apiVersion: "v1",
              kind: "Service",
              metadata: { name: "api", namespace: "default" },
              spec: { selector: { app: "api" } },
            },
          ]);
        }
        if (kind === "Deployment") {
          return Promise.resolve([
            {
              apiVersion: "apps/v1",
              kind: "Deployment",
              metadata: { name: "api", namespace: "default" },
              spec: { template: { metadata: { labels: { app: "api" } } } },
            },
          ]);
        }
        return Promise.resolve([]);
      }
      throw new Error(`unexpected ${cmd}`);
    });

    render(<TopologyPage />, { wrapper });
    await screen.findByRole("img", { name: /dependency graph/i });
    expect(screen.getByLabelText("Service api")).toBeInTheDocument();
    expect(screen.getByLabelText("Deployment api")).toBeInTheDocument();
    expect(screen.getByText(/2 nodes, 1 edges/)).toBeInTheDocument();
  });

  it("shows an empty state", async () => {
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_resources") return Promise.resolve([]);
      throw new Error(`unexpected ${cmd}`);
    });

    render(<TopologyPage />, { wrapper });
    await waitFor(() => expect(screen.getByText("Nothing to graph yet.")).toBeInTheDocument());
  });

  it("opens the resource detail when a node is clicked", async () => {
    invokeMock.mockImplementation((cmd: string, args?: Record<string, unknown>) => {
      if (cmd === "list_resources") {
        const kind = (args as { ctx?: { kind: string } }).ctx?.kind;
        if (kind === "Service") {
          return Promise.resolve([
            {
              apiVersion: "v1",
              kind: "Service",
              metadata: { name: "api", namespace: "default" },
              spec: { selector: { app: "api" } },
            },
          ]);
        }
        if (kind === "Deployment") {
          return Promise.resolve([
            {
              apiVersion: "apps/v1",
              kind: "Deployment",
              metadata: { name: "api", namespace: "default" },
              spec: { template: { metadata: { labels: { app: "api" } } } },
            },
          ]);
        }
        return Promise.resolve([]);
      }
      if (cmd === "list_port_forwards") return Promise.resolve([]);
      throw new Error(`unexpected ${cmd}`);
    });

    const user = userEvent.setup();
    render(<TopologyPage />, { wrapper });
    await screen.findByRole("img", { name: /dependency graph/i });

    await user.click(screen.getByLabelText("Service api"));
    expect(await screen.findByText("Raw JSON")).toBeInTheDocument();
    expect(screen.getAllByText("api").length).toBeGreaterThan(0);
    expect(screen.getByText("default · created —")).toBeInTheDocument();
  });
});
