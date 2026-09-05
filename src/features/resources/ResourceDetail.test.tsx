import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResourceDetail } from "./ResourceDetail";
import { podContainerInfo } from "./pod-container-info";
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
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
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

describe("podContainerInfo", () => {
  it("extracts per-container info from spec and status", () => {
    const podWithStatus: K8sObject = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: { name: "pod-a" },
      spec: {
        containers: [
          {
            name: "app",
            image: "nginx:1.25",
            resources: {
              requests: { cpu: "100m", memory: "128Mi" },
              limits: { cpu: "500m", memory: "256Mi" },
            },
          },
          { name: "sidecar", image: "busybox" },
        ],
      },
      status: {
        phase: "Running",
        podIP: "10.0.0.5",
        qosClass: "Burstable",
        containerStatuses: [
          {
            name: "app",
            ready: true,
            restartCount: 3,
            state: { Running: { startedAt: "2024-01-01T00:00:00Z" } },
          },
          {
            name: "sidecar",
            ready: false,
            restartCount: 0,
            state: { Waiting: { reason: "ContainerCreating" } },
          },
        ],
      },
    };
    const info = podContainerInfo(podWithStatus);
    expect(info).toHaveLength(2);
    expect(info[0]).toMatchObject({
      name: "app",
      image: "nginx:1.25",
      ready: true,
      restartCount: 3,
      state: "Running",
    });
    expect(info[0].cpuRequest).toBe(100);
    expect(info[0].memoryLimit).toBe(256 * 1024 * 1024);
    expect(info[1]).toMatchObject({
      name: "sidecar",
      ready: false,
      state: "Waiting",
      reason: "ContainerCreating",
    });
  });

  it("returns Unknown state when no containerStatuses exist", () => {
    const info = podContainerInfo(pod);
    expect(info).toHaveLength(2);
    expect(info[0]).toMatchObject({
      name: "app",
      image: "nginx",
      state: "Unknown",
      restartCount: 0,
    });
  });
});

describe("ResourceDetail", () => {
  it("shows Logs and Metrics tabs for pods", () => {
    render(<ResourceDetail kind="Pod" object={pod} ctx={ctx} onOpenChange={() => {}} />, {
      wrapper,
    });
    expect(screen.getByText("Logs")).toBeInTheDocument();
    expect(screen.getByText("Metrics")).toBeInTheDocument();
    expect(screen.queryByText("YAML")).not.toBeInTheDocument();
    expect(screen.queryByText("Raw JSON")).not.toBeInTheDocument();
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
    expect(screen.queryByText("Metrics")).not.toBeInTheDocument();
  });

  it("shows container details for pods with containerStatuses", () => {
    const podWithStatus: K8sObject = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: { name: "pod-a", namespace: "default" },
      spec: { containers: [{ name: "app", image: "nginx" }] },
      status: {
        phase: "Running",
        podIP: "10.0.0.5",
        qosClass: "Burstable",
        containerStatuses: [
          {
            name: "app",
            ready: true,
            restartCount: 1,
            state: { Running: { startedAt: "2024-01-01T00:00:00Z" } },
          },
        ],
      },
    };
    render(<ResourceDetail kind="Pod" object={podWithStatus} ctx={ctx} onOpenChange={() => {}} />, {
      wrapper,
    });

    // Container card shows the container name and image
    expect(screen.getByText("app")).toBeInTheDocument();
    expect(screen.getByText("nginx")).toBeInTheDocument();
    // Container actions menu is present
    expect(screen.getByRole("button", { name: /Actions for app/ })).toBeInTheDocument();
  });

  it("shows annotations section when annotations are present", () => {
    const podWithAnnotations: K8sObject = {
      apiVersion: pod.apiVersion,
      kind: pod.kind,
      metadata: {
        name: "pod-a",
        namespace: "default",
        annotations: { "app.kubernetes.io/version": "1.0.0" },
      },
      spec: pod.spec,
      status: pod.status,
    };
    render(
      <ResourceDetail kind="Pod" object={podWithAnnotations} ctx={ctx} onOpenChange={() => {}} />,
      {
        wrapper,
      },
    );
    expect(screen.getByText("Annotations")).toBeInTheDocument();
    expect(screen.getByText(/app\.kubernetes\.io\/version/)).toBeInTheDocument();
    expect(screen.getByText("1.0.0")).toBeInTheDocument();
  });

  it("shows QoS, Node, and Pod IP in the status card for pods", () => {
    const podFull: K8sObject = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: { name: "pod-a", namespace: "default" },
      spec: { containers: [{ name: "app", image: "nginx" }], nodeName: "worker-1" },
      status: { phase: "Running", podIP: "10.0.0.5", qosClass: "Guaranteed" },
    };
    render(<ResourceDetail kind="Pod" object={podFull} ctx={ctx} onOpenChange={() => {}} />, {
      wrapper,
    });
    expect(screen.getByText("QoS")).toBeInTheDocument();
    expect(screen.getByText("Guaranteed")).toBeInTheDocument();
    expect(screen.getByText("Node")).toBeInTheDocument();
    expect(screen.getByText("worker-1")).toBeInTheDocument();
    expect(screen.getByText("Pod IP")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.5")).toBeInTheDocument();
  });
});
