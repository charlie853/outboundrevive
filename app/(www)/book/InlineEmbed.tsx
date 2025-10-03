"use client";
import { useEffect, useRef } from "react";

declare global {
  interface Window { Cal?: any }
}

export default function InlineEmbed({ calLink, namespace = "demo30min" }: { calLink: string; namespace?: string }) {
  const loadedRef = useRef(false);
  const id = `cal-inline-${namespace}`;

  useEffect(() => {
    if (!calLink) return;
    if (loadedRef.current) return;
    loadedRef.current = true;

    function init(origin: 'https://cal.com' | 'https://app.cal.com') {
      try {
        const C = window as any;
        const d = document;
        C.Cal = C.Cal || function () {
          const cal = C.Cal; const ar = arguments as IArguments;
          if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; cal.loaded = true; }
          if (ar[0] === "init") {
            const api = function () { (api as any).q.push(arguments); } as any; const namespace = (ar as any)[1]; (api as any).q = (api as any).q || [];
            if (typeof namespace === "string") { cal.ns[namespace] = cal.ns[namespace] || api; (cal.ns[namespace] as any).q = (cal.ns[namespace] as any).q || []; (cal as any).q.push(["initNamespace", namespace]); }
            (cal as any).q.push(ar);
            return;
          }
          (cal as any).q.push(ar);
        }
        C.Cal("init", namespace, { origin });
        C.Cal.ns[namespace]("inline", { elementOrSelector: `#${id}`, config: { layout: "month_view" }, calLink });
        C.Cal.ns[namespace]("ui", { hideEventTypeDetails: false, layout: "month_view" });
      } catch (e) {
        // ignore; Cal script loader will attempt again
      }
    }

    // Loader that tries cal.com first, then app.cal.com as a fallback
    const tried: string[] = [];
    function loadFrom(src: string, origin: 'https://cal.com' | 'https://app.cal.com') {
      tried.push(src);
      const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
      if (existing && (existing as any)._loaded) { init(origin); return; }
      const s = existing || document.createElement('script');
      s.src = src;
      s.async = true;
      (s as any)._loaded = true;
      s.onload = () => init(origin);
      s.onerror = () => {
        if (src.includes('cal.com/embed/embed.js') && !src.includes('app.cal.com')) {
          // try fallback host
          loadFrom('https://app.cal.com/embed/embed.js', 'https://app.cal.com');
        }
      };
      if (!existing) document.head.appendChild(s);
    }
    loadFrom('https://cal.com/embed/embed.js', 'https://cal.com');
  }, [calLink, id, namespace]);

  return (
    <div>
      <div id={id} style={{ width: "100%", minHeight: "720px", height: "720px", overflow: "auto" }} />
      <div className="mt-3 text-center text-ink-2 text-sm">
        If the calendar doesn’t load, open directly:
        <a className="ml-2 underline" href={`https://cal.com/${calLink}`} target="_blank" rel="noreferrer">cal.com/{calLink}</a>
      </div>
    </div>
  );
}
