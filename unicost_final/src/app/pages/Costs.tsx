import { useState } from "react";
import { useData } from "@/hooks/useData";
import { getCostComponents, getLecturerSalary, getVariableAllowance, getFixedAllowance, getUtilityCost, getOtherCosts, getAllCosts, getInstitutes } from "@/api";
import { PageHeader } from "@/app/components/PageHeader";
import { KpiCard } from "@/app/components/KpiCard";
import { DataTable, Column } from "@/app/components/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/app/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { fmt } from "@/lib/utils";
import { DollarSign } from "lucide-react";
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
const sn = (name: string) => SHORT[name?.trim()] ?? name?.split(" ").slice(0, 2).join(" ") ?? "";

const COLORS_BAR = ["#6B9FE4", "#E8A87C", "#6BAD96", "#9E9FE0", "#E8D87A", "#8BA8D8"];

export default function Costs() {
    const { t } = useLang();
    const [reportId, setReportId] = useState("components");
    const [instituteId, setInstituteId] = useState<string>("all");

    const REPORTS = [
        {
            id: "components", label: t.fullCostBreakdownLabel, description: t.fullCostBreakdownDesc, fetcher: getCostComponents, chartKey: "all_costs", chartColor: "#6B9FE4", chartLabel: t.allCosts,
            columns: [
                { key: "institute_name", label: t.institute },
                { key: "student_count", label: t.students, align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "lecturer_salary", label: t.lecturerSalary, align: "right" as const, render: (v: unknown) => <span className="mono text-blue-acc">{fmt.currency(v as number)}</span> },
                { key: "variable_allowance", label: t.variable, align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.currency(v as number)}</span> },
                { key: "fixed_allowance", label: t.fixed, align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.currency(v as number)}</span> },
                { key: "utility_cost", label: t.utility, align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.currency(v as number)}</span> },
                { key: "other_costs", label: t.other, align: "right" as const, render: (v: unknown) => <span className="mono text-amber-acc">{fmt.currency(v as number)}</span> },
                { key: "allowance_costs", label: t.allowance, align: "right" as const, render: (v: unknown) => <span className="mono text-gold">{fmt.currency(v as number)}</span> },
                { key: "all_costs", label: t.allCosts, align: "right" as const, render: (v: unknown) => <span className="mono text-green-acc font-bold">{fmt.currency(v as number)}</span> },
            ],
        },
        {
            id: "lecturer", label: t.lecturerSalaryLabel, description: t.lecturerSalaryDesc, fetcher: getLecturerSalary, chartKey: "lecturer_salary", chartColor: "#6B9FE4", chartLabel: t.lecturerSalary,
            columns: [
                { key: "institute_name", label: t.institute },
                { key: "institute_code", label: t.code },
                { key: "student_count", label: t.students, align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "lecturer_salary", label: t.lecturerSalary, align: "right" as const, render: (v: unknown) => <span className="mono text-blue-acc font-semibold">{fmt.currency(v as number)}</span> },
            ],
        },
        {
            id: "variable", label: t.variableAllowanceLabel, description: t.variableAllowanceDesc, fetcher: getVariableAllowance, chartKey: "variable_allowance_salary", chartColor: "#E8A87C", chartLabel: t.variable,
            columns: [
                { key: "name", label: t.institute },
                { key: "variable_allowance_salary", label: t.variable, align: "right" as const, render: (v: unknown) => <span className="mono text-gold font-semibold">{fmt.currency(v as number)}</span> },
            ],
        },
        {
            id: "fixed", label: t.fixedAllowanceLabel, description: t.fixedAllowanceDesc, fetcher: getFixedAllowance, chartKey: "fixed_allowance", chartColor: "#E8D87A", chartLabel: t.fixed,
            columns: [
                { key: "institute_name", label: t.institute },
                { key: "student_count", label: t.students, align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "fixed_allowance", label: t.fixed, align: "right" as const, render: (v: unknown) => <span className="mono text-gold font-semibold">{fmt.currency(v as number)}</span> },
            ],
        },
        {
            id: "utility", label: t.utilityCostLabel, description: t.utilityCostDesc, fetcher: getUtilityCost, chartKey: "utility_cost", chartColor: "#9E9FE0", chartLabel: t.utility,
            columns: [
                { key: "institute_name", label: t.institute },
                { key: "student_count", label: t.students, align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "area", label: t.area, align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "utility_cost", label: t.utility, align: "right" as const, render: (v: unknown) => <span className="mono text-amber-acc font-semibold">{fmt.currency(v as number)}</span> },
            ],
        },
        {
            id: "other", label: t.otherCostsLabel, description: t.otherCostsDesc, fetcher: getOtherCosts, chartKey: "other_costs", chartColor: "#8BA8D8", chartLabel: t.other,
            columns: [
                { key: "institute_name", label: t.institute },
                { key: "student_count", label: t.students, align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "other_costs", label: t.other, align: "right" as const, render: (v: unknown) => <span className="mono text-amber-acc font-semibold">{fmt.currency(v as number)}</span> },
            ],
        },
        {
            id: "allcosts", label: t.allCostsTotalLabel, description: t.allCostsTotalDesc, fetcher: getAllCosts, chartKey: "all_costs", chartColor: "#6BAD96", chartLabel: t.allCosts,
            columns: [
                { key: "institute_name", label: t.institute },
                { key: "institute_code", label: t.code },
                { key: "student_count", label: t.students, align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
                { key: "all_costs", label: t.allCosts, align: "right" as const, render: (v: unknown) => <span className="mono text-green-acc font-bold">{fmt.currency(v as number)}</span> },
            ],
        },
    ];

    const { data: institutes } = useData(() => getInstitutes());
    const report = REPORTS.find((r) => r.id === reportId)!;
    const { data, loading, error, refetch } = useData(
        () => report.fetcher(instituteId !== "all" ? Number(instituteId) : undefined),
        [reportId, instituteId]
    );

    const rows = Array.isArray(data) ? data : [];
    const total = rows.reduce((s: number, r: any) => s + (r[report.chartKey] || 0), 0);
    const max = rows.reduce((m: number, r: any) => Math.max(m, r[report.chartKey] || 0), 0);

    const selectedInstituteName = instituteId === "all"
        ? t.allInstitutes
        : (institutes as any[])?.find((i: any) => String(i.institute_id) === instituteId)?.institute_name ?? "Selected";

    const chartData = rows.map((r: any) => ({
        name: sn(r.institute_name ?? r.name ?? ""),
        fullName: r.institute_name ?? r.name ?? "",
        value: Math.round((r[report.chartKey] || 0) / 1_000_000),
    }));
    // Costs page is institute-level only — no group code needed

    return (
        <div className="p-8 space-y-6 animate-in fade-in duration-300">
            <PageHeader title={t.costReportsTitle} subtitle={t.costReportsSub} />

            <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">{t.reportType}</label>
                    <Select value={reportId} onValueChange={setReportId}>
                        <SelectTrigger className="w-56 h-9 text-sm bg-card border-border">
                            <span className="truncate text-sm">{report.label}</span>
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            {REPORTS.map((r) => (
                                <SelectItem key={r.id} value={r.id} className="text-sm cursor-pointer">{r.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">{t.instituteFilter}</label>
                    <Select value={instituteId} onValueChange={setInstituteId}>
                        <SelectTrigger className="w-64 h-9 text-sm bg-card border-border">
                            <span className="truncate text-sm">{selectedInstituteName}</span>
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            <SelectItem value="all" className="text-sm">{t.allInstitutes}</SelectItem>
                            {(institutes as any[])?.map((i: any) => (
                                <SelectItem key={i.institute_id} value={String(i.institute_id)} className="text-sm">{i.institute_name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-md bg-[#8b5cf615] border border-[#8b5cf640]">
                <DollarSign className="h-4 w-4 text-[#a78bfa] flex-shrink-0" />
                <div>
                    <span className="text-sm font-semibold text-[#c4b5fd]">{report.label}</span>
                    <span className="text-xs text-[#a78bfa] font-mono ml-3">{report.description}</span>
                    {instituteId !== "all" && <span className="text-xs text-muted-foreground ml-3">— {selectedInstituteName}</span>}
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className="space-y-4">
                    <KpiCard label={`${t.detail} ${report.label}`} value={fmt.currency(total)} sub={`${rows.length} ${t.byInstitute}`} icon={DollarSign} accent="blue" />
                    <KpiCard label={t.highestValue} value={fmt.currency(max)} sub={t.singleInstitute} icon={DollarSign} accent="amber" />
                </div>

                <Card className="xl:col-span-2 border-border shadow-sm">
                    <CardHeader className="pb-2 pt-4 px-5">
                        <CardTitle className="text-base font-semibold">{report.chartLabel} {t.byInstitute}</CardTitle>
                        <p className="text-xs text-muted-foreground">{t.valuesInMillions} — {selectedInstituteName}</p>
                    </CardHeader>
                    <CardContent className="px-5 pb-4">
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={chartData} margin={{ left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))", maxWidth: 300, whiteSpace: "normal", lineHeight: 1.6 }} content={({ active, payload }: any) => {
                                    if (!active || !payload?.length) return null;
                                    const d = payload[0];
                                    return (
                                        <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "10px 14px", maxWidth: 320, color: "hsl(var(--foreground))" }}>
                                            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, whiteSpace: "normal", lineHeight: 1.5 }}>{d.payload.fullName}</p>
                                            <p style={{ fontSize: 12, color: "#6BAD96" }}>{report.chartLabel}: {d.value}M AMD</p>
                                        </div>
                                    );
                                }} />
                                <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                                    {chartData.map((_: any, i: number) => (
                                        <Cell key={i} fill={report.chartColor} fillOpacity={0.75 + (i % 3) * 0.08} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border shadow-sm">
                <CardHeader className="pt-4 px-5 pb-3">
                    <CardTitle className="text-base font-semibold">
                        {report.label} — {t.detail}
                        {instituteId !== "all" && <span className="text-muted-foreground font-normal text-sm ml-2">({selectedInstituteName})</span>}
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                    <DataTable columns={report.columns as Column[]} data={rows} loading={loading} error={error} onRefresh={refetch} showTotals excelUrl={`/export/cost-components${instituteId !== "all" ? `?institute_id=${instituteId}` : ""}`} exportName="cost_components.xlsx" />
                </CardContent>
            </Card>
        </div>
    );
}