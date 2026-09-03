import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResourceTable } from "./ResourceTable";
import type { K8sObject } from "@/lib/k8s/types";

const pods: K8sObject[] = [
  {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: "web-0", namespace: "default", labels: { app: "web" } },
  },
  {
    apiVersion: "v1",
    kind: "Pod",
    metadata: { name: "db-0", namespace: "default", labels: { app: "db" } },
  },
];

describe("ResourceTable", () => {
  it("filters rows by name", async () => {
    const user = userEvent.setup();
    render(<ResourceTable kind="Pod" objects={pods} showNamespace={false} onSelect={() => {}} />);

    expect(screen.getByText("web-0")).toBeInTheDocument();
    expect(screen.getByText("db-0")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Search resources"), "web");
    expect(screen.getByText("web-0")).toBeInTheDocument();
    expect(screen.queryByText("db-0")).not.toBeInTheDocument();
  });

  it("shows a no-matches state", async () => {
    const user = userEvent.setup();
    render(<ResourceTable kind="Pod" objects={pods} showNamespace={false} onSelect={() => {}} />);

    await user.type(screen.getByLabelText("Search resources"), "zzz");
    expect(screen.getByText("No matches.")).toBeInTheDocument();
  });

  it("shows empty state when there are no objects", () => {
    render(<ResourceTable kind="Pod" objects={[]} showNamespace={false} onSelect={() => {}} />);
    expect(screen.getByText("No pod found.")).toBeInTheDocument();
  });

  it("renders the action menu and exposes delete", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <ResourceTable
        kind="Pod"
        objects={pods}
        showNamespace={false}
        onSelect={() => {}}
        actions={{ onDelete }}
      />,
    );

    const trigger = screen.getAllByRole("button", { name: /Actions for/ })[0];
    await user.click(trigger);
    const deleteItem = await screen.findByText("Delete");
    await user.click(deleteItem);
    expect(onDelete).toHaveBeenCalledWith(pods[0]);
  });
});
