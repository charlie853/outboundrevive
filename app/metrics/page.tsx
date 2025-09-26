export const dynamic = 'force-dynamic';

async function getSummary() {
  const r = await fetch(`${process.env.PUBLIC_BASE_URL}/api/metrics/last7d`, { cache: 'no-store' });
  if (!r.ok) throw new Error('metrics/last7d failed');
  return r.json() as Promise<{ since: string; sent: number; replies: number; booked: number; kept: number }>;
}

async function getSeries() {
  const r = await fetch(`${process.env.PUBLIC_BASE_URL}/api/metrics/last7d/series`, { cache: 'no-store' });
  // If you haven’t built /series yet, just skip it
  if (!r.ok) return [];
  return r.json() as Promise<Array<{ day: string; sent: number; replies: number; booked: number; kept: number }>>;
}

export default async function MetricsPage() {
  const [summary, series] = await Promise.all([getSummary(), getSeries().catch(() => [])]);

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Last 7 days</h1>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border rounded-xl p-4">
          <div className="text-xs text-gray-500">Sent</div>
          <div className="text-2xl font-semibold">{summary.sent}</div>
        </div>
        <div className="border rounded-xl p-4">
          <div className="text-xs text-gray-500">Replies</div>
          <div className="text-2xl font-semibold">{summary.replies}</div>
        </div>
        <div className="border rounded-xl p-4">
          <div className="text-xs text-gray-500">Booked</div>
          <div className="text-2xl font-semibold">{summary.booked}</div>
        </div>
        <div className="border rounded-xl p-4">
          <div className="text-xs text-gray-500">Kept</div>
          <div className="text-2xl font-semibold">{summary.kept}</div>
        </div>
      </div>

      {Array.isArray(series) && series.length > 0 && (
        <div className="border rounded-xl p-4">
          <div className="text-sm font-medium mb-2">Daily</div>
          <div className="text-xs text-gray-500 mb-3">sent / replies / booked / kept</div>
          <div className="space-y-2">
            {series.map((d) => (
              <div key={d.day} className="flex justify-between text-sm">
                <div className="w-24">{d.day}</div>
                <div className="flex gap-5">
                  <span>📤 {d.sent}</span>
                  <span>💬 {d.replies}</span>
                  <span>📅 {d.booked}</span>
                  <span>✅ {d.kept}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}