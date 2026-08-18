import { useTranslation } from "react-i18next";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveCluster, useClusterStore } from "@/features/clusters/cluster-store";
import { useNamespaces } from "@/features/clusters/use-clusters";

export function AppHeader() {
  const { t } = useTranslation();
  const { setTheme, resolvedTheme } = useTheme();
  const activeCluster = useActiveCluster();
  const activeNamespace = useClusterStore((s) => s.activeNamespace);
  const setActiveNamespace = useClusterStore((s) => s.setActiveNamespace);

  const namespacesQuery = useNamespaces(activeCluster?.connected ? activeCluster.name : null);
  const namespaces = namespacesQuery.data ?? [];
  const connected = activeCluster?.connected ?? false;
  const isDark = resolvedTheme === "dark";

  return (
    <header className="bg-background/80 sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
      <SidebarTrigger />
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium">
          {activeCluster?.name ?? t("header.noCluster")}
        </span>
        {connected ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {activeCluster?.version ?? t("header.connected")}
          </span>
        ) : (
          <span className="bg-muted text-muted-foreground inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs">
            <span className="bg-muted-foreground/50 size-1.5 rounded-full" />
            {t("header.offline")}
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Select disabled={!connected} value={activeNamespace} onValueChange={setActiveNamespace}>
          <SelectTrigger className="w-44" aria-label="Namespace">
            <SelectValue placeholder={t("header.allNamespaces")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">{t("header.allNamespaces")}</SelectItem>
            {namespaces.map((namespace) => (
              <SelectItem key={namespace} value={namespace}>
                {namespace}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="ghost"
          size="icon"
          aria-label={t("header.toggleTheme")}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}
