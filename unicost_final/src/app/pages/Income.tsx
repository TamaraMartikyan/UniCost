import { useState } from "react";
import { useData } from "@/hooks/useData";
import { getIncome, getInstitutes } from "@/api";
import { PageHeader } from "@/app/components/PageHeader";
import { KpiCard } from "@/app/components/KpiCard";
import { DataTable, Column } from "@/app/components/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/app/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { fmt } from "@/lib/utils";
import { TrendingUp, Users } from "lucide-react";
import { useLang } from "@/lib/LangContext";

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

const INCOME_KEY: Record<string, string> = { institute: "institute_income", department: "department_income", group: "group_income" };
const NAME_KEY: Record<string, string> = { institute: "institute_name", department: "department_name", group: "group_name" };
const COLORS = ["#6B9FE4", "#6BAD96", "#E8A87C", "#9E9FE0", "#E8D87A", "#8BA8D8"];

export default function Income() {
    const { t } = useLang();
    const [level, setLevel] = useState("institute");
    const [instituteId, setInstituteId] = useState<string>("all");

    const LEVELS = [
        { value: "institute", label: t.byInstituteLvl },
        { value: "department", label: t.byDepartment },
        { value: "group", label: t.byGroup },
    ];

    const COLS: Record<string, Column[]> = {
        institute: [
            { key: "institute_name", label: t.institute },
            { key: "institute_code", label: t.code },
            { key: "group_count", label: "Groups", align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "total_students", label: t.students, align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "institute_income", label: t.income, align: "right", render: (v) => <span className="mono text-green-acc font-bold">{fmt.currency(v as number)}</span> },
        ],
        department: [
            { key: "institute_name", label: t.institute },
            { key: "department_name", label: t.department },
            { key: "total_students", label: t.students, align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "department_income", label: t.income, align: "right", render: (v) => <span className="mono text-green-acc font-bold">{fmt.currency(v as number)}</span> },
        ],
        group: [
            { key: "institute_name", label: t.institute },
            { key: "department_name", label: t.department },
            { key: "group_name", label: t.group },
            { key: "group_code", label: t.code },
            { key: "degree", label: t.degree },
            { key: "edu_type", label: t.eduType },
            { key: "student_count", label: t.students, align: "right", render: (v) => <span className="mono">{fmt.number(v as number)}</span> },
            { key: "tuition_fee", label: t.tuitionFee, align: "right", render: (v) => <span className="mono text-gold">{fmt.currency(v as number)}</span> },
            { key: "group_income", label: t.income, align: "right", render: (v) => <span className="mono text-green-acc font-bold">{fmt.currency(v as number)}</span> },
        ],
    };

    const { data: institutes } = useData(() => getInstitutes());
    const { data, loading, error, refetch } = useData(
        () => getIncome(level, instituteId !== "all" ? Number(instituteId) : undefined),
        [level, instituteId]
    );

    const rows = Array.isArray(data) ? data : [];
    const incKey = INCOME_KEY[level];
    const nameKey = NAME_KEY[level];
    const totalIncome = rows.reduce((s: number, r: any) => s + (r[incKey] || 0), 0);
    const totalStudents = rows.reduce((s: number, r: any) => s + (r.total_students || r.student_count || 0), 0);

    const selectedName = instituteId === "all"
        ? t.allInstitutes
        : (institutes as any[])?.find((i: any) => String(i.institute_id) === instituteId)?.institute_name ?? "Selected";

    const getChartName = (r: any) => {
        if (level === "group" && r.group_code) return r.group_code;
        return sn(r[nameKey] ?? "");
    };
    const getFullName = (r: any) => {
        if (level === "group" && r.group_code) return `${r.group_name ?? ""} (${r.group_code})`;
        return r[nameKey] ?? "";
    };

    const chartData = rows.slice(0, 10).map((r: any) => ({
        name: getChartName(r),
        fullName: getFullName(r),
        value: Math.round((r[incKey] || 0) / 1_000_000),
    }));

    return (
        <div className="p-8 space-y-6 animate-in fade-in duration-300">
            <PageHeader title={t.incomeTitle} subtitle={t.incomeSub} />

            <div className="flex flex-wrap gap-4 items-end">
                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">{t.level}</label>
                    <div className="flex gap-1.5">
                        {LEVELS.map((l) => (
                            <button key={l.value} onClick={() => setLevel(l.value)}
                                className={`h-9 px-4 rounded-md text-sm font-medium border transition-all ${level === l.value ? "bg-primary text-white border-primary" : "bg-card border-border text-foreground hover:bg-accent"}`}>
                                {l.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">{t.instituteFilter}</label>
                    <Select value={instituteId} onValueChange={setInstituteId}>
                        <SelectTrigger className="w-64 h-9 text-sm bg-card border-border">
                            <span className="truncate text-sm">{selectedName}</span>
                        </SelectTrigger>
                        <SelectContent className="bg-card border-border">
                            <SelectItem value="all" className="text-sm">{t.allInstitutes}</SelectItem>
                            {(institutes as any[])?.filter((i: any) => !EXCLUDED_INSTITUTES.includes(i.institute_name?.trim())).map((i: any) => (
                                <SelectItem key={i.institute_id} value={String(i.institute_id)} className="text-sm">{i.institute_name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <KpiCard label={t.totalIncome} value={fmt.currency(totalIncome)} sub={`${rows.length} ${level}s`} icon={TrendingUp} accent="green" />
                <KpiCard label={t.totalStudents} value={fmt.number(totalStudents)} sub={t.enrolled} icon={Users} accent="blue" />
                <KpiCard label={t.avgPerStudent} value={fmt.currency(totalStudents > 0 ? totalIncome / totalStudents : 0)} sub={t.incomePerStudent} icon={TrendingUp} accent="gold" />
            </div>

            <Card className="border-border">
                <CardHeader className="pt-4 px-5 pb-2">
                    <CardTitle className="font-display text-lg">
                        {t.income} {level === "group" ? `(Top 10 ${t.groups})` : `${t.byInstitute}`}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground">{t.valuesInMillions} — {selectedName}</p>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                    <ResponsiveContainer width="100%" height={230}>
                        <BarChart data={chartData} margin={{ left: -10 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
                            <Tooltip
                                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12, color: "hsl(var(--foreground))", maxWidth: 320, whiteSpace: "normal", lineHeight: 1.6 }}
                                content={({ active, payload }: any) => {
                                    if (!active || !payload?.length) return null;
                                    const d = payload[0];
                                    return (
                                        <div style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "10px 14px", maxWidth: 320, color: "hsl(var(--foreground))" }}>
                                            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, whiteSpace: "normal", lineHeight: 1.5 }}>{d.payload.fullName}</p>
                                            <p style={{ fontSize: 12, color: "#6BAD96" }}>{t.income}: {d.value}M AMD</p>
                                        </div>
                                    );
                                }}
                            />
                            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                                {chartData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            <Card className="border-border">
                <CardHeader className="pt-4 px-5 pb-3">
                    <CardTitle className="font-display text-lg">
                        {t.incomeDetail} — {LEVELS.find((l) => l.value === level)?.label}
                        {instituteId !== "all" && <span className="text-muted-foreground font-normal text-sm ml-2">({selectedName})</span>}
                    </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-5">
                    <DataTable columns={COLS[level]} data={rows} loading={loading} error={error} onRefresh={refetch} showTotals openOnExport excelUrl={`/export/income?level=${level}${instituteId !== "all" ? `&institute_id=${instituteId}` : ""}`} exportName={`income_by_${level}.xlsx`} />
                </CardContent>
            </Card>
        </div>
    );
}