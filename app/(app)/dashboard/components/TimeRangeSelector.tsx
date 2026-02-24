'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';

const WINDOW_OPTIONS = [
  { label: '24H', value: '24h' as const },
  { label: '7D', value: '7d' as const },
  { label: '1M', value: '30d' as const },
  { label: 'All Time', value: 'all' as const },
];
export type WindowKey = (typeof WINDOW_OPTIONS)[number]['value'];

export function TimeRangeSelector({ range, onRangeChange }: { range: WindowKey; onRangeChange: (value: WindowKey) => void }) {
  return (
    <div className="inline-flex rounded-full bg-white shadow-sm p-1 gap-1">
      {WINDOW_OPTIONS.map(({ label, value }) => (
        <button
          key={value}
          type="button"
          onClick={() => onRangeChange(value)}
          className={`text-sm font-medium rounded-lg px-4 py-2 transition-all ${
            range === value 
              ? 'text-ink-1 shadow-sm' 
              : 'text-ink-2 hover:bg-surface-bg'
          }`}
          style={range === value ? {
            background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
          } : {}}
          aria-pressed={range === value}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const STORAGE_KEY = 'dashboard_time_range';

export function useTimeRange() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const range = (() => {
    const fromQuery = searchParams?.get('range') ?? searchParams?.get('window');
    const fromStorage = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const raw = (fromQuery ?? fromStorage ?? '7d').toLowerCase();
    const values = WINDOW_OPTIONS.map((o) => o.value);
    return values.includes(raw as WindowKey) ? (raw as WindowKey) : '7d';
  })();

  const handleSetRange = (value: WindowKey) => {
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, value);
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('range', value);
    params.set('window', value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return { range, setRange: handleSetRange };
}

