import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Box,
  Boxes,
  Clock,
  Container,
  Cpu,
  Database,
  FileClock,
  FileText,
  GitBranch,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  Network,
  Server,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";

export interface ResourceTypeMeta {
  kind: string;
  /** Api group, empty for core/v1 resources. */
  group?: string;
  /** Api version without group, e.g. "v1" or "v1beta1". */
  version: string;
  namespaced: boolean;
  label: string;
  icon: LucideIcon;
}

export interface ResourceGroup {
  label: string;
  icon: LucideIcon;
  resources: ResourceTypeMeta[];
}

export const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    label: "Cluster",
    icon: Server,
    resources: [
      { kind: "Node", version: "v1", namespaced: false, label: "Nodes", icon: Server },
      { kind: "Namespace", version: "v1", namespaced: false, label: "Namespaces", icon: Box },
      { kind: "Event", version: "v1", namespaced: true, label: "Events", icon: Activity },
      {
        kind: "CustomResourceDefinition",
        group: "apiextensions.k8s.io",
        version: "v1",
        namespaced: false,
        label: "CRDs",
        icon: Boxes,
      },
    ],
  },
  {
    label: "Workloads",
    icon: Container,
    resources: [
      { kind: "Pod", version: "v1", namespaced: true, label: "Pods", icon: Container },
      {
        kind: "Deployment",
        group: "apps",
        version: "v1",
        namespaced: true,
        label: "Deployments",
        icon: Layers,
      },
      {
        kind: "StatefulSet",
        group: "apps",
        version: "v1",
        namespaced: true,
        label: "StatefulSets",
        icon: Layers,
      },
      {
        kind: "DaemonSet",
        group: "apps",
        version: "v1",
        namespaced: true,
        label: "DaemonSets",
        icon: Layers,
      },
      {
        kind: "ReplicaSet",
        group: "apps",
        version: "v1",
        namespaced: true,
        label: "ReplicaSets",
        icon: Layers,
      },
      {
        kind: "Job",
        group: "batch",
        version: "v1",
        namespaced: true,
        label: "Jobs",
        icon: GitBranch,
      },
      {
        kind: "CronJob",
        group: "batch",
        version: "v1",
        namespaced: true,
        label: "CronJobs",
        icon: Clock,
      },
      {
        kind: "HorizontalPodAutoscaler",
        group: "autoscaling",
        version: "v2",
        namespaced: true,
        label: "HPAs",
        icon: SlidersHorizontal,
      },
      {
        kind: "PodDisruptionBudget",
        group: "policy",
        version: "v1",
        namespaced: true,
        label: "Pod Disruption Budgets",
        icon: FileClock,
      },
    ],
  },
  {
    label: "Network",
    icon: Network,
    resources: [
      { kind: "Service", version: "v1", namespaced: true, label: "Services", icon: Network },
      {
        kind: "Ingress",
        group: "networking.k8s.io",
        version: "v1",
        namespaced: true,
        label: "Ingresses",
        icon: Globe,
      },
      {
        kind: "IngressClass",
        group: "networking.k8s.io",
        version: "v1",
        namespaced: false,
        label: "Ingress Classes",
        icon: Globe,
      },
      {
        kind: "NetworkPolicy",
        group: "networking.k8s.io",
        version: "v1",
        namespaced: true,
        label: "Network Policies",
        icon: ShieldCheck,
      },
      { kind: "Endpoint", version: "v1", namespaced: true, label: "Endpoints", icon: Activity },
      {
        kind: "EndpointSlice",
        group: "discovery.k8s.io",
        version: "v1",
        namespaced: true,
        label: "Endpoint Slices",
        icon: Activity,
      },
    ],
  },
  {
    label: "Storage",
    icon: HardDrive,
    resources: [
      {
        kind: "StorageClass",
        group: "storage.k8s.io",
        version: "v1",
        namespaced: false,
        label: "Storage Classes",
        icon: HardDrive,
      },
      {
        kind: "PersistentVolume",
        version: "v1",
        namespaced: false,
        label: "Persistent Volumes",
        icon: Database,
      },
      {
        kind: "PersistentVolumeClaim",
        version: "v1",
        namespaced: true,
        label: "Persistent Volume Claims",
        icon: HardDrive,
      },
      {
        kind: "VolumeAttachment",
        group: "storage.k8s.io",
        version: "v1",
        namespaced: false,
        label: "Volume Attachments",
        icon: Cpu,
      },
      {
        kind: "CSIDriver",
        group: "storage.k8s.io",
        version: "v1",
        namespaced: false,
        label: "CSI Drivers",
        icon: Cpu,
      },
    ],
  },
  {
    label: "Configuration",
    icon: Settings,
    resources: [
      { kind: "ConfigMap", version: "v1", namespaced: true, label: "ConfigMaps", icon: FileText },
      { kind: "Secret", version: "v1", namespaced: true, label: "Secrets", icon: KeyRound },
      {
        kind: "ResourceQuota",
        version: "v1",
        namespaced: true,
        label: "Resource Quotas",
        icon: SlidersHorizontal,
      },
      {
        kind: "LimitRange",
        version: "v1",
        namespaced: true,
        label: "Limit Ranges",
        icon: SlidersHorizontal,
      },
      {
        kind: "ServiceAccount",
        version: "v1",
        namespaced: true,
        label: "Service Accounts",
        icon: Users,
      },
      {
        kind: "PriorityClass",
        group: "scheduling.k8s.io",
        version: "v1",
        namespaced: false,
        label: "Priority Classes",
        icon: Clock,
      },
    ],
  },
  {
    label: "Access Control",
    icon: ShieldCheck,
    resources: [
      {
        kind: "Role",
        group: "rbac.authorization.k8s.io",
        version: "v1",
        namespaced: true,
        label: "Roles",
        icon: ShieldCheck,
      },
      {
        kind: "RoleBinding",
        group: "rbac.authorization.k8s.io",
        version: "v1",
        namespaced: true,
        label: "Role Bindings",
        icon: Users,
      },
      {
        kind: "ClusterRole",
        group: "rbac.authorization.k8s.io",
        version: "v1",
        namespaced: false,
        label: "Cluster Roles",
        icon: ShieldCheck,
      },
      {
        kind: "ClusterRoleBinding",
        group: "rbac.authorization.k8s.io",
        version: "v1",
        namespaced: false,
        label: "Cluster Role Bindings",
        icon: Users,
      },
    ],
  },
];

export function findResourceType(kind: string): ResourceTypeMeta | undefined {
  for (const group of RESOURCE_GROUPS) {
    const found = group.resources.find((r) => r.kind === kind);
    if (found) return found;
  }
  return undefined;
}

export function resourceApiVersion(meta: ResourceTypeMeta): string {
  return meta.group ? `${meta.group}/${meta.version}` : meta.version;
}

export function resourcePlural(kind: string): string {
  const irregular: Record<string, string> = {
    Endpoint: "endpoints",
    Event: "events",
    Namespace: "namespaces",
    Node: "nodes",
    Pod: "pods",
    Secret: "secrets",
    Service: "services",
  };
  if (irregular[kind]) return irregular[kind];
  return `${kind.toLowerCase()}s`;
}
