import { useState, useRef } from "react";
import { useData } from "@/hooks/useData";
import { getInstitutes, getDepartments, getGroups, getSubjects, getProfessions } from "@/api";
import { PageHeader } from "@/app/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Skeleton } from "@/app/components/ui/skeleton";
import { fmt, downloadFile } from "@/lib/utils";
import { Plus, Pencil, Trash2, Upload, AlertTriangle, X, Check, Save, RefreshCw, Download } from "lucide-react";
import { useLang } from "@/lib/LangContext";

const BASE = "http://localhost:8001";

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
function exportCSV(columns: any[], data: any[], name: string) {
    if (!data?.length) return;
    const header = columns.map((c: any) => c.key).join(",");
    const rows = data.map((row: any) =>
        columns.map((c: any) => {
            const v = row[c.key];
            if (v === null || v === undefined) return "";
            if (typeof v === "number") return String(v);
            const s = String(v);
            if (s.includes(",") || s.includes('"') || s.includes("\n"))
                return `"${s.replace(/"/g, '""')}"`;
            return s;
        }).join(",")
    );
    const csv = "\uFEFF" + [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${name}.csv`; a.click();
    URL.revokeObjectURL(url);
}

interface FieldDef {
    key: string;
    label: string;
    type?: "text" | "number" | "select";
    options?: { value: string | number; label: string }[];
    required?: boolean;
    align?: "left" | "right";
    render?: (v: unknown) => React.ReactNode;
    tableOnly?: boolean;
    formOnly?: boolean;
    maxLength?: number;
    isInt?: boolean;
    isDecimal?: boolean;
    min?: number;
    max?: number;
    duplicateCheck?: string;  // endpoint to check e.g. "institutes"
    duplicateParam?: string;  // query param name e.g. "institute_code"
    duplicateIdKey?: string;  // id key to exclude self e.g. "institute_id"
}

function validateForm(fields: FieldDef[], form: Record<string, any>): Record<string, string> {
    const errors: Record<string, string> = {};
    const formFields = fields.filter((f) => !f.tableOnly);

    for (const field of formFields) {
        const val = form[field.key];
        const strVal = String(val ?? "").trim();

        if (field.required && !strVal) {
            errors[field.key] = "This field is required";
            continue;
        }
        if (!strVal) continue;

        if (field.type === "select" && !val) {
            errors[field.key] = "Please select a value";
            continue;
        }

        if (field.type === "number") {
            const num = Number(strVal);
            if (isNaN(num)) { errors[field.key] = "Must be a valid number"; continue; }
            if (field.isInt && !Number.isInteger(num)) { errors[field.key] = "Must be a whole number (no decimals)"; continue; }
            if (field.isDecimal) {
                const parts = strVal.split(".");
                if (parts[1] && parts[1].length > 2) { errors[field.key] = "Max 2 decimal places"; continue; }
            }
            if (field.min !== undefined && num < field.min) { errors[field.key] = `Minimum value is ${field.min}`; continue; }
            if (field.max !== undefined && num > field.max) { errors[field.key] = `Maximum value is ${field.max}`; continue; }
        }

        if (field.maxLength && strVal.length > field.maxLength) {
            errors[field.key] = `Max ${field.maxLength} characters (currently ${strVal.length})`;
            continue;
        }
    }

    // Cross-field: paid + free must equal student_count
    if ("student_count" in form && "paid_edu_count" in form && "free_edu_count" in form) {
        const sc = Number(form.student_count ?? 0);
        const pc = Number(form.paid_edu_count ?? 0);
        const fc = Number(form.free_edu_count ?? 0);
        if ((pc + fc) !== sc && (pc > 0 || fc > 0)) {
            errors.paid_edu_count = `Paid (${pc}) + Free (${fc}) = ${pc + fc}, must equal Students (${sc})`;
            errors.free_edu_count = `Paid (${pc}) + Free (${fc}) = ${pc + fc}, must equal Students (${sc})`;
        }
    }

    return errors;
}

// ── Server-side duplicate check ───────────────────────────────────────
async function checkDuplicate(field: FieldDef, value: string, editId: number | null): Promise<string | null> {
    if (!field.duplicateCheck || !value.trim()) return null;
    try {
        let url = `${BASE}/${field.duplicateCheck}/check-duplicate?${field.duplicateParam}=${encodeURIComponent(value)}`;
        if (editId != null && field.duplicateIdKey) url += `&${field.duplicateIdKey}=${editId}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.duplicate) return `"${value}" already exists in the database`;
        return null;
    } catch {
        return null; // don't block on network error
    }
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
    return (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg text-sm font-medium shadow-xl border flex items-center gap-2 z-50 animate-in slide-in-from-bottom-2 duration-300 ${ok ? "bg-card border-green-500/30 text-green-400" : "bg-card border-red-500/30 text-red-400"}`}>
            {ok ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {msg}
        </div>
    );
}

function Confirm({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
    const { t } = useLang();
    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-xl p-6 w-96 shadow-2xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-red-400" />
                    </div>
                    <div>
                        <p className="font-semibold">{t.areYouSure}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{message}</p>
                    </div>
                </div>
                <div className="flex gap-2 justify-end mt-5">
                    <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium bg-secondary hover:bg-accent transition-colors">{t.cancelBtn}</button>
                    <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500 text-white hover:bg-red-600 transition-colors">{t.deleteBtn}</button>
                </div>
            </div>
        </div>
    );
}

function ImportModal({ title, endpoint, fields, onClose, onSuccess }: {
    title: string; endpoint: string; fields: FieldDef[]; onClose: () => void; onSuccess: () => void;
}) {
    const { t } = useLang();
    const fileRef = useRef<HTMLInputElement>(null);
    const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
    const [message, setMessage] = useState("");
    const [dragging, setDragging] = useState(false);
    const formFields = fields.filter((f) => !f.tableOnly);

    const processFile = async (file: File) => {
        setStatus("loading"); setMessage("");
        try {
            const result = await apiImport(endpoint, file);
            setStatus("success");
            setMessage(`${t.importSuccess} ${result.imported} ${t.importRecords}`);
            onSuccess();
        } catch (err: any) {
            setStatus("error");
            try { setMessage(JSON.parse(err.message).detail ?? err.message); }
            catch { setMessage(err.message); }
        }
    };

    const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await processFile(file);
        if (fileRef.current) fileRef.current.value = "";
    };

    const handleDrop = async (e: React.DragEvent) => {
        e.preventDefault(); setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) await processFile(file);
    };

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
            <div className="bg-card border border-border rounded-xl p-6 w-[500px] shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                    <h3 className="font-display text-lg font-semibold">{t.importTitle} {title}</h3>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
                </div>
                <div
                    onClick={() => fileRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${dragging ? "border-primary bg-primary/10" : "border-border hover:border-primary/50 hover:bg-accent/30"}`}
                >
                    <Upload className={`h-8 w-8 mx-auto mb-3 ${dragging ? "text-primary" : "text-muted-foreground"}`} />
                    <p className="text-sm font-medium">{dragging ? "Drop file here" : t.importUploadText}</p>
                    <p className="text-xs text-muted-foreground mt-1">{t.importMustInclude}</p>
                    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileInput} />
                </div>
                {status === "loading" && <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />{t.importFile}...</div>}
                {status === "success" && <div className="mt-4 flex items-center gap-2 text-sm text-green-400"><Check className="h-4 w-4 flex-shrink-0" />{message}</div>}
                {status === "error" && <div className="mt-4 flex items-start gap-2 text-sm text-red-400"><AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /><span className="break-all">{message}</span></div>}
                <div className="mt-4 p-3 rounded-lg bg-secondary/50">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{t.importRequiredCols}</p>
                    <p className="text-xs font-mono text-muted-foreground">{formFields.map((f) => f.key).join(", ")}</p>
                </div>
                <button onClick={() => downloadFile(`${BASE}/${endpoint}/template`, `${endpoint}_template.xlsx`)} className="mt-3 w-full py-2 rounded-lg text-sm font-medium bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors flex items-center justify-center gap-2">
                    <Download className="h-3.5 w-3.5" /> {t.importDownloadTpl}
                </button>
                <button onClick={onClose} className="mt-2 w-full py-2 rounded-lg text-sm font-medium bg-secondary hover:bg-accent transition-colors">{t.importClose}</button>
            </div>
        </div>
    );
}

