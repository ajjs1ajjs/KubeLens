import type { ReactNode } from "react";
import {
  Boxes,
  Eye,
  Pencil,
  Plug,
  RotateCcw,
  Scaling,
  ScrollText,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { meta } from "@/lib/k8s/object";
import type { K8sObject } from "@/lib/k8s/types";

/** Which Lens-style actions apply to a given kind. */
const POD_ONLY = new Set(["Pod"]);
const SCALABLE = new Set(["Deployment", "StatefulSet", "ReplicaSet"]);
const RESTARTABLE = new Set(["Deployment", "StatefulSet", "DaemonSet", "CronJob"]);

export interface RowActions {
  onViewYaml?: (object: K8sObject) => void;
  onEdit?: (object: K8sObject) => void;
  onDelete?: (object: K8sObject) => void;
  onLogs?: (object: K8sObject) => void;
  onExec?: (object: K8sObject) => void;
  onPortForward?: (object: K8sObject) => void;
  onScale?: (object: K8sObject) => void;
  onRestart?: (object: K8sObject) => void;
}

interface RowActionsMenuProps {
  object: K8sObject;
  kind: string;
  actions: RowActions;
}

export function RowActionsMenu({ object, kind, actions }: RowActionsMenuProps) {
  const { t } = useTranslation();
  const isPod = POD_ONLY.has(kind);
  const scalable = SCALABLE.has(kind);
  const restartable = RESTARTABLE.has(kind);

  const items: {
    key: string;
    label: string;
    icon: ReactNode;
    onSelect: () => void;
    destructive?: boolean;
  }[] = [];

  if (actions.onViewYaml) {
    items.push({
      key: "view",
      label: t("resources.actions.viewYaml"),
      icon: <Eye className="size-3.5" />,
      onSelect: () => actions.onViewYaml?.(object),
    });
  }
  if (actions.onEdit) {
    items.push({
      key: "edit",
      label: t("resources.actions.edit"),
      icon: <Pencil className="size-3.5" />,
      onSelect: () => actions.onEdit?.(object),
    });
  }
  if (isPod && actions.onLogs) {
    items.push({
      key: "logs",
      label: t("resources.actions.logs"),
      icon: <ScrollText className="size-3.5" />,
      onSelect: () => actions.onLogs?.(object),
    });
  }
  if (isPod && actions.onExec) {
    items.push({
      key: "exec",
      label: t("resources.actions.exec"),
      icon: <TerminalSquare className="size-3.5" />,
      onSelect: () => actions.onExec?.(object),
    });
  }
  if (isPod && actions.onPortForward) {
    items.push({
      key: "port-forward",
      label: t("resources.actions.portForward"),
      icon: <Plug className="size-3.5" />,
      onSelect: () => actions.onPortForward?.(object),
    });
  }
  if (scalable && actions.onScale) {
    items.push({
      key: "scale",
      label: t("resources.actions.scale"),
      icon: <Scaling className="size-3.5" />,
      onSelect: () => actions.onScale?.(object),
    });
  }
  if (restartable && actions.onRestart) {
    items.push({
      key: "restart",
      label: t("resources.actions.restart"),
      icon: <RotateCcw className="size-3.5" />,
      onSelect: () => actions.onRestart?.(object),
    });
  }
  if (actions.onDelete) {
    if (items.length > 0) items.push({ key: "_sep", label: "", icon: null, onSelect: () => {} });
    items.push({
      key: "delete",
      label: t("resources.actions.delete"),
      icon: <Trash2 className="size-3.5" />,
      onSelect: () => actions.onDelete?.(object),
      destructive: true,
    });
  }

  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${meta(object).name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Boxes className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        {items.map((item) => {
          if (item.key === "_sep") return <DropdownMenuSeparator key="sep" />;
          return (
            <DropdownMenuItem
              key={item.key}
              variant={item.destructive ? "destructive" : "default"}
              onSelect={(e) => {
                e.preventDefault();
                item.onSelect();
              }}
            >
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
