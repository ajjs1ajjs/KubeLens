import * as React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Eye, EyeOff } from "lucide-react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Button } from "@/components/ui/button";

/** Renders a secret string masked by default, with reveal + copy controls. */
export function SecretValue({ value, className }: { value: string; className?: string }) {
  const { t } = useTranslation();
  const [revealed, setRevealed] = useState(false);

  const copy = async () => {
    try {
      await writeText(value);
    } catch {
      // Clipboard unavailable: the value stays visible for manual copy.
      setRevealed(true);
    }
  };

  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 ${className ?? ""}`}>
      <span className="min-w-0 flex-1 font-mono text-xs break-all">
        {revealed ? value : "•".repeat(Math.min(value.length, 24)) || "—"}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={revealed ? t("common.hide") : t("common.show")}
        onClick={() => setRevealed((r) => !r)}
      >
        {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t("common.copy")}
        onClick={() => void copy()}
      >
        <Copy className="size-3.5" />
      </Button>
    </span>
  );
}

/** Block-level gate for larger secret texts (Helm values, diffs). */
export function MaskedBlock({ children }: { children: React.ReactNode }) {
  const [revealed, setRevealed] = React.useState(false);
  if (revealed) return <>{children}</>;
  return <SecretGate onReveal={() => setRevealed(true)} />;
}

/** Full-block gate for Secret manifests: masked until explicitly revealed. */
export function SecretGate({ onReveal }: { onReveal: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="bg-muted/50 flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-md border p-6 text-center">
      <EyeOff className="text-muted-foreground size-6" />
      <p className="text-muted-foreground max-w-sm text-xs">{t("common.secretHidden")}</p>
      <Button variant="outline" size="sm" onClick={onReveal}>
        <Eye className="size-3.5" />
        {t("common.show")}
      </Button>
    </div>
  );
}
