"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fmtMoney, fmtNum, fmtPct, fmtDec, presetRange, iso } from "@/lib/format";
import { useSelectedAccount } from "@/lib/use-account";

// ============================================================
// Types & Constants
// ============================================================

type Row = {
  date_start?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  publisher_platform?: string;
  platform_position?: string;
  impression_device?: string;
  device_platform?: string;
  age?: string;
  gender?: string;
  country?: string;
  region?: string;
  user_segment_key?: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  cpm: number;
  purchases: number;
  purchaseValue: number;
  addToCart: number;
  roas: number;
  cpa: number;
};

type MetricDef = {
  key: string;
  label: string;
  fmt: (n: number) => string;
  dir: "up" | "down"; // up = bigger is better, down = smaller is better
};

const METRICS: MetricDef[] = [
  { key: "spend", label: "花費", fmt: fmtMoney, dir: "up" },
  { key: "impressions", label: "曝光", fmt: fmtNum, dir: "up" },
  { key: "clicks", label: "點擊", fmt: fmtNum, dir: "up" },
  { key: "ctr", label: "CTR", fmt: fmtPct, dir: "up" },
  { key: "cpc", label: "CPC", fmt: fmtMoney, dir: "down" },
  { key: "cpm", label: "CPM", fmt: fmtMoney, dir: "down" },
  { key: "addToCart", label: "加入購物車", fmt: fmtNum, dir: "up" },
  { key: "purchases", label: "購買", fmt: fmtNum, dir: "up" },
  { key: "purchaseValue", label: "購買價值", fmt: fmtMoney, dir: "up" },
  { key: "roas", label: "ROAS", fmt: (n) => fmtDec(n, 2), dir: "up" },
  { key: "cpa", label: "CPA", fmt: fmtMoney, dir: "down" },
];

type DimensionDef = {
  key: string;
  label: string;
  level: "account" | "campaign" | "adset" | "ad";
  breakdowns?: string;
  getName: (r: Row) => string;
};

const DIMENSIONS: DimensionDef[] = [
  { key: "campaign", label: "廣告活動", level: "campaign", getName: (r) => r.campaign_name || "-" },
  { key: "adset", label: "廣告組合", level: "adset", getName: (r) => r.adset_name || "-" },
  { key: "ad", label: "廣告", level: "ad", getName: (r) => r.ad_name || "-" },
  { key: "audience_segment", label: "受眾分類", level: "account", breakdowns: "user_segment_key", getName: (r) => segmentLabel(r.user_segment_key) },
  { key: "placement", label: "版位", level: "account", breakdowns: "publisher_platform,platform_position", getName: (r) => `${r.publisher_platform || "-"} / ${r.platform_position || "-"}` },
  { key: "publisher_platform", label: "平台", level: "account", breakdowns: "publisher_platform", getName: (r) => r.publisher_platform || "-" },
  { key: "device", label: "裝置", level: "account", breakdowns: "impression_device", getName: (r) => r.impression_device || "-" },
  { key: "age", label: "年齡", level: "account", breakdowns: "age", getName: (r) => r.age || "-" },
  { key: "gender", label: "性別", level: "account", breakdowns: "gender", getName: (r) => r.gender || "-" },
  { key: "country", label: "國家", level: "account", breakdowns: "country", getName: (r) => r.country || "-" },
  { key: "region", label: "地區", level: "account", breakdowns: "region", getName: (r) => r.region || "-" },
];

const PRESETS = [
  { key: "yesterday", label: "昨日" },
  { key: "7d", label: "近 7 天" },
  { key: "14d", label: "近 14 天" },
  { key: "30d", label: "近 30 天" },
];

type Granularity = "day" | "week" | "month";

const MAX_COLS = 8;
const TREND_THRESHOLD = 5; // ±5% before showing trend chip

// ============================================================
// Persistence
// ============================================================

const CONFIG_KEY = "fb-custom-pivot-v1";

type Config = {
  datePreset: string;
  dateSince: string;
  dateUntil: string;
  granularity: Granularity;
  dimensionKey: string;
  metricKey: string;
  tableCols: string[];   // dimension item names (max 8)
  kpiCards: string[];    // dimension item names (max 8)
};

