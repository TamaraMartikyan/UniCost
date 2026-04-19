import { Card, CardContent } from "@/app/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
    label: string;
    value: string;
    sub?: string;
    icon?: LucideIcon;
    accent?: "gold" | "blue" | "green" | "red" | "amber" | "violet" | "teal";
}

const accentMap = {
    gold: { text: "text-[#7DB8D8]", icon: "bg-[#7DB8D8]/20 text-[#7DB8D8]", border: "border-[#7DB8D8]/30" },
    blue: { text: "text-[#6B9FE4]", icon: "bg-[#6B9FE4]/20 text-[#6B9FE4]", border: "border-[#6B9FE4]/30" },
    green: { text: "text-[#5BBCAD]", icon: "bg-[#5BBCAD]/20 text-[#5BBCAD]", border: "border-[#5BBCAD]/30" },
    red: { text: "text-[#8BA8D8]", icon: "bg-[#8BA8D8]/20 text-[#8BA8D8]", border: "border-[#8BA8D8]/30" },
    amber: { text: "text-[#E8A87C]", icon: "bg-[#E8A87C]/20 text-[#E8A87C]", border: "border-[#E8A87C]/30" },
    violet: { text: "text-[#9E9FE0]", icon: "bg-[#9E9FE0]/20 text-[#9E9FE0]", border: "border-[#9E9FE0]/30" },
    teal: { text: "text-[#6ABFAA]", icon: "bg-[#6ABFAA]/20 text-[#6ABFAA]", border: "border-[#6ABFAA]/30" },
};

export function KpiCard({ label, value, sub, icon: Icon, accent = "green" }: KpiCardProps) {
    const a = accentMap[accent];
    return (
        <Card className={cn("border shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md", a.border)}>
            <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                    <span className="text-[10px] font-bold tracking-[1.5px] uppercase text-muted-foreground">{label}</span>
                    {Icon && (
                        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", a.icon)}>
                            <Icon className="h-4 w-4" />
                        </div>
                    )}
                </div>
                <div className={cn("font-display text-2xl font-bold tracking-tight", a.text)}>{value}</div>
                {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            </CardContent>
        </Card>
    );
}