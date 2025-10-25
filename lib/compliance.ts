import { supabaseAdmin } from "@/lib/supabaseServer";

export type ReminderCapResult = {
  held: boolean;
  reason?: "reminder_cap";
  dayCount: number;
  weekCount: number;
};

export async function checkReminderCaps(toLeadPhone: string): Promise<ReminderCapResult> {
  const daily = parseInt(process.env.REMINDER_CAP_DAILY || "1", 10);
  const weekly = parseInt(process.env.REMINDER_CAP_WEEKLY || "3", 10);

  const now = new Date();
  const dayStart = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const dayQ = await supabaseAdmin
    .from("messages_out")
    .select("id", { count: "exact", head: true })
    .eq("to_phone", toLeadPhone)
    .gte("created_at", dayStart)
    .contains("gate_log", { category: "reminder" });

  const dayCount = dayQ.count ?? 0;

  const weekQ = await supabaseAdmin
    .from("messages_out")
    .select("id", { count: "exact", head: true })
    .eq("to_phone", toLeadPhone)
    .gte("created_at", weekStart)
    .contains("gate_log", { category: "reminder" });

  const weekCount = weekQ.count ?? 0;

  const held = dayCount >= daily || weekCount >= weekly;
  return { held, reason: held ? "reminder_cap" : undefined, dayCount, weekCount };
}
