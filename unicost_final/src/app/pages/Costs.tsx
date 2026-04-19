import { useState } from "react";
import { useData } from "@/hooks/useData";
import {
    getCostComponents, getLecturerSalary, getVariableAllowance,
    getFixedAllowance, getUtilityCost, getOtherCosts, getAllCosts, getInstitutes
} from "@/api";
import { PageHeader } from "@/app/components/PageHeader";
import { KpiCard } from "@/app/components/KpiCard";
import { DataTable, Column } from "@/app/components/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/app/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { fmt } from "@/lib/utils";
import { DollarSign } from "lucide-react";

const BASE = "http://localhost:8001";

const REPORTS = [
    {
        id: "components",
        label: "Full Cost Breakdown",
        description: "All cost components per institute in one view",
        fetcher: getCostComponents,
        columns: [
            { key: "institute_name", label: "Institute" },
            { key: "student_count", label: "Students", align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "lecturer_salary", label: "Lecturer Salary", align: "right" as const, render: (v: unknown) => <span className="mono text-blue-acc">{fmt.currency(v as number)}</span> },
            { key: "variable_allowance", label: "Variable Allow.", align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.currency(v as number)}</span> },
            { key: "fixed_allowance", label: "Fixed Allow.", align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.currency(v as number)}</span> },
            { key: "utility_cost", label: "Utility Cost", align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.currency(v as number)}</span> },
            { key: "other_costs", label: "Other Costs", align: "right" as const, render: (v: unknown) => <span className="mono text-amber-acc">{fmt.currency(v as number)}</span> },
            { key: "allowance_costs", label: "Allowance Costs", align: "right" as const, render: (v: unknown) => <span className="mono text-gold">{fmt.currency(v as number)}</span> },
            { key: "all_costs", label: "All Costs", align: "right" as const, render: (v: unknown) => <span className="mono text-green-acc font-bold">{fmt.currency(v as number)}</span> },
        ],
        chartKey: "all_costs", chartColor: "#6B9FE4", chartLabel: "All Costs",
    },
    {
        id: "lecturer",
        label: "Lecturer Salary",
        description: "SUM(hours_yearly x avg_hourly_rate) per institute",
        fetcher: getLecturerSalary,
        columns: [
            { key: "institute_name", label: "Institute" },
            { key: "institute_code", label: "Code" },
            { key: "student_count", label: "Students", align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "lecturer_salary", label: "Lecturer Salary", align: "right" as const, render: (v: unknown) => <span className="mono text-blue-acc font-semibold">{fmt.currency(v as number)}</span> },
        ],
        chartKey: "lecturer_salary", chartColor: "#6B9FE4", chartLabel: "Lecturer Salary",
    },
    {
        id: "variable",
        label: "Variable Allowance",
        description: "yearly_salary + group_count x constant",
        fetcher: getVariableAllowance,
        columns: [
            { key: "name", label: "Institute" },
            { key: "variable_allowance_salary", label: "Variable Allowance", align: "right" as const, render: (v: unknown) => <span className="mono text-gold font-semibold">{fmt.currency(v as number)}</span> },
        ],
        chartKey: "variable_allowance_salary", chartColor: "#E8A87C", chartLabel: "Variable Allowance",
    },
    {
        id: "fixed",
        label: "Fixed Allowance",
        description: "student_count x 732,000,000 / all_students",
        fetcher: getFixedAllowance,
        columns: [
            { key: "institute_name", label: "Institute" },
            { key: "student_count", label: "Students", align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "fixed_allowance", label: "Fixed Allowance", align: "right" as const, render: (v: unknown) => <span className="mono text-gold font-semibold">{fmt.currency(v as number)}</span> },
        ],
        chartKey: "fixed_allowance", chartColor: "#E8D87A", chartLabel: "Fixed Allowance",
    },
    {
        id: "utility",
        label: "Utility Cost",
        description: "(area + [10] + [21] + [3]) x 1524.88",
        fetcher: getUtilityCost,
        columns: [
            { key: "institute_name", label: "Institute" },
            { key: "student_count", label: "Students", align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "area", label: "Area (m2)", align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "10", label: "[10]", align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "21", label: "[21]", align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "3", label: "[3]", align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "utility_cost", label: "Utility Cost", align: "right" as const, render: (v: unknown) => <span className="mono text-amber-acc font-semibold">{fmt.currency(v as number)}</span> },
        ],
        chartKey: "utility_cost", chartColor: "#9E9FE0", chartLabel: "Utility Cost",
    },
    {
        id: "other",
        label: "Other Costs",
        description: "(lecturer + variable + fixed + utility) x 0.15 / 0.84",
        fetcher: getOtherCosts,
        columns: [
            { key: "institute_name", label: "Institute" },
            { key: "student_count", label: "Students", align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "other_costs", label: "Other Costs", align: "right" as const, render: (v: unknown) => <span className="mono text-amber-acc font-semibold">{fmt.currency(v as number)}</span> },
        ],
        chartKey: "other_costs", chartColor: "#8BA8D8", chartLabel: "Other Costs",
    },
    {
        id: "allcosts",
        label: "All Costs (Total)",
        description: "lecturer_salary + allowance_costs",
        fetcher: getAllCosts,
        columns: [
            { key: "institute_name", label: "Institute" },
            { key: "institute_code", label: "Code" },
            { key: "student_count", label: "Students", align: "right" as const, render: (v: unknown) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "all_costs", label: "All Costs", align: "right" as const, render: (v: unknown) => <span className="mono text-green-acc font-bold">{fmt.currency(v as number)}</span> },
        ],
        chartKey: "all_costs", chartColor: "#6BAD96", chartLabel: "All Costs",
    },
];

