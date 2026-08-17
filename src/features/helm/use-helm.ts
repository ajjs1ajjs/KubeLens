import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { k8sApi } from "@/lib/k8s/api";
import type { HelmReleaseDetail, HelmReleaseSummary } from "@/lib/k8s/types";

export function helmReleasesQueryKey(context: string | null): string[] {
  return ["helm", "releases", context ?? "none"];
}

export function helmReleaseQueryKey(context: string, name: string): string[] {
  return ["helm", "release", context, name];
}

/** Lists Helm releases for the active context. */
export function useHelmReleases(context: string | null) {
  return useQuery({
    queryKey: helmReleasesQueryKey(context),
    queryFn: () => k8sApi.listHelmReleases(context as string),
    enabled: Boolean(context),
  });
}

/** Fetches a single release's detail when a release is selected. */
export function useHelmRelease(context: string | null, name: string | null) {
  return useQuery({
    queryKey: helmReleaseQueryKey(context ?? "", name ?? ""),
    queryFn: () => k8sApi.getHelmRelease(context as string, name as string),
    enabled: Boolean(context && name),
  });
}

/** Uninstalls a release and invalidates the list. */
export function useUninstallHelmRelease(context: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => {
      if (!context) throw new Error("No cluster selected");
      return k8sApi.uninstallHelmRelease(context, name);
    },
    onSuccess: (_data, name) => {
      toast.success(`Release "${name}" uninstalled`);
      void queryClient.invalidateQueries({ queryKey: helmReleasesQueryKey(context) });
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
