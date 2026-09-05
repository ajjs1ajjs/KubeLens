import type { K8sObject } from "@/lib/k8s/types";
import { parseQuantity } from "./pod-resources";

export interface ContainerPort {
  name?: string;
  containerPort: number;
  protocol?: string;
  hostPort?: number;
}

export interface EnvVar {
  name: string;
  value?: string;
  valueFrom?: Record<string, unknown>;
}

export interface VolumeMount {
  name: string;
  mountPath: string;
  readOnly?: boolean;
  subPath?: string;
}

export interface ProbeHandler {
  exec?: { command?: string[] };
  httpGet?: { path?: string; port?: number | string; host?: string; scheme?: string };
  tcpSocket?: { port?: number | string };
  grpc?: { port?: number; service?: string };
}

export interface ContainerProbe {
  initialDelaySeconds?: number;
  timeoutSeconds?: number;
  periodSeconds?: number;
  successThreshold?: number;
  failureThreshold?: number;
  terminationGracePeriodSeconds?: number;
  handler: ProbeHandler;
}

export interface SecurityContext {
  privileged?: boolean;
  runAsUser?: number;
  runAsGroup?: number;
  readOnlyRootFilesystem?: boolean;
  capabilities?: { add?: string[]; drop?: string[] };
  allowPrivilegeEscalation?: boolean;
}

/** Per-container detail rendered in the resource detail panel. */
export interface ContainerInfo {
  name: string;
  image: string;
  imagePullPolicy?: string;
  ready: boolean;
  restartCount: number;
  state: "Running" | "Waiting" | "Terminated" | "Unknown";
  reason?: string;
  message?: string;
  cpuRequest?: number;
  cpuLimit?: number;
  memoryRequest?: number;
  memoryLimit?: number;
  ports: ContainerPort[];
  env: EnvVar[];
  volumeMounts: VolumeMount[];
  command?: string[];
  args?: string[];
  livenessProbe?: ContainerProbe;
  readinessProbe?: ContainerProbe;
  startupProbe?: ContainerProbe;
  securityContext?: SecurityContext;
  stdin?: boolean;
  tty?: boolean;
  workingDir?: string;
}

interface RawStatus {
  name?: string;
  ready?: boolean;
  restartCount?: number;
  state?: Record<string, unknown>;
  reason?: string;
  message?: string;
}

function readProbe(raw: Record<string, unknown> | undefined): ContainerProbe | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const handler: ProbeHandler = {};
  if (raw.exec && typeof raw.exec === "object") handler.exec = raw.exec as ProbeHandler["exec"];
  if (raw.httpGet && typeof raw.httpGet === "object")
    handler.httpGet = raw.httpGet as ProbeHandler["httpGet"];
  if (raw.tcpSocket && typeof raw.tcpSocket === "object")
    handler.tcpSocket = raw.tcpSocket as ProbeHandler["tcpSocket"];
  if (raw.grpc && typeof raw.grpc === "object") handler.grpc = raw.grpc as ProbeHandler["grpc"];
  return {
    initialDelaySeconds:
      typeof raw.initialDelaySeconds === "number" ? raw.initialDelaySeconds : undefined,
    timeoutSeconds: typeof raw.timeoutSeconds === "number" ? raw.timeoutSeconds : undefined,
    periodSeconds: typeof raw.periodSeconds === "number" ? raw.periodSeconds : undefined,
    successThreshold: typeof raw.successThreshold === "number" ? raw.successThreshold : undefined,
    failureThreshold: typeof raw.failureThreshold === "number" ? raw.failureThreshold : undefined,
    terminationGracePeriodSeconds:
      typeof raw.terminationGracePeriodSeconds === "number"
        ? raw.terminationGracePeriodSeconds
        : undefined,
    handler,
  };
}

function readSecurityContext(
  raw: Record<string, unknown> | undefined,
): SecurityContext | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const ctx: SecurityContext = {};
  if (typeof raw.privileged === "boolean") ctx.privileged = raw.privileged;
  if (typeof raw.runAsUser === "number") ctx.runAsUser = raw.runAsUser;
  if (typeof raw.runAsGroup === "number") ctx.runAsGroup = raw.runAsGroup;
  if (typeof raw.readOnlyRootFilesystem === "boolean")
    ctx.readOnlyRootFilesystem = raw.readOnlyRootFilesystem;
  if (typeof raw.allowPrivilegeEscalation === "boolean")
    ctx.allowPrivilegeEscalation = raw.allowPrivilegeEscalation;
  if (raw.capabilities && typeof raw.capabilities === "object") {
    const caps = raw.capabilities as Record<string, unknown>;
    ctx.capabilities = {
      add: Array.isArray(caps.add) ? (caps.add as string[]) : undefined,
      drop: Array.isArray(caps.drop) ? (caps.drop as string[]) : undefined,
    };
  }
  return ctx;
}

