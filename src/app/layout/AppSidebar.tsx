import { NavLink } from "react-router";
import { GitBranch, Network, RefreshCw, Server, Settings } from "lucide-react";
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
import { RESOURCE_GROUPS } from "@/features/resources/resource-types";
import { useClusterStore } from "@/features/clusters/cluster-store";
import { k8sApi } from "@/lib/k8s/api";
import { useQueryClient } from "@tanstack/react-query";

function ClusterStatusDot({ cluster }: { cluster: { connected: boolean; error?: string } }) {
  if (cluster.error) {
    return <span className="bg-destructive size-2 shrink-0 rounded-full" title={cluster.error} />;
  }
  if (cluster.connected) {
    return <span className="size-2 shrink-0 rounded-full bg-emerald-500" title="Connected" />;
  }
  return (
    <span className="bg-muted-foreground/40 size-2 shrink-0 rounded-full" title="Not connected" />
  );
}

export function AppSidebar() {
  const clusters = useClusterStore((s) => s.clusters);
  const activeClusterId = useClusterStore((s) => s.activeClusterId);
  const queryClient = useQueryClient();

  const reloadClusters = async () => {
    await k8sApi.reloadKubeconfig();
    await queryClient.invalidateQueries({ queryKey: ["clusters"] });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/">
                <img src="/app-icon.png" alt="KubeLens" className="size-8 rounded-lg" />
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">KubeLens</span>
                  <span className="text-muted-foreground truncate text-xs">Kubernetes IDE</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="flex items-center justify-between">
            <span>Clusters</span>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground size-5"
              aria-label="Reload kubeconfig"
              onClick={reloadClusters}
            >
              <RefreshCw className="size-3" />
            </Button>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {clusters.length === 0 ? (
                <SidebarMenuItem>
                  <SidebarMenuButton disabled className="text-muted-foreground">
                    <Server className="size-4" />
                    <span>No clusters</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ) : (
                clusters.map((cluster) => (
                  <SidebarMenuItem key={cluster.id}>
                    <SidebarMenuButton
                      isActive={cluster.id === activeClusterId}
                      onClick={() => useClusterStore.getState().setActiveCluster(cluster.id)}
                    >
                      <Server className="size-4" />
                      <span className="truncate">{cluster.name}</span>
                      <ClusterStatusDot cluster={cluster} />
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
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
          <SidebarGroupLabel>Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/helm">
                    <GitBranch className="size-4" />
                    <span>Helm Releases</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <NavLink to="/topology">
                    <Network className="size-4" />
                    <span>Topology</span>
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
                <span>Settings</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
