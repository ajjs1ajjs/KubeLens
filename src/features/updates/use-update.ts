import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";

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
 * Checks for app updates via the Tauri updater plugin. Runs once on mount
 * (app startup) regardless of cluster state, so users always learn about a
 * new version as soon as the app opens.
 */
export function useUpdate(): UseUpdateResult {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [version, setVersion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const updateRef = useRef<Update | null>(null);
  const checkedOnce = useRef(false);
  const statusRef = useRef<UpdateStatus>("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const checkForUpdates = useCallback(async () => {
    if (statusRef.current === "checking" || statusRef.current === "downloading") return;
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
  }, []);

  useEffect(() => {
    if (checkedOnce.current) return;
    checkedOnce.current = true;
    void checkForUpdates();
    // stable checkForUpdates — run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
