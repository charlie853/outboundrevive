"use client";
import { useState } from "react";

export default function WaitlistMini() {
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [ok, setOk] = useState<boolean | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setOk(null);
    setErr(null);
    try {
      const r = await fetch("/api/public/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, hp }),
      });
      setOk(r.ok);
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErr(j?.error || "Something went wrong");
      }
      if (r.ok) setEmail("");
    } catch (e: any) {
      setErr(e?.message || "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex max-w-md gap-2" aria-label="Join waitlist">
      <input
        type="email"
        required
        placeholder="you@company.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="flex-1 rounded-xl border border-surface-line px-3 py-3 text-ink-1 placeholder:text-ink-2"
        aria-label="Email address"
      />
      <input type="text" value={hp} onChange={(e)=>setHp(e.target.value)} className="hidden" autoComplete="off" aria-hidden />
      <button
        type="submit"
        disabled={loading}
        className="rounded-xl bg-ink-1 px-5 py-3 text-white hover:bg-black disabled:opacity-60"
        data-analytics-id="waitlist_submit"
        aria-label="Join waitlist"
      >
        {loading ? "Submitting…" : "Join waitlist"}
      </button>
      {ok && <span className="sr-only">Joined successfully</span>}
      {err && <span className="sr-only">Submission failed</span>}
    </form>
  );
}

