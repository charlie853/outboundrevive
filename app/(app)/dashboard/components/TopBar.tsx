'use client';

interface TopBarProps {
  title: string;
  subtitle: string;
  rightContent?: React.ReactNode;
}

export default function TopBar({ title, subtitle, rightContent }: TopBarProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink-1">{title}</h1>
        <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        {rightContent}
      </div>
    </div>
  );
}

