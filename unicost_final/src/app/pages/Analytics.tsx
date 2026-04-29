import { useState, useRef, useEffect } from "react";
import { useData } from "@/hooks/useData";
import { getInstitutes } from "@/api";
import { PageHeader } from "@/app/components/PageHeader";
import { KpiCard } from "@/app/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/app/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Skeleton } from "@/app/components/ui/skeleton";
import { fmt, downloadFile } from "@/lib/utils";
import { TrendingUp, TrendingDown, Users, DollarSign, Download, Printer } from "lucide-react";
import { useLang } from "@/lib/LangContext";

const BASE = "http://localhost:8001";

const SHORT: Record<string, string> = {
    "Կիրառական մաթեմատիկայի և ֆիզիկայի ֆակուլտետ": "Applied Math",
    "Մեխանիկամեքենաշինական,տրանսպորտային համակարգերի և դիզայնի ինստիտուտ": "Mechanical",
    "Լեռնամետալուրգիա և քիմիական տեխնոլոգիաների ինստիտուտ": "Mining & Chem",
    "Էներգետիկայի և էլեկտրատեխնիկայի ինստիտուտ": "Energy",
    "Տեղեկատվական և հեռահաղորդակցական տեխնոլոգիաների ու էլեկտրոնիկայի ինստիտուտ": "ICT",
    "Ինժեներական տնտեսագիտության և կառավարման ֆակուլտետ": "Eng. Economics",
};
const sn = (name: string) => SHORT[name?.trim()] ?? name?.split(" ").slice(0, 2).join(" ") ?? name;

const EXCLUDED_INSTITUTES = [
    'Ֆիզիկական դաստիրակության և սպորտի ամբիոն',
    'Հասարակական գիտությունների ամբիոն',
    'Խորացված անգլերենի ամբիոն',
    'Լեզուների գիտակրթական կենտրոն',
];

