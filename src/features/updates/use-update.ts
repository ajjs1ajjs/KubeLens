import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";

export type UpdateStatus =
  "idle" | "checking" | "available" | "downloading" | "up-to-date" | "error" | "no-release";

export interface UseUpdateResult {
  status: UpdateStatus;
  version: string | null;
  error: string | null;
  progress: number | null;
  checkForUpdates: () => Promise<void>;
  installUpdate: () => Promise<void>;
  openReleasePage: () => Promise<void>;
  dismiss: () => void;
}

const RELEASES_PAGE = "https://github.com/ajjs1ajjs/KubeLens/releases";

const VERSION_RE = /^\d+\.\d+\.\d+([-.+0-9A-Za-z]+)?$/;

function releaseUrlFor(version: string | null): string {
  // Version comes from the update server: validate before interpolating
  // into a URL opened in the system browser.
  if (version && VERSION_RE.test(version)) {
    return `${RELEASES_PAGE}/tag/v${version}`;
  }
  return RELEASES_PAGE;
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
  const [progress, setProgress] = useState<number | null>(null);
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
    setProgress(null);
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
      const msg = String(err);
      if (
        msg.includes("Could not fetch") ||
        msg.includes("JSON") ||
        msg.includes("404") ||
        msg.includes("Not Found")
      ) {
        setStatus("no-release");
        setError(null);
      } else {
        setError(msg);
        setStatus("error");
      }
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
    setProgress(0);
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          setProgress(0);
        } else if (event.event === "Progress") {
          // This plugin version reports chunk bytes without a total:
          // stay indeterminate instead of fabricating a percentage.
          setProgress(null);
        }
      });
      setProgress(100);
      setStatus("idle");
    } catch (err) {
      setError(String(err));
      setStatus("error");
      setProgress(null);
    }
  }, []);

  const openReleasePage = useCallback(async () => {
    const url = releaseUrlFor(version);
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      // Never overwrite the clipboard silently: surface the link instead.
      const { toast } = await import("sonner");
      toast.info(url, {
        description: "Could not open the browser — copy the link manually.",
        duration: 10000,
      });
    }
  }, [version]);

  const dismiss = useCallback(() => {
    setStatus("idle");
    setVersion(null);
    setProgress(null);
  }, []);

  return {
    status,
    version,
    error,
    progress,
    checkForUpdates,
    installUpdate,
    openReleasePage,
    dismiss,
  };
}
