import type { ReactNode } from "react";
import { Terminal, ScrollText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface ContainerActions {
  onLogs?: (container: string) => void;
  onExec?: (container: string) => void;
}

interface ContainerActionsMenuProps {
  container: string;
  actions: ContainerActions;
}

/** Lens-style per-container actions menu (Logs, Exec). */
export function ContainerActionsMenu({ container, actions }: ContainerActionsMenuProps) {
  const { t } = useTranslation();

  const items: {
    key: string;
    label: string;
    icon: ReactNode;
    onSelect: () => void;
  }[] = [];

  if (actions.onLogs) {
    items.push({
      key: "logs",
      label: t("resources.container.logs"),
      icon: <ScrollText className="size-3.5" />,
      onSelect: () => actions.onLogs?.(container),
    });
  }
  if (actions.onExec) {
    items.push({
      key: "exec",
      label: t("resources.container.exec"),
      icon: <Terminal className="size-3.5" />,
      onSelect: () => actions.onExec?.(container),
    });
  }

  if (items.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${container}`}
          onClick={(e) => e.stopPropagation()}
        >
          <Terminal className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="max-h-[70vh] min-w-32 overflow-y-auto"
      >
        {items.map((item) => (
          <DropdownMenuItem
            key={item.key}
            onSelect={(e) => {
              e.preventDefault();
              item.onSelect();
            }}
          >
            {item.icon}
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
