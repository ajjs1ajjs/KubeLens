import { Download, RefreshCw, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdate } from "./use-update";

/** Shows a banner when a new app version is available. */
export function UpdateBanner() {
  const { status, version, error, checkForUpdates, installUpdate, dismiss } = useUpdate();

  if (
    status !== "available" &&
    status !== "checking" &&
    status !== "downloading" &&
    status !== "error"
  ) {
    return null;
  }

  const downloading = status === "downloading";

  return (
    <div className="bg-primary/5 border-b">
      <div className="flex items-center gap-3 px-4 py-2 text-sm">
        {status === "checking" && (
          <>
            <RefreshCw className="size-4 animate-spin" />
            <span className="text-muted-foreground">Checking for updates…</span>
          </>
        )}
        {status === "available" && version && (
          <>
            <Rocket className="text-primary size-4" />
            <span className="font-medium">KubeLens {version} is available</span>
            <Button size="sm" onClick={() => void installUpdate()}>
              <Download className="size-3.5" />
              Update now
            </Button>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Later
            </Button>
          </>
        )}
        {downloading && (
          <>
            <RefreshCw className="size-4 animate-spin" />
            <span>Downloading update…</span>
          </>
        )}
        {status === "error" && (
          <>
            <span className="text-destructive text-xs">{error}</span>
            <Button variant="outline" size="sm" onClick={() => void checkForUpdates()}>
              Retry
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