function ManagePage({ title, subtitle, fetcher, endpoint, idKey, fields }: {
    title: string; subtitle: string; fetcher: () => Promise<any>;
    endpoint: string; idKey: string; fields: FieldDef[];
}) {
    const { t } = useLang();
    const { data, loading, error, refetch } = useData(fetcher);
    const rows = Array.isArray(data) ? data : [];

    const emptyForm = Object.fromEntries(fields.filter((f) => !f.tableOnly).map((f) => [f.key, ""]));
    const [form, setForm] = useState<Record<string, any>>(emptyForm);
    const [editId, setEditId] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState<{ type: "row" | "all"; id?: number } | null>(null);
    const [showImport, setShowImport] = useState(false);
    const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 20;
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [touched, setTouched] = useState<Record<string, boolean>>({});
    const [shake, setShake] = useState(false);

    const showToast = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 3000); };
    const resetForm = () => { setForm(emptyForm); setEditId(null); setErrors({}); setTouched({}); };

    const handleEdit = (row: any) => {
        setEditId(row[idKey]);
        const filled: Record<string, any> = {};
        fields.filter((f) => !f.tableOnly).forEach((f) => { filled[f.key] = row[f.key] ?? ""; });
        setForm(filled); setErrors({}); setTouched({});
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleFieldChange = (key: string, value: string) => {
        const newForm = { ...form, [key]: value };
        setForm(newForm);
        if (touched[key]) setErrors(validateForm(fields, newForm));
    };

    const handleFieldBlur = async (key: string) => {
        setTouched((prev) => ({ ...prev, [key]: true }));
        const errs = validateForm(fields, form);
        // Server-side duplicate check on blur
        const field = fields.find((f) => f.key === key);
        if (field?.duplicateCheck && form[key]) {
            const dupErr = await checkDuplicate(field, String(form[key]), editId);
            if (dupErr) errs[key] = dupErr;
        }
        setErrors(errs);
    };

    const handleSubmit = async () => {
        const allTouched = Object.fromEntries(fields.filter((f) => !f.tableOnly).map((f) => [f.key, true]));
        setTouched(allTouched);
        const errs = validateForm(fields, form);
        setErrors(errs);
        if (Object.keys(errs).length > 0) {
            setShake(true); setTimeout(() => setShake(false), 500); return;
        }
        setBusy(true);
        try {
            if (editId != null) { await apiPut(endpoint, editId, form); showToast(t.update + " ✓"); }
            else { await apiPost(endpoint, form); showToast(t.addRow + " ✓"); }
            resetForm(); refetch();
        } catch (e: any) { showToast(e.message, false); }
        finally { setBusy(false); }
    };

    const handleDelete = async () => {
        if (!confirm) return;
        setBusy(true);
        try {
            if (confirm.type === "row" && confirm.id != null) { await apiDelete(endpoint, confirm.id); showToast(t.deleteBtn + " ✓"); }
            else { await apiDeleteAll(endpoint); showToast(t.deleteAll + " ✓"); }
            refetch();
        } catch (e: any) { showToast(e.message, false); }
        finally { setBusy(false); setConfirm(null); }
    };

    const tableFields = fields.filter((f) => !f.formOnly);
    const formFields = fields.filter((f) => !f.tableOnly);
    const filtered = rows.filter((row) =>
        Object.values(row).some((v) => {
            if (v === null || v === undefined) return false;
            return String(v).toLowerCase().includes(search.toLowerCase());
        })
    );

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const handleSearch = (v: string) => { setSearch(v); setPage(1); };

    return (
        <div className="p-8 animate-in fade-in duration-300">
            <PageHeader title={title} subtitle={subtitle} />
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                {/* Form panel */}
                <div className="xl:col-span-1">
                    <Card className="border-border sticky top-6">
                        <CardHeader className="pt-4 px-5 pb-3 border-b border-border">
                            <div className="flex items-center justify-between">
                                <CardTitle className="font-display text-base">
                                    {editId != null ? `${t.edit} ${title}` : `${t.addRow} ${title}`}
                                </CardTitle>
                                {editId != null && (
                                    <button onClick={resetForm} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                                        <X className="h-3.5 w-3.5" /> {t.cancelEdit}
                                    </button>
                                )}
                            </div>
                            {editId != null && <p className="text-xs text-primary mt-1">{t.editRecord} #{editId}</p>}
                        </CardHeader>
                        <CardContent className="px-5 py-4 space-y-3">
                            {formFields.map((field) => {
                                const hasError = !!(touched[field.key] && errors[field.key]);
                                const labelStr = typeof field.label === "string" ? field.label : String(field.key);
                                return (
                                    <div key={field.key}>
                                        <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground block mb-1">
                                            {field.label}{field.required && <span className="text-red-400 ml-1">*</span>}
                                        </label>
                                        {field.type === "select" ? (
                                            <select
                                                value={form[field.key] ?? ""}
                                                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                                onBlur={() => handleFieldBlur(field.key)}
                                                className={`w-full h-9 px-3 rounded-md text-sm bg-secondary border text-foreground focus:outline-none transition-colors ${hasError ? "border-red-500" : "border-border focus:border-primary"}`}
                                            >
                                                <option value="">{t.selectOption}</option>
                                                {field.options?.map((o) => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <Input
                                                type={field.type === "number" ? "number" : "text"}
                                                value={form[field.key] ?? ""}
                                                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                                                onBlur={() => handleFieldBlur(field.key)}
                                                className={`h-9 bg-secondary text-sm transition-colors ${hasError ? "border-red-500" : "border-border"}`}
                                                placeholder={`Enter ${labelStr.toLowerCase()}`}
                                            />
                                        )}
                                        {hasError && (
                                            <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                                                <span>⚠</span> {errors[field.key]}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}

                            {/* Calculated field previews */}
                            {(form.monthly_salary || form.yearly_load) && (
                                <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                                    <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">{t.avgHourlyRateCalc}</p>
                                    <p className="mono text-[#6BAD96] text-sm font-semibold">
                                        {form.yearly_load && parseFloat(form.yearly_load) > 0
                                            ? new Intl.NumberFormat("hy-AM", { style: "currency", currency: "AMD", maximumFractionDigits: 0 }).format(
                                                Math.round((12.0 * parseFloat(form.monthly_salary || "0")) / parseFloat(form.yearly_load)))
                                            : "—"}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{t.avgHourlyRateFormula}</p>
                                </div>
                            )}
                            {(form.hours_sem1 || form.hours_sem2) && (
                                <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                                    <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-1">{t.hoursYearlyCalc}</p>
                                    <p className="mono text-[#6B9FE4] text-sm font-semibold">
                                        {(parseFloat(form.hours_sem1 || "0") + parseFloat(form.hours_sem2 || "0")).toFixed(0)} hrs
                                    </p>
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{t.hoursYearlyFormula}</p>
                                </div>
                            )}

                            <style>{`@keyframes shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}`}</style>
                            <button
                                onClick={handleSubmit}
                                disabled={busy}
                                style={shake ? { animation: "shake 0.4s ease" } : {}}
                                className="w-full h-9 mt-2 rounded-md text-sm font-semibold flex items-center justify-center gap-2 bg-primary text-white hover:bg-primary/90 disabled:opacity-50 transition-colors"
                            >
                                {busy ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    : editId != null ? <><Save className="h-4 w-4" />{t.update}</>
                                        : <><Plus className="h-4 w-4" />{t.addRow}</>}
                            </button>
                        </CardContent>
                    </Card>
                </div>

                {/* Table panel */}
                <div className="xl:col-span-2 space-y-3">
                    <div className="flex flex-wrap gap-2 items-center justify-between">
                        <div className="relative flex-1 max-w-xs">
                            <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            <Input value={search} onChange={(e) => handleSearch(e.target.value)} placeholder={t.search} className="pl-9 h-9 bg-card border-border text-sm" />
                        </div>
                        <div className="flex gap-2 flex-wrap">
                            <button onClick={() => setShowImport(true)} className="h-9 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors">
                                <Upload className="h-3.5 w-3.5" /> {t.importFile}
                            </button>
                            <button
                                onClick={() => downloadFile(`http://localhost:8001/export/${endpoint}`, `${endpoint}.xlsx`)}
                                className="h-9 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 bg-secondary border border-border text-green-400 hover:bg-green-500/10 transition-colors"
                            >
                                <Download className="h-3.5 w-3.5" /> Excel
                            </button>
                            <button onClick={refetch} className="h-9 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 bg-secondary border border-border text-muted-foreground hover:text-foreground transition-colors">
                                <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setConfirm({ type: "all" })} className="h-9 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 bg-secondary border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/30 transition-colors">
                                <Trash2 className="h-3.5 w-3.5" /> {t.deleteAll}
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
                                            <TableHead className="w-20 text-center text-[10px] font-bold tracking-widest uppercase text-muted-foreground">{t.actions}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {loading ? (
                                            Array(5).fill(0).map((_, i) => (
                                                <TableRow key={i}><TableCell colSpan={tableFields.length + 1}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                                            ))
                                        ) : error ? (
                                            <TableRow><TableCell colSpan={tableFields.length + 1} className="text-center py-10 text-destructive">⚠ {String(error)}</TableCell></TableRow>
                                        ) : filtered.length === 0 ? (
                                            <TableRow><TableCell colSpan={tableFields.length + 1} className="text-center py-10 text-muted-foreground">{t.noRecordsFound}</TableCell></TableRow>
                                        ) : (
                                            paginated.map((row, i) => {
                                                const id = row[idKey];
                                                const isEditing = editId === id;
                                                return (
                                                    <TableRow key={i} className={`transition-colors ${isEditing ? "bg-primary/5 border-l-2 border-primary" : "hover:bg-accent/30"}`}>
                                                        {tableFields.map((col) => (
                                                            <TableCell key={col.key} style={{ textAlign: col.align || "left" }} className="py-2.5 text-sm whitespace-nowrap">
                                                                {col.render ? col.render(row[col.key]) : String(row[col.key] ?? "—")}
                                                            </TableCell>
                                                        ))}
                                                        <TableCell className="text-center">
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button onClick={() => handleEdit(row)} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors" title={t.edit}>
                                                                    <Pencil className="h-3.5 w-3.5" />
                                                                </button>
                                                                <button onClick={() => setConfirm({ type: "row", id })} className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors" title={t.deleteBtn}>
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
                                <div className="px-4 py-2 border-t border-border flex items-center justify-between">
                                    <p className="text-xs text-muted-foreground">{filtered.length} {t.records}</p>
                                    {totalPages > 1 && (
                                        <div className="flex items-center gap-1.5">
                                            <button onClick={() => setPage(1)} disabled={page === 1} className="w-7 h-7 rounded text-xs font-medium bg-secondary border border-border disabled:opacity-30 hover:bg-accent transition-colors">«</button>
                                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="w-7 h-7 rounded text-xs font-medium bg-secondary border border-border disabled:opacity-30 hover:bg-accent transition-colors">‹</button>
                                            <span className="text-xs text-muted-foreground px-2">{page} / {totalPages}</span>
                                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="w-7 h-7 rounded text-xs font-medium bg-secondary border border-border disabled:opacity-30 hover:bg-accent transition-colors">›</button>
                                            <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="w-7 h-7 rounded text-xs font-medium bg-secondary border border-border disabled:opacity-30 hover:bg-accent transition-colors">»</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {confirm && <Confirm message={confirm.type === "row" ? t.deleteRowMsg : t.deleteAllMsg} onConfirm={handleDelete} onCancel={() => setConfirm(null)} />}
            {showImport && <ImportModal title={title} endpoint={endpoint} fields={fields} onClose={() => setShowImport(false)} onSuccess={refetch} />}
            {toast && <Toast msg={toast.msg} ok={toast.ok} />}
        </div>
    );
}

export function ManageInstitutes() {
    const { t } = useLang();
    return (
        <ManagePage title={t.institutes} subtitle={t.instituteSub} fetcher={getInstitutes} endpoint="institutes" idKey="institute_id"
            fields={[
                { key: "institute_id", label: "ID", tableOnly: true, render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "institute_name", label: t.instituteName, required: true, render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "institute_code", label: t.instituteCode, required: true, maxLength: 20, duplicateCheck: "institutes", duplicateParam: "institute_code", duplicateIdKey: "institute_id", render: (v) => <span className="mono">{v as string}</span> },
            ]}
        />
    );
}

export function ManageDepartments() {
    const { t } = useLang();
    const { data: institutes } = useData(getInstitutes);
    const instOptions = (institutes as any[])?.map((i: any) => ({ value: i.institute_id, label: i.institute_name })) ?? [];
    return (
        <ManagePage title={t.departments} subtitle={t.departmentSub} fetcher={getDepartments} endpoint="departments" idKey="department_id"
            fields={[
                { key: "department_id", label: "ID", tableOnly: true, render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "department_name", label: t.departmentName, required: true, render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "department_code", label: t.departmentCode, required: true, maxLength: 20, duplicateCheck: "departments", duplicateParam: "department_code", duplicateIdKey: "department_id", render: (v) => <span className="mono">{v as string}</span> },
                { key: "institute_id", label: t.selectInstitute, required: true, type: "select", options: instOptions, formOnly: true },
                { key: "institute_name", label: t.institute, tableOnly: true },
                { key: "yearly_load", label: t.yearlyLoad, type: "number", align: "right", isInt: true, min: 1, render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "hourly_salary", label: t.hourlySalary, type: "number", align: "right", isInt: true, min: 0, render: (v) => <span className="mono">{fmt.currency(v as number)}</span> },
                { key: "monthly_salary", label: t.monthlySalary, type: "number", align: "right", isDecimal: true, min: 0, render: (v) => <span className="mono">{fmt.currency(v as number)}</span> },
                { key: "avg_hourly_rate", label: t.avgRate, tableOnly: true, align: "right", render: (v) => <span className="mono text-[#6BAD96]">{fmt.currency(v as number)}</span> },
            ]}
        />
    );
}

export function ManageGroups() {
    const { t } = useLang();
    const { data: professions } = useData(getProfessions);
    const { data: departments } = useData(getDepartments);
    const profOptions = (professions as any[])?.map((p: any) => ({ value: p.prof_id, label: p.prof_name })) ?? [];
    const deptOptions = (departments as any[])?.map((d: any) => ({ value: d.department_id, label: d.department_name })) ?? [];
    return (
        <ManagePage title={t.groups} subtitle={t.groupSub} fetcher={getGroups} endpoint="groups" idKey="group_id"
            fields={[
                { key: "group_id", label: "ID", tableOnly: true, render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "group_name", label: t.groupName, required: true, render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "group_code", label: t.code, required: true, maxLength: 40, duplicateCheck: "groups", duplicateParam: "group_code", duplicateIdKey: "group_id", render: (v) => <span className="mono">{v as string}</span> },
                { key: "degree", label: t.degree, required: true, type: "select", options: [{ value: "Bachelor", label: "Bachelor" }, { value: "Master", label: "Master" }, { value: "PhD", label: "PhD" }] },
                { key: "edu_type", label: t.eduType, required: true, type: "select", options: [{ value: "Day", label: "Day" }, { value: "Evening", label: "Evening" }, { value: "Distance", label: "Distance" }] },
                { key: "student_count", label: t.students, required: true, type: "number", align: "right", isInt: true, min: 1, render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "paid_edu_count", label: t.paid, type: "number", align: "right", isInt: true, min: 0, render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "free_edu_count", label: t.free, type: "number", align: "right", isInt: true, min: 0, render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "tuition_fee", label: t.tuitionFee, required: true, type: "number", align: "right", isInt: true, min: 0, render: (v) => <span className="mono text-[#E8A87C]">{fmt.currency(v as number)}</span> },
                { key: "prof_id", label: t.profession, required: true, type: "select", options: profOptions, formOnly: true },
                { key: "department_id", label: t.department, type: "select", options: deptOptions, formOnly: true },
                { key: "department_name", label: t.department, tableOnly: true },
                { key: "institute_name", label: t.institute, tableOnly: true },
            ]}
        />
    );
}

export function ManageSubjects() {
    const { t } = useLang();
    const { data: departments } = useData(getDepartments);
    const deptOptions = (departments as any[])?.map((d: any) => ({ value: d.department_id, label: d.department_name })) ?? [];
    return (
        <ManagePage title={t.subjects} subtitle={t.subjectSub} fetcher={getSubjects} endpoint="subjects" idKey="subject_id"
            fields={[
                { key: "subject_id", label: "ID", tableOnly: true, render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "subject_name", label: t.subjectName, required: true, duplicateCheck: "subjects", duplicateParam: "subject_name", duplicateIdKey: "subject_id", render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "department_id", label: t.department, required: true, type: "select", options: deptOptions, formOnly: true },
                { key: "department_name", label: t.department, tableOnly: true },
                { key: "hours_sem1", label: t.sem1Hours, required: true, type: "number", align: "right", isInt: true, min: 0, render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "hours_sem2", label: t.sem2Hours, required: true, type: "number", align: "right", isInt: true, min: 0, render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "hours_yearly", label: t.yearlyHours, tableOnly: true, align: "right", render: (v) => <span className="mono text-[#6B9FE4]">{fmt.number(v as number)}</span> },
            ]}
        />
    );
}

export function ManageProfessions() {
    const { t } = useLang();
    const { data: institutes } = useData(getInstitutes);
    const instOptions = (institutes as any[])?.map((i: any) => ({ value: i.institute_id, label: i.institute_name })) ?? [];
    return (
        <ManagePage title={t.professions} subtitle={t.professionSub} fetcher={getProfessions} endpoint="professions" idKey="prof_id"
            fields={[
                { key: "prof_id", label: "ID", tableOnly: true, render: (v) => <span className="mono text-muted-foreground">#{v as number}</span> },
                { key: "prof_name", label: t.professionName, required: true, duplicateCheck: "professions", duplicateParam: "prof_name", duplicateIdKey: "prof_id", render: (v) => <span className="font-medium">{v as string}</span> },
                { key: "institute_id", label: t.selectInstitute, required: true, type: "select", options: instOptions, formOnly: true },
                { key: "institute_name", label: t.institute, tableOnly: true },
            ]}
        />
    );
}

export default ManageInstitutes;