export function formatProbeHandler(handler: ProbeHandler): string {
  if (handler.httpGet) {
    const { path = "/", port, scheme = "HTTP" } = handler.httpGet;
    return `${scheme} GET ${path} :${port}`;
  }
  if (handler.tcpSocket) return `TCP :${handler.tcpSocket.port}`;
  if (handler.exec?.command) return `exec ${handler.exec.command.join(" ")}`;
  if (handler.grpc) return `gRPC :${handler.grpc.port}`;
  return "—";
}
/** Extracts per-container info (status, image, resources, probes, env, ports) from a Pod. */
export function podContainerInfo(pod: K8sObject): ContainerInfo[] {
  const spec = pod.spec as Record<string, unknown> | undefined;
  const status = pod.status as Record<string, unknown> | undefined;
  const containers = (spec?.containers ?? []) as Record<string, unknown>[];
  const statuses = (status?.containerStatuses ?? []) as RawStatus[];

  return containers.map((container): ContainerInfo => {
    const name = typeof container.name === "string" ? container.name : "";
    const image = typeof container.image === "string" ? container.image : "";
    const imagePullPolicy =
      typeof container.imagePullPolicy === "string" ? container.imagePullPolicy : undefined;

    const cs = statuses.find((s) => s.name === name) ?? {};
    const ready = cs.ready === true;
    const restartCount = typeof cs.restartCount === "number" ? cs.restartCount : 0;

    const stateObj = cs.state;
    let state: ContainerInfo["state"] = "Unknown";
    let reason: string | undefined;
    let message: string | undefined;

    if (stateObj && typeof stateObj === "object") {
      const keys = ["Running", "Waiting", "Terminated"];
      for (const key of keys) {
        if (key in stateObj) {
          state = key as ContainerInfo["state"];
          const details = stateObj[key] as Record<string, unknown> | undefined;
          if (details) {
            reason = typeof details.reason === "string" ? details.reason : undefined;
            message = typeof details.message === "string" ? details.message : undefined;
          }
          break;
        }
      }
    }

    const resources = container.resources as Record<string, unknown> | undefined;
    const reqBlock = resources?.requests as Record<string, unknown> | undefined;
    const limBlock = resources?.limits as Record<string, unknown> | undefined;

    const ports: ContainerPort[] = Array.isArray(container.ports)
      ? (container.ports as Record<string, unknown>[]).map((p) => ({
          name: typeof p.name === "string" ? p.name : undefined,
          containerPort: typeof p.containerPort === "number" ? p.containerPort : 0,
          protocol: typeof p.protocol === "string" ? p.protocol : undefined,
          hostPort: typeof p.hostPort === "number" ? p.hostPort : undefined,
        }))
      : [];

    const env: EnvVar[] = Array.isArray(container.env)
      ? (container.env as Record<string, unknown>[]).map((e) => ({
          name: typeof e.name === "string" ? e.name : "",
          value: typeof e.value === "string" ? e.value : undefined,
          valueFrom: e.valueFrom as Record<string, unknown> | undefined,
        }))
      : [];

    const volumeMounts: VolumeMount[] = Array.isArray(container.volumeMounts)
      ? (container.volumeMounts as Record<string, unknown>[]).map((vm) => ({
          name: typeof vm.name === "string" ? vm.name : "",
          mountPath: typeof vm.mountPath === "string" ? vm.mountPath : "",
          readOnly: typeof vm.readOnly === "boolean" ? vm.readOnly : undefined,
          subPath: typeof vm.subPath === "string" ? vm.subPath : undefined,
        }))
      : [];

    return {
      name,
      image,
      imagePullPolicy,
      ready,
      restartCount,
      state,
      reason,
      message,
      cpuRequest: reqBlock ? parseQuantity(reqBlock.cpu as string | number, "cpu") : undefined,
      cpuLimit: limBlock ? parseQuantity(limBlock.cpu as string | number, "cpu") : undefined,
      memoryRequest: reqBlock
        ? parseQuantity(reqBlock.memory as string | number, "memory")
        : undefined,
      memoryLimit: limBlock
        ? parseQuantity(limBlock.memory as string | number, "memory")
        : undefined,
      ports,
      env,
      volumeMounts,
      command: Array.isArray(container.command) ? (container.command as string[]) : undefined,
      args: Array.isArray(container.args) ? (container.args as string[]) : undefined,
      livenessProbe: readProbe(container.livenessProbe as Record<string, unknown> | undefined),
      readinessProbe: readProbe(container.readinessProbe as Record<string, unknown> | undefined),
      startupProbe: readProbe(container.startupProbe as Record<string, unknown> | undefined),
      securityContext: readSecurityContext(
        container.securityContext as Record<string, unknown> | undefined,
      ),
      stdin: typeof container.stdin === "boolean" ? container.stdin : undefined,
      tty: typeof container.tty === "boolean" ? container.tty : undefined,
      workingDir: typeof container.workingDir === "string" ? container.workingDir : undefined,
    };
  });
}
