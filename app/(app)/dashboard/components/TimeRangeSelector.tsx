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

export function useTimeRange() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const initialRange = (() => {
    const fromQuery = (searchParams?.get('range') ?? searchParams?.get('window') ?? '7d').toLowerCase();
    const values = WINDOW_OPTIONS.map((o) => o.value);
    return values.includes(fromQuery as WindowKey) ? (fromQuery as WindowKey) : '7d';
  })();

  const handleSetRange = (value: WindowKey) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('range', value);
    params.set('window', value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return { range: initialRange, setRange: handleSetRange };
}

