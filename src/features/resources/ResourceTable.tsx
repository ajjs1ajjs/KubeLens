import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { resourceColumns, type MetricsLookup } from "./columns";
import { meta } from "@/lib/k8s/object";
import type { K8sObject } from "@/lib/k8s/types";

interface ResourceTableProps {
  kind: string;
  objects: K8sObject[];
  /** Show the namespace column (all-namespaces view). */
  showNamespace: boolean;
  /** Optional CPU/RAM metrics for Pod/Node rows. */
  metrics?: MetricsLookup;
  onSelect: (object: K8sObject) => void;
  onEdit?: (object: K8sObject) => void;
  onDelete?: (object: K8sObject) => void;
}

export function ResourceTable({
  kind,
  objects,
  showNamespace,
  metrics,
  onSelect,
  onEdit,
  onDelete,
}: ResourceTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo<ColumnDef<K8sObject>[]>(() => {
    const config = resourceColumns(kind, metrics).filter(
      (c) => c.id !== "namespace" || showNamespace,
    );
    const cols: ColumnDef<K8sObject>[] = config.map((c) => ({
      id: c.id,
      header: c.header,
      accessorKey: c.accessorKey,
      enableSorting: Boolean(c.accessorKey),
      cell: ({ row }) => c.cell(row.original),
    }));

    if (onEdit || onDelete) {
      cols.push({
        id: "actions",
        header: "",
        accessorKey: undefined,
        enableSorting: false,
        cell: ({ row }) => {
          const object = row.original;
          return (
            <div
              className="flex items-center justify-end gap-0.5"
              onClick={(e) => e.stopPropagation()}
            >
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Edit ${meta(object).name}`}
                  onClick={() => onEdit(object)}
                >
                  <Pencil className="size-3.5" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${meta(object).name}`}
                  className="text-destructive"
                  onClick={() => onDelete(object)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              )}
            </div>
          );
        },
      });
    }

    return cols;
  }, [kind, showNamespace, metrics, onEdit, onDelete]);

  const table = useReactTable({
    data: objects,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (objects.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center rounded-md border border-dashed p-12 text-sm">
        No {kind.toLowerCase()} found.
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="bg-muted/50 text-muted-foreground sticky top-0 z-10 h-9 px-3 text-left font-medium whitespace-nowrap"
                >
                  {header.isPlaceholder ? null : header.column.getCanSort() ? (
                    <button
                      type="button"
                      className="hover:text-foreground inline-flex items-center gap-1"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" ? (
                        <ArrowDown className="size-3" />
                      ) : header.column.getIsSorted() === "desc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ChevronsUpDown className="size-3 opacity-50" />
                      )}
                    </button>
                  ) : (
                    flexRender(header.column.columnDef.header, header.getContext())
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onSelect(row.original)}
              className="hover:bg-muted/50 cursor-pointer border-b last:border-b-0"
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-1.5 whitespace-nowrap">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
