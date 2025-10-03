import Link from "next/link";

export default function CTA({ idSuffix = "bottom" }: { idSuffix?: string }) {
  return (
    <section className="mx-auto max-w-7xl px-4 md:px-6 py-12">
      <div className="rounded-2xl border border-surface-line bg-surface-card shadow-soft p-6 md:p-8 text-center">
        <h3 className="text-2xl font-semibold text-ink-1">Ready to see it in action?</h3>
        <p className="text-ink-2 mt-2">No credit card required.</p>
        <div className="mt-6">
          <Link
            href="/book"
            className="inline-flex rounded-pill bg-brand-600 px-5 py-3 text-white hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
            data-analytics-id={`cta-demo-${idSuffix}`}
            aria-label="Get a demo"
          >
            Get a demo
          </Link>
        </div>
      </div>
    </section>
  );
}
