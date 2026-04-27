// Facebook Marketing API helper (server-side only)

const API_VERSION = process.env.FB_API_VERSION || "v21.0";
const BASE = `https://graph.facebook.com/${API_VERSION}`;

export type InsightsParams = {
  level?: "account" | "campaign" | "adset" | "ad";
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  breakdowns?: string; // e.g. "publisher_platform,platform_position"
  timeIncrement?: string | number; // "1" for daily
  accountId?: string; // overrides FB_AD_ACCOUNT_ID env var
};

const FIELDS = [
  "account_id",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "cpc",
  "cpm",
  "actions",
  "action_values",
  "purchase_roas",
  "date_start",
  "date_stop",
].join(",");

// Pick a safe chunk size (in days) based on granularity & cardinality.
// FB throttles heavier responses — ad-level with daily breakdown is the worst.
function chunkDaysFor(params: InsightsParams): number {
  const level = params.level || "account";
  const daily = !!params.timeIncrement;
  const hasBreakdown = !!params.breakdowns;
  if (level === "ad" && daily) return 3;
  if (level === "ad") return 14;
  if (level === "adset" && daily) return 7;
  if (level === "adset") return 30;
  if (hasBreakdown && daily) return 7;
  if (level === "campaign" && daily) return 14;
  return 30;
}

function splitRange(since: string, until: string, days: number) {
  const chunks: { since: string; until: string }[] = [];
  const s = new Date(since);
  const e = new Date(until);
  let cur = new Date(s);
  while (cur <= e) {
    const end = new Date(cur);
    end.setDate(end.getDate() + days - 1);
    if (end > e) end.setTime(e.getTime());
    chunks.push({ since: toIso(cur), until: toIso(end) });
    cur = new Date(end);
    cur.setDate(cur.getDate() + 1);
  }
  return chunks;
}

