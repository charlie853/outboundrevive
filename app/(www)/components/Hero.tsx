"use client";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "motion/react";

/**
 * Hero Section Component
 * 
 * Main landing section with headline, subheadline, and primary CTA.
 * Features smooth fade-in animations using Framer Motion.
 * 
 * Animation Timeline:
 * - 0.0s: Container fades in
 * - 0.2s: Main headline appears
 * - 0.4s: Subheadline appears
 * - 0.6s: CTA button appears
 */
export default function Hero() {
  return (
    <section className="relative overflow-hidden py-32 sm:py-40">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center max-w-4xl mx-auto">
          {/* Main content wrapper with initial fade-in */}
          <motion.div className="flex flex-col space-y-8"
            initial={{ opacity: 0, y: -30 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ duration: 0.8 }}>
            
            {/* Main headline with gradient accent */}
            <motion.h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white"
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.8, delay: 0.2 }}>
              Revive Dead Leads{" "}
              <span className="block bg-gradient-to-r from-amber-400 to-orange-500 bg-clip-text text-transparent">
                Boost Revenue
              </span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p className="text-xl text-gray-300 max-w-3xl mx-auto"
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.8, delay: 0.4 }}>
              OutboundRevive follows up by SMS so you don't have to. Booked meetings, kept appointments, fewer no-shows.
            </motion.p>

            {/* CTA button with hover/tap interactions */}
            <motion.div className="flex flex-col sm:flex-row gap-4 justify-center"
              initial={{ opacity: 0, y: 20 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.8, delay: 0.6 }}>
              
              <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <Link href="/book" className="btn-shimmer hover-lift tap-active btn-amber btn-pill px-8 py-4 text-lg font-semibold inline-flex items-center">
                  Get a demo
                  {/* Animated arrow with subtle pulse */}
                  <motion.div animate={{ x: [0, 3, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </motion.div>
                </Link>
              </motion.div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}