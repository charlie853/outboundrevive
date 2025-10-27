import { NextResponse } from "next/server";
import { supabaseAdmin as sb } from "@/lib/supabaseServer";

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

    // Fetch latest messages (both directions) in last ~14 days as a working set
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const [outs, ins, leads] = await Promise.all([
      sb
        .from("messages_out")
        .select("to_phone, body, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),
      sb
        .from("messages_in")
        .select("from_phone, body, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1000),
      sb.from("leads").select("phone,name"),
    ]);

    const nameByPhone = new Map<string, string>();
    (leads.data || []).forEach((l: any) => {
      if (l?.phone) nameByPhone.set(l.phone, l.name || "");
    });

    type Msg = { phone: string; body: string; created_at: string };
    const all: Msg[] = [];
    (outs.data || []).forEach((r: any) => all.push({ phone: r.to_phone, body: r.body, created_at: r.created_at }));
    (ins.data || []).forEach((r: any) => all.push({ phone: r.from_phone, body: r.body, created_at: r.created_at }));

    all.sort((a, b) => (a.created_at > b.created_at ? -1 : 1));

    const threads: Array<{ lead_phone: string; lead_name: string; last_message: string; last_at: string }> = [];
    const seen = new Set<string>();
    for (const m of all) {
      if (seen.has(m.phone)) continue;
      seen.add(m.phone);
      threads.push({
        lead_phone: m.phone,
        lead_name: nameByPhone.get(m.phone) || m.phone,
        last_message: m.body,
        last_at: m.created_at,
      });
      if (threads.length >= limit) break;
    }

    return NextResponse.json({ ok: true, threads });
  } catch (e) {
    console.error("[THREADS] error", e);
    return NextResponse.json({ ok: false, error: "threads_failed" }, { status: 500 });
  }
}