function toIso(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function fetchOneWindow(params: InsightsParams, attempt = 0): Promise<any[]> {
  const accountId = params.accountId || process.env.FB_AD_ACCOUNT_ID!;
  const token = process.env.FB_ACCESS_TOKEN!;
  const search = new URLSearchParams({
    access_token: token,
    level: params.level || "account",
    fields: FIELDS,
    time_range: JSON.stringify({ since: params.since, until: params.until }),
    limit: "500",
  });
  if (params.breakdowns) search.set("breakdowns", params.breakdowns);
  if (params.timeIncrement) search.set("time_increment", String(params.timeIncrement));

  const url = `${BASE}/${accountId}/insights?${search.toString()}`;
  const out: any[] = [];
  let next: string | null = url;
  while (next) {
    const res: Response = await fetch(next, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      // Auto-recover from "reduce amount of data" (code 1 / 500) by further chunking
      if ((res.status === 500 || res.status === 400) && /reduce the amount of data/i.test(text) && attempt < 3) {
        const days = Math.max(
          1,
          Math.floor(
            (new Date(params.until).getTime() - new Date(params.since).getTime()) / 86400000 / 2
          ) + 1
        );
        const subs = splitRange(params.since, params.until, days);
        const results = await Promise.all(subs.map((s) => fetchOneWindow({ ...params, ...s }, attempt + 1)));
        return results.flat();
      }
      throw new Error(`FB API ${res.status}: ${text}`);
    }
    const json = await res.json();
    if (json.data) out.push(...json.data);
    next = json.paging?.next || null;
  }
  return out;
}

export async function fetchInsights(params: InsightsParams) {
  const accountId = params.accountId || process.env.FB_AD_ACCOUNT_ID!;
  const token = process.env.FB_ACCESS_TOKEN!;
  if (!accountId || !token) throw new Error("Missing FB credentials");

  const chunkDays = chunkDaysFor(params);
  const windows = splitRange(params.since, params.until, chunkDays);

  // Run chunks in parallel (with a modest concurrency cap via Promise.all — fine for small counts)
  const batches = await Promise.all(
    windows.map((w) => fetchOneWindow({ ...params, since: w.since, until: w.until }))
  );
  const all = batches.flat();
  const normalized = all.map(normalize);

  // When chunked without time_increment, the same entity appears in multiple windows —
  // merge by a composite key so totals are correct.
  if (windows.length > 1 && !params.timeIncrement) {
    return mergeRows(normalized, params);
  }
  return normalized;
}

function mergeRows(rows: ReturnType<typeof normalize>[], params: InsightsParams) {
  const level = params.level || "account";
  const breakdownFields = (params.breakdowns || "").split(",").map((s) => s.trim()).filter(Boolean);
  const keyFn = (r: any) => {
    const parts: string[] = [];
    if (level === "campaign") parts.push(r.campaign_id || "");
    else if (level === "adset") parts.push(r.adset_id || "");
    else if (level === "ad") parts.push(r.ad_id || "");
    else parts.push("account");
    for (const f of breakdownFields) parts.push(String(r[f] ?? ""));
    return parts.join("|");
  };

  const map = new Map<string, any>();
  for (const r of rows) {
    const k = keyFn(r);
    const e = map.get(k);
    if (!e) {
      map.set(k, { ...r });
    } else {
      e.spend += r.spend;
      e.impressions += r.impressions;
      e.clicks += r.clicks;
      e.purchases += r.purchases;
      e.purchaseValue += r.purchaseValue;
      e.addToCart += r.addToCart;
    }
  }
  // Recompute derived metrics
  for (const e of map.values()) {
    e.ctr = e.impressions ? (e.clicks / e.impressions) * 100 : 0;
    e.cpc = e.clicks ? e.spend / e.clicks : 0;
    e.cpm = e.impressions ? (e.spend / e.impressions) * 1000 : 0;
    e.roas = e.spend ? e.purchaseValue / e.spend : 0;
    e.cpa = e.purchases ? e.spend / e.purchases : 0;
  }
  return [...map.values()];
}

// Pick a single action value by priority — FB returns the same conversion under
// multiple action_types (omni_purchase, purchase, offsite_conversion.fb_pixel_purchase, ...)
// which all represent the same transactions from different attribution views. Summing
// them would double/triple count. We take the FIRST match in priority order.
function pickAction(list: any[] | undefined, typesByPriority: string[]): number {
  if (!list) return 0;
  for (const type of typesByPriority) {
    for (const row of list) {
      if (row.action_type === type) {
        const v = Number(row.value) || 0;
        if (v > 0) return v;
      }
    }
  }
  return 0;
}

function normalize(r: any) {
  const spend = Number(r.spend) || 0;
  const impressions = Number(r.impressions) || 0;
  const clicks = Number(r.clicks) || 0;
  const ctr = Number(r.ctr) || 0;
  const cpc = Number(r.cpc) || 0;
  const cpm = Number(r.cpm) || 0;

  // Purchase events — FB returns the same transaction under multiple action_types
  // (omni/standard/pixel). We pick ONE in priority order to match Ads Manager UI's
  // "Purchases" / "Purchases conversion value" column.
  // Priority: omni_purchase (unified, default UI) → purchase (standard event)
  // → offsite_conversion.fb_pixel_purchase (pixel fallback).
  const PURCHASE_TYPES = [
    "omni_purchase",
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
  ];
  const ATC_TYPES = [
    "omni_add_to_cart",
    "add_to_cart",
    "offsite_conversion.fb_pixel_add_to_cart",
  ];

  const purchases = pickAction(r.actions, PURCHASE_TYPES);
  const purchaseValue = pickAction(r.action_values, PURCHASE_TYPES);
  const addToCart = pickAction(r.actions, ATC_TYPES);

  const roas = purchases > 0 && spend > 0 ? purchaseValue / spend : 0;
  const cpa = purchases > 0 ? spend / purchases : 0;

  return {
    account_id: r.account_id,
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    adset_id: r.adset_id,
    adset_name: r.adset_name,
    ad_id: r.ad_id,
    ad_name: r.ad_name,
    date_start: r.date_start,
    date_stop: r.date_stop,
    publisher_platform: r.publisher_platform,
    platform_position: r.platform_position,
    impression_device: r.impression_device,
    device_platform: r.device_platform,
    age: r.age,
    gender: r.gender,
    country: r.country,
    region: r.region,
    user_segment_key: r.user_segment_key,
    spend,
    impressions,
    clicks,
    ctr,
    cpc,
    cpm,
    purchases,
    purchaseValue,
    addToCart,
    roas,
    cpa,
  };
}

export type InsightRow = Awaited<ReturnType<typeof fetchInsights>>[number];
