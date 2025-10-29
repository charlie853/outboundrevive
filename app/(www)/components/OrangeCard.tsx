import React from "react";

/**
 * OrangeCard Component
 * 
 * Reusable card wrapper with amber accent border and dark glass effect.
 * 
 * Props:
 * @param children - Card content
 * @param className - Optional additional CSS classes
 * 
 * Styling:
 * - Amber border with hover effect (via .grad-border-amber)
 * - Semi-transparent dark background
 * - Backdrop blur for glass morphism
 * - Rounded corners (1rem)
 * - Responsive padding (6 → 8)
 */
export default function OrangeCard({
  children, className = "",
}: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`grad-border-amber p-6 md:p-8 ${className}`}>
      {children}
    </div>
  );
}

