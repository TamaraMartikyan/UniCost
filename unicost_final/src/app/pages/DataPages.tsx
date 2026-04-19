import { useState, useRef } from "react";
import { useData } from "@/hooks/useData";
import { getInstitutes, getDepartments, getGroups, getSubjects, getProfessions } from "@/api";
import { PageHeader } from "@/app/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Input } from "@/app/components/ui/input";
import { Skeleton } from "@/app/components/ui/skeleton";
import { fmt } from "@/lib/utils";
import { Search, RefreshCw, Download, Trash2, Upload, AlertTriangle, X, Check } from "lucide-react";

const BASE = "http://localhost:8001";

// ── Helpers ──────────────────────────────────────────────────────────
async function deleteRow(endpoint: string, id: number) {
    const res = await fetch(`${BASE}/${endpoint}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
}

async function deleteAll(endpoint: string) {
    const res = await fetch(`${BASE}/${endpoint}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
}

async function importFile(endpoint: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/${endpoint}/import`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}

function exportCSV(columns: any[], data: any[], name: string) {
    const header = columns.map((c: any) => c.label).join(",");
    const rows = data.map((row: any) => columns.map((c: any) => row[c.key] ?? "").join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${name}.csv`; a.click();
}

// ── Confirm Dialog ────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-xl p-6 w-[400px] shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                    </div>
                    <div>
                        <p className="font-semibold text-foreground">Are you sure?</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{message}</p>
                    </div>
                </div>
                <div className="flex gap-2 justify-end mt-5">
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium bg-secondary text-foreground hover:bg-accent transition-colors">
                        Cancel
                    </button>
                    <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Import Modal ──────────────────────────────────────────────────────
function ImportModal({ tableName, endpoint, onClose, onSuccess }: {
    tableName: string; endpoint: string; onClose: () => void; onSuccess: () => void;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
    const [message, setMessage] = useState("");
    const [fileName, setFileName] = useState("");

    const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileName(file.name);
        setStatus("loading");
        try {
            const result = await importFile(endpoint, file);
            setStatus("success");
            setMessage(`Successfully imported ${result.imported} records.`);
            onSuccess();
        } catch (err: any) {
            setStatus("error");
            setMessage(err.message);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-xl p-6 w-[480px] shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-display text-lg font-semibold">Import {tableName}</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div
                    onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-accent/30 transition-all"
                >
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm font-medium text-foreground">Click to upload CSV file</p>
                    <p className="text-xs text-muted-foreground mt-1">CSV format with column headers</p>
                    {fileName && <p className="text-xs text-primary mt-2 font-mono">{fileName}</p>}
                    <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
                </div>

                {status === "loading" && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Importing...
                    </div>
                )}
                {status === "success" && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-green-400">
                        <Check className="h-4 w-4" /> {message}
                    </div>
                )}
                {status === "error" && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-red-400">
                        <AlertTriangle className="h-4 w-4" /> {message}
                    </div>
                )}

                <div className="mt-5 p-3 rounded-lg bg-secondary/50 text-xs text-muted-foreground font-mono">
                    CSV must have headers matching column names exactly.
                </div>

                <button onClick={onClose} className="mt-4 w-full py-2 rounded-lg text-sm font-medium bg-secondary hover:bg-accent transition-colors">
                    Close
                </button>
            </div>
        </div>
    );
}

// ── Generic Data Page ─────────────────────────────────────────────────
interface ColDef { key: string; label: string; align?: "left" | "right"; render?: (v: unknown) => React.ReactNode; }

