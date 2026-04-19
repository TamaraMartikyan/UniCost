import { useState } from "react";
import { useData } from "@/hooks/useData";
import { getInstitutes } from "@/api";
import { PageHeader } from "@/app/components/PageHeader";
import { KpiCard } from "@/app/components/KpiCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/app/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/app/components/ui/table";
import { Skeleton } from "@/app/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell, ReferenceLine } from "recharts";
import { fmt } from "@/lib/utils";
import { TrendingUp, TrendingDown, Users, DollarSign, Download } from "lucide-react";
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

const COLORS_BAR = ["#6B9FE4", "#E8A87C", "#6BAD96", "#9E9FE0", "#E8D87A", "#8BA8D8"];

function exportCSV(data: any[], name: string) {
    if (!data?.length) return;
    const keys = Object.keys(data[0]);
    const header = keys.join(",");
    const rows = data.map((r) => keys.map((k) => r[k] ?? "").join(","));
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click();
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
    const [level, setLevel] = useState("institute");
    const [instituteId, setInstituteId] = useState("all");

    const LEVELS = [
        { value: "institute", label: t.byInstituteLvl },
        { value: "department", label: t.byDepartment },
        { value: "group", label: t.byGroup },
    ];

    const { data: institutes } = useData(() => getInstitutes());
    const { data, loading, error } = useData(
        () => fetch(`${BASE}/analytics/per-student?level=${level}${instituteId !== "all" ? `&institute_id=${instituteId}` : ""}`).then((r) => r.json()),
        [level, instituteId]
    );

    const rows = Array.isArray(data) ? data : [];

    const selectedInstituteName = instituteId === "all"
        ? t.allInstitutes
        : (institutes as any[])?.find((i: any) => String(i.institute_id) === instituteId)?.institute_name ?? "Selected";

    const totalStudents = rows.reduce((s: number, r: any) => s + (r.student_count || 0), 0);
    const totalIncome = rows.reduce((s: number, r: any) => s + (r.income || 0), 0);
    const totalCosts = rows.reduce((s: number, r: any) => s + (r.all_costs || r.dept_cost || r.group_cost || 0), 0);
    const totalProfit = rows.reduce((s: number, r: any) => s + (r.profit || 0), 0);
    const avgCostPerStudent = totalStudents > 0 ? totalCosts / totalStudents : 0;

    const nameKey = level === "institute" ? "institute_name" : level === "department" ? "department_name" : "group_name";
    const costKey = level === "institute" ? "all_costs" : level === "department" ? "dept_cost" : "group_cost";

    const profitChart = rows.slice(0, 12).map((r: any) => ({
        name: sn(r[nameKey] ?? ""),
        profit: r.profit || 0,
        income: r.income || 0,
        cost: r[costKey] || 0,
    }));

    const cpsChart = rows
        .filter((r: any) => (r.cost_per_student || 0) > 0)
        .slice(0, 12)
        .map((r: any) => ({
            name: sn(r[nameKey] ?? ""),
            value: r.cost_per_student || 0,
        }));

    const instCols = ["institute_name", "student_count", "all_costs", "income", "cost_per_student", "profit", "avg_tuition_fee", "profitability_ratio"];
    const deptCols = ["institute_name", "department_name", "student_count", "dept_cost", "income", "cost_per_student", "profit"];
    const groupCols = ["institute_name", "department_name", "group_name", "group_code", "degree", "edu_type", "student_count", "tuition_fee", "income", "group_cost", "cost_per_student", "profit", "profitability_ratio"];
    const cols = level === "institute" ? instCols : level === "department" ? deptCols : groupCols;

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
                    <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">{t.level}</label>
                    <div className="flex gap-1.5">
                        {LEVELS.map((l) => (
                            <button
                                key={l.value}
                                onClick={() => setLevel(l.value)}
                                className={`h-9 px-4 rounded-md text-sm font-medium border transition-all ${level === l.value
                                        ? "bg-primary text-white border-primary"
                                        : "bg-card border-border text-foreground hover:bg-accent"
                                    }`}
                            >
                                {l.label}
                            </button>
                        ))}
                    </div>
                </div>

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

                <button
                    onClick={() => exportCSV(rows, `analytics-${level}`)}
                    className="h-9 px-3 rounded-md text-sm font-medium flex items-center gap-1.5 bg-secondary border border-border text-muted-foreground hover:text-foreground transition-colors self-end"
                >
                    <Download className="h-3.5 w-3.5" /> {t.exportCSV}
                </button>
            </div>

            {/* Formula box */}
            <FormulaBox level={level} />

            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                <KpiCard label={t.totalStudents} value={fmt.number(totalStudents)} sub={t.enrolled} icon={Users} accent="blue" />
                <KpiCard label={t.totalIncome} value={fmt.currency(totalIncome)} sub={t.tuitionRevenue} icon={TrendingUp} accent="green" />
                <KpiCard label={t.totalCosts} value={fmt.currency(totalCosts)} sub={t.allExpenditure} icon={DollarSign} accent="amber" />
                <KpiCard label={t.totalProfit} value={fmt.currency(totalProfit)} sub={totalProfit >= 0 ? t.surplus : t.deficit} icon={totalProfit >= 0 ? TrendingUp : TrendingDown} accent={totalProfit >= 0 ? "green" : "red"} />
                <KpiCard label={t.avgCostStudent} value={fmt.currency(avgCostPerStudent)} sub={t.universityAvg} icon={DollarSign} accent="violet" />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card className="border-border">
                    <CardHeader className="pt-4 px-5 pb-2">
                        <CardTitle className="font-display text-base">{t.profitLoss} {LEVELS.find(l => l.value === level)?.label}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                            <span className="inline-block w-2 h-2 rounded-full bg-[#34d399] mr-1" />{t.surplusLabel} &nbsp;
                            <span className="inline-block w-2 h-2 rounded-full bg-[#f87171] mr-1" />{t.deficitLabel} · {t.valuesInMillions} · {selectedInstituteName}
                        </p>
                    </CardHeader>
                    <CardContent className="px-5 pb-4">
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={profitChart.map(r => ({ ...r, profit: Math.round(r.profit / 1_000_000) }))} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} />
                                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}M`} />
                                <Tooltip
                                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                                    formatter={(v: number) => [`${v}M AMD`, t.profit]}
                                    cursor={{ fill: "hsl(var(--accent))", opacity: 0.4 }}
                                />
                                <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="4 2" />
                                <Bar dataKey="profit" radius={[4, 4, 0, 0]} maxBarSize={48}
                                    label={{ position: "top", fontSize: 9, fill: "hsl(var(--muted-foreground))", formatter: (v: number) => v !== 0 ? `${v}M` : "" }}
                                >
                                    {profitChart.map((r: any, i: number) => (
                                        <Cell key={i} fill={r.profit >= 0 ? "#34d399" : "#f87171"} fillOpacity={0.85} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="border-border">
                    <CardHeader className="pt-4 px-5 pb-2">
                        <CardTitle className="font-display text-base">{t.costPerStudentChart}</CardTitle>
                        <p className="text-xs text-muted-foreground">{t.amdPerStudent} · {selectedInstituteName}</p>
                    </CardHeader>
                    <CardContent className="px-5 pb-4">
                        <ResponsiveContainer width="100%" height={240}>
                            <BarChart data={cpsChart} margin={{ left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <Tooltip
                                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                                    formatter={(v: number) => [fmt.currency(v), t.costPerStudent]}
                                />
                                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                                    {cpsChart.map((_: any, i: number) => (
                                        <Cell key={i} fill={COLORS_BAR[i % COLORS_BAR.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Detail Table */}
            <Card className="border-border">
                <CardHeader className="pt-4 px-5 pb-3 flex-row items-center justify-between">
                    <div>
                        <CardTitle className="font-display text-base">
                            {t.analyticsDetail} — {LEVELS.find(l => l.value === level)?.label}
                        </CardTitle>
                        {instituteId !== "all" && (
                            <p className="text-xs text-muted-foreground mt-0.5">{selectedInstituteName}</p>
                        )}
                    </div>
                    <span className="text-xs text-muted-foreground">{rows.length} {t.records}</span>
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