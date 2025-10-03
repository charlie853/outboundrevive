import { CalendarCheck, MessagesSquare, ShieldCheck, Share2, GaugeCircle, UserRoundCheck } from "lucide-react";
import Link from "next/link";

type Feature = { title: string; description: string; icon: React.ElementType; href?: string };

const features: Feature[] = [
  { title: "Hands-free follow-ups", description: "Automated SMS sequences trigger from your CRM or site forms.", icon: MessagesSquare, href: "/features" },
  { title: "Smart routing", description: "Replies are detected and assigned to the right owner instantly.", icon: UserRoundCheck, href: "/features" },
  { title: "Book more, no chasing", description: "Booking nudges convert warm leads while interest is high.", icon: CalendarCheck, href: "/features" },
  { title: "Compliance built-in", description: "STOP/HELP, quiet hours, and consent logging out of the box.", icon: ShieldCheck, href: "/features" },
  { title: "Bring your stack", description: "Connect CRMs and calendars in minutes—no heavy lift.", icon: Share2, href: "/features" },
  { title: "Real-time visibility", description: "See who replied and who booked—live KPIs, no exports.", icon: GaugeCircle, href: "/features" },
];

export default function FeatureGrid() {
  return (
    <section id="how-it-works" className="mx-auto max-w-7xl px-4 md:px-6 py-16">
      <h2 className="text-3xl font-semibold text-ink-1">What you’ll get</h2>
      <p className="text-ink-2 mt-2">Short, respectful follow‑ups with guardrails and visibility.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ title, description, icon: I, href }) => (
          <article key={title} className="rounded-2xl border border-surface-line bg-surface-card p-6 shadow-soft focus-within:ring-2 focus-within:ring-brand-500">
            <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center">
              <I className="w-5 h-5" aria-hidden />
            </div>
            <h3 className="mt-4 font-semibold text-ink-1 text-[16px]">{title}</h3>
            <p className="text-ink-2 text-[14px] mt-1">{description}</p>
            <div className="mt-3">
              <Link href={href || "#"} className="text-[14px] underline text-ink-1">Learn more</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

