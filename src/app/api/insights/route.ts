import { NextRequest, NextResponse } from "next/server";
import { fetchInsights } from "@/lib/fb";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const since = sp.get("since");
  const until = sp.get("until");
  const level = (sp.get("level") || "account") as any;
  const breakdowns = sp.get("breakdowns") || undefined;
  const timeIncrement = sp.get("time_increment") || undefined;

  if (!since || !until) {
    return NextResponse.json({ error: "since and until required" }, { status: 400 });
  }

  try {
    const data = await fetchInsights({
      since,
      until,
      level,
      breakdowns,
      timeIncrement,
    });
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
