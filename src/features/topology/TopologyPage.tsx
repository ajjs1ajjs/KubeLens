import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Network, RefreshCw, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveCluster, useClusterStore } from "@/features/clusters/cluster-store";
import { useTopology } from "./use-topology";
import { NODE_HEIGHT, NODE_WIDTH, nodeKindColor, type TopologyNode } from "./topology";
import { ResourceDetail } from "@/features/resources/ResourceDetail";
import { findResourceType } from "@/features/resources/resource-types";
import { meta } from "@/lib/k8s/object";
import type { K8sObject, ResourceContext } from "@/lib/k8s/types";

function NodeLabel({ node }: { node: TopologyNode }) {
  return (
    <text
      x={NODE_WIDTH / 2}
      y={NODE_HEIGHT / 2 + 4}
      textAnchor="middle"
      className="fill-foreground text-[11px] font-medium"
      style={{ pointerEvents: "none" }}
    >
      {node.name.length > 18 ? `${node.name.slice(0, 17)}…` : node.name}
    </text>
  );
}

function GraphNode({
  node,
  onSelect,
}: {
  node: TopologyNode;
  onSelect: (node: TopologyNode) => void;
}) {
  const color = nodeKindColor(node.kind);
  return (
    <g
      transform={`translate(${node.x}, ${node.y})`}
      className="cursor-pointer"
      onClick={() => onSelect(node)}
      role="button"
      aria-label={`${node.resourceKind} ${node.name}`}
    >
      <rect
        width={NODE_WIDTH}
        height={NODE_HEIGHT}
        rx={6}
        className="fill-card stroke-[1.5]"
        style={{ stroke: color }}
      />
      <rect x={0} y={0} width={4} height={NODE_HEIGHT} rx={2} style={{ fill: color }} />
      <NodeLabel node={node} />
    </g>
  );
}

function GraphEdge({ from, to, nodes }: { from: string; to: string; nodes: TopologyNode[] }) {
  const source = nodes.find((n) => n.id === from);
  const target = nodes.find((n) => n.id === to);
  if (!source || !target) return null;

  const x1 = source.x + NODE_WIDTH;
  const y1 = source.y + NODE_HEIGHT / 2;
  const x2 = target.x;
  const y2 = target.y + NODE_HEIGHT / 2;
  const mid = (x1 + x2) / 2;

  return (
    <path
      d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
      className="stroke-muted-foreground/50 fill-none"
      strokeWidth={1}
      markerEnd="url(#arrow)"
    />
  );
}

export function TopologyPage() {
  const { t } = useTranslation();
  const activeCluster = useActiveCluster();
  const activeNamespace = useClusterStore((s) => s.activeNamespace);
  const [selected, setSelected] = useState<TopologyNode | null>(null);
  const [zoom, setZoom] = useState(1);

  const ctx = useMemo<ResourceContext | null>(() => {
    if (!activeCluster) return null;
    return {
      context: activeCluster.name,
      configId: activeCluster.configId,
      group: "",
      version: "v1",
      kind: "Pod",
      namespaced: true,
      namespace: activeNamespace,
    };
  }, [activeCluster, activeNamespace]);

  const { graph, data, isPending, isError, error, refetch, isFetching } = useTopology(ctx);

  const selectedObject = useMemo<K8sObject | null>(() => {
    if (!selected) return null;
    return (
      data?.find((o) => o.kind === selected.resourceKind && meta(o).name === selected.name) ?? null
    );
  }, [selected, data]);

  const selectedCtx = useMemo<ResourceContext | null>(() => {
    if (!selected || !activeCluster) return null;
    const type = findResourceType(selected.resourceKind);
    return {
      context: activeCluster.name,
      group: type?.group ?? "",
      version: type?.version ?? "v1",
      kind: selected.resourceKind,
      namespaced: type?.namespaced ?? true,
      namespace: selected.namespace || activeNamespace,
    };
  }, [selected, activeCluster, activeNamespace]);

  if (!activeCluster) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="text-muted-foreground flex flex-col items-center gap-3 text-center text-sm">
          <Network className="size-8 opacity-50" />
          <p>{t("topology.noCluster")}</p>
        </div>
      </div>
    );
  }

  const width = graph.metrics?.width ?? 600;
  const height = graph.metrics?.height ?? 300;

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <div className="flex shrink-0 items-center gap-3">
        <Network className="text-primary size-5" />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{t("topology.title")}</h1>
          <p className="text-muted-foreground text-xs">
            {t("topology.summary", {
              namespace: activeNamespace || t("topology.allNamespaces"),
              nodes: graph.nodes.length,
              edges: graph.edges.length,
            })}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("topology.zoomOut")}
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
          >
            <ZoomOut className="size-3.5" />
          </Button>
          <span className="text-muted-foreground w-8 text-center text-xs tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("topology.zoomIn")}
            onClick={() => setZoom((z) => Math.min(2, z + 0.2))}
          >
            <ZoomIn className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("topology.refresh")}
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`size-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
        {isPending ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-xs">
            <Skeleton className="size-4 rounded-full" />
            {t("topology.loading")}
          </div>
        ) : isError ? (
          <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed p-12 text-sm">
            <p>{t("topology.failedToLoad")}</p>
            <p className="max-w-md truncate text-xs">{String(error)}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : graph.nodes.length === 0 ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center rounded-md border border-dashed p-12 text-sm">
            {t("topology.nothingToGraph")}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto p-6">
            <svg
              viewBox={`-40 -${height / 2 + 20} ${width + 80} ${height + 40}`}
              style={{ width: (width + 80) * zoom, height: (height + 40) * zoom }}
              className="shrink-0"
              role="img"
              aria-label="Dependency graph"
            >
              <defs>
                <marker
                  id="arrow"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground/60" />
                </marker>
              </defs>
              {graph.edges.map((edge) => (
                <GraphEdge key={edge.id} from={edge.from} to={edge.to} nodes={graph.nodes} />
              ))}
              {graph.nodes.map((node) => (
                <GraphNode key={node.id} node={node} onSelect={setSelected} />
              ))}
            </svg>
          </div>
        )}
      </div>

      {selected && selectedObject && selectedCtx && (
        <ResourceDetail
          kind={selected.resourceKind}
          object={selectedObject}
          ctx={selectedCtx}
          onOpenChange={(open) => !open && setSelected(null)}
        />
      )}
    </div>
  );
}
