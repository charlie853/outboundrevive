"use client";
import { MessageSquare, Route, Calendar, ShieldCheck, Plug, Activity } from "lucide-react";
import { motion } from "motion/react";

/**
 * Feature Grid Component
 * 
 * Displays 6 key product features in a responsive grid layout.
 * Each card fades in with a stagger effect when scrolled into view.
 * 
 * Features:
 * - Responsive grid (1 col mobile, 2 cols tablet, 3 cols desktop)
 * - Staggered fade-in animations
 * - Hover lift effect on cards
 * - Icon badges with amber accent
 */

const features = [
  {
    icon: MessageSquare,
    title: "Hands-free follow-ups",
    description: "Automated SMS sequences trigger from your CRM or site forms."
  },
  {
    icon: Route,
    title: "Smart routing",
    description: "Replies are detected and assigned to the right owner instantly."
  },
  {
    icon: Calendar,
    title: "Book more, no chasing",
    description: "Booking nudges convert warm leads while interest is high."
  },
  {
    icon: ShieldCheck,
    title: "Compliance built-in",
    description: "PAUSE/RESUME/HELP keywords, quiet hours, and consent logging out of the box."
  },
  {
    icon: Plug,
    title: "Bring your stack",
    description: "Connect CRMs and calendars in minutes—no heavy lift."
  },
  {
    icon: Activity,
    title: "Real-time visibility",
    description: "See who replied and who booked—live KPIs, no exports."
  }
];

export default function FeatureGrid() {
  return (
    <section className="relative mx-auto max-w-7xl px-4 md:px-6 py-20">
      {/* Section header with fade-in animation */}
      <motion.h2 
        className="text-4xl md:text-5xl font-bold text-center text-white mb-4"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}>
        What you'll get
      </motion.h2>
      
      <motion.p 
        className="text-xl text-gray-300 text-center max-w-3xl mx-auto mb-16"
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, delay: 0.2 }}>
        Short, respectful follow‑ups with guardrails and visibility.
      </motion.p>

      {/* Feature cards grid with staggered animation */}
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, idx) => (
          <motion.article
            key={feature.title}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-8% 0px" }}
            transition={{ duration: 0.4, delay: idx * 0.1 }}
            className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-[2px] p-8 hover-lift"
          >
            {/* Icon badge */}
            <div className="w-12 h-12 flex items-center justify-center rounded-xl bg-amber-500/10 text-amber-500 mb-6">
              <feature.icon className="w-6 h-6" />
            </div>
            
            {/* Feature title and description */}
            <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
            <p className="text-base text-gray-300 leading-relaxed">{feature.description}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}