function defaultConfig(): Config {
  const r = presetRange("7d");
  return {
    datePreset: "7d",
    dateSince: r.since,
    dateUntil: r.until,
    granularity: "day",
    dimensionKey: "placement",
    metricKey: "cpm",
    tableCols: [],
    kpiCards: [],
  };
}

function loadConfig(): Config {
  if (typeof window === "undefined") return defaultConfig();
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return defaultConfig();
    return { ...defaultConfig(), ...JSON.parse(raw) };
  } catch {
    return defaultConfig();
  }
}

function saveConfig(c: Config) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
  } catch {}
}

// ============================================================
// Page
// ============================================================

export default function CustomPage() {
  const { accountId, hydrated: accountHydrated } = useSelectedAccount();

  const [config, setConfig] = useState<Config>(defaultConfig);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConfig(loadConfig());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveConfig(config);
  }, [config, hydrated]);

  const update = <K extends keyof Config>(k: K, v: Config[K]) =>
    setConfig((c) => ({ ...c, [k]: v }));

  // Date input local state (only commit on apply)
  const [customSince, setCustomSince] = useState(config.dateSince);
  const [customUntil, setCustomUntil] = useState(config.dateUntil);
  useEffect(() => {
    setCustomSince(config.dateSince);
    setCustomUntil(config.dateUntil);
  }, [config.dateSince, config.dateUntil]);

  const setPreset = (p: string) => {
    if (p === "custom") {
      update("datePreset", "custom");
      return;
    }
    const r = presetRange(p);
    setConfig((c) => ({ ...c, datePreset: p, dateSince: r.since, dateUntil: r.until }));
  };
  const applyCustom = () => {
    if (!customSince || !customUntil) return;
    setConfig((c) => ({ ...c, datePreset: "custom", dateSince: customSince, dateUntil: customUntil }));
  };

  // Data
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [curRows, setCurRows] = useState<Row[]>([]);   // dim + time_increment=1
  const [prevRows, setPrevRows] = useState<Row[]>([]); // dim only (totals per item)

  const dimension = DIMENSIONS.find((d) => d.key === config.dimensionKey) || DIMENSIONS[0];
  const metric = METRICS.find((m) => m.key === config.metricKey) || METRICS[0];

  // When account changes (after initial hydration), clear stale item selections —
  // item names from a previous account won't match the new one's data.
  const prevAccountRef = useRef<string | null>(null);
  useEffect(() => {
    if (!accountHydrated) return;
    if (prevAccountRef.current && prevAccountRef.current !== accountId) {
      setConfig((c) => ({ ...c, tableCols: [], kpiCards: [] }));
    }
    prevAccountRef.current = accountId;
  }, [accountId, accountHydrated]);

  useEffect(() => {
    if (!accountHydrated) return;
    let cancelled = false;
    async function load() {
      setError(null);
      setLoading(true);
      try {
        const cur = { since: config.dateSince, until: config.dateUntil };
        const prev = previousRange(cur);
        const buildUrl = (extra: Record<string, string>, range = cur) => {
          const sp = new URLSearchParams({ since: range.since, until: range.until, ...extra });
          if (accountId) sp.set("account_id", accountId);
          return `/api/insights?${sp.toString()}`;
        };
        const base: Record<string, string> = { level: dimension.level };
        if (dimension.breakdowns) base.breakdowns = dimension.breakdowns;

        const [curJ, prevJ] = await Promise.all([
          fetch(buildUrl({ ...base, time_increment: "1" })).then((r) => r.json()),
          fetch(buildUrl(base, prev)).then((r) => r.json()),
        ]);
        if (cancelled) return;
        if (curJ.error) throw new Error(curJ.error);
        if (prevJ.error) throw new Error(prevJ.error);
        setCurRows(curJ.data || []);
        setPrevRows(prevJ.data || []);
      } catch (e: any) {
        if (!cancelled) setError(e.message || "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [config.dimensionKey, config.dateSince, config.dateUntil, accountId, accountHydrated]);

  // ===== Build pivot data =====
  // 1. All item names sorted by current-period metric value (desc)
  const allItemsSorted = useMemo(() => {
    const itemTotals = aggregateByItem(curRows, dimension);
    return [...itemTotals.entries()]
      .sort((a, b) => ((b[1] as any)[config.metricKey] || 0) - ((a[1] as any)[config.metricKey] || 0))
      .map(([name]) => name);
  }, [curRows, dimension, config.metricKey]);

  // 2. Pivoted table data: bucket by (timeBucket, item), recompute derived metrics
  const pivotData = useMemo(
    () => buildPivot(curRows, dimension, config.granularity, config.metricKey, config.tableCols),
    [curRows, dimension, config.granularity, config.metricKey, config.tableCols]
  );

  // 3. KPI card data: cur vs prev for each kpiCards item
  const kpiData = useMemo(() => {
    const curItems = aggregateByItem(curRows, dimension);
    const prevItems = aggregateByItem(prevRows, dimension);
    return config.kpiCards.map((name) => {
      const cur = curItems.get(name);
      const prev = prevItems.get(name);
      const curVal = cur ? ((cur as any)[config.metricKey] as number) : 0;
      const prevVal = prev ? ((prev as any)[config.metricKey] as number) : 0;
      const delta = prevVal && prevVal !== 0 ? ((curVal - prevVal) / prevVal) * 100 : null;
      return { name, curVal, prevVal, delta };
    });
  }, [curRows, prevRows, dimension, config.kpiCards, config.metricKey]);

  // 4. Trend chips: for each table col, compute first vs last value in pivot
  const trendChips = useMemo(() => {
    if (!pivotData.rows.length) return [];
    const out: { name: string; delta: number; isGood: boolean }[] = [];
    for (const name of config.tableCols) {
      const series = pivotData.rows
        .map((r) => r.values[name])
        .filter((v) => v != null && v !== 0);
      if (series.length < 2) continue;
      const first = series[0];
      const last = series[series.length - 1];
      if (!first || last == null) continue;
      const d = ((last - first) / first) * 100;
      if (Math.abs(d) < TREND_THRESHOLD) continue;
      const isGood = (metric.dir === "up" && d > 0) || (metric.dir === "down" && d < 0);
      out.push({ name, delta: d, isGood });
    }
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [pivotData.rows, config.tableCols, metric.dir]);

  // ===== Render =====
  const itemOptions = allItemsSorted.map((n) => ({ key: n, label: n }));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">自訂分析工作台</h1>
            <p className="text-sm text-slate-400 mt-1 font-mono">
              {config.dateSince} → {config.dateUntil}
              {hydrated && <span className="ml-3 text-emerald-500/70">⚙ 設定已記住</span>}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                  config.datePreset === p.key
                    ? "bg-sky-500/20 text-sky-300 border-sky-500/50"
                    : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600"
                }`}
              >
                {p.label}
              </button>
            ))}
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${
                config.datePreset === "custom"
                  ? "bg-sky-500/20 border-sky-500/50"
                  : "bg-slate-900 border-slate-800"
              }`}
            >
              <input
                type="date"
                value={customSince}
                onChange={(e) => setCustomSince(e.target.value)}
                className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
              />
              <span className="text-slate-500">→</span>
              <input
                type="date"
                value={customUntil}
                onChange={(e) => setCustomUntil(e.target.value)}
                className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
              />
              <button
                onClick={applyCustom}
                className="ml-1 px-2 py-0.5 rounded text-xs bg-sky-500 text-slate-950 font-medium hover:bg-sky-400"
              >
                套用
              </button>
            </div>
            <button
              onClick={() => {
                if (confirm("重設所有自訂設定？（會清掉維度/指標/卡片/欄位）")) setConfig(defaultConfig());
              }}
              className="px-3 py-1.5 rounded-lg text-sm border bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
            >
              重設
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-900 text-sm text-red-300 whitespace-pre-wrap break-all">
            {error}
          </div>
        )}

        {/* Global controls: dimension + metric + granularity */}
        <section className="bg-slate-900/60 backdrop-blur rounded-xl border border-slate-800 p-4 mb-6 flex flex-wrap items-center gap-3 relative z-20">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">維度</span>
            <select
              value={config.dimensionKey}
              onChange={(e) => {
                update("dimensionKey", e.target.value);
                update("tableCols", []);
                update("kpiCards", []);
              }}
              className="text-sm bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200"
            >
              {DIMENSIONS.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">指標</span>
            <select
              value={config.metricKey}
              onChange={(e) => update("metricKey", e.target.value)}
              className="text-sm bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200"
            >
              {METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-500">粒度</span>
            <GranularityToggle value={config.granularity} onChange={(v) => update("granularity", v)} />
          </div>
          <div className="ml-auto text-xs text-slate-500">
            {loading ? "載入中…" : `${curRows.length} 筆原始資料`}
          </div>
        </section>

        {/* KPI Cards Section */}
        <section className="bg-slate-900/60 backdrop-blur rounded-xl border border-slate-800 p-5 mb-6 relative z-10">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="font-semibold text-slate-200">
              KPI 卡片
              <span className="text-xs text-slate-500 ml-2 font-normal">
                {dimension.label} · {metric.label} · 全期 vs 上一期間（{config.kpiCards.length}/{MAX_COLS}）
              </span>
            </h2>
            <MultiPicker
              label="挑選項目"
              options={itemOptions}
              value={config.kpiCards}
              onChange={(v) => update("kpiCards", v.slice(0, MAX_COLS))}
              max={MAX_COLS}
              searchable
              width="w-80"
            />
          </div>
          {config.kpiCards.length === 0 ? (
            <div className="text-sm text-slate-500 py-8 text-center">
              點右上角「挑選項目」最多選 {MAX_COLS} 個 {dimension.label} 來顯示為 KPI 卡
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {kpiData.map((d) => (
                <KpiCard key={d.name} title={d.name} metric={metric} {...d} />
              ))}
            </div>
          )}
        </section>

        {/* Pivot Table Section */}
        <section className="bg-slate-900/60 backdrop-blur rounded-xl border border-slate-800 p-5 mb-6 relative z-0">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="font-semibold text-slate-200">
              {metric.label} BY {dimension.label.toUpperCase()}
              <span className="text-xs text-slate-500 ml-2 font-normal">
                ({config.tableCols.length}/{MAX_COLS} 欄)
              </span>
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              {trendChips.map((c) => (
                <span
                  key={c.name}
                  className={`px-2.5 py-1 rounded-full text-xs border ${
                    c.isGood
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                      : "bg-rose-500/10 border-rose-500/40 text-rose-300"
                  }`}
                  title={`${c.delta >= 0 ? "+" : ""}${c.delta.toFixed(1)}% 從第一桶到最後一桶`}
                >
                  {c.delta >= 0 ? "▲" : "▼"} {truncate(c.name, 22)} {c.delta >= 0 ? "上升" : "下降"}
                </span>
              ))}
              <MultiPicker
                label="挑選欄項目"
                options={itemOptions}
                value={config.tableCols}
                onChange={(v) => update("tableCols", v.slice(0, MAX_COLS))}
                max={MAX_COLS}
                searchable
                width="w-80"
              />
            </div>
          </div>
          {config.tableCols.length === 0 ? (
            <div className="text-sm text-slate-500 py-10 text-center">
              點右上角「挑選欄項目」最多選 {MAX_COLS} 個 {dimension.label} 來組成表格
            </div>
          ) : (
            <PivotTable rows={pivotData.rows} cols={config.tableCols} metric={metric} />
          )}
        </section>

        <footer className="text-xs text-slate-600 text-center py-4 font-mono">
          自訂分析工作台 · 設定儲存於瀏覽器 localStorage
        </footer>
      </div>
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================

function KpiCard({
  title,
  metric,
  curVal,
  prevVal,
  delta,
}: {
  title: string;
  metric: MetricDef;
  curVal: number;
  prevVal: number;
  delta: number | null;
}) {
  const goodWhenPositive = metric.dir === "up";
  const isGood = delta !== null && (goodWhenPositive ? delta >= 0 : delta <= 0);
  const tone = delta === null ? "neutral" : isGood ? "good" : "bad";
  const styles = {
    good: {
      border: "border-emerald-500/50",
      glow: "shadow-[0_0_20px_rgba(16,185,129,0.15)]",
      title: "text-emerald-400",
      pct: "text-emerald-300",
      arrow: "text-emerald-400",
    },
    bad: {
      border: "border-rose-500/50",
      glow: "shadow-[0_0_20px_rgba(244,63,94,0.15)]",
      title: "text-rose-400",
      pct: "text-rose-300",
      arrow: "text-rose-400",
    },
    neutral: {
      border: "border-slate-700",
      glow: "",
      title: "text-slate-400",
      pct: "text-slate-300",
      arrow: "text-slate-500",
    },
  }[tone];
  return (
    <div
      className={`bg-slate-950/60 rounded-xl border p-4 transition ${styles.border} ${styles.glow}`}
    >
      <div
        className={`text-[11px] uppercase tracking-wider font-semibold ${styles.title} truncate`}
        title={title}
      >
        {title}
      </div>
      <div className={`text-3xl font-bold mt-2 tabular-nums ${styles.pct}`}>
        {delta === null ? "—" : `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%`}
      </div>
      <div className={`text-xs mt-2 font-mono tabular-nums ${styles.arrow}`}>
        {delta === null
          ? "—"
          : `${delta >= 0 ? "▲" : "▼"} ${metric.fmt(prevVal)} → ${metric.fmt(curVal)}`}
      </div>
    </div>
  );
}

function PivotTable({
  rows,
  cols,
  metric,
}: {
  rows: PivotRow[];
  cols: string[];
  metric: MetricDef;
}) {
  // Compute per-column min/max of non-zero values for cell coloring
  const stats = useMemo(() => {
    const out: Record<string, { min: number; max: number }> = {};
    for (const c of cols) {
      const vals = rows.map((r) => r.values[c]).filter((v) => v != null && v !== 0) as number[];
      if (!vals.length) {
        out[c] = { min: 0, max: 0 };
        continue;
      }
      const sorted = [...vals].sort((a, b) => a - b);
      out[c] = { min: sorted[0], max: sorted[sorted.length - 1] };
    }
    return out;
  }, [rows, cols]);

  if (!rows.length) {
    return <div className="text-sm text-slate-500 py-10 text-center">此範圍無資料</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800">
            <th className="px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500 whitespace-nowrap">
              時間
            </th>
            {cols.map((c) => {
              const series = rows.map((r) => r.values[c]);
              return (
                <th
                  key={c}
                  className="px-3 pt-2.5 pb-1.5 text-right text-[11px] font-medium uppercase tracking-wider text-slate-400 whitespace-nowrap max-w-[200px]"
                  title={c}
                >
                  <div className="truncate">{c}</div>
                  <div className="flex justify-end mt-1">
                    <MiniSparkline values={series} dir={metric.dir} />
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.bucket} className="border-b border-slate-900 hover:bg-slate-800/30">
              <td className="px-3 py-2.5 text-slate-400 whitespace-nowrap font-mono text-xs">
                {r.bucketLabel}
              </td>
              {cols.map((c) => {
                const v = r.values[c];
                if (v == null) {
                  return <td key={c} className="px-3 py-2.5 text-right text-slate-700">—</td>;
                }
                const color = colorFor(v, stats[c], metric.dir);
                return (
                  <td
                    key={c}
                    className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${color}`}
                  >
                    {metric.fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniSparkline({
  values,
  dir,
}: {
  values: (number | null)[];
  dir: "up" | "down";
}) {
  const W = 60;
  const H = 22;
  const valid = values.filter((v) => v != null && v !== 0) as number[];
  if (valid.length < 2) return <div style={{ width: W, height: H }} />;

  const min = Math.min(...valid);
  const max = Math.max(...valid);
  const range = max - min || 1;

  // Build point pairs, only for non-null values, scaled to (0, W) × (H-2, 2)
  const indexed: { x: number; y: number }[] = [];
  const total = values.length;
  values.forEach((v, i) => {
    if (v == null || v === 0) return;
    const x = (i / Math.max(total - 1, 1)) * W;
    const y = H - 2 - ((v - min) / range) * (H - 4);
    indexed.push({ x, y });
  });

  if (indexed.length < 2) return <div style={{ width: W, height: H }} />;

  const pointsStr = indexed.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  // Color: compare first vs last non-null
  const first = valid[0];
  const last = valid[valid.length - 1];
  const rising = last > first;
  const isGood = (dir === "up" && rising) || (dir === "down" && !rising);
  const stroke = isGood ? "#10b981" : "#f43f5e";

  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline
        points={pointsStr}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.85}
      />
      {/* end dot */}
      <circle
        cx={indexed[indexed.length - 1].x}
        cy={indexed[indexed.length - 1].y}
        r={2.5}
        fill={stroke}
      />
    </svg>
  );
}

function colorFor(v: number, s: { min: number; max: number } | undefined, dir: "up" | "down") {
  if (!s || s.max === s.min || v === 0) return "text-slate-300";
  const norm = (v - s.min) / (s.max - s.min);
  const goodness = dir === "up" ? norm : 1 - norm;
  if (goodness >= 0.66) return "text-emerald-400 font-medium";
  if (goodness <= 0.33) return "text-rose-400";
  return "text-slate-200";
}

function MultiPicker({
  label,
  options,
  value,
  onChange,
  searchable,
  width,
  max,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
  width?: string;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
  const toggle = (k: string) => {
    if (value.includes(k)) onChange(value.filter((x) => x !== k));
    else if (!max || value.length < max) onChange([...value, k]);
  };
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;
  const reachedMax = !!max && value.length >= max;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1.5 rounded-lg text-sm border bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600"
      >
        {label} ({value.length}{max ? `/${max}` : ""}) ▾
      </button>
      {open && (
        <div
          className={`absolute right-0 mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-20 p-2 max-h-96 overflow-hidden flex flex-col ${
            width || "w-64"
          }`}
        >
          {searchable && (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜尋…"
              className="mb-2 px-2 py-1.5 text-sm bg-slate-950 border border-slate-800 rounded text-slate-200 outline-none focus:border-sky-600"
            />
          )}
          <div className="flex justify-between items-center mb-2 px-1">
            <span className="text-xs text-slate-500">
              {reachedMax ? `已達上限 ${max}` : ""}
            </span>
            <button
              className="text-xs text-slate-400 hover:text-slate-200"
              onClick={() => onChange([])}
            >
              清除
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.map((o) => {
              const checked = value.includes(o.key);
              const disabled = !checked && reachedMax;
              return (
                <label
                  key={o.key}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
                    disabled ? "opacity-40" : "hover:bg-slate-800 cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggle(o.key)}
                    className="accent-sky-500 shrink-0"
                  />
                  <span className="text-slate-200 truncate" title={o.label}>
                    {o.label}
                  </span>
                </label>
              );
            })}
            {!filtered.length && (
              <div className="text-xs text-slate-500 py-3 text-center">無結果</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function GranularityToggle({
  value,
  onChange,
}: {
  value: Granularity;
  onChange: (v: Granularity) => void;
}) {
  const options: { k: Granularity; l: string }[] = [
    { k: "day", l: "日" },
    { k: "week", l: "週" },
    { k: "month", l: "月" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-0.5">
      {options.map((o) => (
        <button
          key={o.k}
          onClick={() => onChange(o.k)}
          className={`px-3 py-1 text-sm rounded-md transition ${
            value === o.k ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

// ============================================================
// Helpers — types & functions
// ============================================================

type AggCells = {
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  purchaseValue: number;
  addToCart: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
  cpa: number;
};

type PivotRow = {
  bucket: string;        // e.g. "2026-04-08" / "2026-04" / week-Monday-iso
  bucketLabel: string;   // user-facing label e.g. "Apr 8" / "Apr '26" / "週: Apr 8"
  values: Record<string, number | null>; // column item name → metric value (null if no data)
};

function previousRange(r: { since: string; until: string }) {
  const since = new Date(r.since);
  const until = new Date(r.until);
  const days = Math.round((until.getTime() - since.getTime()) / 86400000) + 1;
  const prevUntil = new Date(since);
  prevUntil.setDate(prevUntil.getDate() - 1);
  const prevSince = new Date(prevUntil);
  prevSince.setDate(prevSince.getDate() - (days - 1));
  return { since: iso(prevSince), until: iso(prevUntil) };
}

// Group rows by dimension item name, sum base metrics, recompute derived
function aggregateByItem(rows: Row[], dim: DimensionDef): Map<string, AggCells> {
  const m = new Map<string, AggCells>();
  for (const r of rows) {
    const name = dim.getName(r);
    if (!name) continue;
    let cell = m.get(name);
    if (!cell) {
      cell = { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0, addToCart: 0, ctr: 0, cpc: 0, cpm: 0, roas: 0, cpa: 0 };
      m.set(name, cell);
    }
    cell.spend += r.spend || 0;
    cell.impressions += r.impressions || 0;
    cell.clicks += r.clicks || 0;
    cell.purchases += r.purchases || 0;
    cell.purchaseValue += r.purchaseValue || 0;
    cell.addToCart += r.addToCart || 0;
  }
  for (const cell of m.values()) {
    cell.ctr = cell.impressions ? (cell.clicks / cell.impressions) * 100 : 0;
    cell.cpc = cell.clicks ? cell.spend / cell.clicks : 0;
    cell.cpm = cell.impressions ? (cell.spend / cell.impressions) * 1000 : 0;
    cell.roas = cell.spend ? cell.purchaseValue / cell.spend : 0;
    cell.cpa = cell.purchases ? cell.spend / cell.purchases : 0;
  }
  return m;
}

function bucketDate(dateStr: string, g: Granularity): string {
  if (!dateStr) return "";
  if (g === "day") return dateStr;
  if (g === "month") return dateStr.slice(0, 7);
  // Week — bucket by Monday
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return iso(d);
}

function bucketLabel(bucket: string, g: Granularity): string {
  if (g === "month") {
    // "2026-04" → "Apr '26"
    const [y, m] = bucket.split("-");
    const monthName = new Date(`${bucket}-01T00:00:00`).toLocaleString("en-US", { month: "short" });
    return `${monthName} '${y.slice(2)}`;
  }
  if (g === "week") {
    // ISO date of Monday
    const d = new Date(bucket + "T00:00:00");
    return d.toLocaleString("en-US", { month: "short", day: "numeric" });
  }
  // day: "2026-04-08" → "Apr 8"
  const d = new Date(bucket + "T00:00:00");
  return d.toLocaleString("en-US", { month: "short", day: "numeric" });
}

function buildPivot(
  rows: Row[],
  dim: DimensionDef,
  g: Granularity,
  metricKey: string,
  cols: string[]
): { rows: PivotRow[] } {
  if (!rows.length || !cols.length) return { rows: [] };
  const colSet = new Set(cols);
  // (bucket, item) → AggCells
  const grid = new Map<string, Map<string, AggCells>>();
  for (const r of rows) {
    const name = dim.getName(r);
    if (!colSet.has(name)) continue;
    const b = bucketDate(r.date_start || "", g);
    if (!b) continue;
    let row = grid.get(b);
    if (!row) {
      row = new Map();
      grid.set(b, row);
    }
    let cell = row.get(name);
    if (!cell) {
      cell = { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0, addToCart: 0, ctr: 0, cpc: 0, cpm: 0, roas: 0, cpa: 0 };
      row.set(name, cell);
    }
    cell.spend += r.spend || 0;
    cell.impressions += r.impressions || 0;
    cell.clicks += r.clicks || 0;
    cell.purchases += r.purchases || 0;
    cell.purchaseValue += r.purchaseValue || 0;
    cell.addToCart += r.addToCart || 0;
  }
  // Recompute derived & extract metric value
  const buckets = [...grid.keys()].sort();
  const out: PivotRow[] = buckets.map((b) => {
    const row = grid.get(b)!;
    const values: Record<string, number | null> = {};
    for (const name of cols) {
      const cell = row.get(name);
      if (!cell) {
        values[name] = null;
        continue;
      }
      cell.ctr = cell.impressions ? (cell.clicks / cell.impressions) * 100 : 0;
      cell.cpc = cell.clicks ? cell.spend / cell.clicks : 0;
      cell.cpm = cell.impressions ? (cell.spend / cell.impressions) * 1000 : 0;
      cell.roas = cell.spend ? cell.purchaseValue / cell.spend : 0;
      cell.cpa = cell.purchases ? cell.spend / cell.purchases : 0;
      values[name] = (cell as any)[metricKey] ?? 0;
    }
    return { bucket: b, bucketLabel: bucketLabel(b, g), values };
  });
  return { rows: out };
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function segmentLabel(k: string | undefined): string {
  switch (k) {
    case "prospecting":
      return "新受眾 (New audience)";
    case "engaged":
      return "互動受眾 (Engaged audience)";
    case "existing":
      return "既有客戶 (Existing customers)";
    case "unknown":
      return "未分類";
    default:
      return k || "-";
  }
}
