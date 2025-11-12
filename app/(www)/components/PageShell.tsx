"use client";
import React from "react";

/**
 * PageShell Component
 * 
 * Provides a consistent wrapper for all secondary pages with:
 * - Dark gradient background (indigo → slate)
 * - Static aurora effect (subtle gradient orbs)
 * - Proper z-index layering for content
 * 
 * Usage:
 * Wrap page content in this component for unified styling across
 * Contact, About, Privacy, Terms, SMS Consent, and Messaging Policy pages.
 */
export default function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="page-shell bg-gradient-to-b from-indigo-900 via-indigo-800 to-slate-900 bg-grid relative min-h-screen">
      <div className="relative z-10">{children}</div>
    </section>
  );
}

