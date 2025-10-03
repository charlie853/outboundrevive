export default function Logos() {
  return (
    <section className="mx-auto max-w-7xl px-4 md:px-6 py-8">
      <div className="text-center text-sm text-ink-2 mb-3">Trusted by great teams</div>
      <div className="flex flex-wrap items-center justify-center gap-6 md:gap-10 opacity-80">
        {Array.from({ length: 6 }).map((_, i) => (
          <svg key={i} width="112" height="28" viewBox="0 0 112 28" className="text-surface-line" aria-hidden>
            <rect width="112" height="28" rx="6" fill="currentColor" />
          </svg>
        ))}
      </div>
    </section>
  );
}

