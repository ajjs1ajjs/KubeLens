import { useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useResourceColumns, type MetricsLookup } from "./columns";
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
  const [query, setQuery] = useState("");
  const config = useResourceColumns(kind, metrics);

  const columns = useMemo<ColumnDef<K8sObject>[]>(() => {
    const visible = config.filter((c) => c.id !== "namespace" || showNamespace);
    const cols: ColumnDef<K8sObject>[] = visible.map((c) => ({
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
  }, [config, showNamespace, onEdit, onDelete]);

  const table = useReactTable({
    data: objects,
    columns,
    state: { sorting, globalFilter: query },
    onSortingChange: setSorting,
    onGlobalFilterChange: setQuery,
    globalFilterFn: (row, _columnId, value) => {
      const q = String(value).toLowerCase();
      const m = meta(row.original);
      return (
        m.name.toLowerCase().includes(q) ||
        (m.namespace ?? "").toLowerCase().includes(q) ||
        Object.values(m.labels).some((v) => v.toLowerCase().includes(q))
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const rows = table.getRowModel().rows;

  if (objects.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-1 items-center justify-center rounded-md border border-dashed p-12 text-sm">
        No {kind.toLowerCase()} found.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <div className="relative w-64">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="h-8 pl-8 text-sm"
            aria-label="Search resources"
          />
        </div>
        <span className="text-muted-foreground text-xs tabular-nums">
          {rows.length} / {objects.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-md border">
        {rows.length === 0 ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center rounded-md border border-dashed p-12 text-sm">
            No matches.
          </div>
        ) : (
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
              {rows.map((row) => (
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
        )}
      </div>
    </div>
  );
}
