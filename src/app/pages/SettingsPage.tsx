import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useClusterStore } from "@/features/clusters/cluster-store";
import { k8sApi } from "@/lib/k8s/api";
import { useQueryClient } from "@tanstack/react-query";

interface AppInfo {
  name: string;
  version: string;
  platform: string;
  default_kubeconfig: string | null;
}

export function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const clusters = useClusterStore((s) => s.clusters);
  const queryClient = useQueryClient();

  useEffect(() => {
    invoke<AppInfo>("app_info")
      .then(setInfo)
      .catch(() => {});
  }, []);

  const reload = async () => {
    await k8sApi.reloadKubeconfig();
    await queryClient.invalidateQueries({ queryKey: ["clusters"] });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      <div className="mt-4 flex max-w-xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application</CardTitle>
            <CardDescription>
              {info?.name ?? "kubelens"} v{info?.version ?? "?"} · {info?.platform ?? "?"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">kubeconfig</div>
              <code className="text-xs break-all">{info?.default_kubeconfig ?? "—"}</code>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={reload}>
                <RefreshCw className="size-3.5" />
                Reload kubeconfig
              </Button>
              <span className="text-muted-foreground text-xs">
                {clusters.length} cluster{clusters.length === 1 ? "" : "s"} found
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