const SHORT: Record<string, string> = {
    "Կիրառական մաթեմատիկայի և ֆիզիկայի ֆակուլտետ": "Applied Math",
    "Մեխանիկամեքենաշինական,տրանսպորտային համակարգերի և դիզայնի ինստիտուտ": "Mechanical",
    "Լեռնամետալուրգիա և քիմիական տեխնոլոգիաների ինստիտուտ": "Mining & Chem",
    "Էներգետիկայի և էլեկտրատեխնիկայի ինստիտուտ": "Energy",
    "Տեղեկատվական և հեռահաղորդակցական տեխնոլոգիաների ու էլեկտրոնիկայի ինստիտուտ": "ICT",
    "Ինժեներական տնտեսագիտության և կառավարման ֆակուլտետ": "Eng. Economics",
};
const sn = (name: string) => SHORT[name?.trim()] ?? name?.split(" ").slice(0, 2).join(" ") ?? "";

export default function Costs() {
    const [reportId, setReportId] = useState("components");
    const [instituteId, setInstituteId] = useState<string>("all");

    const { data: institutes } = useData(() => getInstitutes());
    const { data: studentsByInstitute } = useData(() =>
        fetch(`${BASE}/students/by-institute`).then((r) => r.json())
    );

    const report = REPORTS.find((r) => r.id === reportId)!;

    const { data, loading, error, refetch } = useData(
        () => report.fetcher(instituteId !== "all" ? Number(instituteId) : undefined),
        [reportId, instituteId]
    );

    const rawRows = (data as any[]) ?? [];
    const rows = rawRows.map((r: any) => {
        const s = (studentsByInstitute as any[])?.find(
            (x: any) => x.institute_id === (r.institute_id ?? r.id)
        );
        return { ...r, student_count: s?.student_count ?? r.student_count ?? 0 };
    });

    const total = rows.reduce((s: number, r: any) => s + (r[report.chartKey] || 0), 0);
    const max = rows.reduce((m: number, r: any) => Math.max(m, r[report.chartKey] || 0), 0);

    const selectedReportLabel = REPORTS.find((r) => r.id === reportId)?.label ?? "";
    const selectedInstituteName = instituteId === "all"
        ? "All Institutes"
        : (institutes as any[])?.find((i: any) => String(i.institute_id) === instituteId)?.institute_name ?? "Selected";

    const chartData = rows.map((r: any) => ({
        name: sn(r.institute_name ?? r.name ?? ""),
        value: Math.round((r[report.chartKey] || 0) / 1_000_000),
    }));

    return (
        <div className="p-8 space-y-6 animate-in fade-in duration-300">
            <PageHeader title="Cost Reports" subtitle="Query every calculated value from the database" />

            {/* Controls */}
            <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">Report Type</label>
                    <Select value={reportId} onValueChange={setReportId}>
                        <SelectTrigger className="w-56 h-9 text-sm bg-card border-border">
                            <span className="truncate text-sm">{selectedReportLabel}</span>
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            {REPORTS.map((r) => (
                                <SelectItem key={r.id} value={r.id} className="text-sm cursor-pointer">
                                    {r.label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">Institute</label>
                    <Select value={instituteId} onValueChange={setInstituteId}>
                        <SelectTrigger className="w-64 h-9 text-sm bg-card border-border">
                            <span className="truncate text-sm">{selectedInstituteName}</span>
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            <SelectItem value="all" className="text-sm">All Institutes</SelectItem>
                            {(institutes as any[])?.map((i: any) => (
                                <SelectItem key={i.institute_id} value={String(i.institute_id)} className="text-sm">
                                    {i.institute_name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Description banner */}
            <div className="flex items-center gap-3 p-3 rounded-md bg-[#8b5cf615] border border-[#8b5cf640]">
                <DollarSign className="h-4 w-4 text-[#a78bfa] flex-shrink-0" />
                <div>
                    <span className="text-sm font-semibold text-[#c4b5fd]">{report.label}</span>
                    <span className="text-xs text-[#a78bfa] font-mono ml-3">{report.description}</span>
                    {instituteId !== "all" && (
                        <span className="text-xs text-muted-foreground ml-3">— {selectedInstituteName}</span>
                    )}
                </div>
            </div>

            {/* KPI + Chart */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                <div className="space-y-4">
                    <KpiCard
                        label={`Total ${report.label}`}
                        value={fmt.currency(total)}
                        sub={`${rows.length} institute${rows.length !== 1 ? "s" : ""}`}
                        icon={DollarSign}
                        accent="blue"
                    />
                    <KpiCard
                        label="Highest Value"
                        value={fmt.currency(max)}
                        sub="Single institute"
                        icon={DollarSign}
                        accent="amber"
                    />
                </div>

                <Card className="xl:col-span-2 border-border shadow-sm">
                    <CardHeader className="pb-2 pt-4 px-5">
                        <CardTitle className="text-base font-semibold text-foreground">
                            {report.chartLabel} by Institute
                        </CardTitle>
                        <p className="text-xs text-muted-foreground">
                            Values in millions AMD — {selectedInstituteName}
                        </p>
                    </CardHeader>
                    <CardContent className="px-5 pb-4">
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={chartData} margin={{ left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <Tooltip
                                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                                    formatter={(v: number) => [`${v}M AMD`, report.chartLabel]}
                                />
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

            {/* Table */}
            <Card className="border-border shadow-sm">
                <CardHeader className="pt-4 px-5 pb-3">
                    <CardTitle className="text-base font-semibold">
                        {report.label} — Detail
                        {instituteId !== "all" && (
                            <span className="text-muted-foreground font-normal text-sm ml-2">({selectedInstituteName})</span>
                        )}
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                    <DataTable
                        columns={report.columns as Column[]}
                        data={rows}
                        loading={loading}
                        error={error}
                        onRefresh={refetch}
                        exportable
                        exportName={report.id}
                    />
                </CardContent>
            </Card>
        </div>
    );
}