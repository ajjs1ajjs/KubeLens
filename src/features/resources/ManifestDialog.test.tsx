import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ManifestDialog } from "./ManifestDialog";

vi.mock("./yaml-editor", () => ({
  YamlEditor: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
    <textarea aria-label="YAML editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

describe("ManifestDialog", () => {
  it("renders the title and initial manifest", () => {
    render(
      <ManifestDialog
        open
        onOpenChange={vi.fn()}
        title="Create Pod"
        initialValue="apiVersion: v1"
        submitLabel="Apply"
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Create Pod" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "YAML editor" })).toHaveValue("apiVersion: v1");
  });

  it("submits the edited value on Apply", () => {
    const onSubmit = vi.fn();
    render(
      <ManifestDialog
        open
        onOpenChange={vi.fn()}
        title="Create Pod"
        initialValue="apiVersion: v1"
        submitLabel="Apply"
        onSubmit={onSubmit}
      />,
    );

    const editor = screen.getByRole("textbox", { name: "YAML editor" });
    fireEvent.change(editor, { target: { value: "apiVersion: v1\nkind: Pod\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    expect(onSubmit).toHaveBeenCalledWith("apiVersion: v1\nkind: Pod\n");
  });

  it("closes on Cancel", () => {
    const onOpenChange = vi.fn();
    render(
      <ManifestDialog
        open
        onOpenChange={onOpenChange}
        title="Edit pod-a"
        initialValue="kind: Pod"
        submitLabel="Save"
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
