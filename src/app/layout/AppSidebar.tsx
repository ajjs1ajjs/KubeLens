import { useState } from "react";
import { NavLink } from "react-router";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Link,
  Unlink,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Server,
  Settings,
  Trash2,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RESOURCE_GROUPS } from "@/features/resources/resource-types";
import { useClusterStore } from "@/features/clusters/cluster-store";
import { connectCluster, disconnectCluster } from "@/features/clusters/use-clusters";
import { k8sApi } from "@/lib/k8s/api";
import { useQueryClient } from "@tanstack/react-query";
import type { ClusterConfig } from "@/lib/k8s/types";

function ConfigContextRow({
  cluster,
  active,
  onSelect,
}: {
  cluster: { name: string; configId?: string; connected: boolean };
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const uniqueId = `${cluster.configId ?? ""}::${cluster.name}`;

  const handleConnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await connectCluster(uniqueId, cluster.name, cluster.configId);
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await disconnectCluster(uniqueId, cluster.name, cluster.configId);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            isActive={active}
            onClick={onSelect}
            onContextMenu={(e) => {
              e.preventDefault();
              (e.currentTarget as HTMLElement).click();
            }}
          >
            <Server className="size-4" />
            <span className="truncate">{cluster.name}</span>
            <span
              className={`ml-auto size-2 shrink-0 rounded-full ${cluster.connected ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
            />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="right">
          <DropdownMenuItem onClick={onSelect}>{t("sidebar.setActive")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          {cluster.connected ? (
            <DropdownMenuItem onClick={() => void handleDisconnect()}>
              <Unlink className="mr-2 size-4" />
              {t("sidebar.disconnect")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={() => void handleConnect()}>
              <Link className="mr-2 size-4" />
              {t("sidebar.connect")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

function ConfigRow({
  config,
  activeContext,
  onActivate,
}: {
  config: ClusterConfig;
  activeContext: string | null;
  onActivate: () => void;
}) {
  const [expanded, setExpanded] = useState(config.active);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(config.name);
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const refreshConfigs = async () => {
    await queryClient.invalidateQueries({ queryKey: ["cluster-configs"] });
  };

  const commitRename = async () => {
    const trimmed = name.trim();
    setEditing(false);
    if (!trimmed || trimmed === config.name) {
      setName(config.name);
      return;
    }
    await k8sApi.renameClusterConfig(config.id, trimmed);
    await refreshConfigs();
  };

  const remove = async () => {
    await k8sApi.removeClusterConfig(config.id);
    await refreshConfigs();
  };

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={expanded ? t("sidebar.collapse") : t("sidebar.expand")}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </Button>
        {editing ? (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commitRename();
              if (e.key === "Escape") {
                setEditing(false);
                setName(config.name);
              }
            }}
            autoFocus
            className="h-7 text-xs"
            aria-label="Config name"
          />
        ) : (
          <button
            className="hover:bg-accent/50 flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm"
            onClick={onActivate}
            title={config.path}
          >
            {config.active && <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />}
            <span className="truncate">{config.name}</span>
          </button>
        )}
        {!editing && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground size-5"
            aria-label={t("sidebar.rename", { name: config.name })}
            onClick={() => {
              setName(config.name);
              setEditing(true);
            }}
          >
            <Pencil className="size-3" />
          </Button>
        )}
        {!editing && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-destructive size-5"
            aria-label={t("sidebar.remove", { name: config.name })}
            onClick={() => void remove()}
          >
            <Trash2 className="size-3" />
          </Button>
        )}
      </div>

      {expanded && (
        <div className="ml-3 border-l pl-1">
          <SidebarMenu>
            {config.contexts.map((ctx) => {
              const clusterId = `${config.id}::${ctx.name}`;
              const clusterState = useClusterStore
                .getState()
                .clusters.find((c) => c.id === clusterId);
              return (
                <ConfigContextRow
                  key={ctx.name}
                  cluster={{
                    name: ctx.name,
                    configId: config.id,
                    connected: clusterState?.connected ?? false,
                  }}
                  active={clusterId === activeContext}
                  onSelect={() => {
                    void onActivate();
                    useClusterStore.getState().setActiveCluster(clusterId);
                    useClusterStore.getState().setActiveNamespace("");
                  }}
                />
              );
            })}
          </SidebarMenu>
        </div>
      )}
    </div>
  );
}

export function AppSidebar() {
  const { t } = useTranslation();
  const configs = useClusterStore((s) => s.configs);
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const queryClient = useQueryClient();

  const reloadClusters = async () => {
    await k8sApi.reloadKubeconfig();
    await queryClient.invalidateQueries({ queryKey: ["clusters"] });
    await queryClient.invalidateQueries({ queryKey: ["cluster-configs"] });
  };

  const addConfig = async () => {
    const picked = await open({ multiple: false, directory: false });
    if (typeof picked !== "string") return;
    await k8sApi.addClusterConfig(picked);
    await queryClient.invalidateQueries({ queryKey: ["cluster-configs"] });
  };

  const activateConfig = async (id: string) => {
    await k8sApi.setActiveClusterConfig(id);
    await queryClient.invalidateQueries({ queryKey: ["cluster-configs"] });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/">
                <img src="/app-icon.png" alt={t("sidebar.brand")} className="size-8 rounded-lg" />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{t("sidebar.brand")}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {t("sidebar.brandSub")}
                  </span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>{t("sidebar.clusters")}</span>
            <div className="flex items-center">
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground size-5"
                aria-label={t("sidebar.addConfig")}
                onClick={() => void addConfig()}
              >
                <Plus className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground size-5"
                aria-label={t("sidebar.reloadConfig")}
                onClick={reloadClusters}
              >
                <RefreshCw className="size-3" />
              </Button>
            </div>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <div className="flex flex-col gap-1">
              {configs.length === 0 ? (
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled className="text-muted-foreground">
                      <Server className="size-4" />
                      <span>{t("sidebar.noConfigs")}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              ) : (
                configs.map((config) => (
                  <ConfigRow
                    key={config.id}
                    config={config}
                    activeContext={activeClusterId}
                    onActivate={() => void activateConfig(config.id)}
                  />
                ))
              )}
            </div>
          </SidebarGroupContent>
        </SidebarGroup>

        {RESOURCE_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.resources.map((resource) => (
                  <SidebarMenuItem key={resource.kind}>
                    <SidebarMenuButton asChild>
                      <NavLink to={`/resources/${resource.kind}`}>
                        <resource.icon className="size-4" />
                        <span>{resource.label}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}

        <SidebarGroup>
          <SidebarGroupLabel>{t("sidebar.tools")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/helm">
                    <GitBranch className="size-4" />
                    <span>{t("sidebar.helm")}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/topology">
                    <Network className="size-4" />
                    <span>{t("sidebar.topology")}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink to="/settings">
                <Settings className="size-4" />
                <span>{t("sidebar.settings")}</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
