import type { ReactNode } from "react";
import { Ellipsis, Eye, Pencil, RotateCcw, Scaling, ScrollText, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { meta } from "@/lib/k8s/object";
import type { K8sObject } from "@/lib/k8s/types";

const POD_ONLY = new Set(["Pod"]);
const SCALABLE = new Set(["Deployment", "StatefulSet", "ReplicaSet"]);
const RESTARTABLE = new Set(["Deployment", "StatefulSet", "DaemonSet", "CronJob"]);

export interface RowActions {
  onViewYaml?: (object: K8sObject) => void;
  onEdit?: (object: K8sObject) => void;
  onDelete?: (object: K8sObject) => void;
  onLogs?: (object: K8sObject) => void;
  onScale?: (object: K8sObject) => void;
  onRestart?: (object: K8sObject) => void;
}

interface RowActionsMenuProps {
  object: K8sObject;
  kind: string;
  actions: RowActions;
}

type MenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  destructive?: boolean;
};

export function RowActionsMenu({ object, kind, actions }: RowActionsMenuProps) {
  const { t } = useTranslation();
  const isPod = POD_ONLY.has(kind);
  const scalable = SCALABLE.has(kind);
  const restartable = RESTARTABLE.has(kind);
  const name = meta(object).name;

  const general: MenuItem[] = [];
  const workload: MenuItem[] = [];
  const danger: MenuItem[] = [];

  if (actions.onViewYaml) {
    general.push({
      key: "view",
      label: t("resources.actions.viewYaml"),
      icon: <Eye className="size-3.5 opacity-70" />,
      onSelect: () => actions.onViewYaml?.(object),
    });
  }
  if (actions.onEdit) {
    general.push({
      key: "edit",
      label: t("resources.actions.edit"),
      icon: <Pencil className="size-3.5 opacity-70" />,
      onSelect: () => actions.onEdit?.(object),
    });
  }
  if (isPod && actions.onLogs) {
    workload.push({
      key: "logs",
      label: t("resources.actions.logs"),
      icon: <ScrollText className="size-3.5 opacity-70" />,
      onSelect: () => actions.onLogs?.(object),
    });
  }
  if (scalable && actions.onScale) {
    workload.push({
      key: "scale",
      label: t("resources.actions.scale"),
      icon: <Scaling className="size-3.5 opacity-70" />,
      onSelect: () => actions.onScale?.(object),
    });
  }
  if (restartable && actions.onRestart) {
    workload.push({
      key: "restart",
      label: t("resources.actions.restart"),
      icon: <RotateCcw className="size-3.5 opacity-70" />,
      onSelect: () => actions.onRestart?.(object),
    });
  }
  if (actions.onDelete) {
    danger.push({
      key: "delete",
      label: t("resources.actions.delete"),
      icon: <Trash2 className="size-3.5" />,
      onSelect: () => actions.onDelete?.(object),
      destructive: true,
    });
  }

  const hasAny = general.length + workload.length + danger.length > 0;
  if (!hasAny) return null;

  const renderItems = (items: MenuItem[]) =>
    items.map((item) => (
      <DropdownMenuItem
        key={item.key}
        variant={item.destructive ? "destructive" : "default"}
        className="gap-2.5 py-1.5 text-[13px] font-medium data-[variant=destructive]:font-medium"
        onSelect={(e) => {
          e.preventDefault();
          item.onSelect();
        }}
      >
        {item.icon}
        <span className="flex-1">{item.label}</span>
      </DropdownMenuItem>
    ));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${name}`}
          onClick={(e) => e.stopPropagation()}
          className="hover:bg-accent hover:border-border data-[state=open]:bg-accent data-[state=open]:border-border size-7 rounded-md border border-transparent bg-transparent opacity-60 transition-all hover:opacity-100 data-[state=open]:opacity-100"
        >
          <Ellipsis className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        side="bottom"
        sideOffset={8}
        collisionPadding={12}
        className="max-h-[70vh] min-w-52 overflow-y-auto rounded-xl p-1.5 shadow-xl ring-1"
      >
        <DropdownMenuLabel className="text-muted-foreground px-2 py-1.5 text-[11px] font-semibold tracking-wide uppercase">
          {kind} · {name}
        </DropdownMenuLabel>
        {general.length > 0 && (
          <>
            <div className="py-1">{renderItems(general)}</div>
            {(workload.length > 0 || danger.length > 0) && (
              <DropdownMenuSeparator className="my-1" />
            )}
          </>
        )}
        {workload.length > 0 && (
          <>
            <div className="py-1">{renderItems(workload)}</div>
            {danger.length > 0 && <DropdownMenuSeparator className="my-1" />}
          </>
        )}
        {danger.length > 0 && <div className="py-1">{renderItems(danger)}</div>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