function DataPage({
    title, subtitle, fetcher, columns, endpoint, idKey, csvName,
}: {
    title: string; subtitle: string;
    fetcher: () => Promise<any>;
    columns: ColDef[];
    endpoint: string;
    idKey: string;
    csvName: string;
}) {
    const { data, loading, error, refetch } = useData(fetcher);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [confirm, setConfirm] = useState<{ type: "row" | "selected" | "all"; id?: number } | null>(null);
    const [showImport, setShowImport] = useState(false);
    const [busy, setBusy] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

    const rows = (data as any[]) ?? [];
    const filtered = rows.filter((row) =>
        Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(search.toLowerCase()))
    );

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3000);
    };

    const toggleSelect = (id: number) => {
        setSelected((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selected.size === filtered.length) setSelected(new Set());
        else setSelected(new Set(filtered.map((r) => r[idKey])));
    };

    const handleConfirm = async () => {
        if (!confirm) return;
        setBusy(true);
        try {
            if (confirm.type === "row" && confirm.id != null) {
                await deleteRow(endpoint, confirm.id);
                showToast("Row deleted.");
            } else if (confirm.type === "selected") {
                await Promise.all([...selected].map((id) => deleteRow(endpoint, id)));
                setSelected(new Set());
                showToast(`${selected.size} rows deleted.`);
            } else if (confirm.type === "all") {
                await deleteAll(endpoint);
                showToast("All rows deleted.");
            }
            refetch();
        } catch (e: any) {
            showToast(e.message, false);
        } finally {
            setBusy(false);
            setConfirm(null);
        }
    };

    return (
        <div className="p-8 animate-in fade-in duration-300">
            <PageHeader title={title} subtitle={subtitle} />

            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-9 h-9 bg-card border-border text-sm"
                    />
                </div>
                <div className="flex gap-2 flex-wrap">
                    {selected.size > 0 && (
                        <button
                            onClick={() => setConfirm({ type: "selected" })}
                            className="h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-colors"
                        >
                            <Trash2 className="h-3.5 w-3.5" /> Delete Selected ({selected.size})
                        </button>
                    )}
                    <button
                        onClick={() => setConfirm({ type: "all" })}
                        className="h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 bg-secondary text-muted-foreground border border-border hover:text-red-400 hover:border-red-500/30 transition-colors"
                    >
                        <Trash2 className="h-3.5 w-3.5" /> Delete All
                    </button>
                    <button
                        onClick={() => setShowImport(true)}
                        className="h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors"
                    >
                        <Upload className="h-3.5 w-3.5" /> Import CSV
                    </button>
                    <button
                        onClick={() => exportCSV(columns, filtered, csvName)}
                        className="h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 bg-secondary border border-border text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <Download className="h-3.5 w-3.5" /> Export CSV
                    </button>
                    <button
                        onClick={refetch}
                        className="h-9 px-3 rounded-lg text-sm font-medium flex items-center gap-1.5 bg-secondary border border-border text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <RefreshCw className="h-3.5 w-3.5" /> Refresh
                    </button>
                </div>
            </div>

            <Card className="border-border">
                <CardHeader className="pt-4 px-5 pb-3 flex-row items-center justify-between">
                    <CardTitle className="font-display text-base">{title}</CardTitle>
                    <span className="text-xs text-muted-foreground">{filtered.length} records</span>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                                    <TableHead className="w-10 pl-5">
                                        <input
                                            type="checkbox"
                                            checked={selected.size === filtered.length && filtered.length > 0}
                                            onChange={toggleAll}
                                            className="rounded border-border"
                                        />
                                    </TableHead>
                                    {columns.map((col) => (
                                        <TableHead key={col.key} className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground whitespace-nowrap" style={{ textAlign: col.align || "left" }}>
                                            {col.label}
                                        </TableHead>
                                    ))}
                                    <TableHead className="w-12" />
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array(5).fill(0).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={columns.length + 2}>
                                                <Skeleton className="h-4 w-full" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : error ? (
                                    <TableRow>
                                        <TableCell colSpan={columns.length + 2} className="text-center py-10 text-destructive">
                                            ⚠ {error}
                                        </TableCell>
                                    </TableRow>
                                ) : filtered.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={columns.length + 2} className="text-center py-10 text-muted-foreground">
                                            No data found
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filtered.map((row, i) => {
                                        const id = row[idKey];
                                        const isSelected = selected.has(id);
                                        return (
                                            <TableRow key={i} className={`hover:bg-accent/30 transition-colors ${isSelected ? "bg-primary/5" : ""}`}>
                                                <TableCell className="pl-5">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => toggleSelect(id)}
                                                        className="rounded border-border"
                                                    />
                                                </TableCell>
                                                {columns.map((col) => (
                                                    <TableCell key={col.key} style={{ textAlign: col.align || "left" }} className="py-3 whitespace-nowrap text-sm">
                                                        {col.render ? col.render(row[col.key]) : String(row[col.key] ?? "—")}
                                                    </TableCell>
                                                ))}
                                                <TableCell className="pr-4">
                                                    <button
                                                        onClick={() => setConfirm({ type: "row", id })}
                                                        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            {/* Confirm dialog */}
            {confirm && (
                <ConfirmDialog
                    message={
                        confirm.type === "row" ? "This row will be permanently deleted."
                            : confirm.type === "selected" ? `${selected.size} selected rows will be permanently deleted.`
                                : "ALL rows in this table will be permanently deleted."
                    }
                    onConfirm={handleConfirm}
                    onCancel={() => setConfirm(null)}
                />
            )}

            {/* Import modal */}
            {showImport && (
                <ImportModal
                    tableName={title}
                    endpoint={endpoint}
                    onClose={() => setShowImport(false)}
                    onSuccess={refetch}
                />
            )}

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium shadow-lg border flex items-center gap-2 animate-in slide-in-from-bottom-2 duration-300 ${toast.ok ? "bg-card border-green-500/30 text-green-400" : "bg-card border-red-500/30 text-red-400"
                    }`}>
                    {toast.ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {toast.msg}
                </div>
            )}
        </div>
    );
}

// ── Page exports ──────────────────────────────────────────────────────
export function Institutes() {
    return (
        <DataPage
            title="Institutes" subtitle="Manage institute records"
            fetcher={getInstitutes}
            endpoint="institutes" idKey="institute_id" csvName="institutes"
            columns={[
                { key: "institute_id", label: "ID", render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "institute_name", label: "Name", render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "institute_code", label: "Code", render: (v) => <span className="mono">{v as string}</span> },
            ]}
        />
    );
}

export function Departments() {
    return (
        <DataPage
            title="Departments" subtitle="Manage department records"
            fetcher={getDepartments}
            endpoint="departments" idKey="department_id" csvName="departments"
            columns={[
                { key: "department_id", label: "ID", render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "department_name", label: "Department", render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "department_code", label: "Code", render: (v) => <span className="mono">{v as string}</span> },
                { key: "institute_name", label: "Institute" },
                { key: "yearly_load", label: "Yearly Load", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "avg_hourly_rate", label: "Avg Rate", align: "right", render: (v) => <span className="mono text-[#6BAD96]">{fmt.currency(v as number)}</span> },
            ]}
        />
    );
}

export function Groups() {
    return (
        <DataPage
            title="Groups" subtitle="Manage student group records"
            fetcher={getGroups}
            endpoint="groups" idKey="group_id" csvName="groups"
            columns={[
                { key: "group_id", label: "ID", render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "group_name", label: "Group", render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "group_code", label: "Code", render: (v) => <span className="mono">{v as string}</span> },
                { key: "degree", label: "Degree" },
                { key: "edu_type", label: "Edu Type" },
                { key: "student_count", label: "Students", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "tuition_fee", label: "Tuition", align: "right", render: (v) => <span className="mono text-[#E8A87C]">{fmt.currency(v as number)}</span> },
                { key: "institute_name", label: "Institute" },
            ]}
        />
    );
}

export function Subjects() {
    return (
        <DataPage
            title="Subjects" subtitle="Manage subject records"
            fetcher={getSubjects}
            endpoint="subjects" idKey="subject_id" csvName="subjects"
            columns={[
                { key: "subject_id", label: "ID", render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "subject_name", label: "Subject", render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "department_name", label: "Department" },
                { key: "hours_sem1", label: "Sem 1 Hours", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "hours_sem2", label: "Sem 2 Hours", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "hours_yearly", label: "Yearly Hours", align: "right", render: (v) => <span className="mono text-[#6B9FE4]">{fmt.number(v as number)}</span> },
            ]}
        />
    );
}

export function Professions() {
    return (
        <DataPage
            title="Professions" subtitle="Manage profession records"
            fetcher={getProfessions}
            endpoint="professions" idKey="prof_id" csvName="professions"
            columns={[
                { key: "prof_id", label: "ID", render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "prof_name", label: "Profession", render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "institute_name", label: "Institute" },
            ]}
        />
    );
}

export default Institutes;