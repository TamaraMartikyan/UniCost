import { useState, useEffect } from "react";
import { PageHeader } from "@/app/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Input } from "@/app/components/ui/input";
import { useLang } from "@/lib/LangContext";
import { Save, Wifi, WifiOff, Eye, EyeOff } from "lucide-react";

const BASE = "http://localhost:8001";

export default function Settings() {
    const { t } = useLang();
    const [form, setForm] = useState({
        server: "", database: "", username: "", password: "",
        encrypt: true, trust_cert: false, timeout: 30,
    });
    const [showPwd, setShowPwd] = useState(false);
    const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
    const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "ok" | "fail">("idle");
    const [testMsg, setTestMsg] = useState("");

    useEffect(() => {
        fetch(`${BASE}/config`)
            .then(r => r.json())
            .then(d => setForm(f => ({ ...f, ...d, password: "" })))
            .catch(() => {});
    }, []);

    function set(key: string, val: unknown) {
        setForm(f => ({ ...f, [key]: val }));
        setTestStatus("idle");
        setSaveStatus("idle");
    }

    async function handleTest() {
        setTestStatus("testing");
        setTestMsg("");
        try {
            const res = await fetch(`${BASE}/test-connection`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form }),
            });
            if (res.ok) {
                setTestStatus("ok");
                setTestMsg(t.connectionOk);
            } else {
                const data = await res.json().catch(() => ({}));
                setTestStatus("fail");
                setTestMsg(data.detail || t.connectionFailed);
            }
        } catch {
            setTestStatus("fail");
            setTestMsg(t.connectionFailed);
        }
    }

    async function handleSave() {
        setSaveStatus("saving");
        try {
            const res = await fetch(`${BASE}/config`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...form }),
            });
            setSaveStatus(res.ok ? "ok" : "fail");
        } catch {
            setSaveStatus("fail");
        }
    }

    return (
        <div className="p-6 space-y-6">
            <PageHeader title={t.settings} subtitle={t.settingsSub} />

            <Card className="max-w-xl border-white/10 bg-[hsl(240_15%_9%)]">
                <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold tracking-widest uppercase text-white/50">
                        SQL Server
                    </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Field label={t.dbServer}>
                        <Input value={form.server} onChange={e => set("server", e.target.value)}
                            placeholder="server.database.windows.net" className="bg-white/5 border-white/10 text-white" />
                    </Field>
                    <Field label={t.dbDatabase}>
                        <Input value={form.database} onChange={e => set("database", e.target.value)}
                            placeholder="my_database" className="bg-white/5 border-white/10 text-white" />
                    </Field>
                    <Field label={t.dbUsername}>
                        <Input value={form.username} onChange={e => set("username", e.target.value)}
                            placeholder="db_user" className="bg-white/5 border-white/10 text-white" />
                    </Field>
                    <Field label={t.dbPassword}>
                        <div className="relative">
                            <Input
                                type={showPwd ? "text" : "password"}
                                value={form.password}
                                onChange={e => set("password", e.target.value)}
                                placeholder="••••••••"
                                className="bg-white/5 border-white/10 text-white pr-10"
                            />
                            <button
                                onClick={() => setShowPwd(v => !v)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                            >
                                {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>
                    </Field>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label={t.dbTimeout}>
                            <Input type="number" value={form.timeout}
                                onChange={e => set("timeout", parseInt(e.target.value) || 30)}
                                className="bg-white/5 border-white/10 text-white" />
                        </Field>
                    </div>
                    <div className="space-y-2 pt-1">
                        <Toggle checked={form.encrypt} onChange={v => set("encrypt", v)} label={t.dbEncrypt} />
                        <Toggle checked={form.trust_cert} onChange={v => set("trust_cert", v)} label={t.dbTrustCert} />
                    </div>

                    {/* Status message */}
                    {testMsg && (
                        <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
                            testStatus === "ok" ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                        }`}>
                            {testStatus === "ok" ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
                            {testMsg}
                        </div>
                    )}
                    {saveStatus === "ok" && (
                        <div className="flex items-center gap-2 text-sm rounded-lg px-3 py-2 bg-emerald-500/15 text-emerald-400">
                            <Save className="h-4 w-4" />
                            {t.settingsSaved}
                        </div>
                    )}

                    {/* Buttons */}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={handleTest}
                            disabled={testStatus === "testing"}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white/8 text-white/80 hover:bg-white/12 hover:text-white disabled:opacity-50 transition-all"
                        >
                            <Wifi className="h-4 w-4" />
                            {testStatus === "testing" ? "Testing…" : t.testConnection}
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saveStatus === "saving"}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-[#7c3aed]/70 text-white hover:bg-[#7c3aed]/90 disabled:opacity-50 transition-all"
                        >
                            <Save className="h-4 w-4" />
                            {saveStatus === "saving" ? "Saving…" : t.saveSettings}
                        </button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="text-xs font-semibold tracking-wide text-white/50 uppercase">{label}</label>
            {children}
        </div>
    );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
                onClick={() => onChange(!checked)}
                className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-[#7c3aed]" : "bg-white/15"}`}
            >
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
            </div>
            <span className="text-sm text-white/70">{label}</span>
        </label>
    );
}
