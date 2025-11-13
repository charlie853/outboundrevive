'use client';

import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * Reusable StatCard component with frosted glass styling
 * Used for metric cards on the dashboard
 */
export function StatCard({ title, value, subtext, className = '', children }: StatCardProps) {
  return (
    <div
      className={`
        bg-white/20
        backdrop-blur-xl
        border border-amber-500/50
        rounded-2xl
        shadow-[0_8px_24px_rgba(0,0,0,0.35)]
        px-6 py-5
        flex flex-col justify-between
        ${className}
      `}
    >
      <div className="text-sm font-bold text-white">{title}</div>
      <div className="mt-2 text-3xl font-bold text-white">
        {value}
      </div>
      {subtext && (
        <div className="text-xs text-white/60 mt-1">{subtext}</div>
      )}
      {children}
    </div>
  );
}

/**
 * ChartCard component for chart containers
 * Frosted glass styling to match StatCard
 */
export function ChartCard({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`
        bg-white/20
        backdrop-blur-xl
        border border-amber-500/50
        rounded-2xl
        shadow-[0_8px_24px_rgba(0,0,0,0.35)]
        px-6 py-5
        ${className}
      `}
    >
      {title && (
        <h3 className="text-sm font-bold text-white mb-4">{title}</h3>
      )}
      {children}
    </div>
  );
}

/**
 * WhiteChartCard component for Message Delivery and Lead Engagement
 * White background with dark gray/black text
 */
export function WhiteChartCard({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`
        bg-white
        border border-amber-500/50
        rounded-2xl
        shadow-[0_8px_24px_rgba(0,0,0,0.35)]
        px-6 py-5
        ${className}
      `}
    >
      {title && (
        <h3 className="text-sm font-bold text-gray-900 mb-4">{title}</h3>
      )}
      {children}
    </div>
  );
}

