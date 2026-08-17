import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { k8sApi, subscribeLogs } from "@/lib/k8s/api";
import type { ResourceContext } from "@/lib/k8s/types";

export function logsQueryKey(ctx: ResourceContext, name: string, container?: string): string[] {
  return ["logs", ctx.context, ctx.namespace, name, container ?? ""];
}

export interface UseLogsResult {
  /** Full log text fetched on demand. */
  text: string | undefined;
  isPending: boolean;
  error: string | null;
  /** Live lines accumulated while following. */
  liveLines: string[];
  following: boolean;
  followError: string | null;
  startFollowing: () => void;
  stopFollowing: () => void;
  refresh: () => void;
}

/**
 * Fetches a pod's logs and can tail them live. `following` toggles a backend
 * follow-log subscription whose lines arrive via `kubelens://logs` events.
 */
export function useLogs(
  ctx: ResourceContext | null,
  name: string,
  container?: string,
): UseLogsResult {
  const query = useQuery({
    queryKey: ctx ? logsQueryKey(ctx, name, container) : ["logs", "none"],
    queryFn: () => k8sApi.getLogs(ctx as ResourceContext, name, container),
    enabled: Boolean(ctx),
    staleTime: 30_000,
  });

  const [following, setFollowing] = useState(false);
  const [liveLines, setLiveLines] = useState<string[]>([]);
  const [followError, setFollowError] = useState<string | null>(null);
  const unlisten = useRef<(() => void) | null>(null);
  const activeId = useRef<string | null>(null);

  // Reset accumulated lines when switching to a different pod/container.
  const [lastKey, setLastKey] = useState("");
  const key = `${name}:${container ?? ""}`;
  if (lastKey !== key) {
    setLastKey(key);
    setLiveLines([]);
    setFollowError(null);
  }

  const teardown = useCallback((id?: string) => {
    unlisten.current?.();
    unlisten.current = null;
    const toStop = id ?? activeId.current;
    if (toStop) {
      activeId.current = null;
      void k8sApi.stopFollowLogs(toStop);
    }
  }, []);

  const stopFollowing = useCallback(() => {
    teardown();
    setFollowing(false);
  }, [teardown]);

  const startFollowing = useCallback(() => {
    if (!ctx) return;
    teardown();
    let disposed = false;
    void (async () => {
      try {
        const id = await k8sApi.followLogs(ctx, name, container);
        if (disposed) {
          void k8sApi.stopFollowLogs(id);
          return;
        }
        activeId.current = id;
        setFollowError(null);
        unlisten.current = await subscribeLogs(id, (event) => {
          if (event.action === "error") {
            setFollowError(event.error ?? "follow failed");
            return;
          }
          const line = event.line;
          if (event.action === "line" && line !== undefined) {
            setLiveLines((lines) => [...lines, line]);
          }
          if (event.action === "done") {
            setFollowing(false);
          }
        });
        setFollowing(true);
      } catch {
        if (!disposed) setFollowError("failed to start following logs");
      }
    })();
    return () => {
      disposed = true;
    };
  }, [ctx, name, container, teardown]);

  useEffect(() => {
    return stopFollowing;
  }, [stopFollowing]);

  useEffect(() => {
    teardown();
  }, [name, container, teardown]);

  const refresh = useCallback(() => {
    void query.refetch();
  }, [query]);

  return {
    text: query.data,
    isPending: query.isPending,
    error: query.error ? String(query.error) : null,
    liveLines,
    following,
    followError,
    startFollowing,
    stopFollowing,
    refresh,
  };
}
