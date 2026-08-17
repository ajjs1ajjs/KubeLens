import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResourceDetail } from "./ResourceDetail";
import { podContainers } from "./pod-containers";
import type { K8sObject, ResourceContext } from "@/lib/k8s/types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { invoke } from "@tauri-apps/api/core";

const invokeMock = invoke as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  invokeMock.mockImplementation((cmd: string) => {
    if (cmd === "list_port_forwards") return Promise.resolve([]);
    return Promise.resolve(undefined);
  });
});

const ctx: ResourceContext = {
  context: "ctx-a",
  group: "",
  version: "v1",
  kind: "Pod",
  namespaced: true,
  namespace: "default",
};

const pod: K8sObject = {
  apiVersion: "v1",
  kind: "Pod",
  metadata: { name: "pod-a", namespace: "default" },
  spec: {
    containers: [{ name: "app", image: "nginx" }, { name: "sidecar" }],
  },
  status: { phase: "Running" },
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("podContainers", () => {
  it("extracts container names from a Pod spec", () => {
    expect(podContainers(pod)).toEqual(["app", "sidecar"]);
  });

  it("returns an empty list when there are no containers", () => {
    expect(podContainers({ apiVersion: "v1", kind: "Pod", metadata: { name: "p" } })).toEqual([]);
  });
});

describe("ResourceDetail", () => {
  it("shows logs and terminal tabs for pods", () => {
    render(<ResourceDetail kind="Pod" object={pod} ctx={ctx} onOpenChange={() => {}} />, {
      wrapper,
    });
    expect(screen.getByText("Raw JSON")).toBeInTheDocument();
    expect(screen.getByText("Logs")).toBeInTheDocument();
    expect(screen.getByText("Terminal")).toBeInTheDocument();
    expect(screen.getByText("Port Forward")).toBeInTheDocument();
  });

  it("hides pod-only controls for other kinds", () => {
    render(
      <ResourceDetail
        kind="Service"
        object={{ apiVersion: "v1", kind: "Service", metadata: { name: "svc-a" } }}
        ctx={ctx}
        onOpenChange={() => {}}
      />,
      { wrapper },
    );
    expect(screen.queryByText("Logs")).not.toBeInTheDocument();
    expect(screen.queryByText("Terminal")).not.toBeInTheDocument();
    expect(screen.queryByText("Port Forward")).not.toBeInTheDocument();
  });
});
