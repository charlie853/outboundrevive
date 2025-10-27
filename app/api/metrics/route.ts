import { NextResponse } from "next/server";
import { supabaseAdmin as sb } from "@/lib/supabaseServer";

export const revalidate = 0;
export const runtime = 'nodejs';

export async function GET() {
  try {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const since7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [out24, in24, reminders24, pausedNow] = await Promise.all([
      sb.from("messages_out").select("*", { count: "exact", head: true }).gte("created_at", since24h),
      sb.from("messages_in").select("*", { count: "exact", head: true }).gte("created_at", since24h),
      sb.from("messages_out").select("*", { count: "exact", head: true }).gte("created_at", since24h).eq("gate_log->>category", "reminder"),
      sb.from("leads").select("*", { count: "exact", head: true }).gt("reminder_pause_until", now.toISOString()),
    ]);

    // Basic series for last 7d
    const outRows = await sb
      .from("messages_out")
      .select("created_at")
      .gte("created_at", since7d)
      .order("created_at", { ascending: true });

    const inRows = await sb
      .from("messages_in")
      .select("created_at")
      .gte("created_at", since7d)
      .order("created_at", { ascending: true });

    const bucket = (rows?: { created_at: string }[]) => {
      const m = new Map<string, number>();
      (rows || []).forEach((r) => {
        const d = (r.created_at as string).slice(0, 10);
        m.set(d, (m.get(d) || 0) + 1);
      });
      return Array.from(m.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));
    };

    return NextResponse.json({
      ok: true,
      out24: out24.count || 0,
      in24: in24.count || 0,
      reminders24: reminders24.count || 0,
      paused: pausedNow.count || 0,
      series: {
        out: bucket((outRows.data as any) || []),
        in: bucket((inRows.data as any) || []),
      },
    });
  } catch (e) {
    console.error("[METRICS] simple route error", e);
    return NextResponse.json({ ok: false, error: "metrics_failed" }, { status: 500 });
  }
}

