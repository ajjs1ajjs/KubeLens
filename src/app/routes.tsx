import { createHashRouter } from "react-router";
import { AppLayout } from "./layout/AppLayout";
import { OverviewPage } from "./pages/OverviewPage";
import { ResourcePage } from "./pages/ResourcePage";
import { SettingsPage } from "./pages/SettingsPage";
import { HelmPage } from "@/features/helm/HelmPage";
import { TopologyPage } from "@/features/topology/TopologyPage";

export const router = createHashRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: "resources/:kind", element: <ResourcePage /> },
      { path: "helm", element: <HelmPage /> },
      { path: "topology", element: <TopologyPage /> },
      { path: "settings", element: <SettingsPage /> },
    ],
  },
]);
