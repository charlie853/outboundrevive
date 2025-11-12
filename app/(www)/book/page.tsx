import Client from "./Client";
import Nav from "../components/Nav";
import PageShell from "../components/PageShell";

function sanitizeCalLink(raw?: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  // Accept full Cal.com URL or path-like "user/event"
  try {
    const u = new URL(s);
    if (u.hostname.endsWith("cal.com")) {
      return u.pathname.replace(/^\/+/, "");
    }
  } catch {
    // not a full URL; fall through
  }
  // simple path guard
  if (/^[A-Za-z0-9-_]+\/[A-Za-z0-9-_]+$/.test(s)) return s;
  return null;
}

export default function BookPage() {
  const fromEnv = process.env.CAL_PUBLIC_URL || process.env.NEXT_PUBLIC_CAL_PUBLIC_URL || "";
  const provided = sanitizeCalLink("https://cal.com/charlie-fregozo-v8sczt/30min");
  const calPath = sanitizeCalLink(fromEnv) || provided;
  return (
    <div className="min-h-screen flex flex-col">
      <Nav />
      <main className="flex-1">
        <PageShell>
          <Client calLink={calPath} />
        </PageShell>
      </main>
    </div>
  );
}
