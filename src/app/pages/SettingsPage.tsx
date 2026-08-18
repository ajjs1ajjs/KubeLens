import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useTheme } from "next-themes";
import { FolderOpen, Monitor, Moon, RefreshCw, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClusterStore } from "@/features/clusters/cluster-store";
import { k8sApi } from "@/lib/k8s/api";
import { useQueryClient } from "@tanstack/react-query";

interface AppInfo {
  name: string;
  version: string;
  platform: string;
  default_kubeconfig: string | null;
}

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [picking, setPicking] = useState(false);
  const configs = useClusterStore((s) => s.configs);
  const clusters = useClusterStore((s) => s.clusters);
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    invoke<AppInfo>("app_info")
      .then(setInfo)
      .catch(() => {});
  }, []);

  const refresh = async () => {
    await k8sApi.reloadKubeconfig();
    await queryClient.invalidateQueries({ queryKey: ["clusters"] });
    await queryClient.invalidateQueries({ queryKey: ["cluster-configs"] });
  };

  const handleAdd = async () => {
    setPicking(true);
    try {
      const picked = await open({ multiple: false, directory: false });
      if (typeof picked === "string") {
        await k8sApi.addClusterConfig(picked);
        await queryClient.invalidateQueries({ queryKey: ["cluster-configs"] });
      }
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
      <h1 className="text-lg font-semibold">Settings</h1>

      <div className="mt-4 flex max-w-xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Appearance</CardTitle>
            <CardDescription>Choose how KubeLens looks.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="theme">Theme</Label>
              <Select value={theme ?? "system"} onValueChange={(value) => setTheme(value)}>
                <SelectTrigger id="theme" className="w-48">
                  <SelectValue placeholder="Theme" />
                </SelectTrigger>
                <SelectContent>
                  {THEME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex items-center gap-2">
                        <option.icon className="size-3.5" />
                        {option.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application</CardTitle>
            <CardDescription>
              {info?.name ?? "kubelens"} v{info?.version ?? "?"} · {info?.platform ?? "?"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">Cluster configs</div>
              {configs.length === 0 ? (
                <p className="text-muted-foreground mt-1 text-xs">
                  No configs added. Add a kubeconfig file below.
                </p>
              ) : (
                <ul className="mt-1 flex flex-col gap-1">
                  {configs.map((config) => (
                    <li key={config.id} className="flex items-center gap-2">
                      <span
                        className={`size-1.5 rounded-full ${config.active ? "bg-emerald-500" : "bg-muted-foreground/40"}`}
                      />
                      <span className="min-w-0 truncate text-xs font-medium">{config.name}</span>
                      <code className="text-muted-foreground ml-auto truncate text-[11px]">
                        {config.path}
                      </code>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleAdd} disabled={picking}>
                <FolderOpen className="size-3.5" />
                Add kubeconfig…
              </Button>
              <Button variant="outline" size="sm" onClick={refresh}>
                <RefreshCw className="size-3.5" />
                Reload
              </Button>
              <span className="text-muted-foreground text-xs">
                {clusters.length} cluster{clusters.length === 1 ? "" : "s"} in active config
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
