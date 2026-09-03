import { useMemo, useState } from "react";
import { useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Activity, Plus, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useActiveCluster, useClusterStore } from "@/features/clusters/cluster-store";
import { DeleteConfirmDialog } from "@/features/resources/DeleteConfirmDialog";
import { ManifestSheet } from "@/features/resources/ManifestSheet";
import { manifestFromObject, manifestTemplate } from "@/features/resources/manifest";
import { findResourceType, resourceApiVersion } from "@/features/resources/resource-types";
import { ResourceDetail } from "@/features/resources/ResourceDetail";
import { ResourceTable } from "@/features/resources/ResourceTable";
import { RestartConfirmDialog } from "@/features/resources/RestartConfirmDialog";
import { ScaleDialog } from "@/features/resources/ScaleDialog";
import { useResourceActions } from "@/features/resources/use-resource-actions";
import { useResourceList } from "@/features/resources/use-resource-list";
import {
  toNodeMetricLookup,
  toPodMetricLookup,
  useNodeMetrics,
  usePodMetrics,
} from "@/features/resources/use-metrics";
import { meta as objectMeta, readPath } from "@/lib/k8s/object";
import type { K8sObject, ResourceContext } from "@/lib/k8s/types";
import { ResizablePanel } from "@/components/ui/resizable";

