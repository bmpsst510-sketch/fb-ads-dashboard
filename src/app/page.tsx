"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { fmtMoney, fmtNum, fmtPct, fmtDec, presetRange, iso } from "@/lib/format";
import { useSelectedAccount } from "@/lib/use-account";

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

const PRESETS: { key: string; label: string }[] = [
  { key: "yesterday", label: "昨日" },
  { key: "7d", label: "近 7 天" },
  { key: "14d", label: "近 14 天" },
  { key: "30d", label: "近 30 天" },
];

type MetricDef = {
  key: string;
  label: string;
  fmt: (n: number) => string;
  dir: "up" | "down";
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

const DEFAULT_COLS = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "purchases",
  "purchaseValue",
  "roas",
  "cpa",
];

// -------- Dimensions --------
type DimensionDef = {
  key: string;
  label: string;
  level: "account" | "campaign" | "adset" | "ad";
  breakdowns?: string;
  getKey: (r: Row) => string;
  getName: (r: Row) => string;
};

const DIMENSIONS: DimensionDef[] = [
  {
    key: "campaign",
    label: "廣告活動",
    level: "campaign",
    getKey: (r) => r.campaign_id || "",
    getName: (r) => r.campaign_name || "-",
  },
  {
    key: "adset",
    label: "廣告組合",
    level: "adset",
    getKey: (r) => r.adset_id || "",
    getName: (r) => r.adset_name || "-",
  },
  {
    key: "ad",
    label: "廣告",
    level: "ad",
    getKey: (r) => r.ad_id || "",
    getName: (r) => r.ad_name || "-",
  },
  {
    key: "audience_segment",
    label: "受眾分類",
    level: "account",
    breakdowns: "user_segment_key",
    getKey: (r) => r.user_segment_key || "",
    getName: (r) => segmentLabel(r.user_segment_key),
  },
  {
    key: "placement",
    label: "版位",
    level: "account",
    breakdowns: "publisher_platform,platform_position",
    getKey: (r) => `${r.publisher_platform}|${r.platform_position}`,
    getName: (r) => `${r.publisher_platform || "-"} / ${r.platform_position || "-"}`,
  },
  {
    key: "publisher_platform",
    label: "平台",
    level: "account",
    breakdowns: "publisher_platform",
    getKey: (r) => r.publisher_platform || "",
    getName: (r) => r.publisher_platform || "-",
  },
  {
    key: "device",
    label: "裝置",
    level: "account",
    breakdowns: "impression_device",
    getKey: (r) => r.impression_device || "",
    getName: (r) => r.impression_device || "-",
  },
  {
    key: "age",
    label: "年齡",
    level: "account",
    breakdowns: "age",
    getKey: (r) => r.age || "",
    getName: (r) => r.age || "-",
  },
  {
    key: "gender",
    label: "性別",
    level: "account",
    breakdowns: "gender",
    getKey: (r) => r.gender || "",
    getName: (r) => r.gender || "-",
  },
  {
    key: "country",
    label: "國家",
    level: "account",
    breakdowns: "country",
    getKey: (r) => r.country || "",
    getName: (r) => r.country || "-",
  },
  {
    key: "region",
    label: "地區",
    level: "account",
    breakdowns: "region",
    getKey: (r) => r.region || "",
    getName: (r) => r.region || "-",
  },
];

const SERIES_COLORS = [
  "#38bdf8",
  "#f472b6",
  "#fb923c",
  "#34d399",
  "#a78bfa",
  "#fbbf24",
  "#f87171",
  "#22d3ee",
];

