import { useEffect } from "react";
export function useParallax(selector: string, depth = 0.15){
  useEffect(()=>{
    const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if(!els.length) return;
    let raf = 0;
    const onScroll = ()=>{
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(()=>{
        const y = window.scrollY || 0;
        els.forEach(el=>el.style.setProperty("--pY", String(y * depth)));
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive:true });
    return ()=>{ cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); };
  },[selector, depth]);
}
