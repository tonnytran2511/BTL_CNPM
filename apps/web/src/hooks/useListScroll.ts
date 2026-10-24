import { useCallback, useEffect, useRef, useState } from "react";

export function useListScroll(itemCount: number) {
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [canUp, setCanUp] = useState(false);
  const [canDown, setCanDown] = useState(false);
  const measure = useCallback(() => {
    const element = viewport.current;
    if (!element) return;
    setCanUp(element.scrollTop > 1);
    setCanDown(
      element.scrollTop + element.clientHeight < element.scrollHeight - 1,
    );
  }, []);
  useEffect(() => {
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (viewport.current) observer?.observe(viewport.current);
    if (content.current) observer?.observe(content.current);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [itemCount, measure]);
  const move = (direction: number) => {
    const element = viewport.current;
    if (!element) return;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    element.scrollBy({
      top: direction * Math.max(element.clientHeight * 0.8, 100),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };
  return {
    viewport,
    content,
    canUp,
    canDown,
    measure,
    up: () => move(-1),
    down: () => move(1),
  };
}
