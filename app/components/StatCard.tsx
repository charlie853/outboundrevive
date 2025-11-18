'use client';

import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  subtext?: string;
  className?: string;
  children?: React.ReactNode;
  accentColor?: 'brand' | 'warning' | 'success' | 'danger';
  icon?: React.ReactNode;
}

/**
 * Reusable StatCard component with left accent bar
 * Used for metric cards on the dashboard
 */
export function StatCard({ title, value, subtext, className = '', children, accentColor = 'brand', icon }: StatCardProps) {
  const accentBarColor = 
    accentColor === 'warning' ? 'bg-warning' :
    accentColor === 'success' ? 'bg-success' :
    accentColor === 'danger' ? 'bg-danger' :
    'bg-brand-400';
  
  return (
    <div
      className={`
        relative
        p-6
        rounded-[12px]
        shadow-sm
        border
        border-surface-line
        bg-surface-card
        flex flex-col justify-between
        ${className}
      `}
    >
      <div className={`absolute left-0 top-0 h-full w-[4px] rounded-l-[12px] ${accentBarColor}`} />
      <div className="flex items-start justify-between">
        <div className="text-sm font-medium text-ink-2">{title}</div>
        {icon && <div className="text-ink-2">{icon}</div>}
      </div>
      <div className="mt-2 text-[32px] font-bold text-ink-1">
        {value}
      </div>
      {subtext && (
        <div className="text-xs mt-1" style={{ 
          color: subtext.includes('+') ? '#10B981' : subtext.includes('-') ? '#EF4444' : '#475569' 
        }}>
          {subtext}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * ChartCard component for chart containers
 * White card surface with proper styling
 */
export function ChartCard({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`
        p-6
        rounded-[12px]
        shadow-sm
        border
        border-surface-line
        bg-surface-card
        ${className}
      `}
    >
      {title && (
        <h3 className="text-sm font-bold text-ink-1 mb-4">{title}</h3>
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
        p-6
        rounded-[12px]
        shadow-sm
        border
        border-surface-line
        bg-surface-card
        ${className}
      `}
    >
      {title && (
        <h3 className="text-sm font-bold text-ink-1 mb-4">{title}</h3>
      )}
      {children}
    </div>
  );
}

