import { useState } from "react";
import { useData } from "@/hooks/useData";
import { getIncome, getInstitutes } from "@/api";
import { PageHeader } from "@/app/components/PageHeader";
import { KpiCard } from "@/app/components/KpiCard";
import { DataTable, Column } from "@/app/components/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/app/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { fmt } from "@/lib/utils";
import { TrendingUp, Users } from "lucide-react";

const SHORT: Record<string, string> = {
    "Կիրառական մաթեմատիկայի և ֆիզիկայի ֆակուլտետ": "Applied Math",
    "Մեխանիկամեքենաշինական,տրանսպորտային համակարգերի և դիզայնի ինստիտուտ": "Mechanical",
    "Լեռնամետալուրգիա և քիմիական տեխնոլոգիաների ինստիտուտ": "Mining & Chem",
    "Էներգետիկայի և էլեկտրատեխնիկայի ինստիտուտ": "Energy",
    "Տեղեկատվական և հեռահաղորդակցական տեխնոլոգիաների ու էլեկտրոնիկայի ինստիտուտ": "ICT",
    "Ինժեներական տնտեսագիտության և կառավարման ֆակուլտետ": "Eng. Economics",
};
const sn = (name: string) => SHORT[name?.trim()] ?? name?.split(" ").slice(0, 2).join(" ") ?? name;

const LEVELS = [
    { value: "institute", label: "By Institute" },
    { value: "department", label: "By Department" },
    { value: "group", label: "By Group" },
];

const COLS: Record<string, Column[]> = {
    institute: [
        { key: "institute_name", label: "Institute" },
        { key: "institute_code", label: "Code" },
        { key: "group_count", label: "Groups", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
        { key: "total_students", label: "Students", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
        { key: "institute_income", label: "Income", align: "right", render: (v) => <span className="mono text-green-acc font-bold">{fmt.currency(v as number)}</span> },
    ],
    department: [
        { key: "institute_name", label: "Institute" },
        { key: "department_name", label: "Department" },
        { key: "total_students", label: "Students", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
        { key: "department_income", label: "Income", align: "right", render: (v) => <span className="mono text-green-acc font-bold">{fmt.currency(v as number)}</span> },
    ],
    group: [
        { key: "institute_name", label: "Institute" },
        { key: "department_name", label: "Department" },
        { key: "group_name", label: "Group" },
        { key: "group_code", label: "Code" },
        { key: "degree", label: "Degree" },
        { key: "edu_type", label: "Edu Type" },
        { key: "student_count", label: "Students", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
        { key: "tuition_fee", label: "Tuition Fee", align: "right", render: (v) => <span className="mono text-gold">{fmt.currency(v as number)}</span> },
        { key: "group_income", label: "Income", align: "right", render: (v) => <span className="mono text-green-acc font-bold">{fmt.currency(v as number)}</span> },
    ],
};

const INCOME_KEY: Record<string, string> = {
    institute: "institute_income",
    department: "department_income",
    group: "group_income",
};

const NAME_KEY: Record<string, string> = {
    institute: "institute_name",
    department: "department_name",
    group: "group_name",
};

const COLORS = ["#6B9FE4", "#6BAD96", "#E8A87C", "#9E9FE0", "#E8D87A", "#8BA8D8"];

export default function Income() {
    const [level, setLevel] = useState("institute");
    const [instituteId, setInstituteId] = useState<string>("all");

    const { data: institutes } = useData(() => getInstitutes());
    const { data, loading, error, refetch } = useData(
        () => getIncome(level, instituteId !== "all" ? Number(instituteId) : undefined),
        [level, instituteId]
    );

    const rows = (data as any[]) ?? [];
    const incKey = INCOME_KEY[level];
    const nameKey = NAME_KEY[level];
    const totalIncome = rows.reduce((s: number, r: any) => s + (r[incKey] || 0), 0);
    const totalStudents = rows.reduce((s: number, r: any) => s + (r.total_students || r.student_count || 0), 0);

    const selectedName = instituteId === "all"
        ? "All Institutes"
        : (institutes as any[])?.find((i: any) => String(i.institute_id) === instituteId)?.institute_name ?? "Selected";

    const chartData = rows.slice(0, 10).map((r: any) => ({
        name: sn(r[nameKey] ?? ""),
        value: Math.round((r[incKey] || 0) / 1_000_000),
    }));

    return (
        <div className="p-8 space-y-6 animate-in fade-in duration-300">
            <PageHeader title="Income Reports" subtitle="student_count x tuition_fee aggregated by group, department, and institute" />

            {/* Controls */}
            <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">Level</label>
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
                    <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
                        {level === "institute" ? "Filter Institute" : "Filter by Institute"}
                    </label>
                    <Select value={instituteId} onValueChange={setInstituteId}>
                        <SelectTrigger className="w-64 h-9 text-sm bg-card border-border">
                            <span className="truncate text-sm">{selectedName}</span>
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

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard label="Total Income" value={fmt.currency(totalIncome)} sub={`${rows.length} ${level}s`} icon={TrendingUp} accent="green" />
                <KpiCard label="Total Students" value={fmt.number(totalStudents)} sub="Enrolled" icon={Users} accent="blue" />
                <KpiCard label="Avg per Student" value={fmt.currency(totalStudents > 0 ? totalIncome / totalStudents : 0)} sub="Income per student" icon={TrendingUp} accent="gold" />
            </div>

            {/* Chart */}
            <Card className="border-border">
                <CardHeader className="pt-4 px-5 pb-2">
                    <CardTitle className="font-display text-lg">
                        Income {level === "group" ? "(Top 10 Groups)" : `by ${level.charAt(0).toUpperCase() + level.slice(1)}`}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">Values in millions AMD — {selectedName}</p>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                    <ResponsiveContainer width="100%" height={230}>
                        <BarChart data={chartData} margin={{ left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                            <Tooltip
                                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 6, fontSize: 12 }}
                                formatter={(v: number) => [`${v}M AMD`, "Income"]}
                            />
                            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                                {chartData.map((_: any, i: number) => (
                                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Table */}
            <Card className="border-border">
                <CardHeader className="pt-4 px-5 pb-3">
                    <CardTitle className="font-display text-lg">
                        Income Detail — {LEVELS.find((l) => l.value === level)?.label}
                        {instituteId !== "all" && <span className="text-muted-foreground font-normal text-sm ml-2">({selectedName})</span>}
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                    <DataTable
                        columns={COLS[level]}
                        data={rows}
                        loading={loading}
                        error={error}
                        onRefresh={refetch}
                        exportable
                        exportName={`income-${level}`}
                    />
                </CardContent>
            </Card>
        </div>
    );
}