import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { k8sApi, subscribeWatch } from "@/lib/k8s/api";
import { objectUid } from "@/lib/k8s/object";
import type { K8sObject, ResourceContext } from "@/lib/k8s/types";

export type WatchStatus = "idle" | "starting" | "watching" | "error";

export function resourceQueryKey(ctx: ResourceContext): string[] {
  return ["resources", ctx.context, ctx.group, ctx.version, ctx.kind, ctx.namespace || "__all__"];
}

/**
 * Fetches a resource list and keeps it in sync with the cluster via a
 * Kubernetes watch subscription (streamed through the backend).
 */
export function useResourceList(ctx: ResourceContext | null) {
  const queryClient = useQueryClient();
  const [watching, setWatching] = useState(false);
  const [watchError, setWatchError] = useState<string | null>(null);

  const context = ctx?.context;
  const group = ctx?.group;
  const version = ctx?.version;
  const kind = ctx?.kind;
  const namespaced = ctx?.namespaced ?? false;
  const namespace = ctx?.namespace ?? "";
  const active = ctx !== null;

  const query = useQuery({
    queryKey: ctx ? resourceQueryKey(ctx) : ["resources", "none"],
    queryFn: () => k8sApi.listResources(ctx as ResourceContext),
    enabled: !!ctx,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!active) return;
    const c: ResourceContext = {
      context: context ?? "",
      group: group ?? "",
      version: version ?? "",
      kind: kind ?? "",
      namespaced,
      namespace,
    };
    let disposed = false;
    let unlisten: (() => void) | undefined;
    let watchId: string | undefined;

    void (async () => {
      try {
        watchId = await k8sApi.startWatch(c);
        if (disposed) {
          void k8sApi.stopWatch(watchId);
          return;
        }
        unlisten = await subscribeWatch(watchId, (event) => {
          if (disposed) return;
          if (event.action === "error") {
            setWatchError(event.error ?? "watch failed");
            return;
          }
          setWatchError(null);
          setWatching(true);
          const key = resourceQueryKey(c);
          if (event.action === "upsert" && event.object) {
            const object = event.object;
            queryClient.setQueryData<K8sObject[]>(key, (old = []) => {
              const uid = objectUid(object);
              const index = old.findIndex((o) => objectUid(o) === uid);
              if (index === -1) return [...old, object];
              const next = old.slice();
              next[index] = object;
              return next;
            });
          } else if (event.action === "delete" && event.object) {
            const object = event.object;
            queryClient.setQueryData<K8sObject[]>(key, (old = []) =>
              old.filter((o) => objectUid(o) !== objectUid(object)),
            );
          }
        });
        setWatching(true);
      } catch {
        if (!disposed) setWatchError("failed to start watch");
      }
    })();

    return () => {
      disposed = true;
      unlisten?.();
      if (watchId) void k8sApi.stopWatch(watchId);
    };
  }, [active, context, group, version, kind, namespaced, namespace, queryClient]);

  const watch: WatchStatus = !active
    ? "idle"
    : watchError
      ? "error"
      : watching
        ? "watching"
        : "starting";

  return { ...query, watch };
}
