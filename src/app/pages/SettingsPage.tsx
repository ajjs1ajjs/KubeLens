import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
import {
  LANGUAGE_STORAGE_KEY,
  SUPPORTED_LANGUAGES,
  type Language,
} from "@/i18n";

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

const LANG_OPTIONS: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "uk", label: "Українська" },
];

export function SettingsPage() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [picking, setPicking] = useState(false);
  const configs = useClusterStore((s) => s.configs);
  const clusters = useClusterStore((s) => s.clusters);
  const queryClient = useQueryClient();
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();

  const currentLang: Language = SUPPORTED_LANGUAGES.includes(i18n.language as Language)
    ? (i18n.language as Language)
    : "en";

  const setLanguage = (lang: Language) => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    void i18n.changeLanguage(lang);
  };

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
      <h1 className="text-lg font-semibold">{t("settings.title")}</h1>

      <div className="mt-4 flex max-w-xl flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("settings.appearance")}</CardTitle>
            <CardDescription>{t("settings.appearanceDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="theme">{t("settings.theme")}</Label>
              <Select value={theme ?? "system"} onValueChange={(value) => setTheme(value)}>
                <SelectTrigger id="theme" className="w-48">
                  <SelectValue placeholder={t("settings.theme")} />
                </SelectTrigger>
                <SelectContent>
                  {THEME_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <span className="flex items-center gap-2">
                        <option.icon className="size-3.5" />
                        {t(`settings.theme${option.value[0].toUpperCase()}${option.value.slice(1)}`)}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="language">{t("settings.language")}</Label>
              <Select value={currentLang} onValueChange={(value) => setLanguage(value as Language)}>
                <SelectTrigger id="language" className="w-48">
                  <SelectValue placeholder={t("settings.language")} />
                </SelectTrigger>
                <SelectContent>
                  {LANG_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {t(`settings.language${option.value === "en" ? "En" : "Uk"}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("settings.application")}</CardTitle>
            <CardDescription>
              {info?.name ?? "kubelens"} v{info?.version ?? "?"} · {info?.platform ?? "?"}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <div>
              <div className="text-muted-foreground text-xs">{t("settings.clusterConfigs")}</div>
              {configs.length === 0 ? (
                <p className="text-muted-foreground mt-1 text-xs">{t("settings.noConfigs")}</p>
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
                {t("settings.addKubeconfig")}
              </Button>
              <Button variant="outline" size="sm" onClick={refresh}>
                <RefreshCw className="size-3.5" />
                {t("common.reload")}
              </Button>
              <span className="text-muted-foreground text-xs">
                {t("settings.clustersInActive", { count: clusters.length })}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
