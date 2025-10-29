/**
 * SectionHeader Component
 * 
 * Reusable header for page sections with consistent styling.
 * 
 * Props:
 * @param title - Main heading text (required)
 * @param subtitle - Optional subheading text
 * 
 * Styling:
 * - Centered text alignment
 * - Large responsive heading (4xl → 5xl)
 * - Gray subtitle with proper spacing
 */
export default function SectionHeader({
  title, subtitle,
}: { title: string; subtitle?: string }) {
  return (
    <header className="text-center mb-10">
      <h1 className="text-4xl md:text-5xl font-bold text-white">{title}</h1>
      {subtitle && <p className="text-lg text-gray-300 mt-3">{subtitle}</p>}
    </header>
  );
}

