import { useData } from "@/hooks/useData";
import { getCostComponents, getIncome } from "@/api";
import { PageHeader } from "@/app/components/PageHeader";
import { KpiCard } from "@/app/components/KpiCard";
import { DataTable, Column } from "@/app/components/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { Users, DollarSign, TrendingUp, Calculator } from "lucide-react";
import { fmt } from "@/lib/utils";
import { useLang } from "@/lib/LangContext";

const BASE = "http://localhost:8001";

const SHORT_NAMES: Record<string, string> = {
    "Կիրառական մաթեմատիկայի և ֆիզիկայի ֆակուլտետ": "Applied Math",
    "Մեխանիկամեքենաշինական,տրանսպորտային համակարգերի և դիզայնի ինստիտուտ": "Mechanical",
    "Լեռնամետալուրգիա և քիմիական տեխնոլոգիաների ինստիտուտ": "Mining & Chem",
    "Էներգետիկայի և էլեկտրատեխնիկայի ինստիտուտ": "Energy",
    "Տեղեկատվական և հեռահաղորդակցական տեխնոլոգիաների ու էլեկտրոնիկայի ինստիտուտ": "ICT",
    "Ինժեներական տնտեսագիտության և կառավարման ֆակուլտետ": "Eng. Economics",
};
const shortName = (name: string) => SHORT_NAMES[name?.trim()] ?? name?.split(" ").slice(0, 2).join(" ") ?? name;

