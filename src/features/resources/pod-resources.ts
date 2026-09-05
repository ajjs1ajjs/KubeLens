import type { K8sObject } from "@/lib/k8s/types";

export interface ContainerResources {
  name: string;
  cpuRequest?: number;
  cpuLimit?: number;
  memoryRequest?: number;
  memoryLimit?: number;
}

/** CPU/memory requests and limits summed across a pod's containers. */
export interface PodResources {
  containers: ContainerResources[];
  cpuRequest?: number;
  cpuLimit?: number;
  memoryRequest?: number;
  memoryLimit?: number;
}

/** Parses a Kubernetes quantity into millicores (CPU) or bytes (memory). */
export function parseQuantity(
  raw: string | number | undefined,
  kind: "cpu" | "memory",
): number | undefined {
  if (typeof raw === "number") {
    return kind === "cpu" ? raw * 1000 : raw;
  }
  if (typeof raw !== "string" || raw.trim() === "") return undefined;
  const text = raw.trim();

  // Split number from suffix, e.g. "100m", "1Gi", "512Mi", "0.5".
  const match = text.match(/^([0-9]*\.?[0-9]+)\s*([a-zA-Z]*)$/);
  if (!match) return undefined;
  const value = Number(match[1]);
  const suffix = match[2];
  if (Number.isNaN(value)) return undefined;

  if (kind === "cpu") {
    switch (suffix) {
      case "":
        return value * 1000; // cores -> millicores
      case "m":
        return value; // already millicores
      case "n":
        return value / 1_000_000;
      case "u":
        return value / 1000;
      default:
        return undefined;
    }
  }

  // memory
  const binary: Record<string, number> = {
    Ki: 1024,
    Mi: 1024 ** 2,
    Gi: 1024 ** 3,
    Ti: 1024 ** 4,
    Pi: 1024 ** 5,
    Ei: 1024 ** 6,
  };
  if (suffix in binary) return Math.round(value * binary[suffix]);
  const decimal: Record<string, number> = {
    k: 1000,
    M: 1000 ** 2,
    G: 1000 ** 3,
    T: 1000 ** 4,
    P: 1000 ** 5,
    E: 1000 ** 6,
  };
  if (suffix in decimal) return Math.round(value * decimal[suffix]);
  if (suffix === "") return Math.round(value);
  return undefined;
}

function readResource(
  container: K8sObject,
  key: "requests" | "limits",
  kind: "cpu" | "memory",
): number | undefined {
  const resources = container.resources as K8sObject | undefined;
  const block = resources?.[key] as K8sObject | undefined;
  const raw = block?.[kind] as string | number | undefined;
  return parseQuantity(raw, kind);
}

/** Extracts requests/limits from a Pod's containers and aggregates them. */
export function podResources(pod: K8sObject): PodResources {
  const spec = pod.spec as K8sObject | undefined;
  const containers = (spec?.containers ?? []) as K8sObject[];

  let cpuRequest = 0;
  let cpuLimit = 0;
  let memoryRequest = 0;
  let memoryLimit = 0;
  let hasRequest = false;
  let hasLimit = false;

  const parsed = containers.map((container) => {
    const name = (container.name as string) ?? "";
    const reqCpu = readResource(container, "requests", "cpu");
    const limCpu = readResource(container, "limits", "cpu");
    const reqMem = readResource(container, "requests", "memory");
    const limMem = readResource(container, "limits", "memory");
    if (reqCpu !== undefined) {
      cpuRequest += reqCpu;
      hasRequest = true;
    }
    if (limCpu !== undefined) {
      cpuLimit += limCpu;
      hasLimit = true;
    }
    if (reqMem !== undefined) {
      memoryRequest += reqMem;
      hasRequest = true;
    }
    if (limMem !== undefined) {
      memoryLimit += limMem;
      hasLimit = true;
    }
    return {
      name,
      cpuRequest: reqCpu,
      cpuLimit: limCpu,
      memoryRequest: reqMem,
      memoryLimit: limMem,
    };
  });

  return {
    containers: parsed,
    cpuRequest: hasRequest ? cpuRequest : undefined,
    cpuLimit: hasLimit ? cpuLimit : undefined,
    memoryRequest: hasRequest ? memoryRequest : undefined,
    memoryLimit: hasLimit ? memoryLimit : undefined,
  };
}
