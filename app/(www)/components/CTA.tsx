import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function CTA() {
  return (
    <section className="relative py-16">
      <div className="mx-auto max-w-3xl px-4 md:px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
          Ready to see it in action?
        </h2>

        <div className="flex justify-center">
          <Link 
            href="/book" 
            className="btn-shimmer hover-lift tap-active btn-amber btn-pill px-8 py-3 text-base font-semibold inline-flex items-center">
            Get a demo
            <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </div>
    </section>
  );
}