export default function Dashboard() {
    const { t } = useLang();
    const { data: costs, loading: cl } = useData(() => getCostComponents());
    const { data: income, loading: il } = useData(() => getIncome("institute"));
    const { data: studentsData, loading: sl } = useData(() => fetch(`${BASE}/students/total`).then((r) => r.json()));
    const { data: studentsByInstitute } = useData(() => fetch(`${BASE}/students/by-institute`).then((r) => r.json()));

    const totalStudentsFromView = (studentsData as any[])?.[0]?.Students_Total ?? 0;

    const totals = (costs as any[])?.reduce(
        (acc: any, r: any) => ({
            lecturer: acc.lecturer + (r.lecturer_salary || 0),
            allowanceCosts: acc.allowanceCosts + (r.allowance_costs || 0),
            allCosts: acc.allCosts + (r.all_costs || 0),
        }),
        { lecturer: 0, allowanceCosts: 0, allCosts: 0 }
    );

    const totalIncome = (income as any[])?.reduce((s: number, r: any) => s + (r.institute_income || 0), 0);

    const costsWithStudents = (costs as any[])?.map((r: any) => {
        const s = (studentsByInstitute as any[])?.find((x: any) => x.institute_id === r.institute_id);
        return { ...r, student_count: s?.student_count ?? 0 };
    });

    const chartData = (costs as any[])?.map((r: any) => {
        const inc = (income as any[])?.find((i: any) => i.institute_id === r.institute_id);
        return {
            name: shortName(r.institute_name),
            fullName: r.institute_name ?? "",
            [t.allCosts]: Math.round((r.all_costs || 0) / 1_000_000),
            [t.income]: Math.round((inc?.institute_income || 0) / 1_000_000),
        };
    }) ?? [];

    const breakdownData = (costs as any[])?.map((r: any) => ({
        name: shortName(r.institute_name),
        fullName: r.institute_name ?? "",
        [t.lecturer]: Math.round((r.lecturer_salary || 0) / 1_000_000),
        [t.variable]: Math.round((r.variable_allowance || 0) / 1_000_000),
        [t.fixed]: Math.round((r.fixed_allowance || 0) / 1_000_000),
        [t.utility]: Math.round((r.utility_cost || 0) / 1_000_000),
        [t.other]: Math.round((r.other_costs || 0) / 1_000_000),
    })) ?? [];

    const columns: Column[] = [
        { key: "institute_name", label: t.institute },
        { key: "student_count", label: t.students, align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
        { key: "lecturer_salary", label: t.lecturer, align: "right", render: (v) => <span className="mono text-blue-acc">{fmt.currency(v as number)}</span> },
        { key: "variable_allowance", label: t.variable, align: "right", render: (v) => <span className="mono">{fmt.currency(v as number)}</span> },
        { key: "fixed_allowance", label: t.fixed, align: "right", render: (v) => <span className="mono">{fmt.currency(v as number)}</span> },
        { key: "utility_cost", label: t.utility, align: "right", render: (v) => <span className="mono">{fmt.currency(v as number)}</span> },
        { key: "other_costs", label: t.other, align: "right", render: (v) => <span className="mono text-amber-acc">{fmt.currency(v as number)}</span> },
        { key: "allowance_costs", label: t.allowance, align: "right", render: (v) => <span className="mono text-gold">{fmt.currency(v as number)}</span> },
        { key: "all_costs", label: t.allCosts, align: "right", render: (v) => <span className="mono text-green-acc font-semibold">{fmt.currency(v as number)}</span> },
    ];

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-300">
            <PageHeader title={t.dashboardTitle} subtitle={t.dashboardSub} />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard label={t.totalStudents} value={sl ? "..." : fmt.number(totalStudentsFromView)} sub={t.allStudentsCount} icon={Users} accent="blue" />
                <KpiCard label={t.lecturerSalary} value={fmt.currency(totals?.lecturer)} sub={t.teachingCosts} icon={DollarSign} accent="violet" />
                <KpiCard label={t.totalAllCosts} value={fmt.currency(totals?.allCosts)} sub={t.fullExpenditure} icon={Calculator} accent="amber" />
                <KpiCard label={t.totalIncome} value={fmt.currency(totalIncome)} sub={t.fromTuition} icon={TrendingUp} accent="green" />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="font-display text-lg">{t.costVsIncome}</CardTitle>
                        <p className="text-xs text-muted-foreground">{t.valuesInMillions}</p>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={chartData} margin={{ left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))", maxWidth: 300, whiteSpace: "normal", lineHeight: 1.6 }} content={({ active, payload, label }: any) => {
                                    if (!active || !payload?.length) return null;
                                    const full = payload[0]?.payload?.fullName || label;
                                    return (
                                        <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "10px 14px", maxWidth: 320, color: "hsl(var(--foreground))" }}>
                                            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, whiteSpace: "normal", lineHeight: 1.5 }}>{full}</p>
                                            {payload.map((p: any, i: number) => (
                                                <p key={i} style={{ fontSize: 12, color: p.color }}>{p.name}: {p.value}M AMD</p>
                                            ))}
                                        </div>
                                    );
                                }} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey={t.allCosts} fill="#6B9FE4" radius={[3, 3, 0, 0]} />
                                <Bar dataKey={t.income} fill="#6BAD96" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="font-display text-lg">{t.costBreakdown}</CardTitle>
                        <p className="text-xs text-muted-foreground">{t.stackedComponents}</p>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={breakdownData} margin={{ left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))", maxWidth: 300, whiteSpace: "normal", lineHeight: 1.6 }} content={({ active, payload }: any) => {
                                    if (!active || !payload?.length) return null;
                                    const full = payload[0]?.payload?.fullName || "";
                                    return (
                                        <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "10px 14px", maxWidth: 320, color: "hsl(var(--foreground))" }}>
                                            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, whiteSpace: "normal", lineHeight: 1.5 }}>{full}</p>
                                            {payload.map((p: any, i: number) => (
                                                <p key={i} style={{ fontSize: 12, color: p.fill }}>{p.name}: {p.value}M AMD</p>
                                            ))}
                                        </div>
                                    );
                                }} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey={t.lecturer} stackId="a" fill="#6B9FE4" />
                                <Bar dataKey={t.variable} stackId="a" fill="#E8A87C" />
                                <Bar dataKey={t.fixed} stackId="a" fill="#9E9FE0" />
                                <Bar dataKey={t.utility} stackId="a" fill="#6BAD96" />
                                <Bar dataKey={t.other} stackId="a" fill="#E8D87A" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border">
                <CardHeader>
                    <CardTitle className="font-display text-lg">{t.fullCostBreakdown}</CardTitle>
                    <p className="text-xs text-muted-foreground">{t.allComponents}</p>
                </CardHeader>
                <CardContent>
                    <DataTable columns={columns} data={costsWithStudents as any} loading={cl} error={null} showTotals excelUrl="/export/cost-components" exportName="cost_components.xlsx" />
                </CardContent>
            </Card>
        </div>
    );
}