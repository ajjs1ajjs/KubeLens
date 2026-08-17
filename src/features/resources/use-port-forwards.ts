import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { k8sApi } from "@/lib/k8s/api";
import type { PortForwardInfo, ResourceContext } from "@/lib/k8s/types";

export const portForwardsQueryKey = ["port-forwards"];

/**
 * Lists active port-forward tunnels and lets the user start/stop them.
 * Tunnels are global to the backend (not per resource view), so the list is
 * cached once and refreshed after mutations.
 */
export function usePortForwards(ctx: ResourceContext | null) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: portForwardsQueryKey,
    queryFn: () => k8sApi.listPortForwards(),
    staleTime: 5_000,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: portForwardsQueryKey });
  }, [queryClient]);

  useEffect(() => {
    if (ctx) invalidate();
  }, [ctx, invalidate]);

  const start = useMutation({
    mutationFn: ({ name, remotePort }: { name: string; remotePort: number }) => {
      if (!ctx) throw new Error("No resource context");
      return k8sApi.startPortForward(ctx, name, remotePort);
    },
    onSuccess: (result) => {
      toast.success(`Port ${result.localPort} forwarded`);
      invalidate();
    },
    onError: (error: unknown) => toast.error(String(error)),
  });

  const stop = useMutation({
    mutationFn: (id: string) => k8sApi.stopPortForward(id),
    onSuccess: () => {
      toast.success("Port forward stopped");
      invalidate();
    },
    onError: (error: unknown) => toast.error(String(error)),
  });

  const forwards: PortForwardInfo[] = query.data ?? [];

  return { forwards, isPending: query.isPending, start, stop };
}
