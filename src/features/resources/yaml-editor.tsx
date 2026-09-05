import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { useTheme } from "next-themes";

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  readOnly?: boolean;
  className?: string;
}

/** Lightweight YAML editor (CodeMirror 6) used for manifests. */
export function YamlEditor({ value, onChange, height, readOnly, className }: YamlEditorProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  return (
    <CodeMirror
      value={value}
      height={height ?? "100%"}
      extensions={[yaml()]}
      theme={dark ? "dark" : "light"}
      basicSetup={{ foldGutter: true, lineNumbers: true }}
      readOnly={readOnly}
      onChange={onChange}
      aria-label="YAML editor"
      className={`flex h-full min-h-0 w-full flex-1 overflow-auto rounded-md border text-xs [&_.cm-content]:!w-full [&_.cm-editor]:w-full [&_.cm-scroller]:!w-full ${className ?? "!bg-transparent"}`}
      style={{ width: "100%" }}
    />
  );
}
