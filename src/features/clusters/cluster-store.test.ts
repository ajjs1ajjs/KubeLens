import { beforeEach, describe, expect, it } from "vitest";
import { useClusterStore } from "./cluster-store";

const cluster = (id: string) => ({
  id,
  name: id,
  server: "https://x",
  current: false,
  connected: true,
});

describe("cluster-store", () => {
  beforeEach(() => {
    useClusterStore.setState({
      clusters: [],
      configs: [],
      activeClusterId: null,
      activeNamespace: "",
    });
  });

  it("upserts clusters by id", () => {
    useClusterStore.getState().upsertCluster({ ...cluster("a"), connected: true });
    useClusterStore
      .getState()
      .upsertCluster({ ...cluster("a"), name: "dev2", server: "https://y" });

    const { clusters } = useClusterStore.getState();
    expect(clusters).toHaveLength(1);
    expect(clusters[0].name).toBe("dev2");
  });

  it("adds distinct clusters and removes one", () => {
    useClusterStore.getState().upsertCluster({ ...cluster("a"), connected: true });
    useClusterStore.getState().upsertCluster({ ...cluster("b"), connected: false });

    useClusterStore.getState().setActiveCluster("a");
    useClusterStore.getState().removeCluster("a");

    const { clusters, activeClusterId } = useClusterStore.getState();
    expect(clusters).toHaveLength(1);
    expect(clusters[0].id).toBe("b");
    expect(activeClusterId).toBeNull();
  });

  it("patches cluster connectivity state", () => {
    useClusterStore.getState().upsertCluster({ ...cluster("a"), connected: true });

    useClusterStore.getState().setClusterState("a", { connected: false, error: "timeout" });
    const c = useClusterStore.getState().clusters[0];
    expect(c.connected).toBe(false);
    expect(c.error).toBe("timeout");
  });

  it("syncs clusters from the backend and selects the current context", () => {
    useClusterStore.getState().syncClusters([
      {
        name: "dev",
        server: "https://dev",
        namespace: null,
        current: false,
        connected: false,
        version: null,
        error: null,
      },
      {
        name: "prod",
        server: "https://prod",
        namespace: "team",
        current: true,
        connected: false,
        version: null,
        error: null,
      },
    ]);

    const { clusters, activeClusterId } = useClusterStore.getState();
    expect(clusters).toHaveLength(2);
    expect(clusters[0].namespace).toBeNull();
    expect(clusters[1].namespace).toBe("team");
    expect(clusters[1].current).toBe(true);
    expect(activeClusterId).toBe("prod");
  });

  it("preserves connectivity across a sync", () => {
    useClusterStore.getState().upsertCluster({
      ...cluster("dev"),
      connected: true,
      version: "v1.30",
    });
    useClusterStore.getState().syncClusters([
      {
        name: "dev",
        server: "https://dev",
        namespace: null,
        current: true,
        connected: false,
        version: null,
        error: null,
      },
    ]);

    const { clusters } = useClusterStore.getState();
    expect(clusters[0].connected).toBe(true);
    expect(clusters[0].version).toBe("v1.30");
  });

  it("sets and resets the active namespace", () => {
    useClusterStore.getState().setActiveNamespace("kube-system");
    expect(useClusterStore.getState().activeNamespace).toBe("kube-system");
    useClusterStore.getState().setActiveNamespace("");
    expect(useClusterStore.getState().activeNamespace).toBe("");
  });

  it("loads configs and shows only the active config's contexts", () => {
    const summary = (name: string, current: boolean) => ({
      name,
      server: `https://${name}`,
      namespace: null,
      current,
      connected: false,
      version: null,
      error: null,
    });
    useClusterStore.getState().setConfigs([
      {
        id: "cfg-a",
        name: "Alpha",
        path: "/a",
        active: false,
        contexts: [summary("alpha-ctx", true)],
      },
      {
        id: "cfg-b",
        name: "Beta",
        path: "/b",
        active: true,
        contexts: [summary("beta-ctx", true), summary("beta-ctx2", false)],
      },
    ]);

    const { configs, clusters, activeClusterId } = useClusterStore.getState();
    expect(configs).toHaveLength(2);
    expect(clusters).toHaveLength(2);
    expect(clusters.map((c) => c.id)).toEqual(["beta-ctx", "beta-ctx2"]);
    expect(activeClusterId).toBe("beta-ctx");
  });
});
