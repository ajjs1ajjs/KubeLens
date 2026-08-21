import { useState } from "react";
import { NavLink } from "react-router";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import {
  Check,
  GitBranch,
  Link,
  LoaderCircle,
  MoreHorizontal,
  Unlink,
  Network,
  Plus,
  RefreshCw,
  Server,
  Settings,
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
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
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
import type { ClusterInfo } from "@/features/clusters/cluster-store";

function ClusterRow({
  cluster,
  active,
  onSelect,
}: {
  cluster: ClusterInfo;
  active: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleConnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      onSelect();
      await connectCluster(cluster.id, cluster.name, cluster.configId);
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await disconnectCluster(cluster.id, cluster.name, cluster.configId);
    } finally {
      setBusy(false);
    }
  };

  const handleSelect = () => {
    if (active) {
      if (!cluster.connected && !busy) void handleConnect();
      return;
    }
    onSelect();
  };

  const statusLabel = busy
    ? t("sidebar.connecting")
    : active && cluster.connected
      ? t("sidebar.active")
      : cluster.connected
        ? t("sidebar.connected")
        : t("sidebar.offline");

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        onClick={handleSelect}
        tooltip={cluster.name}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
      >
        <Server className="size-4" />
        <span className="flex min-w-0 flex-1 flex-col items-start leading-tight group-data-[collapsible=icon]:hidden">
          <span className="max-w-full truncate">{cluster.name}</span>
          <span
            className="text-muted-foreground max-w-full truncate text-[10px] font-normal"
            title={cluster.error}
          >
            {cluster.error ? cluster.error : statusLabel}
          </span>
        </span>
        {busy ? (
          <LoaderCircle className="text-muted-foreground size-3.5 animate-spin" />
        ) : active && cluster.connected ? (
          <Check className="size-3.5 text-emerald-500" />
        ) : (
          <span
            className={`size-1.5 shrink-0 rounded-full ${cluster.connected ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
          />
        )}
      </SidebarMenuButton>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <SidebarMenuAction asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground size-5"
              aria-label={t("sidebar.clusterActions", { name: cluster.name })}
            >
              <MoreHorizontal className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </SidebarMenuAction>
        <DropdownMenuContent align="end" sideOffset={4} className="w-48">
          <DropdownMenuItem onClick={handleSelect} disabled={active}>
            {t("sidebar.switchTo")}
          </DropdownMenuItem>
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

export function AppSidebar() {
  const { t } = useTranslation();
  const clusters = useClusterStore((s) => s.clusters);
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
            <div className="flex flex-col">
              {clusters.length === 0 ? (
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton disabled className="text-muted-foreground">
                      <Server className="size-4" />
                      <span>{t("sidebar.noClusters")}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              ) : (
                <SidebarMenu>
                  {clusters.map((cluster) => (
                    <ClusterRow
                      key={cluster.id}
                      cluster={cluster}
                      active={cluster.id === activeClusterId}
                      onSelect={() => {
                        useClusterStore.getState().setActiveCluster(cluster.id);
                        useClusterStore.getState().setActiveNamespace("");
                      }}
                    />
                  ))}
                </SidebarMenu>
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
