import CodeMirror from "@uiw/react-codemirror";
import { yaml } from "@codemirror/lang-yaml";
import { useTheme } from "next-themes";

interface YamlEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  readOnly?: boolean;
}

/** Lightweight YAML editor (CodeMirror 6) used for manifests. */
export function YamlEditor({ value, onChange, height = "380px", readOnly }: YamlEditorProps) {
  const { resolvedTheme } = useTheme();
  const dark = resolvedTheme === "dark";

  return (
    <CodeMirror
      value={value}
      height={height}
      extensions={[yaml()]}
      theme={dark ? "dark" : "light"}
      basicSetup={{ foldGutter: true, lineNumbers: true }}
      readOnly={readOnly}
      onChange={onChange}
      aria-label="YAML editor"
      className="overflow-hidden rounded-md border text-xs"
    />
  );
}
