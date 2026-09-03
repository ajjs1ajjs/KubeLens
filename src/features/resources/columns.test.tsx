import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { resourceColumns } from "./columns";

const pod = {
  metadata: { name: "web-0", namespace: "default", creationTimestamp: "2026-01-01T00:00:00Z" },
  status: {
    phase: "Running",
    containerStatuses: [
      { ready: true, restartCount: 0 },
      { ready: true, restartCount: 0 },
    ],
  },
};

const deployment = {
  metadata: { name: "web", namespace: "default", creationTimestamp: "2026-01-01T00:00:00Z" },
  status: { readyReplicas: 2, replicas: 3 },
};

const node = {
  metadata: {
    name: "node-1",
    creationTimestamp: "2026-01-01T00:00:00Z",
    labels: { "node-role.kubernetes.io/worker": "" },
  },
  status: {
    conditions: [{ type: "Ready", status: "True" }],
    nodeInfo: { kubeletVersion: "v1.30.0" },
  },
};

const service = {
  metadata: { name: "api", namespace: "default", creationTimestamp: "2026-01-01T00:00:00Z" },
  spec: { type: "LoadBalancer", clusterIP: "10.0.0.1" },
};

describe("resourceColumns", () => {
  it("defines pod columns", () => {
    const columns = resourceColumns("Pod");
    expect(columns.map((c) => c.id)).toEqual([
      "name",
      "namespace",
      "ready",
      "status",
      "restarts",
      "controlled-by",
      "node",
      "qos",
      "age",
    ]);
  });

  it("renders pod status and readiness", () => {
    const columns = resourceColumns("Pod");
    const status = columns.find((c) => c.id === "status")!;
    const ready = columns.find((c) => c.id === "ready")!;
    render(
      <>
        {status.cell(pod)}
        {ready.cell(pod)}
      </>,
    );
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("2/2")).toBeInTheDocument();
  });

  it("renders Lens-style Pod columns (restarts, controlled-by, node, qos)", () => {
    const owned = {
      metadata: {
        name: "web-0",
        namespace: "default",
        creationTimestamp: "2026-01-01T00:00:00Z",
        ownerReferences: [{ kind: "ReplicaSet", name: "web-abc" }],
      },
      spec: { nodeName: "k8s-dev-wr" },
      status: {
        phase: "Running",
        containerStatuses: [{ ready: true, restartCount: 7 }],
        qosClass: "Burstable",
      },
    };
    const columns = resourceColumns("Pod");
    const find = (id: string) => columns.find((c) => c.id === id)!.cell;
    render(
      <>
        {find("restarts")(owned)}
        {find("controlled-by")(owned)}
        {find("node")(owned)}
        {find("qos")(owned)}
      </>,
    );
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("ReplicaSet/web-abc")).toBeInTheDocument();
    expect(screen.getByText("k8s-dev-wr")).toBeInTheDocument();
    expect(screen.getByText("Burstable")).toBeInTheDocument();
  });

  it("renders deployment replica summary", () => {
    const columns = resourceColumns("Deployment");
    const ready = columns.find((c) => c.id === "ready")!;
    render(<>{ready.cell(deployment)}</>);
    expect(screen.getByText("2/3")).toBeInTheDocument();
  });

  it("renders node status, roles and version", () => {
    const columns = resourceColumns("Node");
    expect(columns.some((c) => c.id === "roles")).toBe(true);
    const status = columns.find((c) => c.id === "status")!;
    const roles = columns.find((c) => c.id === "roles")!;
    const version = columns.find((c) => c.id === "version")!;
    render(
      <>
        {status.cell(node)}
        {roles.cell(node)}
        {version.cell(node)}
      </>,
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("worker")).toBeInTheDocument();
    expect(screen.getByText("v1.30.0")).toBeInTheDocument();
  });

  it("renders service type and cluster IP", () => {
    const columns = resourceColumns("Service");
    const type = columns.find((c) => c.id === "type")!;
    const ip = columns.find((c) => c.id === "cluster-ip")!;
    render(
      <>
        {type.cell(service)}
        {ip.cell(service)}
      </>,
    );
    expect(screen.getByText("LoadBalancer")).toBeInTheDocument();
    expect(screen.getByText("10.0.0.1")).toBeInTheDocument();
  });

  it("adds CPU/memory columns when metrics are provided", () => {
    const columns = resourceColumns("Pod", {
      pod: new Map([
        [
          "web-0",
          {
            name: "web-0",
            namespace: "default",
            cpuMillicores: 125,
            memoryBytes: 64 << 20,
            containers: [],
          },
        ],
      ]),
      node: new Map(),
    });
    expect(columns.some((c) => c.id === "cpu")).toBe(true);
    expect(columns.some((c) => c.id === "memory")).toBe(true);
    const cpu = columns.find((c) => c.id === "cpu")!;
    const mem = columns.find((c) => c.id === "memory")!;
    render(
      <>
        {cpu.cell(pod)}
        {mem.cell(pod)}
      </>,
    );
    expect(screen.getByText("125m")).toBeInTheDocument();
    expect(screen.getByText("64 Mi")).toBeInTheDocument();
  });

  it("shows an em dash when metrics are missing for a row", () => {
    const columns = resourceColumns("Pod", { pod: new Map(), node: new Map() });
    const cpu = columns.find((c) => c.id === "cpu")!;
    render(<>{cpu.cell(pod)}</>);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
