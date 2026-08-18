import { Outlet } from "react-router";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { CommandPalette } from "@/components/command-palette";
import { UpdateBanner } from "@/features/updates/UpdateBanner";
import {
  useActiveClusterConnect,
  useAutoSelectCluster,
  useClusters,
} from "@/features/clusters/use-clusters";

export function AppLayout() {
  useClusters();
  useAutoSelectCluster();
  useActiveClusterConnect();

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <UpdateBanner />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <Outlet />
        </main>
      </SidebarInset>
      <CommandPalette />
    </SidebarProvider>
  );
}
