"use client";

import Cal from '@calcom/embed-react';

type Props = {
  calLink: string;
  height?: number | string;
  hideDetails?: boolean;
  layout?: 'month_view' | 'week_view' | string;
  className?: string;
};

export default function BookingEmbed({ calLink, height = 1000, hideDetails = true, layout = 'month_view', className }: Props) {
  if (!calLink) return null;
  return (
    <div className={className}>
      <Cal
        calLink={calLink}
        style={{ width: '100%', height: typeof height === 'number' ? `${height}px` : height }}
        config={{ hideEventTypeDetails: hideDetails as any, layout: layout as any, theme: 'light' as any }}
      />
    </div>
  );
}
