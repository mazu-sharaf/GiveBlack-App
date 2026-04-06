import { useState, useEffect } from "react";

/** Matches CSS max-width breakpoints (px). */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(query);
    const fn = () => setMatches(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [query]);

  return matches;
}

export function useIsMobile() {
  return useMediaQuery("(max-width: 639px)");
}

export function useIsTabletDown() {
  return useMediaQuery("(max-width: 1023px)");
}
