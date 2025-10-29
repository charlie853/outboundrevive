import { useEffect } from "react";
export function useInView(selector: string, cls = "in-view"){
  useEffect(()=>{
    const els = Array.from(document.querySelectorAll<HTMLElement>(selector));
    if(!("IntersectionObserver" in window) || !els.length) return;
    const io = new IntersectionObserver(es=>{
      es.forEach(e=> e.isIntersecting && (e.target as HTMLElement).classList.add(cls));
    }, { threshold:0.3 });
    els.forEach(el=>io.observe(el));
    return ()=>io.disconnect();
  },[selector, cls]);
}
