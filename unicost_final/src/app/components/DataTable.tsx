import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Skeleton } from "@/app/components/ui/skeleton";
import { Search, RefreshCw, Download } from "lucide-react";
import { downloadFile, downloadAndOpen } from "@/lib/utils";

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
    exportName?: string;
    pageSize?: number;
    showTotals?: boolean;
    excelUrl?: string;
    openOnExport?: boolean;
}

export function DataTable<T extends Record<string, unknown>>({
    columns, data, loading, error, onRefresh,
    searchable = true, pageSize = 25, showTotals = false, excelUrl, exportName = "export.xlsx", openOnExport = false,
}: DataTableProps<T>) {
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);

    const filtered = (data ?? []).filter((row) =>
        Object.values(row).some((v) => {
            if (v === null || v === undefined) return false;
            return String(v).toLowerCase().includes(search.toLowerCase());
        })
    );

    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

    const handleSearch = (v: string) => { setSearch(v); setPage(1); };

    const totals: Record<string, unknown> = {};
    if (showTotals && data?.length) {
        columns.forEach((col) => {
            const vals = (data || []).map(r => r[col.key]).filter(v => typeof v === "number") as number[];
            if (vals.length) totals[col.key] = vals.reduce((a, b) => a + b, 0);
        });
    }

    return (
        <div className="space-y-3">
            {(searchable || onRefresh || excelUrl) && (
                <div className="flex items-center justify-between gap-3">
                    {searchable && (
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search..."
                                value={search}
                                onChange={(e) => handleSearch(e.target.value)}
                                className="pl-9 bg-card border-border"
                            />
                        </div>
                    )}
                    <div className="flex gap-2">
                        {excelUrl && (
                            <Button variant="outline" size="sm"
                                onClick={() => openOnExport
                                    ? downloadAndOpen(`http://localhost:8001${excelUrl}`, exportName)
                                    : downloadFile(`http://localhost:8001${excelUrl}`, exportName)}
                                className="gap-2 border-green-500/30 text-green-400 hover:bg-green-500/10">
                                <Download className="h-4 w-4" /> Export Excel
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
                                    <TableHead key={col.key}
                                        className="text-xs font-bold tracking-widest uppercase text-muted-foreground whitespace-nowrap"
                                        style={{ textAlign: col.align || "left" }}>
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
                                            <TableCell key={col.key}><Skeleton className="h-4 w-full" /></TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            ) : error ? (
                                <TableRow>
                                    <TableCell colSpan={columns.length} className="text-center py-12 text-destructive">⚠ {error}</TableCell>
                                </TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={columns.length} className="text-center py-12 text-muted-foreground">No data found</TableCell>
                                </TableRow>
                            ) : (
                                paginated.map((row, i) => (
                                    <TableRow key={i} className="hover:bg-accent/30 transition-colors">
                                        {columns.map((col) => (
                                            <TableCell key={col.key} style={{ textAlign: col.align || "left" }} className="whitespace-nowrap py-3">
                                                {col.render ? col.render(row[col.key], row) : String(row[col.key] ?? "—")}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                ))
                            )}
                            {showTotals && Object.keys(totals).length > 0 && !loading && filtered.length > 0 && (
                                <TableRow className="bg-[#7c3aed]/15 border-t-2 border-[#7c3aed]/40 font-bold">
                                    {columns.map((col, idx) => (
                                        <TableCell key={col.key} style={{ textAlign: col.align || "left" }} className="whitespace-nowrap py-3">
                                            {idx === 0 ? (
                                                <span className="text-[#a78bfa] font-bold text-xs uppercase tracking-widest">TOTAL</span>
                                            ) : totals[col.key] !== undefined ? (
                                                col.render ? col.render(totals[col.key], totals as T) :
                                                    <span className="text-[#a78bfa] font-bold">{String(totals[col.key])}</span>
                                            ) : ""}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {!loading && !error && (
                <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                        {filtered.length} record{filtered.length !== 1 ? "s" : ""}
                        {totalPages > 1 && ` · page ${page} of ${totalPages}`}
                    </p>
                    {totalPages > 1 && (
                        <div className="flex items-center gap-1">
                            <button onClick={() => setPage(1)} disabled={page === 1}
                                className="w-7 h-7 rounded text-xs font-medium bg-secondary border border-border disabled:opacity-30 hover:bg-accent transition-colors">«</button>
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                className="w-7 h-7 rounded text-xs font-medium bg-secondary border border-border disabled:opacity-30 hover:bg-accent transition-colors">‹</button>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                                const p = start + i;
                                return (
                                    <button key={p} onClick={() => setPage(p)}
                                        className={`w-7 h-7 rounded text-xs font-medium border transition-colors ${p === page ? "bg-primary text-white border-primary" : "bg-secondary border-border hover:bg-accent"}`}>
                                        {p}
                                    </button>
                                );
                            })}
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                className="w-7 h-7 rounded text-xs font-medium bg-secondary border border-border disabled:opacity-30 hover:bg-accent transition-colors">›</button>
                            <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                                className="w-7 h-7 rounded text-xs font-medium bg-secondary border border-border disabled:opacity-30 hover:bg-accent transition-colors">»</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}