import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownToLine, ArrowUpFromLine, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { diffLines, type DiffLine } from "./diff";
import { useHelmReleaseRevision, useHelmRevisions } from "./use-helm";

interface ReleaseDiffTabProps {
  context: string;
  name: string;
  configId?: string;
}

function DiffView({ lines }: { lines: DiffLine[] }) {
  return (
    <div className="rounded-md border font-mono text-xs">
      {lines.map((line, index) => {
        const bg =
          line.op === "add" ? "bg-emerald-500/10" : line.op === "remove" ? "bg-red-500/10" : "";
        const marker = line.op === "add" ? "+" : line.op === "remove" ? "-" : " ";
        return (
          <div key={index} className={`flex px-2 ${bg}`}>
            <span className="text-muted-foreground w-8 shrink-0 text-right select-none">
              {line.op === "add" ? line.newLine : (line.oldLine ?? "")}
            </span>
            <span
              className={`w-4 shrink-0 select-none ${
                line.op === "add"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : line.op === "remove"
                    ? "text-red-600 dark:text-red-400"
                    : "text-muted-foreground"
              }`}
            >
              {marker}
            </span>
            <span className="min-w-0 flex-1 break-all whitespace-pre-wrap">{line.text || " "}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Compares two revisions of a release (values + manifest). */
export function ReleaseDiffTab({ context, name, configId }: ReleaseDiffTabProps) {
  const { t } = useTranslation();
  const { data: revisions } = useHelmRevisions(context, name, configId);
  const [base, setBase] = useState<number | null>(null);
  const [next, setNext] = useState<number | null>(null);

  const baseDetail = useHelmReleaseRevision(context, name, base, configId);
  const nextDetail = useHelmReleaseRevision(context, name, next, configId);

  const versions = revisions?.map((r) => r.version) ?? [];
  const canDiff = base !== null && next !== null && base !== next;
  const loading = baseDetail.isPending || nextDetail.isPending;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex shrink-0 items-center gap-2">
        <Select
          value={base === null ? "" : String(base)}
          onValueChange={(value) => setBase(Number(value))}
        >
          <SelectTrigger size="sm" className="w-32" aria-label={t("helm.diffTab.baseRev")}>
            <SelectValue placeholder={t("helm.diffTab.baseRev")} />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v} value={String(v)}>
                {t("helm.rev")} {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ArrowDownToLine className="text-muted-foreground size-4" />
        <Select
          value={next === null ? "" : String(next)}
          onValueChange={(value) => setNext(Number(value))}
        >
          <SelectTrigger size="sm" className="w-32" aria-label={t("helm.diffTab.targetRev")}>
            <SelectValue placeholder={t("helm.diffTab.targetRev")} />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v} value={String(v)}>
                {t("helm.rev")} {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ArrowUpFromLine className="text-muted-foreground size-4" />
      </div>

      {!canDiff ? (
        <p className="text-muted-foreground text-xs">{t("helm.diffTab.choose")}</p>
      ) : loading ? (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" />
          {t("helm.diffTab.loading")}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
          <div>
            <p className="text-muted-foreground mb-1 text-xs">{t("helm.values")}</p>
            <DiffView
              lines={diffLines(baseDetail.data?.values ?? "", nextDetail.data?.values ?? "")}
            />
          </div>
          <div>
            <p className="text-muted-foreground mb-1 text-xs">{t("helm.manifest")}</p>
            <DiffView
              lines={diffLines(baseDetail.data?.manifest ?? "", nextDetail.data?.manifest ?? "")}
            />
          </div>
        </div>
      )}
    </div>
  );
}
