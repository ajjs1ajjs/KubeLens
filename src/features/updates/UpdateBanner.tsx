import { Download, ExternalLink, RefreshCw, Rocket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useUpdate } from "./use-update";

/** Shows a banner when a new app version is available. */
export function UpdateBanner() {
  const { t } = useTranslation();
  const {
    status,
    version,
    error,
    progress,
    checkForUpdates,
    installUpdate,
    openReleasePage,
    dismiss,
  } = useUpdate();

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
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
        {status === "checking" && (
          <>
            <RefreshCw className="size-4 animate-spin" />
            <span className="text-muted-foreground">{t("updates.checking")}</span>
          </>
        )}
        {status === "available" && version && (
          <>
            <Rocket className="text-primary size-4" />
            <button
              type="button"
              className="hover:text-primary inline-flex items-center gap-1 font-medium underline-offset-2 hover:underline"
              onClick={() => void openReleasePage()}
              aria-label={t("updates.openReleasePage")}
            >
              {t("updates.available", { version })}
              <ExternalLink className="size-3" />
            </button>
            <Button size="sm" onClick={() => void installUpdate()}>
              <Download className="size-3.5" />
              {t("common.updateNow")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => void openReleasePage()}>
              <ExternalLink className="size-3.5" />
              {t("updates.downloadOnGithub")}
            </Button>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              {t("common.later")}
            </Button>
          </>
        )}
        {downloading && (
          <>
            <RefreshCw className="size-4 animate-spin" />
            <span>
              {progress !== null && progress > 0 && progress < 100
                ? t("updates.downloadingProgress", { progress })
                : t("updates.downloading")}
            </span>
          </>
        )}
        {status === "error" && (
          <>
            <span className="text-destructive text-xs">{error}</span>
            <Button variant="outline" size="sm" onClick={() => void checkForUpdates()}>
              {t("common.retry")}
            </Button>
            <Button size="sm" onClick={() => void openReleasePage()}>
              <ExternalLink className="size-3.5" />
              {t("updates.downloadOnGithub")}
            </Button>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              {t("common.later")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
