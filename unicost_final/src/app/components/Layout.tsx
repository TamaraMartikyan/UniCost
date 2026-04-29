import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router";
import {
    LayoutDashboard, DollarSign, TrendingUp, BarChart2,
    Building2, Layers, Users, BookOpen, GraduationCap,
    ChevronLeft, ChevronRight, PencilLine, Settings, WifiOff
} from "lucide-react";
import { useLang } from "@/lib/LangContext";

export default function Layout() {
    const [collapsed, setCollapsed] = useState(false);
    const [dbError, setDbError] = useState(false);
    const navigate = useNavigate();
    const location = useLocation();
    const { lang, setLang, t } = useLang();

    useEffect(() => {
        let cancelled = false;
        async function checkHealth() {
            try {
                const res = await fetch("http://localhost:8001/health");
                if (!cancelled) setDbError(!res.ok);
            } catch {
                if (!cancelled) setDbError(true);
            }
        }
        checkHealth();
        const id = setInterval(checkHealth, 30000);
        return () => { cancelled = true; clearInterval(id); };
    }, []);

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
        {
            section: "SYSTEM",
            items: [{ path: "/settings", label: t.settings, icon: Settings }],
        },
    ];

    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <aside
                style={{ background: "hsl(240 15% 7%)" }}
                className={`flex flex-col border-r border-white/10 transition-all duration-300 flex-shrink-0 ${collapsed ? "w-[60px]" : "w-[250px]"}`}
            >
                {/* Logo */}
                <div className={`flex items-center min-h-[64px] px-4 gap-3 border-b border-white/10 ${collapsed ? "justify-center" : ""}`}>
                    {!collapsed && (
                        <div className="flex-1 overflow-hidden">
                            <div className="flex items-baseline gap-0.5">
                                <span className="text-xl font-black text-white tracking-widest">UNI</span>
                                <span className="text-xl font-black tracking-widest text-[#a78bfa]">COST</span>
                            </div>
                            <p className="text-[10px] tracking-[2px] uppercase mt-0.5 text-white/40">{t.appSub}</p>
                        </div>
                    )}
                    <button
                        onClick={() => setCollapsed(!collapsed)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
                    >
                        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
                    {NAV.map((group) => (
                        <div key={group.section}>
                            {!collapsed && (
                                <p className={`text-[10px] font-bold tracking-[3px] uppercase px-2 mb-2 ${group.section === t.manage ? "text-[#a78bfa]/60" : "text-white/35"
                                    }`}>
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
                                            title={collapsed ? String(item.label) : undefined}
                                            className={`w-full flex items-center gap-3 rounded-lg text-[13px] font-medium transition-all ${collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2.5"
                                                } ${active
                                                    ? "bg-[#7c3aed]/70 text-white/90"
                                                    : isManage
                                                        ? "text-[#c4b5fd]/60 hover:text-[#c4b5fd] hover:bg-white/8"
                                                        : "text-white/75 hover:text-white hover:bg-white/8"
                                                }`}
                                        >
                                            <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${active ? "text-white" : isManage ? "text-[#a78bfa]/60" : "text-white/60"
                                                }`} />
                                            {!collapsed && <span className="truncate">{item.label}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                {/* Language toggle */}
                <div className="border-t border-white/10 p-3">
                    {!collapsed ? (
                        <div>
                            <p className="text-[10px] font-bold tracking-[3px] uppercase text-white/35 mb-2 px-1">LANGUAGE</p>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setLang("en")}
                                    className={`flex-1 h-9 rounded-lg text-sm font-bold tracking-wide transition-all ${lang === "en"
                                            ? "bg-[#7c3aed]/70 text-white/90"
                                            : "bg-white/8 text-white/60 hover:bg-white/12 hover:text-white"
                                        }`}
                                >
                                    EN
                                </button>
                                <button
                                    onClick={() => setLang("hy")}
                                    className={`flex-1 h-9 rounded-lg text-sm font-bold tracking-wide transition-all ${lang === "hy"
                                            ? "bg-[#7c3aed]/70 text-white/90"
                                            : "bg-white/8 text-white/60 hover:bg-white/12 hover:text-white"
                                        }`}
                                >
                                    ՀՅ
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            <button
                                onClick={() => setLang("en")}
                                title="English"
                                className={`w-full h-8 rounded-lg text-[11px] font-bold transition-all ${lang === "en" ? "bg-[#7c3aed]/70 text-white/90" : "bg-white/8 text-white/60 hover:text-white"
                                    }`}
                            >EN</button>
                            <button
                                onClick={() => setLang("hy")}
                                title="Հայerен"
                                className={`w-full h-8 rounded-lg text-[11px] font-bold transition-all ${lang === "hy" ? "bg-[#7c3aed]/70 text-white/90" : "bg-white/8 text-white/60 hover:text-white"
                                    }`}
                            >ՀՅ</button>
                        </div>
                    )}
                </div>
            </aside>

            <main className="flex-1 overflow-y-auto flex flex-col">
                {dbError && (
                    <div className="flex items-center gap-3 px-4 py-2.5 bg-red-500/15 border-b border-red-500/20 text-red-400 text-sm">
                        <WifiOff className="h-4 w-4 flex-shrink-0" />
                        <span className="flex-1">{t.dbErrorMsg}</span>
                        <button
                            onClick={() => navigate("/settings")}
                            className="text-xs font-semibold underline hover:text-red-300 whitespace-nowrap"
                        >
                            {t.goToSettings}
                        </button>
                    </div>
                )}
                <Outlet />
            </main>
        </div>
    );
}