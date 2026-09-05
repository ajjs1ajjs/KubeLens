import { formatCpu, formatMemory } from "./use-metrics";

interface MetricBarProps {
  label: string;
  /** Usage in the metric's base unit (millicores or bytes). */
  value: number;
  /** Optional capacity to render a percentage fill. */
  capacity?: number;
  format: (value: number) => string;
}

/** A labelled horizontal usage bar. */
export function MetricBar({ label, value, capacity, format }: MetricBarProps) {
  const percent = capacity && capacity > 0 ? Math.min(100, (value / capacity) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-24 shrink-0 text-xs">{label}</span>
      <div className="bg-muted relative h-2 min-w-0 flex-1 overflow-hidden rounded-full">
        <div
          className="bg-primary absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="w-24 shrink-0 text-right text-xs tabular-nums">{format(value)}</span>
    </div>
  );
}

export interface ResourceCapability {
  /** Actual usage. */
  value: number;
  /** Optional requests figure (millicores or bytes). */
  request?: number;
  /** Optional limits figure (millicores or bytes). */
  limit?: number;
}

/** A usage bar with request and limit markers overlaid. */
function UsageWithMarkers({
  label,
  metric,
  format,
}: {
  label: string;
  metric: ResourceCapability;
  format: (value: number) => string;
}) {
  const scale = metric.limit ?? metric.request;
  const percentOf = (v: number | undefined) =>
    scale && scale > 0 ? Math.min(100, (v ?? 0) / scale) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-24 shrink-0 text-xs">{label}</span>
      <div className="relative h-2 min-w-0 flex-1">
        {/* track */}
        <div className="bg-muted absolute inset-0 rounded-full" />
        {/* usage fill */}
        <div
          className="bg-primary absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${percentOf(metric.value)}%` }}
        />
        {/* request marker */}
        {metric.request !== undefined && (
          <div
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-amber-500"
            style={{ left: `${percentOf(metric.request)}%` }}
            title={`request ${format(metric.request)}`}
          />
        )}
        {/* limit marker */}
        {metric.limit !== undefined && (
          <div
            className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-red-500"
            style={{ left: `${percentOf(metric.limit)}%` }}
            title={`limit ${format(metric.limit)}`}
          />
        )}
      </div>
      <span className="w-24 shrink-0 text-right text-xs tabular-nums">{format(metric.value)}</span>
    </div>
  );
}

export interface ResourceUsageRow {
  name: string;
  cpu: ResourceCapability;
  memory: ResourceCapability;
}

/** Usage bars with request/limit markers for a pod's containers. */
export function ContainerUsageChart({ containers }: { containers: ResourceUsageRow[] }) {
  return (
    <div className="flex flex-col gap-2">
      {containers.map((container) => (
        <div key={container.name} className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{container.name}</span>
          <UsageWithMarkers label="CPU" metric={container.cpu} format={formatCpu} />
          <UsageWithMarkers label="Memory" metric={container.memory} format={formatMemory} />
        </div>
      ))}
    </div>
  );
}