export default function Home() {
  const { accountId, hydrated: accountHydrated } = useSelectedAccount();

  const [preset, setPreset] = useState<string>("7d");
  const [range, setRange] = useState(presetRange("7d"));
  const [customSince, setCustomSince] = useState(range.since);
  const [customUntil, setCustomUntil] = useState(range.until);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [timeSeries, setTimeSeries] = useState<Row[]>([]);
  const [dimRows, setDimRows] = useState<Row[]>([]);
  const [dimTS, setDimTS] = useState<Row[]>([]);
  const [prevTotals, setPrevTotals] = useState<ReturnType<typeof aggregate> | null>(null);

  const [dimensionKey, setDimensionKey] = useState<string>("campaign");
  const dimension = DIMENSIONS.find((d) => d.key === dimensionKey)!;

  const [chartMetrics, setChartMetrics] = useState<string[]>(["spend"]);
  const [visibleCols, setVisibleCols] = useState<string[]>(DEFAULT_COLS);
  const [dimMetric, setDimMetric] = useState<string>("spend");
  const [topN, setTopN] = useState<number>(5);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // Chart granularity
  const [mainGran, setMainGran] = useState<Granularity>("day");
  const [dimGran, setDimGran] = useState<Granularity>("day");

  // Per-dimension date range (defaults to global; user can override)
  const [dimRange, setDimRange] = useState(range);
  const [dimRangeOverride, setDimRangeOverride] = useState(false);
  const [dimSinceInput, setDimSinceInput] = useState(range.since);
  const [dimUntilInput, setDimUntilInput] = useState(range.until);

  // When global range changes, sync dim range unless user has overridden
  useEffect(() => {
    if (!dimRangeOverride) {
      setDimRange(range);
      setDimSinceInput(range.since);
      setDimUntilInput(range.until);
    }
  }, [range.since, range.until, dimRangeOverride]);

  const applyDimRange = () => {
    if (!dimSinceInput || !dimUntilInput) return;
    setDimRange({ since: dimSinceInput, until: dimUntilInput });
    setDimRangeOverride(true);
  };
  const resetDimRange = () => {
    setDimRangeOverride(false);
    setDimRange(range);
    setDimSinceInput(range.since);
    setDimUntilInput(range.until);
  };

  // Reset manual selection when dimension changes
  useEffect(() => {
    setSelectedKeys([]);
  }, [dimensionKey]);

  useEffect(() => {
    if (preset !== "custom") {
      const r = presetRange(preset);
      setRange(r);
      setCustomSince(r.since);
      setCustomUntil(r.until);
    }
  }, [preset]);

  const applyCustom = () => {
    if (!customSince || !customUntil) return;
    setPreset("custom");
    setRange({ since: customSince, until: customUntil });
  };

  // Load overview (KPI + main trend + prev period) — only on range change
  useEffect(() => {
    if (!accountHydrated) return;
    async function load() {
      setError(null);
      try {
        const q = (extra: Record<string, string>, r = range) => {
          const sp = new URLSearchParams({ since: r.since, until: r.until, ...extra });
          if (accountId) sp.set("account_id", accountId);
          return `/api/insights?${sp.toString()}`;
        };
        const prev = previousRange(range);
        const [ts, prevTs] = await Promise.all([
          fetch(q({ level: "account", time_increment: "1" })).then((r) => r.json()),
          fetch(q({ level: "account", time_increment: "1" }, prev)).then((r) => r.json()),
        ]);
        if (ts.error) throw new Error(ts.error);
        setTimeSeries(ts.data || []);
        setPrevTotals(prevTs.data ? aggregate(prevTs.data) : null);
      } catch (e: any) {
        setError(e.message || "Unknown error");
      }
    }
    load();
  }, [range.since, range.until, accountId, accountHydrated]);

  // Load per-dimension data — on dimension OR dim-range change
  useEffect(() => {
    if (!accountHydrated) return;
    async function load() {
      setLoading(true);
      try {
        const q = (extra: Record<string, string>) => {
          const sp = new URLSearchParams({ since: dimRange.since, until: dimRange.until, ...extra });
          if (accountId) sp.set("account_id", accountId);
          return `/api/insights?${sp.toString()}`;
        };
        const base: Record<string, string> = { level: dimension.level };
        if (dimension.breakdowns) base.breakdowns = dimension.breakdowns;

        const [agg, tsd] = await Promise.all([
          fetch(q(base)).then((r) => r.json()),
          fetch(q({ ...base, time_increment: "1" })).then((r) => r.json()),
        ]);
        if (agg.error) throw new Error(agg.error);
        if (tsd.error) throw new Error(tsd.error);
        setDimRows(agg.data || []);
        setDimTS(tsd.data || []);
      } catch (e: any) {
        setError(e.message || "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dimensionKey, dimRange.since, dimRange.until, accountId, accountHydrated]);

  const totals = useMemo(() => aggregate(timeSeries), [timeSeries]);

  // All unique names in current dimension, sorted by current metric
  const allNames = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of dimRows) {
      const k = dimension.getName(r);
      if (!k) continue;
      totals.set(k, (totals.get(k) || 0) + (((r as any)[dimMetric] as number) || 0));
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  }, [dimRows, dimension, dimMetric]);

  // Effective keys for chart: user selection when any, else default Top N
  const effectiveKeys =
    selectedKeys.length > 0 ? selectedKeys : allNames.slice(0, topN);

  const { pivoted, seriesKeys } = useMemo(
    () => pivotByKeys(dimTS, dimension.getName, dimMetric, effectiveKeys),
    [dimTS, dimension, dimMetric, effectiveKeys]
  );

  // Apply granularity buckets
  const mainChartData = useMemo(
    () => rollupTimeSeries(timeSeries, mainGran),
    [timeSeries, mainGran]
  );
  const dimChartData = useMemo(
    () => rollupPivoted(pivoted, seriesKeys, dimGran),
    [pivoted, seriesKeys, dimGran]
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Facebook Ads Dashboard</h1>
            <p className="text-sm text-slate-400 mt-1 font-mono">
              {range.since} → {range.until}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPreset(p.key)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                  preset === p.key
                    ? "bg-sky-500/20 text-sky-300 border-sky-500/50"
                    : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600"
                }`}
              >
                {p.label}
              </button>
            ))}
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${
                preset === "custom"
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
              onClick={() => setRange({ ...range })}
              className="px-3 py-1.5 rounded-lg text-sm border bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600"
              title="重新整理"
            >
              ↻
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-900 text-sm text-red-300 whitespace-pre-wrap break-all">
            {error}
          </div>
        )}

        {/* KPI Cards */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {METRICS.filter((m) => m.key !== "impressions").map((m) => {
            const cur = (totals as any)[m.key] as number;
            const prev = prevTotals ? ((prevTotals as any)[m.key] as number) : null;
            const delta = prev && prev !== 0 ? ((cur - prev) / prev) * 100 : null;
            return <Kpi key={m.key} metric={m} value={cur} delta={delta} />;
          })}
        </section>

        {/* Main trend chart */}
        <section className="bg-slate-900/60 backdrop-blur rounded-xl border border-slate-800 p-5 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="font-semibold text-slate-200">時間趨勢</h2>
            <div className="flex gap-2 flex-wrap">
              <GranularityToggle value={mainGran} onChange={setMainGran} />
              <MultiPicker
                label="指標"
                options={METRICS.map((m) => ({ key: m.key, label: m.label }))}
                value={chartMetrics}
                onChange={(v) => setChartMetrics(v.length ? v : ["spend"])}
              />
            </div>
          </div>
          <div className="h-80">
            <AreaTrendChart
              data={mainChartData}
              xKey="date_start"
              series={chartMetrics.map((k, i) => {
                const m = METRICS.find((x) => x.key === k)!;
                return {
                  key: k,
                  label: m.label,
                  color: SERIES_COLORS[i % SERIES_COLORS.length],
                  fmt: m.fmt,
                };
              })}
            />
          </div>
        </section>

        {/* Dimension section */}
        <section className="bg-slate-900/60 backdrop-blur rounded-xl border border-slate-800 p-5 mb-6">
          {/* Dimension date range */}
          <div className="mb-4 flex items-center gap-2 flex-wrap">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">維度日期</div>
            <div
              className={`flex items-center gap-1 px-2 py-1 rounded-lg border ${
                dimRangeOverride
                  ? "bg-amber-500/10 border-amber-500/40"
                  : "bg-slate-900 border-slate-800"
              }`}
            >
              <input
                type="date"
                value={dimSinceInput}
                onChange={(e) => setDimSinceInput(e.target.value)}
                className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
              />
              <span className="text-slate-500">→</span>
              <input
                type="date"
                value={dimUntilInput}
                onChange={(e) => setDimUntilInput(e.target.value)}
                className="bg-transparent text-sm text-slate-200 outline-none [color-scheme:dark]"
              />
              <button
                onClick={applyDimRange}
                className="ml-1 px-2 py-0.5 rounded text-xs bg-amber-500 text-slate-950 font-medium hover:bg-amber-400"
              >
                套用
              </button>
            </div>
            {dimRangeOverride ? (
              <>
                <span className="text-xs text-amber-400">獨立於全站日期</span>
                <button
                  onClick={resetDimRange}
                  className="px-2 py-1 rounded text-xs bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
                >
                  同步全站
                </button>
              </>
            ) : (
              <span className="text-xs text-slate-500">跟隨全站日期</span>
            )}
          </div>

          {/* Dimension chip selector */}
          <div className="mb-5">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">分析維度</div>
            <div className="flex gap-2 flex-wrap">
              {DIMENSIONS.map((d, i) => {
                const active = dimensionKey === d.key;
                const color = SERIES_COLORS[i % SERIES_COLORS.length];
                return (
                  <button
                    key={d.key}
                    onClick={() => setDimensionKey(d.key)}
                    style={
                      active
                        ? {
                            backgroundColor: `${color}22`,
                            borderColor: `${color}99`,
                            color,
                            boxShadow: `0 0 14px ${color}55`,
                          }
                        : undefined
                    }
                    className={`px-4 py-1.5 rounded-full text-sm border transition ${
                      active
                        ? "font-medium"
                        : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600"
                    }`}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Top N trend chart */}
          <div className="mb-5">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="text-sm text-slate-400">
                <span className="text-slate-200">{dimension.label}</span> 依{" "}
                <span className="text-slate-200">
                  {METRICS.find((m) => m.key === dimMetric)?.label}
                </span>{" "}
                時間走勢
                {selectedKeys.length > 0 ? (
                  <span className="text-sky-400 ml-2">（自選 {selectedKeys.length} 項）</span>
                ) : (
                  <span className="text-slate-500 ml-2">（預設 Top {topN}）</span>
                )}
              </div>
              <div className="flex gap-2 flex-wrap">
                <select
                  value={dimMetric}
                  onChange={(e) => setDimMetric(e.target.value)}
                  className="text-sm bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200"
                >
                  {METRICS.map((m) => (
                    <option key={m.key} value={m.key}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <select
                  value={topN}
                  onChange={(e) => setTopN(Number(e.target.value))}
                  disabled={selectedKeys.length > 0}
                  className="text-sm bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200 disabled:opacity-40"
                >
                  {[3, 5, 8, 10].map((n) => (
                    <option key={n} value={n}>
                      Top {n}
                    </option>
                  ))}
                </select>
                <MultiPicker
                  label="項目"
                  options={allNames.map((n) => ({ key: n, label: n }))}
                  value={selectedKeys}
                  onChange={setSelectedKeys}
                  searchable
                  width="w-80"
                />
                {selectedKeys.length > 0 && (
                  <button
                    onClick={() => setSelectedKeys([])}
                    className="px-2 py-1.5 rounded-lg text-xs bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200"
                    title="恢復預設 Top N"
                  >
                    重置
                  </button>
                )}
                <GranularityToggle value={dimGran} onChange={setDimGran} />
              </div>
            </div>
            <div className="h-72">
              <AreaTrendChart
                data={dimChartData}
                xKey="date"
                series={seriesKeys.map((k, i) => ({
                  key: k,
                  label: truncate(k, 28),
                  color: SERIES_COLORS[i % SERIES_COLORS.length],
                  fmt: METRICS.find((m) => m.key === dimMetric)!.fmt,
                }))}
              />
            </div>
          </div>

          {/* Column picker */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-slate-400">
              {loading ? "載入中…" : `${dimRows.length} 筆 ${dimension.label}`}
              <span className="ml-2 text-xs text-slate-500 font-mono">
                {dimRange.since} → {dimRange.until}
              </span>
            </div>
            <MultiPicker
              label="欄位"
              options={METRICS.map((m) => ({ key: m.key, label: m.label }))}
              value={visibleCols}
              onChange={setVisibleCols}
            />
          </div>

          <Table rows={dimRows} dimension={dimension} visibleCols={visibleCols} />
        </section>

        <footer className="text-xs text-slate-600 text-center py-4 font-mono">
          act_9177740032347247
        </footer>
      </div>
    </div>
  );
}

function AreaTrendChart({
  data,
  xKey,
  series,
}: {
  data: any[];
  xKey: string;
  series: { key: string; label: string; color: string; fmt: (n: number) => string }[];
}) {
  if (!data.length || !series.length) {
    return <div className="h-full flex items-center justify-center text-sm text-slate-500">無資料</div>;
  }
  const idPrefix = useId();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`${idPrefix}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis dataKey={xKey} fontSize={11} stroke="#64748b" />
        <YAxis fontSize={11} stroke="#64748b" tickFormatter={(v) => compactFmt(v)} />
        <Tooltip
          contentStyle={{
            background: "#0f172a",
            border: "1px solid #334155",
            borderRadius: 8,
            boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
          }}
          labelStyle={{ color: "#cbd5e1" }}
          formatter={(v: any, _n: any, entry: any) => {
            const s = series.find((x) => x.key === entry?.dataKey);
            return s ? s.fmt(Number(v) || 0) : v;
          }}
        />
        <Legend wrapperStyle={{ color: "#cbd5e1", fontSize: 12 }} />
        {series.map((s, i) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2.5}
            fill={`url(#${idPrefix}-${i})`}
            dot={{ r: 3, fill: "#0f172a", stroke: s.color, strokeWidth: 2 }}
            activeDot={{ r: 6, fill: s.color, stroke: "#0f172a", strokeWidth: 2 }}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

// Stable per-render id to avoid gradient id collisions between charts
function useId() {
  const r = useRef<string | null>(null);
  if (r.current === null) r.current = "g" + Math.random().toString(36).slice(2, 9);
  return r.current;
}

function Kpi({ metric, value, delta }: { metric: MetricDef; value: number; delta: number | null }) {
  const goodWhenPositive = metric.dir === "up";
  const isGood = delta !== null && (goodWhenPositive ? delta >= 0 : delta <= 0);
  const color = delta === null ? "text-slate-500" : isGood ? "text-emerald-400" : "text-rose-400";
  const arrow = delta === null ? "" : delta >= 0 ? "▲" : "▼";
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-4 hover:border-slate-700 transition">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{metric.label}</div>
      <div className="text-xl font-semibold mt-1 tabular-nums text-slate-100">
        {metric.fmt(value || 0)}
      </div>
      <div className={`text-xs mt-1 tabular-nums ${color}`}>
        {delta === null ? "—" : `${arrow} ${Math.abs(delta).toFixed(1)}%`}
      </div>
    </div>
  );
}

function MultiPicker({
  label,
  options,
  value,
  onChange,
  searchable,
  width,
}: {
  label: string;
  options: { key: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
  width?: string;
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
    else onChange([...value, k]);
  };
  const filtered = q
    ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-1.5 rounded-lg text-sm border bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-600"
      >
        {label} ({value.length}) ▾
      </button>
      {open && (
        <div
          className={`absolute right-0 mt-2 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-10 p-2 max-h-96 overflow-hidden flex flex-col ${
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
          <div className="flex justify-between mb-2 px-1">
            <button
              className="text-xs text-sky-400 hover:text-sky-300"
              onClick={() => onChange(filtered.map((o) => o.key))}
            >
              {q ? "選取搜尋結果" : "全選"}
            </button>
            <button className="text-xs text-slate-400 hover:text-slate-200" onClick={() => onChange([])}>
              清除
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.map((o) => (
              <label
                key={o.key}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={value.includes(o.key)}
                  onChange={() => toggle(o.key)}
                  className="accent-sky-500 shrink-0"
                />
                <span className="text-slate-200 truncate" title={o.label}>
                  {o.label}
                </span>
              </label>
            ))}
            {!filtered.length && (
              <div className="text-xs text-slate-500 py-3 text-center">無結果</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Table({
  rows,
  dimension,
  visibleCols,
}: {
  rows: Row[];
  dimension: DimensionDef;
  visibleCols: string[];
}) {
  const [sortKey, setSortKey] = useState<string>("spend");
  const [desc, setDesc] = useState(true);

  const cols = METRICS.filter((m) => visibleCols.includes(m.key));

  const stats = useMemo(() => {
    const s: Record<string, { min: number; max: number }> = {};
    for (const m of cols) {
      const vals = rows.map((r) => (r as any)[m.key] as number).filter((v) => v > 0);
      if (!vals.length) {
        s[m.key] = { min: 0, max: 0 };
        continue;
      }
      const sorted = [...vals].sort((a, b) => a - b);
      s[m.key] = { min: sorted[0], max: sorted[sorted.length - 1] };
    }
    return s;
  }, [rows, cols]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a: any, b: any) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string") return desc ? bv.localeCompare(av) : av.localeCompare(bv);
      return desc ? bv - av : av - bv;
    });
    return copy;
  }, [rows, sortKey, desc]);

  const renderHeader = (key: string, label: string, align: "left" | "right" = "right") => (
    <th
      key={key}
      onClick={() => {
        if (sortKey === key) setDesc(!desc);
        else {
          setSortKey(key);
          setDesc(true);
        }
      }}
      className={`px-3 py-2.5 text-[11px] font-medium uppercase tracking-wider text-slate-500 cursor-pointer select-none whitespace-nowrap hover:text-slate-300 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {label} {sortKey === key ? (desc ? "↓" : "↑") : ""}
    </th>
  );

  if (!rows.length) {
    return <div className="text-sm text-slate-500 py-10 text-center">此範圍無資料</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-800">
            {renderHeader("_name", dimension.label, "left")}
            {cols.map((c) => renderHeader(c.key, c.label))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={i} className="border-b border-slate-900 hover:bg-slate-800/40">
              <td className="px-3 py-2.5 max-w-[280px] truncate text-slate-200" title={dimension.getName(r)}>
                {dimension.getName(r)}
              </td>
              {cols.map((c) => {
                const v = ((r as any)[c.key] as number) || 0;
                const color = colorFor(v, stats[c.key], c.dir);
                return (
                  <td key={c.key} className={`px-3 py-2.5 text-right tabular-nums whitespace-nowrap ${color}`}>
                    {c.fmt(v)}
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

function colorFor(v: number, s: { min: number; max: number } | undefined, dir: "up" | "down") {
  if (!s || s.max === s.min || v === 0) return "text-slate-300";
  const norm = (v - s.min) / (s.max - s.min);
  const goodness = dir === "up" ? norm : 1 - norm;
  if (goodness >= 0.66) return "text-emerald-400 font-medium";
  if (goodness <= 0.33) return "text-rose-400";
  return "text-slate-200";
}

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

function aggregate(rows: Row[]) {
  const t = rows.reduce(
    (a, r) => {
      a.spend += r.spend || 0;
      a.impressions += r.impressions || 0;
      a.clicks += r.clicks || 0;
      a.purchases += r.purchases || 0;
      a.purchaseValue += r.purchaseValue || 0;
      a.addToCart += r.addToCart || 0;
      return a;
    },
    { spend: 0, impressions: 0, clicks: 0, purchases: 0, purchaseValue: 0, addToCart: 0 }
  );
  const ctr = t.impressions ? (t.clicks / t.impressions) * 100 : 0;
  const cpc = t.clicks ? t.spend / t.clicks : 0;
  const cpm = t.impressions ? (t.spend / t.impressions) * 1000 : 0;
  const roas = t.spend ? t.purchaseValue / t.spend : 0;
  const cpa = t.purchases ? t.spend / t.purchases : 0;
  return { ...t, ctr, cpc, cpm, roas, cpa };
}

function pivotByKeys(
  rows: Row[],
  nameFn: (r: Row) => string,
  metric: string,
  keys: string[]
) {
  if (!rows.length || !keys.length) return { pivoted: [] as any[], seriesKeys: keys };
  const keySet = new Set(keys);
  const byDate = new Map<string, any>();
  for (const r of rows) {
    const k = nameFn(r);
    if (!keySet.has(k)) continue;
    const d = r.date_start || "";
    if (!byDate.has(d)) byDate.set(d, { date: d });
    const row = byDate.get(d);
    row[k] = (row[k] || 0) + (((r as any)[metric] as number) || 0);
  }
  const pivoted = [...byDate.values()]
    .map((row) => {
      for (const k of keys) if (row[k] == null) row[k] = 0;
      return row;
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return { pivoted, seriesKeys: keys };
}

function compactFmt(v: number): string {
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + "M";
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + "K";
  return String(v);
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// FB API user_segment_key → Ads Manager label
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

// ---------- Granularity: day / week / month ----------
type Granularity = "day" | "week" | "month";

function bucketDate(dateStr: string, g: Granularity): string {
  if (!dateStr) return "";
  if (g === "day") return dateStr;
  if (g === "month") return dateStr.slice(0, 7); // YYYY-MM
  // week: ISO-ish, bucket by Monday start
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0=Sun .. 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return iso(d);
}

// Aggregate Row[] (for main trend) by granularity — recompute derived metrics
function rollupTimeSeries(rows: Row[], g: Granularity): any[] {
  if (g === "day") return rows;
  const byBucket = new Map<string, any>();
  for (const r of rows) {
    const k = bucketDate(r.date_start || "", g);
    if (!k) continue;
    let e = byBucket.get(k);
    if (!e) {
      e = {
        date_start: k,
        spend: 0,
        impressions: 0,
        clicks: 0,
        purchases: 0,
        purchaseValue: 0,
        addToCart: 0,
      };
      byBucket.set(k, e);
    }
    e.spend += r.spend || 0;
    e.impressions += r.impressions || 0;
    e.clicks += r.clicks || 0;
    e.purchases += r.purchases || 0;
    e.purchaseValue += r.purchaseValue || 0;
    e.addToCart += r.addToCart || 0;
  }
  const out = [...byBucket.values()].sort((a, b) => a.date_start.localeCompare(b.date_start));
  for (const e of out) {
    e.ctr = e.impressions ? (e.clicks / e.impressions) * 100 : 0;
    e.cpc = e.clicks ? e.spend / e.clicks : 0;
    e.cpm = e.impressions ? (e.spend / e.impressions) * 1000 : 0;
    e.roas = e.spend ? e.purchaseValue / e.spend : 0;
    e.cpa = e.purchases ? e.spend / e.purchases : 0;
  }
  return out;
}

// Aggregate pivoted dimension data by granularity (sum per series key)
function rollupPivoted(data: any[], keys: string[], g: Granularity): any[] {
  if (g === "day" || !data.length) return data;
  const byBucket = new Map<string, any>();
  for (const row of data) {
    const k = bucketDate(row.date, g);
    if (!k) continue;
    let e = byBucket.get(k);
    if (!e) {
      e = { date: k };
      for (const s of keys) e[s] = 0;
      byBucket.set(k, e);
    }
    for (const s of keys) e[s] += row[s] || 0;
  }
  return [...byBucket.values()].sort((a, b) => a.date.localeCompare(b.date));
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
            value === o.k
              ? "bg-sky-500/20 text-sky-300"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}
