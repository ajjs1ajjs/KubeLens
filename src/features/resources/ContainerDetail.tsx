import { useState } from "react";
import { ChevronDown, ChevronRight, ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatCpu, formatMemory } from "./use-metrics";
import { formatProbeHandler, type ContainerInfo } from "./pod-container-info";

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-3 py-1">
      <span className="text-muted-foreground min-w-0 shrink-0 overflow-hidden text-xs font-medium break-all">
        {label}
      </span>
      <span className="min-w-0 overflow-hidden text-xs [overflow-wrap:anywhere] break-all whitespace-pre-wrap">
        {children}
      </span>
    </div>
  );
}

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-1.5 border-t pt-1.5">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-xs font-medium hover:underline"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        {title}
      </button>
      {open && (
        <div className="mt-1 flex min-w-0 flex-col gap-0.5 overflow-hidden pl-4">{children}</div>
      )}
    </div>
  );
}

/** Lens-style detailed container info panel. */
export function ContainerDetail({ info }: { info: ContainerInfo }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-1 text-xs">
      <DetailRow label={t("resources.container.image")}>
        <span className="break-all">{info.image || "—"}</span>
      </DetailRow>
      {info.imagePullPolicy && (
        <DetailRow label={t("resources.container.pullPolicy")}>{info.imagePullPolicy}</DetailRow>
      )}
      {info.command && info.command.length > 0 && (
        <DetailRow label={t("resources.container.command")}>
          <code className="bg-muted block max-w-full rounded px-1.5 py-0.5 break-all whitespace-pre-wrap">
            {info.command.join(" ")}
          </code>
        </DetailRow>
      )}
      {info.args && info.args.length > 0 && (
        <DetailRow label={t("resources.container.args")}>
          <code className="bg-muted block max-w-full rounded px-1.5 py-0.5 break-all whitespace-pre-wrap">
            {info.args.join(" ")}
          </code>
        </DetailRow>
      )}
      {info.workingDir && (
        <DetailRow label={t("resources.container.workingDir")}>{info.workingDir}</DetailRow>
      )}

      {/* Resources */}
      {(info.cpuRequest !== undefined ||
        info.cpuLimit !== undefined ||
        info.memoryRequest !== undefined ||
        info.memoryLimit !== undefined) && (
        <Section title={t("resources.container.resources")}>
          {info.cpuRequest !== undefined && (
            <DetailRow label={t("resources.container.cpuRequest")}>
              {formatCpu(info.cpuRequest)}
            </DetailRow>
          )}
          {info.cpuLimit !== undefined && (
            <DetailRow label={t("resources.container.cpuLimit")}>
              {formatCpu(info.cpuLimit)}
            </DetailRow>
          )}
          {info.memoryRequest !== undefined && (
            <DetailRow label={t("resources.container.memoryRequest")}>
              {formatMemory(info.memoryRequest)}
            </DetailRow>
          )}
          {info.memoryLimit !== undefined && (
            <DetailRow label={t("resources.container.memoryLimit")}>
              {formatMemory(info.memoryLimit)}
            </DetailRow>
          )}
        </Section>
      )}

      {/* Ports */}
      {info.ports.length > 0 && (
        <Section title={t("resources.container.ports")}>
          {info.ports.map((port, i) => (
            <DetailRow key={i} label={port.name || `${port.containerPort}`}>
              {port.containerPort}
              {port.protocol ? `/${port.protocol}` : ""}
              {port.hostPort ? ` → ${port.hostPort}` : ""}
            </DetailRow>
          ))}
        </Section>
      )}

      {/* Env vars */}
      {info.env.length > 0 && (
        <Section title={t("resources.container.env")}>
          {info.env.map((env, i) => (
            <DetailRow key={i} label={env.name}>
              {env.value ? (
                <span className="break-all">{env.value}</span>
              ) : env.valueFrom ? (
                <span className="text-muted-foreground italic">
                  from {Object.keys(env.valueFrom)[0]}
                </span>
              ) : (
                "—"
              )}
            </DetailRow>
          ))}
        </Section>
      )}

      {/* Volume mounts */}
      {info.volumeMounts.length > 0 && (
        <Section title={t("resources.container.volumeMounts")}>
          {info.volumeMounts.map((vm, i) => (
            <DetailRow key={i} label={vm.mountPath}>
              {vm.name}
              {vm.readOnly ? " (ro)" : ""}
              {vm.subPath ? ` → ${vm.subPath}` : ""}
            </DetailRow>
          ))}
        </Section>
      )}

      {/* Probes */}
      {(info.livenessProbe || info.readinessProbe || info.startupProbe) && (
        <Section title={t("resources.container.probes")}>
          {info.livenessProbe && (
            <DetailRow label={t("resources.container.livenessProbe")}>
              {formatProbeHandler(info.livenessProbe.handler)}
              {info.livenessProbe.initialDelaySeconds !== undefined &&
                ` (delay: ${info.livenessProbe.initialDelaySeconds}s)`}
            </DetailRow>
          )}
          {info.readinessProbe && (
            <DetailRow label={t("resources.container.readinessProbe")}>
              {formatProbeHandler(info.readinessProbe.handler)}
              {info.readinessProbe.initialDelaySeconds !== undefined &&
                ` (delay: ${info.readinessProbe.initialDelaySeconds}s)`}
            </DetailRow>
          )}
          {info.startupProbe && (
            <DetailRow label={t("resources.container.startupProbe")}>
              {formatProbeHandler(info.startupProbe.handler)}
              {info.startupProbe.initialDelaySeconds !== undefined &&
                ` (delay: ${info.startupProbe.initialDelaySeconds}s)`}
            </DetailRow>
          )}
        </Section>
      )}

      {/* Security context */}
      {info.securityContext && (
        <Section title={t("resources.container.securityContext")}>
          {info.securityContext.privileged !== undefined && (
            <DetailRow label={t("resources.container.privileged")}>
              {info.securityContext.privileged ? (
                <span className="flex items-center gap-1 text-red-500">
                  <ShieldOff className="size-3" /> Yes
                </span>
              ) : (
                <span className="flex items-center gap-1 text-green-500">
                  <ShieldCheck className="size-3" /> No
                </span>
              )}
            </DetailRow>
          )}
          {info.securityContext.runAsUser !== undefined && (
            <DetailRow label={t("resources.container.runAsUser")}>
              {info.securityContext.runAsUser}
            </DetailRow>
          )}
          {info.securityContext.readOnlyRootFilesystem !== undefined && (
            <DetailRow label={t("resources.container.readOnlyFs")}>
              {info.securityContext.readOnlyRootFilesystem ? "Yes" : "No"}
            </DetailRow>
          )}
          {info.securityContext.allowPrivilegeEscalation !== undefined && (
            <DetailRow label={t("resources.container.allowPrivEsc")}>
              {info.securityContext.allowPrivilegeEscalation ? "Yes" : "No"}
            </DetailRow>
          )}
        </Section>
      )}

      {/* IO */}
      {(info.stdin !== undefined || info.tty !== undefined) && (
        <Section title="IO">
          {info.stdin !== undefined && (
            <DetailRow label="stdin">{info.stdin ? "Yes" : "No"}</DetailRow>
          )}
          {info.tty !== undefined && <DetailRow label="tty">{info.tty ? "Yes" : "No"}</DetailRow>}
        </Section>
      )}
    </div>
  );
}
