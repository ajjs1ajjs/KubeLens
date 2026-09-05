import { Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePodMetrics } from "./use-metrics";
import { ContainerUsageChart } from "./MetricChart";
import { podResources } from "./pod-resources";
import type { K8sObject, ResourceContext } from "@/lib/k8s/types";

interface PodMetricsTabProps {
  ctx: ResourceContext;
  name: string;
  pod: K8sObject;
}

/** Per-container CPU/RAM usage with request/limit markers for a pod. */
export function PodMetricsTab({ ctx, name, pod }: PodMetricsTabProps) {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = usePodMetrics(ctx);

  if (isPending) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="size-3.5 animate-spin" />
        {t("resources.metrics.loading")}
      </div>
    );
  }
  if (isError) {
    return <p className="text-destructive text-xs">{String(error)}</p>;
  }
  const metric = data?.find((m) => m.name === name);
  const resources = podResources(pod);

  if (!metric || metric.containers.length === 0) {
    return <p className="text-muted-foreground text-xs">{t("resources.metrics.noMetrics")}</p>;
  }

  const rows = metric.containers.map((container) => {
    const spec = resources.containers.find((c) => c.name === container.name);
    return {
      name: container.name,
      cpu: {
        value: container.cpuMillicores,
        request: spec?.cpuRequest,
        limit: spec?.cpuLimit,
      },
      memory: {
        value: container.memoryBytes,
        request: spec?.memoryRequest,
        limit: spec?.memoryLimit,
      },
    };
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground flex items-center gap-1.5">
          <span className="bg-primary size-2 rounded-sm" /> {t("resources.metrics.usage")}
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5">
          <span className="size-0.5 bg-amber-500" /> {t("resources.metrics.request")}
        </span>
        <span className="text-muted-foreground flex items-center gap-1.5">
          <span className="size-0.5 bg-red-500" /> {t("resources.metrics.limit")}
        </span>
      </div>
      <ContainerUsageChart containers={rows} />
    </div>
  );
}
