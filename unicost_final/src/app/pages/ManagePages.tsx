import { useState, useRef, useEffect } from "react";
import { useData } from "@/hooks/useData";
import { getInstitutes, getDepartments, getGroups, getSubjects, getProfessions } from "@/api";
import { PageHeader } from "@/app/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Skeleton } from "@/app/components/ui/skeleton";
import { fmt } from "@/lib/utils";
import { Plus, Pencil, Trash2, Upload, AlertTriangle, X, Check, Save, RefreshCw, Download } from "lucide-react";

const BASE = "http://localhost:8001";

// ── API helpers ──────────────────────────────────────────────────────
async function apiDelete(endpoint: string, id: number) {
    const res = await fetch(`${BASE}/${endpoint}/${id}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
}
async function apiDeleteAll(endpoint: string) {
    const res = await fetch(`${BASE}/${endpoint}`, { method: "DELETE" });
    if (!res.ok) throw new Error(await res.text());
}
async function apiPost(endpoint: string, body: object) {
    const res = await fetch(`${BASE}/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
async function apiPut(endpoint: string, id: number, body: object) {
    const res = await fetch(`${BASE}/${endpoint}/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
async function apiImport(endpoint: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/${endpoint}/import`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
}
function exportCSV(columns: FieldDef[], data: any[], name: string) {
    const header = columns.map((c) => c.key).join(",");
    const rows = data.map((row) => columns.map((c) => row[c.key] ?? "").join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click();
}

// ── Shared types ─────────────────────────────────────────────────────
interface FieldDef {
    key: string;
    label: string;
    type?: "text" | "number" | "select";
    options?: { value: string | number; label: string }[];
    required?: boolean;
    align?: "left" | "right";
    render?: (v: unknown) => React.ReactNode;
    tableOnly?: boolean;   // show in table but not form
    formOnly?: boolean;    // show in form but not table
}

// ── Toast ─────────────────────────────────────────────────────────────
function Toast({ msg, ok }: { msg: string; ok: boolean }) {
    return (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium shadow-xl border flex items-center gap-2 z-50 animate-in slide-in-from-bottom-2 duration-300 ${ok ? "bg-card border-green-500/30 text-green-400" : "bg-card border-red-500/30 text-red-400"}`}>
            {ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {msg}
        </div>
    );
}

// ── Confirm dialog ────────────────────────────────────────────────────
function Confirm({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-xl p-6 w-96 shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                    </div>
                    <div>
                        <p className="font-semibold">Are you sure?</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{message}</p>
                    </div>
                </div>
                <div className="flex gap-2 justify-end mt-5">
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium bg-secondary hover:bg-accent transition-colors">Cancel</button>
                    <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">Delete</button>
                </div>
            </div>
        </div>
    );
}

// ── Import modal ──────────────────────────────────────────────────────
function ImportModal({ title, endpoint, fields, onClose, onSuccess }: {
    title: string; endpoint: string; fields: FieldDef[]; onClose: () => void; onSuccess: () => void;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
    const [message, setMessage] = useState("");
    const [dragging, setDragging] = useState(false);
    const formFields = fields.filter((f) => !f.tableOnly);

    const processFile = async (file: File) => {
        if (!file) return;
        setStatus("loading");
        setMessage("");
        try {
            const result = await apiImport(endpoint, file);
            setStatus("success");
            setMessage(`Successfully imported ${result.imported} records.`);
            onSuccess();
        } catch (err: any) {
            setStatus("error");
            try {
                const parsed = JSON.parse(err.message);
                setMessage(parsed.detail ?? err.message);
            } catch {
                setMessage(err.message);
            }
        }
    };

    const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await processFile(file);
        // Reset input so same file can be picked again
        if (fileRef.current) fileRef.current.value = "";
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) await processFile(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setDragging(true);
    };

    const handleDragLeave = () => setDragging(false);

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-xl p-6 w-[500px] shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-display text-lg font-semibold">Import {title}</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
                </div>

                {/* Drop zone */}
                <div
                    onClick={() => fileRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${dragging
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50 hover:bg-accent/30"
                        }`}
                >
                    <Upload className={`h-8 w-8 mx-auto mb-3 ${dragging ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="text-sm font-medium">
                        {dragging ? "Drop file here" : "Click or drag & drop CSV / Excel file"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Supports .csv, .xlsx, .xls</p>
                    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileInput} />
                </div>

                {/* Status */}
                {status === "loading" && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        Importing...
                    </div>
                )}
                {status === "success" && (
                    <div className="mt-4 flex items-center gap-2 text-sm text-green-400">
                        <Check className="h-4 w-4 flex-shrink-0" />{message}
                    </div>
                )}
                {status === "error" && (
                    <div className="mt-4 flex items-start gap-2 text-sm text-red-400">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                        <span className="break-all">{message}</span>
                    </div>
                )}

                {/* Required columns */}
                <div className="mt-4 p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Required columns:</p>
                    <p className="text-xs font-mono text-muted-foreground">{formFields.map((f) => f.key).join(", ")}</p>
                </div>

                <button
                    onClick={() => window.open(`http://localhost:8001/${endpoint}/template`, "_blank")}
                    className="mt-3 w-full py-2 rounded-lg text-sm font-medium bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors flex items-center justify-center gap-2"
                >
                    <Download className="h-3.5 w-3.5" /> Download Excel Template
                </button>
                <button onClick={onClose} className="mt-2 w-full py-2 rounded-lg text-sm font-medium bg-secondary hover:bg-accent transition-colors">
                    Close
                </button>
            </div>
        </div>
    );
}

// ── Main manage page component ────────────────────────────────────────
function ManagePage({
    title, subtitle, fetcher, endpoint, idKey, fields,
}: {
    title: string; subtitle: string;
    fetcher: () => Promise<any>;
    endpoint: string; idKey: string;
    fields: FieldDef[];
}) {
    const { data, loading, error, refetch } = useData(fetcher);
    const rows = (data as any[]) ?? [];

    const emptyForm = Object.fromEntries(fields.filter((f) => !f.tableOnly).map((f) => [f.key, ""]));
    const [form, setForm] = useState<Record<string, any>>(emptyForm);
    const [editId, setEditId] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState<{ type: "row" | "all"; id?: number } | null>(null);
    const [showImport, setShowImport] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const [search, setSearch] = useState("");

    const showToast = (msg: string, ok = true) => {
        setToast({ msg, ok });
        setTimeout(() => setToast(null), 3000);
    };

    const resetForm = () => { setForm(emptyForm); setEditId(null); };

    const handleEdit = (row: any) => {
        setEditId(row[idKey]);
        const filled: Record<string, any> = {};
        fields.filter((f) => !f.tableOnly).forEach((f) => { filled[f.key] = row[f.key] ?? ""; });
        setForm(filled);
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleSubmit = async () => {
        setBusy(true);
        try {
            if (editId != null) {
                await apiPut(endpoint, editId, form);
                showToast("Row updated successfully.");
            } else {
                await apiPost(endpoint, form);
                showToast("Row added successfully.");
            }
            resetForm();
            refetch();
        } catch (e: any) {
            showToast(e.message, false);
        } finally {
            setBusy(false);
        }
    };

    const handleDelete = async () => {
        if (!confirm) return;
        setBusy(true);
        try {
            if (confirm.type === "row" && confirm.id != null) {
                await apiDelete(endpoint, confirm.id);
                showToast("Row deleted.");
            } else {
                await apiDeleteAll(endpoint);
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

    const tableFields = fields.filter((f) => !f.formOnly);
    const formFields = fields.filter((f) => !f.tableOnly);
    const filtered = rows.filter((row) =>
        Object.values(row).some((v) => String(v ?? "").toLowerCase().includes(search.toLowerCase()))
    );

    return (
        <div className="p-8 animate-in fade-in duration-300">
            <PageHeader title={`Manage ${title}`} subtitle={subtitle} />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* ── Form panel ── */}
                <div className="xl:col-span-1">
                    <Card className="border-border sticky top-6">
                        <CardHeader className="pt-4 px-5 pb-3 border-b border-border">
                            <div className="flex items-center justify-between">
                                <CardTitle className="font-display text-base">
                                    {editId != null ? `Edit ${title}` : `Add New ${title}`}
                                </CardTitle>
                                {editId != null && (
                                    <button onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                                        <X className="h-3.5 w-3.5" /> Cancel
                                    </button>
                                )}
                            </div>
                            {editId != null && (
                                <p className="text-xs text-primary mt-1">Editing record #{editId}</p>
                            )}
                        </CardHeader>
                        <CardContent className="px-5 py-4 space-y-3">
                            {formFields.map((field) => (
                                <div key={field.key}>
                                    <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground block mb-1">
                                        {field.label}{field.required && <span className="text-red-400 ml-1">*</span>}
                                    </label>
                                    {field.type === "select" ? (
                                        <select
                                            value={form[field.key] ?? ""}
                                            onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                                            className="w-full h-9 px-3 rounded-md text-sm bg-secondary border border-border text-foreground focus:outline-none focus:border-primary transition-colors"
                                        >
                                            <option value="">— Select —</option>
                                            {field.options?.map((o) => (
                                                <option key={o.value} value={o.value}>{o.label}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <Input
                                            type={field.type === "number" ? "number" : "text"}
                                            value={form[field.key] ?? ""}
                                            onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                                            className="h-9 bg-secondary border-border text-sm"
                                            placeholder={`Enter ${field.label.toLowerCase()}`}
                                        />
                                    )}
                                </div>
                            ))}


                            {/* Calculated field previews */}
                            {(form.monthly_salary || form.yearly_load) && (
                                <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                                    <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">Avg Hourly Rate (auto-calculated)</p>
                                    <p className="mono text-[#6BAD96] text-sm font-semibold">
                                        {form.yearly_load && parseFloat(form.yearly_load) > 0
                                            ? new Intl.NumberFormat('hy-AM', { style: 'currency', currency: 'AMD', maximumFractionDigits: 0 }).format(
                                                Math.round((12.0 * parseFloat(form.monthly_salary || '0')) / parseFloat(form.yearly_load)))
                                            : '—'}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">ROUND((12 × monthly_salary) / yearly_load, 0)</p>
                                </div>
                            )}
                            {(form.hours_sem1 !== undefined || form.hours_sem2 !== undefined) && (form.hours_sem1 || form.hours_sem2) && (
                                <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                                    <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">Hours Yearly (auto-calculated)</p>
                                    <p className="mono text-[#6B9FE4] text-sm font-semibold">
                                        {(parseFloat(form.hours_sem1 || '0') + parseFloat(form.hours_sem2 || '0')).toFixed(0)} hrs
                                    </p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">hours_sem1 + hours_sem2</p>
                                </div>
                            )}

                            <button
                                onClick={handleSubmit}
                                disabled={busy}
                                className="w-full h-9 mt-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                                {busy ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : editId != null ? (
                                    <><Save className="h-4 w-4" /> Update</>
                                ) : (
                                    <><Plus className="h-4 w-4" /> Add Row</>
                                )}
                            </button>
                        </CardContent>
                    </Card>
                </div>

                {/* ── Table panel ── */}
                <div className="xl:col-span-2 space-y-3">
                    {/* Toolbar */}
                    <div className="flex flex-wrap gap-2 items-center justify-between">
                        <div className="relative flex-1 max-w-xs">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-9 h-9 bg-card border-border text-sm" />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <button onClick={() => setShowImport(true)} className="h-9 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors">
                                <Upload className="h-3.5 w-3.5" /> Import
                            </button>
                            <button onClick={() => exportCSV(tableFields, filtered, endpoint)} className="h-9 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 bg-secondary border border-border text-muted-foreground hover:text-foreground transition-colors">
                                <Download className="h-3.5 w-3.5" /> Export
                            </button>
                            <button onClick={refetch} className="h-9 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 bg-secondary border border-border text-muted-foreground hover:text-foreground transition-colors">
                                <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setConfirm({ type: "all" })} className="h-9 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 bg-secondary border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/30 transition-colors">
                                <Trash2 className="h-3.5 w-3.5" /> Delete All
                            </button>
                        </div>
                    </div>

                    <Card className="border-border">
                        <CardContent className="px-0 pb-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                                            {tableFields.map((col) => (
                                                <TableHead key={col.key} className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground whitespace-nowrap" style={{ textAlign: col.align || "left" }}>
                                                    {col.label}
                                                </TableHead>
                                            ))}
                                            <TableHead className="w-20 text-center text-[10px] font-bold tracking-widest uppercase text-muted-foreground">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loading ? (
                                            Array(5).fill(0).map((_, i) => (
                                                <TableRow key={i}>
                                                    <TableCell colSpan={tableFields.length + 1}><Skeleton className="h-4 w-full" /></TableCell>
                                                </TableRow>
                                            ))
                                        ) : error ? (
                                            <TableRow><TableCell colSpan={tableFields.length + 1} className="text-center py-10 text-destructive">⚠ {error}</TableCell></TableRow>
                                        ) : filtered.length === 0 ? (
                                            <TableRow><TableCell colSpan={tableFields.length + 1} className="text-center py-10 text-muted-foreground">No records found</TableCell></TableRow>
                                        ) : (
                                            filtered.map((row, i) => {
                                                const id = row[idKey];
                                                const isEditing = editId === id;
                                                return (
                                                    <TableRow key={i} className={`transition-colors ${isEditing ? "bg-primary/8 border-l-2 border-primary" : "hover:bg-accent/30"}`}>
                                                        {tableFields.map((col) => (
                                                            <TableCell key={col.key} style={{ textAlign: col.align || "left" }} className="py-2.5 text-sm whitespace-nowrap">
                                                                {col.render ? col.render(row[col.key]) : String(row[col.key] ?? "—")}
                                                            </TableCell>
                                                        ))}
                                                        <TableCell className="text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button onClick={() => handleEdit(row)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title="Edit">
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </button>
                                                                <button onClick={() => setConfirm({ type: "row", id })} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Delete">
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                            {!loading && !error && (
                                <div className="px-4 py-2 border-t border-border">
                                    <p className="text-xs text-muted-foreground">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {confirm && <Confirm message={confirm.type === "row" ? "This record will be permanently deleted." : "ALL records in this table will be permanently deleted."} onConfirm={handleDelete} onCancel={() => setConfirm(null)} />}
            {showImport && <ImportModal title={title} endpoint={endpoint} fields={fields} onClose={() => setShowImport(false)} onSuccess={refetch} />}
            {toast && <Toast msg={toast.msg} ok={toast.ok} />}
        </div>
    );
}

// ── Page exports ──────────────────────────────────────────────────────
export function ManageInstitutes() {
    return (
        <ManagePage
            title="Institutes" subtitle="Add, edit or remove institutes"
            fetcher={getInstitutes} endpoint="institutes" idKey="institute_id"
            fields={[
                { key: "institute_id", label: "ID", tableOnly: true, render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "institute_name", label: "Institute Name", required: true, render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "institute_code", label: "Code", required: true, render: (v) => <span className="mono">{v as string}</span> },
            ]}
        />
    );
}

export function ManageDepartments() {
    const { data: institutes } = useData(getInstitutes);
    const instOptions = (institutes as any[])?.map((i: any) => ({ value: i.institute_id, label: i.institute_name })) ?? [];

    return (
        <ManagePage
            title="Departments" subtitle="Add, edit or remove departments"
            fetcher={getDepartments} endpoint="departments" idKey="department_id"
            fields={[
                { key: "department_id", label: "ID", tableOnly: true, render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "department_name", label: "Name", required: true, render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "department_code", label: "Code", required: true, render: (v) => <span className="mono">{v as string}</span> },
                { key: "institute_id", label: "Institute", type: "select", options: instOptions, formOnly: true },
                { key: "institute_name", label: "Institute", tableOnly: true },
                { key: "yearly_load", label: "Yearly Load", type: "number", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "hourly_salary", label: "Hourly Salary", type: "number", align: "right", render: (v) => <span className="mono">{fmt.currency(v as number)}</span> },
                { key: "monthly_salary", label: "Monthly Salary", type: "number", align: "right", render: (v) => <span className="mono">{fmt.currency(v as number)}</span> },
                { key: "avg_hourly_rate", label: "Avg Rate", type: "number", align: "right", render: (v) => <span className="mono text-[#6BAD96]">{fmt.currency(v as number)}</span> },
            ]}
        />
    );
}

export function ManageGroups() {
    const { data: professions } = useData(getProfessions);
    const { data: departments } = useData(getDepartments);
    const profOptions = (professions as any[])?.map((p: any) => ({ value: p.prof_id, label: p.prof_name })) ?? [];
    const deptOptions = (departments as any[])?.map((d: any) => ({ value: d.department_id, label: d.department_name })) ?? [];

    return (
        <ManagePage
            title="Groups" subtitle="Add, edit or remove student groups"
            fetcher={getGroups} endpoint="groups" idKey="group_id"
            fields={[
                { key: "group_id", label: "ID", tableOnly: true, render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "group_name", label: "Group Name", required: true, render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "group_code", label: "Code", required: true, render: (v) => <span className="mono">{v as string}</span> },
                { key: "degree", label: "Degree", type: "select", options: [{ value: "Bachelor", label: "Bachelor" }, { value: "Master", label: "Master" }, { value: "PhD", label: "PhD" }] },
                { key: "edu_type", label: "Edu Type", type: "select", options: [{ value: "Day", label: "Day" }, { value: "Evening", label: "Evening" }, { value: "Distance", label: "Distance" }] },
                { key: "student_count", label: "Students", type: "number", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "paid_edu_count", label: "Paid", type: "number", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "free_edu_count", label: "Free", type: "number", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "tuition_fee", label: "Tuition Fee", type: "number", align: "right", render: (v) => <span className="mono text-[#E8A87C]">{fmt.currency(v as number)}</span> },
                { key: "prof_id", label: "Profession", type: "select", options: profOptions, formOnly: true },
                { key: "department_id", label: "Department", type: "select", options: deptOptions, formOnly: true },
                { key: "department_name", label: "Department", tableOnly: true },
                { key: "institute_name", label: "Institute", tableOnly: true },
            ]}
        />
    );
}

export function ManageSubjects() {
    const { data: departments } = useData(getDepartments);
    const deptOptions = (departments as any[])?.map((d: any) => ({ value: d.department_id, label: d.department_name })) ?? [];

    return (
        <ManagePage
            title="Subjects" subtitle="Add, edit or remove subjects"
            fetcher={getSubjects} endpoint="subjects" idKey="subject_id"
            fields={[
                { key: "subject_id", label: "ID", tableOnly: true, render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "subject_name", label: "Subject Name", required: true, render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "department_id", label: "Department", type: "select", options: deptOptions, formOnly: true },
                { key: "department_name", label: "Department", tableOnly: true },
                { key: "hours_sem1", label: "Sem 1 Hours", type: "number", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "hours_sem2", label: "Sem 2 Hours", type: "number", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "hours_yearly", label: "Yearly Hours", tableOnly: true, align: "right", render: (v) => <span className="mono text-[#6B9FE4]">{fmt.number(v as number)}</span> },
            ]}
        />
    );
}

export function ManageProfessions() {
    const { data: institutes } = useData(getInstitutes);
    const instOptions = (institutes as any[])?.map((i: any) => ({ value: i.institute_id, label: i.institute_name })) ?? [];

    return (
        <ManagePage
            title="Professions" subtitle="Add, edit or remove professions"
            fetcher={getProfessions} endpoint="professions" idKey="prof_id"
            fields={[
                { key: "prof_id", label: "ID", tableOnly: true, render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "prof_name", label: "Profession", required: true, render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "institute_id", label: "Institute", type: "select", options: instOptions, formOnly: true },
                { key: "institute_name", label: "Institute", tableOnly: true },
            ]}
        />
    );
}

export default ManageInstitutes;