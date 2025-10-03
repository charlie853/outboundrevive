export default function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-surface-line bg-white p-10 text-center">
      <div className="text-xl font-semibold text-ink-1">{title}</div>
      {body && <div className="mt-2 text-ink-2">{body}</div>}
    </div>
  );
}

