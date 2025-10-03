"use client";
import { useRouter, useSearchParams, usePathname } from 'next/navigation';

export default function TimeRange({ current }: { current: '7d'|'30d'|'90d'|string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const ranges = ['7d','30d','90d'] as const;
  function setRange(r: string) {
    const q = new URLSearchParams(sp?.toString());
    q.set('range', r);
    router.push(`${pathname}?${q.toString()}`);
  }
  return (
    <div className="inline-flex rounded-xl border border-surface-line bg-white p-1">
      {ranges.map((r) => (
        <button key={r} onClick={() => setRange(r)} className={`px-3 py-1.5 text-sm rounded-lg ${current===r?'bg-ink-1 text-white':'text-ink-1 hover:bg-surface-bg'}`} aria-pressed={current===r}>
          {r.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

