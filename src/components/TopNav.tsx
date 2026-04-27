"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AccountSummary,
  selectAccount,
  useSelectedAccount,
} from "@/lib/use-account";

const TABS = [
  { href: "/", label: "主頁" },
  { href: "/custom", label: "自訂" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-6 flex items-center gap-4">
        <div className="flex gap-1">
          {TABS.map((t) => {
            const active =
              t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-4 py-3 text-sm border-b-2 transition ${
                  active
                    ? "border-sky-500 text-sky-300"
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </div>
        <div className="ml-auto py-2">
          <AccountSwitcher />
        </div>
      </div>
    </nav>
  );
}

function AccountSwitcher() {
  const { accountId, hydrated } = useSelectedAccount();
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/accounts");
        const json = await res.json();
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setAccounts(json.data || []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "載入帳號失敗");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Click-outside to close
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  // Auto-pick first account if user has no selection yet
  useEffect(() => {
    if (!hydrated || accountId || !accounts || accounts.length === 0) return;
    selectAccount(accounts[0].id);
  }, [hydrated, accountId, accounts]);

  const current = accounts?.find((a) => a.id === accountId);

  if (!hydrated) {
    return <div className="h-9 w-48 rounded-lg bg-slate-900/50 animate-pulse" />;
  }

  if (error) {
    return (
      <div
        className="text-xs text-rose-400 max-w-[280px] truncate"
        title={error}
      >
        ⚠ {error}
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={loading || !accounts}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-600 disabled:opacity-50 max-w-[280px]"
      >
        <span className="text-[10px] uppercase tracking-wider text-slate-500">帳號</span>
        <span className="text-sm truncate" title={current?.name}>
          {loading
            ? "載入中…"
            : current?.name ||
              (accounts && accounts.length === 0 ? "無可用帳號" : "選擇帳號")}
        </span>
        <span className="text-slate-500 text-xs">▾</span>
      </button>
      {open && accounts && accounts.length > 0 && (
        <div className="absolute right-0 mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-40 p-1 max-h-96 overflow-y-auto w-80">
          {accounts.map((a) => {
            const active = a.id === accountId;
            return (
              <button
                key={a.id}
                onClick={() => {
                  selectAccount(a.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between gap-3 ${
                  active
                    ? "bg-sky-500/15 text-sky-300"
                    : "text-slate-200 hover:bg-slate-800"
                }`}
                title={a.id}
              >
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{a.name}</span>
                  <span className="text-[10px] text-slate-500 font-mono truncate">
                    {a.id}
                    {a.currency ? ` · ${a.currency}` : ""}
                  </span>
                </div>
                {active && <span className="text-xs">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
