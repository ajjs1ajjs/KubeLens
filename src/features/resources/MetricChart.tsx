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

/** Stacked CPU/RAM usage bars for a pod's containers. */
export function ContainerUsageChart({
  containers,
  cpuCapacity,
  memoryCapacity,
}: {
  containers: { name: string; cpuMillicores: number; memoryBytes: number }[];
  cpuCapacity?: number;
  memoryCapacity?: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {containers.map((container) => (
        <div key={container.name} className="flex flex-col gap-1">
          <span className="text-muted-foreground text-xs">{container.name}</span>
          <MetricBar
            label="CPU"
            value={container.cpuMillicores}
            capacity={cpuCapacity}
            format={formatCpu}
          />
          <MetricBar
            label="Memory"
            value={container.memoryBytes}
            capacity={memoryCapacity}
            format={formatMemory}
          />
        </div>
      ))}
    </div>
  );
}