export function ResourcePage() {
  const { t } = useTranslation();
  const { kind } = useParams<{ kind: string }>();
  const meta = kind ? findResourceType(kind) : undefined;

  const activeCluster = useActiveCluster();
  const activeNamespace = useClusterStore((s) => s.activeNamespace);
  const [selected, setSelected] = useState<K8sObject | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editObject, setEditObject] = useState<K8sObject | null>(null);
  const [viewObject, setViewObject] = useState<K8sObject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<K8sObject | null>(null);
  const [scaleTarget, setScaleTarget] = useState<K8sObject | null>(null);
  const [restartTarget, setRestartTarget] = useState<K8sObject | null>(null);
  const contextName = activeCluster?.name;
  const configId = activeCluster?.configId;

  const ctx = useMemo<ResourceContext | null>(() => {
    if (!contextName || !meta) return null;
    return {
      context: contextName,
      configId,
      group: meta.group ?? "",
      version: meta.version,
      kind: meta.kind,
      namespaced: meta.namespaced,
      namespace: meta.namespaced ? activeNamespace : "",
    };
  }, [contextName, configId, meta, activeNamespace]);

  const { data, isPending, isError, error, watch } = useResourceList(ctx);
  const objects = data ?? [];
  const { remove, apply, scale, restart } = useResourceActions(ctx);

  const podMetrics = usePodMetrics(kind === "Pod" ? ctx : null);
  const nodeMetrics = useNodeMetrics(kind === "Node" ? ctx : null);
  const metrics = useMemo(
    () =>
      kind === "Pod" || kind === "Node"
        ? {
            pod: toPodMetricLookup(podMetrics.data).byName,
            node: toNodeMetricLookup(nodeMetrics.data).byName,
          }
        : undefined,
    [kind, podMetrics.data, nodeMetrics.data],
  );

  const createTemplate = useMemo(
    () => (meta && ctx ? manifestTemplate(meta, ctx) : ""),
    [meta, ctx],
  );
  const editValue = useMemo(() => (editObject ? manifestFromObject(editObject) : ""), [editObject]);
  const viewValue = useMemo(() => (viewObject ? manifestFromObject(viewObject) : ""), [viewObject]);

  const handleDelete = () => {
    if (!deleteTarget) return;
    const name = objectMeta(deleteTarget).name;
    remove.mutate(name, {
      onSuccess: () => {
        setDeleteTarget(null);
        if (selected && objectMeta(selected).name === name) setSelected(null);
      },
    });
  };

  const handleScale = (replicas: number) => {
    if (!scaleTarget) return;
    scale.mutate(
      { name: objectMeta(scaleTarget).name, replicas },
      { onSuccess: () => setScaleTarget(null) },
    );
  };

  const handleRestart = () => {
    if (!restartTarget) return;
    restart.mutate(objectMeta(restartTarget).name, {
      onSuccess: () => setRestartTarget(null),
    });
  };

  const scaleReplicas = (object: K8sObject): number => {
    const raw = readPath(object, "/spec/replicas");
    return typeof raw === "number" ? raw : 1;
  };

  if (!activeCluster) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <div className="text-muted-foreground flex flex-col items-center gap-3 text-center text-sm">
          <Server className="size-8 opacity-50" />
          <p>{t("resources.page.noCluster")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col p-6">
      <div className="flex shrink-0 items-center gap-3">
        {meta && <meta.icon className="text-primary size-5" />}
        <div className="min-w-0">
          <h1 className="text-lg font-semibold">{meta?.label ?? kind}</h1>
          <p className="text-muted-foreground flex items-center gap-2 text-xs">
            {meta
              ? `${resourceApiVersion(meta)} · ${meta.namespaced ? (activeNamespace ? activeNamespace : t("common.allNamespaces")) : t("common.clusterScoped")}`
              : "Unknown resource type"}
            {watch === "watching" && (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Activity className="size-3" /> {t("common.live")}
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm font-medium tabular-nums">{objects.length}</span>
          <Button size="sm" onClick={() => setCreateOpen(true)} disabled={!ctx}>
            <Plus className="size-4" />
            {t("resources.page.create")}
          </Button>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 gap-0 overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {isPending ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : isError ? (
            <div className="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 rounded-md border border-dashed p-12 text-sm">
              <p>{t("resources.page.failedToLoad", { kind })}</p>
              <p className="max-w-md truncate text-xs">{String(error)}</p>
              <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                {t("common.reload")}
              </Button>
            </div>
          ) : (
            <ResourceTable
              kind={kind ?? "Resource"}
              objects={objects}
              showNamespace={Boolean(meta?.namespaced) && activeNamespace === ""}
              metrics={metrics}
              onSelect={setSelected}
              actions={{
                onViewYaml: setViewObject,
                onEdit: setEditObject,
                onDelete: setDeleteTarget,
                onLogs: (o) => setSelected(o),
                onExec: (o) => setSelected(o),
                onPortForward: (o) => setSelected(o),
                onScale: setScaleTarget,
                onRestart: setRestartTarget,
              }}
            />
          )}
        </div>

        {selected && (
          <ResizablePanel defaultWidth={440} minWidth={320} maxWidth={720}>
            <ResourceDetail
              kind={kind ?? "Resource"}
              object={selected}
              ctx={ctx}
              onOpenChange={(open) => !open && setSelected(null)}
            />
          </ResizablePanel>
        )}
      </div>

      <ManifestSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={t("resources.yaml.createTitle", { label: meta?.label ?? kind })}
        description={t("resources.yaml.createDescription", {
          label: meta?.label?.toLowerCase() ?? kind,
        })}
        initialValue={createTemplate}
        submitLabel="Apply"
        isSubmitting={apply.isPending}
        onSubmit={(yaml) => apply.mutate(yaml, { onSuccess: () => setCreateOpen(false) })}
      />

      <ManifestSheet
        open={editObject !== null}
        onOpenChange={(open) => !open && setEditObject(null)}
        title={t("resources.yaml.editTitle", {
          name: editObject ? objectMeta(editObject).name : "",
        })}
        description={t("resources.yaml.description")}
        initialValue={editValue}
        submitLabel="Save"
        isSubmitting={apply.isPending}
        onSubmit={(yaml) => apply.mutate(yaml, { onSuccess: () => setEditObject(null) })}
      />

      <ManifestSheet
        open={viewObject !== null}
        onOpenChange={(open) => !open && setViewObject(null)}
        title={t("resources.yaml.viewTitle", {
          name: viewObject ? objectMeta(viewObject).name : "",
        })}
        initialValue={viewValue}
        readOnly
      />

      <ScaleDialog
        open={scaleTarget !== null}
        onOpenChange={(open) => !open && setScaleTarget(null)}
        kind={kind ?? "Resource"}
        name={scaleTarget ? objectMeta(scaleTarget).name : ""}
        initialReplicas={scaleTarget ? scaleReplicas(scaleTarget) : 1}
        isSubmitting={scale.isPending}
        onSubmit={handleScale}
      />

      <RestartConfirmDialog
        open={restartTarget !== null}
        onOpenChange={(open) => !open && setRestartTarget(null)}
        kind={kind ?? "Resource"}
        name={restartTarget ? objectMeta(restartTarget).name : ""}
        isSubmitting={restart.isPending}
        onConfirm={handleRestart}
      />

      <DeleteConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        kind={kind ?? "Resource"}
        name={deleteTarget ? objectMeta(deleteTarget).name : ""}
        isDeleting={remove.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