function printReport(rows: any[], level: string, cols: string[], colLabels: Record<string, string>, title: string) {
    const fmtVal = (key: string, val: unknown) => {
        if (val === null || val === undefined) return "—";
        if (typeof val === "number") {
            if (["student_count"].includes(key)) return val.toLocaleString();
            if (["profitability_ratio"].includes(key)) return val.toFixed(2);
            return val.toLocaleString("hy-AM", { style: "currency", currency: "AMD", maximumFractionDigits: 0 });
        }
        return String(val);
    };
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
    <style>
        body { font-family: Arial, sans-serif; font-size: 11px; color: #000; padding: 20px; }
        h1 { font-size: 16px; margin-bottom: 4px; }
        p  { font-size: 11px; color: #555; margin-bottom: 16px; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #16213e; color: #fff; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; }
        td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
        tr:nth-child(even) td { background: #f9fafb; }
        .num { text-align: right; }
        tfoot td { background: #7c3aed; color: #fff; font-weight: bold; padding: 6px 8px; }
        @media print { @page { margin: 15mm; } }
    </style></head><body>
    <h1>${title}</h1>
    <p>Generated: ${new Date().toLocaleString()} · ${rows.length} records</p>
    <table>
        <thead><tr>${cols.map(c => `<th>${colLabels[c] ?? c}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(row => `<tr>${cols.map(c => {
        const isNum = typeof row[c] === "number";
        return `<td class="${isNum ? "num" : ""}">${fmtVal(c, row[c])}</td>`;
    }).join("")}</tr>`).join("")}</tbody>
        <tfoot><tr>${cols.map((c, i) => {
        if (i === 0) return `<td>TOTAL</td>`;
        const vals = rows.map(r => r[c]).filter(v => typeof v === "number") as number[];
        if (vals.length) return `<td class="num">${vals.reduce((a, b) => a + b, 0).toLocaleString()}</td>`;
        return `<td></td>`;
    }).join("")}</tr></tfoot>
    </table>
    </body></html>`;
    const w = window.open("", "_blank");
    if (w) {
        w.document.write(html);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 250);
    }
}

function FormulaBox({ level }: { level: string }) {
    const [open, setOpen] = useState(false);
    const { t } = useLang();
    const f = (t.formulas as any)[level];
    if (!f) return null;
    return (
        <div className="rounded-lg border border-border overflow-hidden">
            <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-between px-4 py-3 bg-secondary/40 hover:bg-secondary/60 transition-colors text-left"
            >
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground">📐 {t.formulasTitle}</span>
                    <span className="text-[10px] text-muted-foreground">— {f.title}</span>
                </div>
                <span className="text-muted-foreground text-xs">{open ? t.hideFormulas : t.showFormulas}</span>
            </button>
            {open && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-px bg-border">
                    {f.items.map((item: any, i: number) => (
                        <div key={i} className="bg-card px-4 py-3">
                            <p className="text-[11px] font-bold tracking-widest uppercase text-muted-foreground mb-1">{item.label}</p>
                            <p className="font-mono text-sm text-primary font-semibold mb-1">{item.formula}</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">{item.note}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function Analytics() {
    const { t } = useLang();
    const [instituteId, setInstituteId] = useState("all");
    const level = "institute";

    const { data: institutes } = useData(() => getInstitutes());

    // Frontend cache per level — switching levels uses cached data instantly
    const levelCache = useRef<Record<string, any[]>>({});
    const [allRows, setAllRows] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (levelCache.current[level]) {
            setAllRows(levelCache.current[level]);
            return;
        }
        setLoading(true);
        setError(null);
        fetch(`${BASE}/analytics/per-student?level=institute`)
            .then(r => r.json())
            .then(result => {
                const data = Array.isArray(result) ? result : [];
                levelCache.current[level] = data;
                setAllRows(data);
                setLoading(false);
            })
            .catch(e => { setError(String(e)); setLoading(false); });
    }, [level]);

    // Filter by institute on frontend — instant, no API call
    const rows = instituteId === "all"
        ? allRows
        : allRows.filter((r: any) => String(r.institute_id) === instituteId);

    const selectedInstituteName = instituteId === "all"
        ? t.allInstitutes
        : (institutes as any[])?.find((i: any) => String(i.institute_id) === instituteId)?.institute_name ?? "Selected";

    const totalStudents = rows.reduce((s: number, r: any) => s + (r.student_count || 0), 0);
    const totalIncome = rows.reduce((s: number, r: any) => s + (r.income || 0), 0);
    const totalCosts = rows.reduce((s: number, r: any) => s + (r.all_costs || r.dept_cost || r.group_cost || 0), 0);
    const totalProfit = rows.reduce((s: number, r: any) => s + (r.profit || 0), 0);
    const avgCostPerStudent = totalStudents > 0 ? totalCosts / totalStudents : 0;



    const cols = ["institute_name", "student_count", "all_costs", "income", "cost_per_student", "profit", "avg_tuition_fee", "profitability_ratio"];

    const colLabels: Record<string, string> = {
        institute_name: t.institute,
        department_name: t.department,
        group_name: t.group,
        group_code: t.code,
        degree: t.degree,
        edu_type: t.eduType,
        student_count: t.students,
        all_costs: t.allCosts,
        dept_cost: `${t.department} ${t.allCosts}`,
        group_cost: `${t.group} ${t.allCosts}`,
        income: `${t.income} Σ(n×fee)`,
        cost_per_student: t.costPerStudent,
        profit: `${t.profit} (${t.income} − Cost)`,
        avg_tuition_fee: t.avgTuition,
        profitability_ratio: t.profitability,
        tuition_fee: t.tuitionFee,
    };

    const renderCell = (key: string, value: unknown) => {
        const v = value as number;
        if (key === "student_count") return <span className="mono">{fmt.number(v)}</span>;
        if (key === "profit") return (
            <span className={`mono font-semibold ${v >= 0 ? "text-[#34d399]" : "text-[#f87171]"}`}>
                {v >= 0 ? "+" : ""}{fmt.currency(v)}
            </span>
        );
        if (["all_costs", "dept_cost", "group_cost", "income", "avg_tuition_fee", "tuition_fee", "cost_per_student"].includes(key))
            return <span className="mono">{fmt.currency(v)}</span>;
        if (key === "profitability_ratio")
            return <span className="mono text-[#a78bfa]">{(v as any)?.toFixed ? (v as number).toFixed(2) : v}</span>;
        return <span className="text-sm">{String(value ?? "—")}</span>;
    };

    return (
        <div className="p-8 space-y-6 animate-in fade-in duration-300">
            <PageHeader title={t.analyticsTitle} subtitle={t.analyticsSub} />

            {/* Controls */}
            <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">{t.instituteFilter}</label>
                    <Select value={instituteId} onValueChange={setInstituteId}>
                        <SelectTrigger className="w-64 h-9 text-sm bg-card border-border">
                            <span className="truncate text-sm">{selectedInstituteName}</span>
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            <SelectItem value="all" className="text-sm">{t.allInstitutes}</SelectItem>
                            {(institutes as any[])?.filter((i: any) => !EXCLUDED_INSTITUTES.includes(i.institute_name?.trim())).map((i: any) => (
                                <SelectItem key={i.institute_id} value={String(i.institute_id)} className="text-sm">
                                    {i.institute_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Formula box */}
            <FormulaBox level="institute" />

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <KpiCard label={t.totalStudents} value={fmt.number(totalStudents)} sub={t.enrolled} icon={Users} accent="blue" />
                <KpiCard label={t.totalIncome} value={fmt.currency(totalIncome)} sub={t.tuitionRevenue} icon={TrendingUp} accent="green" />
                <KpiCard label={t.totalCosts} value={fmt.currency(totalCosts)} sub={t.allExpenditure} icon={DollarSign} accent="amber" />
                <KpiCard label={t.totalProfit} value={fmt.currency(totalProfit)} sub={totalProfit >= 0 ? t.surplus : t.deficit} icon={totalProfit >= 0 ? TrendingUp : TrendingDown} accent={totalProfit >= 0 ? "green" : "red"} />
                <KpiCard label={t.avgCostStudent} value={fmt.currency(avgCostPerStudent)} sub={t.universityAvg} icon={DollarSign} accent="violet" />
            </div>

            {/* Institute summary cards — all institutes view */}
            {instituteId === "all" && rows.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {rows.map((r: any) => {
                        const profit = r.profit || 0;
                        const isProfit = profit >= 0;
                        return (
                            <button
                                key={r.institute_id}
                                onClick={() => setInstituteId(String(r.institute_id))}
                                className="text-left rounded-xl border border-border bg-card hover:bg-accent/20 transition-colors p-5 space-y-4"
                            >
                                <p className="text-sm font-semibold text-foreground leading-snug">{r.institute_name?.trim()}</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-0.5">{t.students}</p>
                                        <p className="text-lg font-bold text-blue-400 mono">{fmt.number(r.student_count)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-0.5">{t.costPerStudent}</p>
                                        <p className="text-lg font-bold text-[#a78bfa] mono">{fmt.currency(r.cost_per_student)}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-0.5">{t.totalIncome}</p>
                                        <p className="text-lg font-bold text-green-400 mono">{Math.round(r.income / 1_000_000)}M</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground mb-0.5">{t.totalProfit}</p>
                                        <p className={`text-lg font-bold mono ${isProfit ? "text-[#34d399]" : "text-[#f87171]"}`}>
                                            {isProfit ? "+" : ""}{Math.round(profit / 1_000_000)}M
                                        </p>
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}



            {/* Detail Table */}
            <Card className="border-border">
                <CardHeader className="pt-4 px-5 pb-3">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <CardTitle className="font-display text-base">
                                {t.analyticsDetail}
                            </CardTitle>
                            {instituteId !== "all" && (
                                <p className="text-xs text-muted-foreground mt-0.5">{selectedInstituteName}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <span className="text-xs text-muted-foreground">{rows.length} {t.records}</span>
                            <button
                                onClick={() => downloadFile(`http://localhost:8001/export/analytics?level=${level}${instituteId !== "all" ? `&institute_id=${instituteId}` : ""}`, `analytics_by_${level}.xlsx`)}
                                className="h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 bg-secondary border border-border text-green-400 hover:bg-green-500/10 transition-colors"
                            >
                                <Download className="h-3.5 w-3.5" /> Excel
                            </button>
                            <button
                                onClick={() => printReport(rows, level, cols, colLabels, `${t.analyticsDetail}`)}
                                className="h-8 px-3 rounded-md text-xs font-medium flex items-center gap-1.5 bg-secondary border border-border text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <Printer className="h-3.5 w-3.5" /> Print
                            </button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-secondary/50 hover:bg-secondary/50">
                                    {cols.map((col) => (
                                        <TableHead key={col} className="text-[10px] font-bold tracking-widest uppercase text-muted-foreground whitespace-nowrap">
                                            {colLabels[col] ?? col}
                                        </TableHead>
                                    ))}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    Array(6).fill(0).map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={cols.length}><Skeleton className="h-4 w-full" /></TableCell>
                                        </TableRow>
                                    ))
                                ) : error ? (
                                    <TableRow><TableCell colSpan={cols.length} className="text-center py-10 text-destructive">⚠ {String(error)}</TableCell></TableRow>
                                ) : rows.length === 0 ? (
                                    <TableRow><TableCell colSpan={cols.length} className="text-center py-10 text-muted-foreground">{t.noRecordsFound}</TableCell></TableRow>
                                ) : (
                                    rows.map((row: any, i: number) => (
                                        <TableRow key={i} className="hover:bg-accent/30 transition-colors">
                                            {cols.map((col) => (
                                                <TableCell key={col} className="py-2.5 whitespace-nowrap text-sm">
                                                    {renderCell(col, row[col])}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}