import { useState } from "react";
import { useTranslation } from "react-i18next";
import { GitBranch, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useActiveCluster } from "@/features/clusters/cluster-store";
import { DeleteConfirmDialog } from "@/features/resources/DeleteConfirmDialog";
import { formatAge } from "@/lib/k8s/object";
import {
  releaseStatusTone,
  useHelmRelease,
  useHelmReleases,
  useUninstallHelmRelease,
} from "@/features/helm/use-helm";
import { ReleaseDiffTab } from "@/features/helm/ReleaseDiffTab";
import type { HelmReleaseSummary } from "@/lib/k8s/types";

const STATUS_TONES: Record<string, string> = {
  green: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  red: "border-transparent bg-red-500/15 text-red-700 dark:text-red-400",
  yellow: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400",
  gray: "border-transparent bg-muted text-muted-foreground",
};

function ReleaseStatus({ status }: { status: string }) {
  const tone = releaseStatusTone(status);
  return <Badge className={STATUS_TONES[tone]}>{status}</Badge>;
}

function ReleaseDetailSheet({
  context,
  configId,
  release,
  onOpenChange,
}: {
  context: string;
  configId?: string;
  release: HelmReleaseSummary;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data, isPending, isError, error } = useHelmRelease(context, release.name, configId);

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            <span className="text-muted-foreground mr-2 text-xs font-normal">
              {t("helm.release")}
            </span>
            {release.name}
          </SheetTitle>
          <SheetDescription>
            {release.namespace} · {t("helm.rev")} {release.version} · {t("helm.chart")}{" "}
            {release.chart}-{release.chartVersion}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <ReleaseStatus status={release.status} />
            {release.appVersion && (
              <Badge variant="secondary">
                {t("helm.appVersion", { version: release.appVersion })}
              </Badge>
            )}
          </div>

          {isPending ? (
            <div className="text-muted-foreground flex items-center gap-2 text-xs">
              <Loader2 className="size-3.5 animate-spin" />
              {t("helm.loading")}
            </div>
          ) : isError ? (
            <p className="text-destructive text-xs">{String(error)}</p>
          ) : (
            <Tabs defaultValue="values" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="w-fit">
                <TabsTrigger value="values">{t("helm.values")}</TabsTrigger>
                <TabsTrigger value="manifest">{t("helm.manifest")}</TabsTrigger>
                <TabsTrigger value="notes">{t("helm.notes")}</TabsTrigger>
                <TabsTrigger value="diff">{t("helm.diff")}</TabsTrigger>
              </TabsList>
              <TabsContent value="values" className="min-h-0 flex-1 overflow-auto">
                <pre className="bg-muted/50 rounded-md p-3 text-xs">
                  {data?.values || t("helm.noValues")}
                </pre>
              </TabsContent>
              <TabsContent value="manifest" className="min-h-0 flex-1 overflow-auto">
                <pre className="bg-muted/50 rounded-md p-3 text-xs">{data?.manifest || "—"}</pre>
              </TabsContent>
              <TabsContent value="notes" className="min-h-0 flex-1 overflow-auto">
                <pre className="bg-muted/50 rounded-md p-3 text-xs">{data?.notes || "—"}</pre>
              </TabsContent>
              <TabsContent value="diff" className="min-h-0 flex-1 overflow-hidden">
                <ReleaseDiffTab context={context} name={release.name} />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function HelmPage() {
  const { t } = useTranslation();
  const activeCluster = useActiveCluster();
  const context = activeCluster?.name ?? null;
  const configId = activeCluster?.configId;
  const { data, isPending, isError, error } = useHelmReleases(context, configId);
  const releases = data ?? [];
  const uninstall = useUninstallHelmRelease(context, configId);

  const [selected, setSelected] = useState<HelmReleaseSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<HelmReleaseSummary | null>(null);

  if (!activeCluster) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="text-muted-foreground flex flex-col items-center gap-3 text-center text-sm">
          <GitBranch className="size-8 opacity-50" />
          <p>{t("helm.noCluster")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <div className="flex shrink-0 items-center gap-3">
        <GitBranch className="text-primary size-5" />
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{t("helm.title")}</h1>
          <p className="text-muted-foreground text-xs">
            {t("helm.installedCharts", { name: activeCluster.name })}
          </p>
        </div>
        <span className="text-muted-foreground ml-auto text-sm font-medium tabular-nums">
          {releases.length}
        </span>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-auto rounded-md border">
        {isPending ? (
          <div className="flex flex-col gap-2 p-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError ? (
          <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed p-12 text-sm">
            <p>{t("helm.failedToLoad")}</p>
            <p className="max-w-md truncate text-xs">{String(error)}</p>
          </div>
        ) : releases.length === 0 ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center rounded-md border border-dashed p-12 text-sm">
            {t("helm.noReleases")}
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b">
                <th className="bg-muted/50 text-muted-foreground sticky top-0 z-10 h-9 px-3 text-left font-medium">
                  {t("helm.columns.name")}
                </th>
                <th className="bg-muted/50 text-muted-foreground sticky top-0 z-10 h-9 px-3 text-left font-medium">
                  {t("helm.columns.namespace")}
                </th>
                <th className="bg-muted/50 text-muted-foreground sticky top-0 z-10 h-9 px-3 text-left font-medium">
                  {t("helm.columns.status")}
                </th>
                <th className="bg-muted/50 text-muted-foreground sticky top-0 z-10 h-9 px-3 text-left font-medium">
                  {t("helm.columns.chart")}
                </th>
                <th className="bg-muted/50 text-muted-foreground sticky top-0 z-10 h-9 px-3 text-left font-medium">
                  {t("helm.columns.rev")}
                </th>
                <th className="bg-muted/50 text-muted-foreground sticky top-0 z-10 h-9 px-3 text-left font-medium">
                  {t("helm.columns.age")}
                </th>
                <th className="bg-muted/50 sticky top-0 z-10 h-9 px-3 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {releases.map((release) => (
                <tr
                  key={`${release.namespace}/${release.name}`}
                  onClick={() => setSelected(release)}
                  className="hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
                >
                  <td className="px-3 py-1.5 font-medium">{release.name}</td>
                  <td className="text-muted-foreground px-3 py-1.5">{release.namespace}</td>
                  <td className="px-3 py-1.5">
                    <ReleaseStatus status={release.status} />
                  </td>
                  <td className="text-muted-foreground px-3 py-1.5">
                    {release.chart || "—"}
                    {release.chartVersion ? ` (${release.chartVersion})` : ""}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{release.version}</td>
                  <td className="text-muted-foreground px-3 py-1.5 whitespace-nowrap">
                    {formatAge(release.lastDeployed)}
                  </td>
                  <td className="px-3 py-1.5">
                    <div
                      className="flex items-center justify-end"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Uninstall ${release.name}`}
                        className="text-destructive"
                        onClick={() => setDeleteTarget(release)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <ReleaseDetailSheet
          context={context ?? ""}
          configId={configId}
          release={selected}
          onOpenChange={(open) => !open && setSelected(null)}
        />
      )}

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        kind={t("helm.deleteKind")}
        name={deleteTarget ? deleteTarget.name : ""}
        isDeleting={uninstall.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          uninstall.mutate(deleteTarget.name, {
            onSuccess: () => {
              setDeleteTarget(null);
              if (selected && selected.name === deleteTarget.name) setSelected(null);
            },
          });
        }}
      />
    </div>
  );
}
