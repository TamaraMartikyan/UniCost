import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export async function downloadAndOpen(url: string, filename = "export.xlsx") {
    const api = (window as any).electronAPI;
    if (api?.openFileUrl) {
        await api.openFileUrl(url, filename);
    } else {
        await downloadFile(url, filename);
    }
}

export async function downloadFile(url: string, filename = "export.xlsx") {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const blob = await res.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(blobUrl);
}

export const fmt = {
  currency: (v: number | null | undefined) =>
    v == null ? "—" : new Intl.NumberFormat("hy-AM", { style: "currency", currency: "AMD", maximumFractionDigits: 0 }).format(v),
  number: (v: number | null | undefined) =>
    v == null ? "—" : new Intl.NumberFormat("en-US").format(v),
  pct: (v: number | null | undefined) =>
    v == null ? "—" : `${(v * 100).toFixed(1)}%`,
};
