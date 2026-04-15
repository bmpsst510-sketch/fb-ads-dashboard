export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(n || 0);

export const fmtNum = (n: number) =>
  new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(n || 0);

export const fmtPct = (n: number) => `${(n || 0).toFixed(2)}%`;

export const fmtDec = (n: number, d = 2) => (n || 0).toFixed(d);

export function presetRange(preset: string) {
  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() - 1); // yesterday as "until" (today data often incomplete)
  const start = new Date(end);
  switch (preset) {
    case "today":
      return { since: iso(today), until: iso(today) };
    case "yesterday":
      return { since: iso(end), until: iso(end) };
    case "7d":
      start.setDate(end.getDate() - 6);
      return { since: iso(start), until: iso(end) };
    case "14d":
      start.setDate(end.getDate() - 13);
      return { since: iso(start), until: iso(end) };
    case "30d":
    default:
      start.setDate(end.getDate() - 29);
      return { since: iso(start), until: iso(end) };
  }
}

export function iso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
