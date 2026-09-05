import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "@/i18n";
import { k8sApi } from "@/lib/k8s/api";
import type { HelmReleaseDetail, HelmReleaseSummary } from "@/lib/k8s/types";

export function helmReleasesQueryKey(context: string | null, configId?: string): string[] {
  return ["helm", "releases", context ?? "none", configId ?? ""];
}

export function helmReleaseQueryKey(context: string, name: string, configId?: string): string[] {
  return ["helm", "release", context, name, configId ?? ""];
}

export function helmRevisionsQueryKey(context: string, name: string, configId?: string): string[] {
  return ["helm", "revisions", context, name, configId ?? ""];
}

export function helmRevisionQueryKey(
  context: string,
  name: string,
  version: number,
  configId?: string,
): string[] {
  return ["helm", "revision", context, name, String(version), configId ?? ""];
}

/** Lists Helm releases for the active context. */
export function useHelmReleases(context: string | null, configId?: string) {
  return useQuery({
    queryKey: helmReleasesQueryKey(context, configId),
    queryFn: () => k8sApi.listHelmReleases(context as string, configId),
    enabled: Boolean(context),
  });
}

/** Fetches a single release's detail when a release is selected. */
export function useHelmRelease(context: string | null, name: string | null, configId?: string) {
  return useQuery({
    queryKey: helmReleaseQueryKey(context ?? "", name ?? "", configId),
    queryFn: () => k8sApi.getHelmRelease(context as string, name as string, configId),
    enabled: Boolean(context && name),
  });
}

/** Fetches every stored revision of a release. */
export function useHelmRevisions(context: string | null, name: string | null, configId?: string) {
  return useQuery({
    queryKey: helmRevisionsQueryKey(context ?? "", name ?? "", configId),
    queryFn: () => k8sApi.listHelmRevisions(context as string, name as string, configId),
    enabled: Boolean(context && name),
  });
}

/** Fetches the detail for a specific revision. */
export function useHelmReleaseRevision(
  context: string | null,
  name: string | null,
  version: number | null,
  configId?: string,
) {
  return useQuery({
    queryKey: helmRevisionQueryKey(context ?? "", name ?? "", version ?? 0, configId),
    queryFn: () =>
      k8sApi.getHelmReleaseRevision(context as string, name as string, version as number, configId),
    enabled: Boolean(context && name && version !== null),
  });
}

/** Uninstalls a release and invalidates the list. */
export function useUninstallHelmRelease(context: string | null, configId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => {
      if (!context) throw new Error("No cluster selected");
      return k8sApi.uninstallHelmRelease(context, name, configId);
    },
    onSuccess: (_data, name) => {
      toast.success(i18n.t("resources.toasts.releaseUninstalled", { name }));
      void queryClient.invalidateQueries({ queryKey: helmReleasesQueryKey(context, configId) });
    },
    onError: (error: unknown) => toast.error(String(error)),
  });
}

/** Status tone helpers for the release status column. */
export function releaseStatusTone(status: string): "green" | "red" | "yellow" | "gray" {
  switch (status) {
    case "deployed":
      return "green";
    case "failed":
      return "red";
    case "pending-install":
    case "pending-upgrade":
    case "pending-rollback":
    case "uninstalling":
      return "yellow";
    default:
      return "gray";
  }
}

export type { HelmReleaseDetail, HelmReleaseSummary };
