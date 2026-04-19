import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Search, RefreshCw, Download } from "lucide-react";

export interface Column<T = Record<string, unknown>> {
  key: string;
  label: string;
  align?: "left" | "right" | "center";
  render?: (value: unknown, row: T) => React.ReactNode;
}

interface DataTableProps<T = Record<string, unknown>> {
  columns: Column<T>[];
  data: T[] | null;
  loading: boolean;
  error: string | null;
  onRefresh?: () => void;
  searchable?: boolean;
  exportable?: boolean;
  exportName?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns, data, loading, error, onRefresh, searchable = true, exportable = false, exportName = "export"
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");

  const filtered = data?.filter((row) =>
    Object.values(row).some((v) =>
      String(v ?? "").toLowerCase().includes(search.toLowerCase())
    )
  ) ?? [];

  const exportCSV = () => {
    if (!filtered.length) return;
    const header = columns.map((c) => c.label).join(",");
    const rows = filtered.map((row) => columns.map((c) => row[c.key] ?? "").join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${exportName}.csv`; a.click();
  };

  return (
    <div className="space-y-3">
      {(searchable || onRefresh || exportable) && (
        <div className="flex items-center justify-between gap-3">
          {searchable && (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-card border-border"
              />
            </div>
          )}
          <div className="flex gap-2">
            {exportable && (
              <Button variant="outline" size="sm" onClick={exportCSV} className="gap-2">
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            )}
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh} className="gap-2">
                <RefreshCw className="h-4 w-4" /> Refresh
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    className="text-xs font-bold tracking-widest uppercase text-muted-foreground whitespace-nowrap"
                    style={{ textAlign: col.align || "left" }}
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array(6).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    {columns.map((col) => (
                      <TableCell key={col.key}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : error ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center py-12 text-destructive">
                    ⚠ {error}
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="text-center py-12 text-muted-foreground">
                    No data found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row, i) => (
                  <TableRow key={i} className="hover:bg-accent/30 transition-colors">
                    {columns.map((col) => (
                      <TableCell
                        key={col.key}
                        style={{ textAlign: col.align || "left" }}
                        className="whitespace-nowrap py-3"
                      >
                        {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "—")}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      {!loading && !error && (
        <p className="text-xs text-muted-foreground">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}
