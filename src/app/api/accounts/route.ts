import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_VERSION = process.env.FB_API_VERSION || "v21.0";

// List ad accounts the current FB_ACCESS_TOKEN has access to.
// Used by the UI to populate the account-switcher dropdown.
export async function GET() {
  const token = process.env.FB_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "Missing FB_ACCESS_TOKEN" }, { status: 500 });
  }

  const sp = new URLSearchParams({
    access_token: token,
    fields: "id,account_id,name,account_status,currency",
    limit: "100",
  });

  const url = `https://graph.facebook.com/${API_VERSION}/me/adaccounts?${sp.toString()}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `FB API ${res.status}: ${text}` }, { status: 500 });
    }
    const json = await res.json();
    // Filter to active accounts (status 1 = ACTIVE) and shape minimal payload
    const data = (json.data || [])
      .map((a: any) => ({
        id: a.id, // already in form "act_xxxxx"
        name: a.name,
        currency: a.currency,
        status: a.account_status,
      }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
    return NextResponse.json({ data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
