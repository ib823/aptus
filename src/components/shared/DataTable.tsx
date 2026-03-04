"use client";

import { useState } from "react";
import {
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  filterColumn?: string | undefined;
  filterPlaceholder?: string | undefined;
  pageSize?: number | undefined;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  filterColumn,
  filterPlaceholder = "Filter...",
  pageSize = 10,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: { sorting, columnFilters },
    initialState: { pagination: { pageSize } },
  });

  return (
    <div className="space-y-4">
      {filterColumn && (
        <Input
          placeholder={filterPlaceholder}
          value={(table.getColumn(filterColumn)?.getFilterValue() as string) ?? ""}
          onChange={(e) => table.getColumn(filterColumn)?.setFilterValue(e.target.value)}
          className="max-w-sm h-11 sm:h-9"
        />
      )}

      {/* Desktop Table View */}
      <div className="hidden sm:block rounded-md border overflow-hidden">
        <Table>
          <TableHeader className="bg-muted/50">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id} className="h-10 text-xs font-semibold uppercase tracking-wider">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"} className="hover:bg-muted/30">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Mobile Card View */}
      <div className="sm:hidden space-y-3">
        {table.getRowModel().rows.length ? (
          table.getRowModel().rows.map((row) => (
            <div 
              key={row.id} 
              className="rounded-lg border bg-card p-4 shadow-sm active:bg-muted/50 transition-colors"
            >
              <div className="space-y-3">
                {row.getVisibleCells().map((cell, idx) => {
                  // The first cell is usually the "Title" or primary identifier
                  if (idx === 0) {
                    return (
                      <div key={cell.id} className="flex justify-between items-start border-b pb-2">
                        <div className="font-semibold text-base text-foreground">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                        <MoreHorizontal className="size-4 text-muted-foreground" />
                      </div>
                    );
                  }
                  
                  // Hide empty cells or internal IDs if needed, but here we show labels
                  const header = columns[idx]?.header;
                  const label = typeof header === 'string' ? header : null;

                  return (
                    <div key={cell.id} className="flex flex-col gap-1">
                      {label && (
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">
                          {label}
                        </span>
                      )}
                      <div className="text-sm text-foreground">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="h-32 flex items-center justify-center border rounded-lg border-dashed text-muted-foreground italic">
            No results found.
          </div>
        )}
      </div>

      {/* Pagination Controls - Mobile Optimized */}
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-xs font-medium text-muted-foreground">
            {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="h-11 w-11 p-0 sm:h-8 sm:w-8"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label="Previous page"
            >
              <ChevronLeft className="size-5 sm:size-4" />
            </Button>
            <Button
              variant="outline"
              className="h-11 w-11 p-0 sm:h-8 sm:w-8"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              aria-label="Next page"
            >
              <ChevronRight className="size-5 sm:size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function SortableHeader({ column, children }: { column: { toggleSorting: (desc?: boolean) => void; getIsSorted: () => false | "asc" | "desc" }; children: React.ReactNode }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 text-xs font-semibold hover:bg-transparent px-2"
      onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
    >
      {children}
      <ArrowUpDown className="ml-2 size-3" />
    </Button>
  );
}
