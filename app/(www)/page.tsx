import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import BookingEmbed from './components/BookingEmbed';
import { MessagesSquare, BellRing, CalendarCheck, ShieldCheck, Database, BarChart3, ArrowRight } from 'lucide-react';

export default function HomePage() {
  const base = process.env.CAL_PUBLIC_URL || '';
  const calLink = (() => {
    try {
      if (!base) return '';
      const url = new URL(base);
      return url.host.replace(/^www\./, '') === 'cal.com' ? url.pathname.replace(/^\//, '') : '';
    } catch {
      return '';
    }
  })();
  return (
    <div className="mx-auto max-w-7xl px-4 md:px-6 py-12">
      {/* Hero */}
      <section
        id="hero"
        className="relative overflow-hidden rounded-3xl border border-surface-line bg-surface-card shadow-soft px-6 md:px-12 py-16"
      >
        <div className="relative max-w-3xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-semibold leading-tight text-ink-1">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-brand-500 to-accent-500">
              Revive cold leads. Book kept appointments.
            </span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-ink-2">
            AI-assisted SMS follow-ups with quiet hours, built-in opt-out, and answers grounded in your playbook.
            You keep control; clients see a simple, read-only dashboard.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href="#book" className="inline-flex items-center gap-2 rounded-pill bg-brand-600 hover:bg-brand-700 text-white px-5 py-3 shadow-soft transition">
              Book a demo <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#how-it-works" className="inline-flex items-center gap-2 rounded-pill border border-surface-line bg-white/70 backdrop-blur px-5 py-3 text-ink-1 hover:bg-white transition">
              See how it works
            </a>
            <a href="/auth/login" className="inline-flex items-center gap-2 rounded-pill border border-surface-line bg-white/70 backdrop-blur px-5 py-3 text-ink-1 hover:bg-white transition">
              Sign in
            </a>
          </div>
        </div>
      </section>

      {/* Logo strip */}
      <section className="mt-10 text-center">
        <div className="text-sm text-ink-2 mb-3">Trusted by great teams</div>
        <div className="flex items-center justify-center gap-6 md:gap-10 opacity-80">
          {[1,2,3,4,5].map((i) => (
            <svg key={i} width="112" height="28" viewBox="0 0 112 28" className="text-zinc-300" aria-hidden>
              <rect width="112" height="28" rx="6" fill="currentColor" />
            </svg>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mt-16 scroll-mt-24">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-center text-ink-1">Everything you need to revive leads</h2>
        <div className="w-12 h-1 bg-gradient-to-r from-brand-500 to-accent-500 rounded-full mx-auto mt-3" />
        <p className="text-ink-2 text-center mt-3">Grounded replies, guardrails, and metrics—built for SMS.</p>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[ 
            { t: 'AI replies that book', d: 'Short, respectful follow‑ups that stay within caps and quiet hours.', I: MessagesSquare },
            { t: 'Booking links that convert', d: 'Tracked links that stamp BOOKED and block double‑booking.', I: CalendarCheck },
            { t: 'SMS compliance', d: 'Opt‑out footer, quiet hours, and deliverability insights baked‑in.', I: ShieldCheck },
            { t: 'CRM import', d: 'Upload CSV or connect your CRM; we normalize and dedupe.', I: Database },
            { t: 'Alerts that matter', d: 'Get notified on key replies and booked meetings.', I: BellRing },
            { t: 'Metrics that guide', d: 'Replies, bookings, and deliverability in one place.', I: BarChart3 },
          ].map(({ t, d, I }) => (
            <div key={t} className="rounded-2xl border border-surface-line bg-surface-card p-6 shadow-soft">
              <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center">
                <I className="w-5 h-5" />
              </div>
              <h3 className="mt-4 font-semibold text-ink-1">{t}</h3>
              <p className="text-ink-2 text-sm mt-1">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mt-16 scroll-mt-24">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-center text-ink-1">How it works</h2>
        <div className="w-12 h-1 bg-gradient-to-r from-brand-500 to-accent-500 rounded-full mx-auto mt-3" />
        <p className="text-ink-2 text-center mt-3">Three simple steps to more bookings.</p>
        <div className="mt-8 grid md:grid-cols-3 gap-4">
          {[
            { t: 'Import leads', d: 'Upload CSV or connect CRM to seed your outreach.', I: Database },
            { t: 'AI replies + KB', d: 'Grounded answers from your content, capped for SMS.', I: MessagesSquare },
            { t: 'Book meetings', d: 'Tracked links stamp BOOKED and notify your team.', I: CalendarCheck },
          ].map(({ t, d, I }, i) => (
            <div key={t} className="rounded-2xl border border-surface-line bg-surface-card p-6 shadow-soft">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center">
                  {i + 1}
                </div>
                <I className="w-5 h-5 text-brand-700" />
              </div>
              <h3 className="mt-4 font-semibold text-ink-1">{t}</h3>
              <p className="text-ink-2 text-sm mt-1">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Results */}
      <section id="results" className="mt-16 rounded-2xl border border-surface-line p-6 bg-surface-card shadow-soft scroll-mt-24">
        <div className="grid md:grid-cols-3 gap-6 text-center">
          <div><div className="text-3xl font-extrabold">35%</div><div className="text-sm text-zinc-600">Reply rate (placeholder)</div></div>
          <div><div className="text-3xl font-extrabold">+20%</div><div className="text-sm text-zinc-600">Booked from cold leads</div></div>
          <div><div className="text-3xl font-extrabold">10h/wk</div><div className="text-sm text-zinc-600">Time saved per rep</div></div>
        </div>
        <div className="mt-6 grid md:grid-cols-2 gap-4">
          {[
            '“We re‑engaged old inquiries and booked time fast.”',
            '“The agent covers follow‑ups we never had time for.”',
          ].map((q, i) => (
            <blockquote key={i} className="rounded-xl border border-surface-line p-4 text-ink-2 bg-white">{q}</blockquote>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mt-16 scroll-mt-24">
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-center text-ink-1">FAQ</h2>
        <div className="w-12 h-1 bg-gradient-to-r from-brand-500 to-accent-500 rounded-full mx-auto mt-3" />
        <div className="mt-8 grid md:grid-cols-2 gap-4">
        {[
          { q: 'How do opt‑outs work?', a: 'Every message includes STOP/HELP; STOP removes the contact immediately.' },
          { q: 'Quiet hours?', a: 'Yes. Configure your window by time zone and the agent respects it.' },
          { q: 'Pricing?', a: 'Book a demo—we’ll tailor a plan based on send volume.' },
          { q: 'Security?', a: 'Data stays in our database; no sharing with third parties beyond providers.' },
          { q: 'CRMs supported?', a: 'CSV import works everywhere; we support common CRMs via connectors.' },
          { q: 'How to start?', a: 'Click “Book a demo” and we’ll get you set up.' },
        ].map((f, i) => (
          <details key={i} className="rounded-2xl border border-surface-line bg-surface-card p-4 shadow-soft">
            <summary className="cursor-pointer font-semibold text-ink-1 list-none flex items-center justify-between">
              {f.q}
              <span className="ml-2 text-ink-2">+</span>
            </summary>
            <div className="text-sm text-ink-2 mt-2">{f.a}</div>
          </details>
        ))}
        </div>
      </section>

      {/* Book a demo */}
      <section id="book" className="mt-20 scroll-mt-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-ink-1">Book a demo</h2>
          <div className="w-12 h-1 bg-gradient-to-r from-brand-500 to-accent-500 rounded-full mx-auto mt-3" />
          <p className="text-ink-2 mt-3">See how OutboundRevive revives cold leads and books time.</p>
        </div>
        <div className="mt-6">
          {calLink ? (
            <BookingEmbed calLink={calLink} />
          ) : (
            <div className="rounded-2xl border border-surface-line bg-surface-card p-8 text-center text-ink-2 shadow-soft">
              Set CAL_PUBLIC_URL to your Cal.com booking link.
            </div>
          )}
        </div>
      </section>

      {/* Book a demo moved to /demo */}
    </div>
  );
}

export const generateMetadata = (): Metadata => pageMeta(
  'OutboundRevive — AI SMS follow-ups that book real appointments',
  'Revive cold leads with compliant, AI-assisted SMS. Quiet hours, opt-outs, and a read-only dashboard. Book more kept appointments without babysitting outreach.',
  '/'
);
