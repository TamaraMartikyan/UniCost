import { useData } from "@/hooks/useData";
import { getCostComponents, getIncome } from "@/api";
import { PageHeader } from "@/app/components/PageHeader";
import { KpiCard } from "@/app/components/KpiCard";
import { DataTable, Column } from "@/app/components/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { Users, DollarSign, TrendingUp, Calculator } from "lucide-react";
import { fmt } from "@/lib/utils";

const BASE = "http://localhost:8001";

const SHORT_NAMES: Record<string, string> = {
    "Կիրառական մաթեմատիկայի և ֆիզիկայի ֆակուլտետ": "Applied Math",
    "Մեխանիկամեքենաշինական,տրանսպորտային համակարգերի և դիզայնի ինստիտուտ": "Mechanical",
    "Լեռնամետալուրգիա և քիմիական տեխնոլոգիաների ինստիտուտ": "Mining & Chem",
    "Էներգետիկայի և էլեկտրատեխնիկայի ինստիտուտ": "Energy",
    "Տեղեկատվական և հեռահաղորդակցական տեխնոլոգիաների ու էլեկտրոնիկայի ինստիտուտ": "ICT",
    "Ինժեներական տնտեսագիտության և կառավարման ֆակուլտետ": "Eng. Economics",
};

const shortName = (name: string) =>
    SHORT_NAMES[name?.trim()] ?? name?.split(" ").slice(0, 2).join(" ") ?? name;

export default function Dashboard() {
    const { data: costs, loading: cl } = useData(() => getCostComponents());
    const { data: income, loading: il } = useData(() => getIncome("institute"));
    const { data: studentsData, loading: sl } = useData(() =>
        fetch(`${BASE}/students/total`).then((r) => r.json())
    );
    const { data: studentsByInstitute } = useData(() =>
        fetch(`${BASE}/students/by-institute`).then((r) => r.json())
    );

    const totalStudentsFromView = (studentsData as any[])?.[0]?.Students_Total ?? 0;

    const totals = (costs as any[])?.reduce(
        (acc: any, r: any) => ({
            lecturer: acc.lecturer + (r.lecturer_salary || 0),
            allowanceCosts: acc.allowanceCosts + (r.allowance_costs || 0),
            allCosts: acc.allCosts + (r.all_costs || 0),
        }),
        { lecturer: 0, allowanceCosts: 0, allCosts: 0 }
    );

    const totalIncome = (income as any[])?.reduce(
        (s: number, r: any) => s + (r.institute_income || 0), 0
    );

    // Merge student counts into costs rows
    const costsWithStudents = (costs as any[])?.map((r: any) => {
        const s = (studentsByInstitute as any[])?.find(
            (x: any) => x.institute_id === r.institute_id
        );
        return { ...r, student_count: s?.student_count ?? 0 };
    });

    const chartData = (costs as any[])?.map((r: any) => {
        const inc = (income as any[])?.find((i: any) => i.institute_id === r.institute_id);
        return {
            name: shortName(r.institute_name),
            "All Costs": Math.round((r.all_costs || 0) / 1_000_000),
            "Income": Math.round((inc?.institute_income || 0) / 1_000_000),
        };
    }) ?? [];

    const breakdownData = (costs as any[])?.map((r: any) => ({
        name: shortName(r.institute_name),
        Lecturer: Math.round((r.lecturer_salary || 0) / 1_000_000),
        Variable: Math.round((r.variable_allowance || 0) / 1_000_000),
        Fixed: Math.round((r.fixed_allowance || 0) / 1_000_000),
        Utility: Math.round((r.utility_cost || 0) / 1_000_000),
        Other: Math.round((r.other_costs || 0) / 1_000_000),
    })) ?? [];

    const columns: Column[] = [
        { key: "institute_name", label: "Institute" },
        { key: "student_count", label: "Students", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
        { key: "lecturer_salary", label: "Lecturer", align: "right", render: (v) => <span className="mono text-blue-acc">{fmt.currency(v as number)}</span> },
        { key: "variable_allowance", label: "Variable", align: "right", render: (v) => <span className="mono">{fmt.currency(v as number)}</span> },
        { key: "fixed_allowance", label: "Fixed", align: "right", render: (v) => <span className="mono">{fmt.currency(v as number)}</span> },
        { key: "utility_cost", label: "Utility", align: "right", render: (v) => <span className="mono">{fmt.currency(v as number)}</span> },
        { key: "other_costs", label: "Other", align: "right", render: (v) => <span className="mono text-amber-acc">{fmt.currency(v as number)}</span> },
        { key: "allowance_costs", label: "Allowance", align: "right", render: (v) => <span className="mono text-gold">{fmt.currency(v as number)}</span> },
        { key: "all_costs", label: "All Costs", align: "right", render: (v) => <span className="mono text-green-acc font-semibold">{fmt.currency(v as number)}</span> },
    ];

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-300">
            <PageHeader title="Dashboard" subtitle="University-wide financial overview" />

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    label="Total Students"
                    value={sl ? "..." : fmt.number(totalStudentsFromView)}
                    sub="All students count"
                    icon={Users}
                    accent="blue"
                />
                <KpiCard
                    label="Lecturer Salary"
                    value={fmt.currency(totals?.lecturer)}
                    sub="Teaching costs total"
                    icon={DollarSign}
                    accent="violet"
                />
                <KpiCard
                    label="Total All Costs"
                    value={fmt.currency(totals?.allCosts)}
                    sub="Full expenditure"
                    icon={Calculator}
                    accent="amber"
                />
                <KpiCard
                    label="Total Income"
                    value={fmt.currency(totalIncome)}
                    sub="From tuition fees"
                    icon={TrendingUp}
                    accent="green"
                />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="font-display text-lg">Cost vs Income by Institute</CardTitle>
                        <p className="text-xs text-muted-foreground">Values in millions AMD</p>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={chartData} margin={{ left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <Tooltip
                                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                                    formatter={(v: number) => [`${v}M AMD`]}
                                />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="All Costs" fill="#6B9FE4" radius={[3, 3, 0, 0]} />
                                <Bar dataKey="Income" fill="#6BAD96" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="border-border">
                    <CardHeader className="pb-2">
                        <CardTitle className="font-display text-lg">Cost Breakdown by Institute</CardTitle>
                        <p className="text-xs text-muted-foreground">Stacked components in millions AMD</p>
                    </CardHeader>
                    <CardContent>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={breakdownData} margin={{ left: -10 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                                <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                                <Tooltip
                                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                                    formatter={(v: number) => [`${v}M AMD`]}
                                />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                                <Bar dataKey="Lecturer" stackId="a" fill="#6B9FE4" />
                                <Bar dataKey="Variable" stackId="a" fill="#E8A87C" />
                                <Bar dataKey="Fixed" stackId="a" fill="#9E9FE0" />
                                <Bar dataKey="Utility" stackId="a" fill="#6BAD96" />
                                <Bar dataKey="Other" stackId="a" fill="#E8D87A" radius={[3, 3, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border">
                <CardHeader>
                    <CardTitle className="font-display text-lg">Full Cost Breakdown</CardTitle>
                    <p className="text-xs text-muted-foreground">All calculated components per institute</p>
                </CardHeader>
                <CardContent>
                    <DataTable
                        columns={columns}
                        data={costsWithStudents as any}
                        loading={cl}
                        error={null}
                        exportable
                        exportName="cost-breakdown"
                    />
                </CardContent>
            </Card>
        </div>
    );
}