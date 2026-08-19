import { useState } from "react";
import { NavLink } from "react-router";
import { open } from "@tauri-apps/plugin-dialog";
import { useTranslation } from "react-i18next";
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
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
import { RESOURCE_GROUPS } from "@/features/resources/resource-types";
import { useClusterStore } from "@/features/clusters/cluster-store";
import { k8sApi } from "@/lib/k8s/api";
import { useQueryClient } from "@tanstack/react-query";
import type { ClusterConfig } from "@/lib/k8s/types";

function ConfigContextRow({
  name,
  active,
  onSelect,
}: {
  name: string;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton isActive={active} onClick={onSelect}>
        <Server className="size-4" />
        <span className="truncate">{name}</span>
      </SidebarMenuButton>
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
            {config.contexts.map((ctx) => (
              <ConfigContextRow
                key={ctx.name}
                name={ctx.name}
                active={ctx.name === activeContext}
                onSelect={() => {
                  // Select the context AND ensure its config is the active one
                  // so the backend serves resources from this cluster.
                  void onActivate();
                  useClusterStore.getState().setActiveCluster(ctx.name);
                  useClusterStore.getState().setActiveNamespace("");
                }}
              />
            ))}
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
