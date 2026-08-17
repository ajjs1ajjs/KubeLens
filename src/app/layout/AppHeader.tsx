import { Moon, Search, Sun } from "lucide-react";
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
import { useUiStore } from "@/lib/stores/ui-store";

export function AppHeader() {
  const { setTheme, theme } = useTheme();
  const activeCluster = useActiveCluster();
  const activeNamespace = useClusterStore((s) => s.activeNamespace);
  const setActiveNamespace = useClusterStore((s) => s.setActiveNamespace);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);

  const namespacesQuery = useNamespaces(activeCluster?.connected ? activeCluster.name : null);
  const namespaces = namespacesQuery.data ?? [];
  const connected = activeCluster?.connected ?? false;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger />
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-medium">
          {activeCluster?.name ?? "No cluster connected"}
        </span>
        {connected && activeCluster?.version && (
          <span className="text-muted-foreground hidden truncate text-xs lg:inline">
            {activeCluster.version}
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Select disabled={!connected} value={activeNamespace} onValueChange={setActiveNamespace}>
          <SelectTrigger className="w-44" aria-label="Namespace">
            <SelectValue placeholder="All namespaces" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All namespaces</SelectItem>
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
          aria-label="Search commands"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <Search className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </div>
    </header>
  );
}
