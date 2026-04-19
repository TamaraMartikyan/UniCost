import { useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";
import {
    LayoutDashboard, DollarSign, TrendingUp, BarChart2,
    Building2, Layers, Users, BookOpen, GraduationCap,
    ChevronLeft, ChevronRight, PencilLine
} from "lucide-react";
import { useLang } from "@/lib/LangContext";

export default function Layout() {
    const [collapsed, setCollapsed] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { lang, setLang, t } = useLang();

    const NAV = [
        {
            section: t.overview,
            items: [{ path: "/", label: t.dashboard, icon: LayoutDashboard }],
        },
        {
            section: t.financials,
            items: [
                { path: "/costs", label: t.costReports, icon: DollarSign },
                { path: "/income", label: t.income, icon: TrendingUp },
                { path: "/analytics", label: t.analytics, icon: BarChart2 },
            ],
        },
        {
            section: t.data,
            items: [
                { path: "/institutes", label: t.institutes, icon: Building2 },
                { path: "/departments", label: t.departments, icon: Layers },
                { path: "/groups", label: t.groups, icon: Users },
                { path: "/subjects", label: t.subjects, icon: BookOpen },
                { path: "/professions", label: t.professions, icon: GraduationCap },
            ],
        },
        {
            section: t.manage,
            items: [
                { path: "/manage/institutes", label: t.institutes, icon: PencilLine },
                { path: "/manage/departments", label: t.departments, icon: PencilLine },
                { path: "/manage/groups", label: t.groups, icon: PencilLine },
                { path: "/manage/subjects", label: t.subjects, icon: PencilLine },
                { path: "/manage/professions", label: t.professions, icon: PencilLine },
            ],
        },
    ];

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <aside className={`flex flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 flex-shrink-0 ${collapsed ? "w-[60px]" : "w-[240px]"}`}>

                {/* Logo */}
                <div className={`flex items-center border-b border-sidebar-border min-h-[64px] px-4 gap-3 ${collapsed ? "justify-center" : ""}`}>
                    {!collapsed && (
                        <div className="flex-1 overflow-hidden">
                            <div className="flex items-baseline gap-0.5">
                                <span className="font-display text-lg font-bold text-white tracking-widest">UNI</span>
                                <span className="font-display text-lg font-bold tracking-widest text-[#a78bfa]">COST</span>
                            </div>
                            <p className="text-[9px] tracking-[2px] uppercase mt-0.5 whitespace-nowrap text-[#ffffff30]">{t.appSub}</p>
                        </div>
                    )}
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-white hover:bg-sidebar-accent transition-colors flex-shrink-0"
                    >
                        {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-4">
                    {NAV.map((group) => (
                        <div key={group.section}>
                            {!collapsed && (
                                <p className={`text-[9px] font-bold tracking-[2.5px] uppercase px-2 mb-1.5 ${group.section === t.manage ? "text-[#a78bfa50]" : "text-[#ffffff25]"}`}>
                                    {group.section}
                                </p>
                            )}
                            <div className="space-y-0.5">
                                {group.items.map((item) => {
                                    const Icon = item.icon;
                                    const active = location.pathname === item.path;
                                    const isManage = group.section === t.manage;
                                    return (
                                        <button
                                            key={item.path}
                                            onClick={() => navigate(item.path)}
                                            title={collapsed ? item.label : undefined}
                                            className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-[13px] font-medium transition-all ${collapsed ? "justify-center" : ""} ${active
                                                    ? "bg-[#8b5cf620] text-[#c4b5fd] border-l-2 border-[#8b5cf6] pl-[9px]"
                                                    : isManage
                                                        ? "text-[#a78bfa60] hover:bg-sidebar-accent hover:text-[#c4b5fd]"
                                                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                                                }`}
                                        >
                                            <Icon className={`h-4 w-4 flex-shrink-0 ${active ? "text-[#a78bfa]" : "opacity-60"}`} />
                                            {!collapsed && <span className="truncate">{item.label}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* Bottom: language toggle + user card */}
                <div className="border-t border-sidebar-border">

                    {/* Language switcher */}
                    {!collapsed ? (
                        <div className="px-3 pt-3 pb-1">
                            <p className="text-[9px] font-bold tracking-[2px] uppercase text-[#ffffff25] mb-1.5 px-1">LANGUAGE</p>
                            <div className="flex gap-1.5">
                                <button
                                    onClick={() => setLang("en")}
                                    className={`flex-1 h-8 rounded-md text-xs font-bold tracking-wide transition-all border ${lang === "en"
                                            ? "bg-[#8b5cf6] text-white border-[#8b5cf6]"
                                            : "bg-sidebar-accent text-sidebar-foreground border-sidebar-border hover:text-white"
                                        }`}
                                >
                                    EN
                                </button>
                                <button
                                    onClick={() => setLang("hy")}
                                    className={`flex-1 h-8 rounded-md text-xs font-bold tracking-wide transition-all border ${lang === "hy"
                                            ? "bg-[#8b5cf6] text-white border-[#8b5cf6]"
                                            : "bg-sidebar-accent text-sidebar-foreground border-sidebar-border hover:text-white"
                                        }`}
                                >
                                    ՀՅ
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="px-2 py-2 flex flex-col gap-1">
                            <button
                                onClick={() => setLang("en")}
                                title="English"
                                className={`w-full h-7 rounded-md text-[10px] font-bold transition-all ${lang === "en" ? "bg-[#8b5cf6] text-white" : "bg-sidebar-accent text-sidebar-foreground hover:text-white"}`}
                            >EN</button>
                            <button
                                onClick={() => setLang("hy")}
                                title="Հայerен"
                                className={`w-full h-7 rounded-md text-[10px] font-bold transition-all ${lang === "hy" ? "bg-[#8b5cf6] text-white" : "bg-sidebar-accent text-sidebar-foreground hover:text-white"}`}
                            >ՀՅ</button>
                        </div>
                    )}

                    
                </div>

            </aside>
            <main className="flex-1 overflow-y-auto"><Outlet /></main>
        </div>
    );
}