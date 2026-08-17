import { NavLink } from "react-router";
import {
  Activity,
  CheckCircle2,
  Container,
  Cpu,
  FileCode2,
  GitBranch,
  Network,
  RefreshCw,
  Server,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClusterStore } from "@/features/clusters/cluster-store";
import { k8sApi } from "@/lib/k8s/api";
import { useQueryClient } from "@tanstack/react-query";

const FEATURES: { title: string; description: string; icon: LucideIcon }[] = [
  {
    title: "Resource browser",
    description: "Pods, Deployments, Services and more with live updates.",
    icon: Container,
  },
  {
    title: "Logs, exec & port-forward",
    description: "Stream logs, open a terminal and forward ports to localhost.",
    icon: Activity,
  },
  {
    title: "YAML editor",
    description: "View, edit and apply manifests with validation.",
    icon: FileCode2,
  },
  {
    title: "Metrics",
    description: "CPU and memory usage for nodes and pods in real time.",
    icon: Cpu,
  },
  {
    title: "Helm",
    description: "Browse and manage Helm releases.",
    icon: GitBranch,
  },
  {
    title: "Topology",
    description: "Visual dependency graph between your workloads.",
    icon: Network,
  },
];

export function OverviewPage() {
  const clusters = useClusterStore((s) => s.clusters);
  const queryClient = useQueryClient();

  const reload = async () => {
    await k8sApi.reloadKubeconfig();
    await queryClient.invalidateQueries({ queryKey: ["clusters"] });
  };

  const connected = clusters.filter((c) => c.connected).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="flex flex-1 flex-col gap-8 p-8">
        {/* Hero */}
        <div className="from-primary/10 via-card to-card relative overflow-hidden rounded-2xl border bg-gradient-to-br p-8">
          <div className="bg-primary/20 pointer-events-none absolute -top-24 -right-20 size-64 rounded-full blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="relative flex flex-col items-start gap-2">
            <Badge variant="secondary" className="mb-1">
              Kubernetes IDE
            </Badge>
            <h1 className="text-3xl font-semibold tracking-tight">Welcome to KubeLens</h1>
            <p className="text-muted-foreground max-w-xl text-sm">
              A modern, lightweight Kubernetes IDE. Connect a cluster to explore your workloads,
              metrics, Helm releases and dependency topology — all in one place.
            </p>
          </div>
        </div>

        {/* Clusters */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-medium">Clusters</h2>
            <div className="flex items-center gap-2">
              {clusters.length > 0 && (
                <span className="text-muted-foreground text-xs">
                  {connected} of {clusters.length} connected
                </span>
              )}
              <Button variant="outline" size="sm" onClick={reload}>
                <RefreshCw className="size-3.5" />
                Reload kubeconfig
              </Button>
            </div>
          </div>
          {clusters.length === 0 ? (
            <Card>
              <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
                <Server className="size-8 opacity-50" />
                <p>No clusters found in kubeconfig.</p>
                <p className="text-xs">Point KUBECONFIG at a valid file, then press reload.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {clusters.map((cluster) => (
                <Card key={cluster.id} className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      {cluster.connected ? (
                        <CheckCircle2 className="size-4 text-emerald-500" />
                      ) : (
                        <XCircle className="text-destructive size-4" />
                      )}
                      <span className="truncate">{cluster.name}</span>
                      {cluster.current && (
                        <Badge variant="secondary" className="ml-auto">
                          current
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="truncate">
                      {cluster.server || "no server"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-muted-foreground flex items-center gap-2 text-xs">
                    {cluster.connected ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <span className="size-1.5 rounded-full bg-emerald-500" />
                          Connected
                        </span>
                        {cluster.version && <span>· {cluster.version}</span>}
                      </>
                    ) : cluster.error ? (
                      <span className="text-destructive truncate" title={cluster.error}>
                        {cluster.error}
                      </span>
                    ) : (
                      <span>Connecting…</span>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        {/* Resources quick links */}
        <section>
          <h2 className="mb-3 text-sm font-medium">Resources</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {["Pod", "Deployment", "Service", "ConfigMap", "Ingress", "Node"].map((kind) => (
              <NavLink
                key={kind}
                to={`/resources/${kind}`}
                className="hover:bg-accent/50 text-card-foreground bg-card rounded-lg border px-3 py-4 text-center text-sm font-medium transition-colors"
              >
                {kind}
              </NavLink>
            ))}
          </div>
        </section>

        {/* Features */}
        <div className="grid w-full max-w-3xl grid-cols-1 gap-4 self-center sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="transition-shadow hover:shadow-md">
              <CardHeader>
                <span className="bg-primary/10 text-primary inline-flex size-9 items-center justify-center rounded-lg">
                  <feature.icon className="size-5" />
                </span>
                <CardTitle className="text-base">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
              <CardContent />
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
