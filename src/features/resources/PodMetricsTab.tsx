import { Loader2 } from "lucide-react";
import { usePodMetrics } from "./use-metrics";
import { ContainerUsageChart } from "./MetricChart";
import type { ResourceContext } from "@/lib/k8s/types";

interface PodMetricsTabProps {
  ctx: ResourceContext;
  name: string;
}

/** Per-container CPU/RAM usage for a pod. */
export function PodMetricsTab({ ctx, name }: PodMetricsTabProps) {
  const { data, isPending, isError, error } = usePodMetrics(ctx);

  if (isPending) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        Loading metrics…
      </div>
    );
  }
  if (isError) {
    return <p className="text-destructive text-xs">{String(error)}</p>;
  }
  const metric = data?.find((m) => m.name === name);
  if (!metric || metric.containers.length === 0) {
    return (
      <p className="text-muted-foreground text-xs">
        No metrics available — is metrics-server installed?
      </p>
    );
  }
  return <ContainerUsageChart containers={metric.containers} />;
}
