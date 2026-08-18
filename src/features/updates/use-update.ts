import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useClusterStore } from "@/features/clusters/cluster-store";

export type UpdateStatus =
  "idle" | "checking" | "available" | "downloading" | "up-to-date" | "error";

export interface UseUpdateResult {
  status: UpdateStatus;
  version: string | null;
  error: string | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  dismiss: () => void;
}

/**
 * Checks for app updates via the Tauri updater plugin. Only runs when a
 * cluster is connected (the app is actively used) so the extra network
 * request doesn't fire on every cold start.
 */
export function useUpdate(): UseUpdateResult {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);
  const connecting = useClusterStore((s) => s.clusters.some((c) => c.connected));
  const checkedOnce = useRef(false);

  const checkForUpdates = useCallback(async () => {
    if (status === "checking" || status === "downloading") return;
    setStatus("checking");
    setError(null);
    try {
      const update = await check();
      updateRef.current = update;
      if (update) {
        setVersion(update.version);
        setStatus("available");
      } else {
        setStatus("up-to-date");
      }
    } catch (err) {
      setError(String(err));
      setStatus("error");
    }
  }, [status]);

  useEffect(() => {
    if (checkedOnce.current || !connecting) return;
    checkedOnce.current = true;
    void checkForUpdates();
  }, [connecting, checkForUpdates]);

  const installUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;
    setStatus("downloading");
    setError(null);
    try {
      await update.downloadAndInstall();
      setStatus("idle");
    } catch (err) {
      setError(String(err));
      setStatus("available");
    }
  }, []);

  const dismiss = useCallback(() => {
    setStatus("idle");
    setVersion(null);
  }, []);

  return { status, version, error, checkForUpdates, installUpdate, dismiss };
}
