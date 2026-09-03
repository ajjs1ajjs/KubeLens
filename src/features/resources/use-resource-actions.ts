import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import i18n from "@/i18n";
import { k8sApi } from "@/lib/k8s/api";
import type { ResourceContext } from "@/lib/k8s/types";
import { resourceQueryKey } from "./use-resource-list";

/**
 * Mutations for deleting resources and applying YAML manifests, wired to
 * toast feedback and query invalidation so the table refreshes.
 */
export function useResourceActions(ctx: ResourceContext | null) {
  const queryClient = useQueryClient();

  const invalidate = () => {
    if (!ctx) return;
    void queryClient.invalidateQueries({ queryKey: resourceQueryKey(ctx) });
  };

  const remove = useMutation({
    mutationFn: (name: string) => {
      if (!ctx) throw new Error("No resource context");
      return k8sApi.deleteResource(ctx, name);
    },
    onSuccess: () => {
      toast.success(i18n.t("resources.toasts.resourceDeleted"));
      invalidate();
    },
    onError: (error: unknown) => toast.error(String(error)),
  });

  const apply = useMutation({
    mutationFn: (yaml: string) => {
      if (!ctx) throw new Error("No resource context");
      return k8sApi.applyYaml(ctx, yaml);
    },
    onSuccess: () => {
      toast.success(i18n.t("resources.toasts.manifestApplied"));
      invalidate();
    },
    onError: (error: unknown) => toast.error(String(error)),
  });

  const scale = useMutation({
    mutationFn: (input: { name: string; replicas: number }) => {
      if (!ctx) throw new Error("No resource context");
      return k8sApi.scaleResource(ctx, input.name, input.replicas);
    },
    onSuccess: () => {
      toast.success(i18n.t("resources.toasts.scaled"));
      invalidate();
    },
    onError: (error: unknown) => toast.error(String(error)),
  });

  const restart = useMutation({
    mutationFn: (name: string) => {
      if (!ctx) throw new Error("No resource context");
      return k8sApi.restartResource(ctx, name);
    },
    onSuccess: () => {
      toast.success(i18n.t("resources.toasts.restartRequested"));
      invalidate();
    },
    onError: (error: unknown) => toast.error(String(error)),
  });

  return { remove, apply, scale, restart };
}
