import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmt = {
  currency: (v: number | null | undefined) =>
    v == null ? "—" : new Intl.NumberFormat("hy-AM", { style: "currency", currency: "AMD", maximumFractionDigits: 0 }).format(v),
  number: (v: number | null | undefined) =>
    v == null ? "—" : new Intl.NumberFormat("en-US").format(v),
  pct: (v: number | null | undefined) =>
    v == null ? "—" : `${(v * 100).toFixed(1)}%`,
};
