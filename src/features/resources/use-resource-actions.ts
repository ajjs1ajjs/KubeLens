import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
      toast.success("Resource deleted");
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
      toast.success("Manifest applied");
      invalidate();
    },
    onError: (error: unknown) => toast.error(String(error)),
  });

  return { remove, apply };
}
