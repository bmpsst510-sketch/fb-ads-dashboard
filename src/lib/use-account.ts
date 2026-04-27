"use client";

import { useEffect, useState } from "react";

const KEY = "fb-selected-account-id";
const EVENT = "accountchange";

/**
 * Read the currently selected ad account id from localStorage.
 * Subscribes to "accountchange" custom events so all pages stay in sync
 * when the user picks a different account in the TopNav dropdown.
 *
 * Returns null until hydrated (avoids SSR mismatch). Pages should treat
 * null as "use server default (env var)".
 */
export function useSelectedAccount() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setAccountId(localStorage.getItem(KEY));
    setHydrated(true);
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<string | null>).detail;
      setAccountId(detail || null);
    };
    window.addEventListener(EVENT, onChange);
    return () => window.removeEventListener(EVENT, onChange);
  }, []);

  return { accountId, hydrated };
}

/** Persist the selected account id and notify all listeners. */
export function selectAccount(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) localStorage.setItem(KEY, id);
  else localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: id }));
}

export type AccountSummary = {
  id: string; // "act_xxxxx"
  name: string;
  currency?: string;
  status?: number;
};
