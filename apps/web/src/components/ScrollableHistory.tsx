import { useId } from "react";
import type { ReactNode } from "react";
import { useListScroll } from "../hooks/useListScroll";

export function ScrollableHistory({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: ReactNode;
}) {
  const scroll = useListScroll(count);
  const id = useId();
  if (!count) return null;
  return (
    <div className="mobility-scroll-list">
      <div
        className="mobility-scroll-controls"
        role="group"
        aria-label={`Cuộn ${label}`}
      >
        <button
          type="button"
          className="secondary"
          aria-controls={id}
          disabled={!scroll.canUp}
          onClick={scroll.up}
        >
          ↑ Lên
        </button>
        <button
          type="button"
          className="secondary"
          aria-controls={id}
          disabled={!scroll.canDown}
          onClick={scroll.down}
        >
          ↓ Xuống
        </button>
      </div>
      <div
        id={id}
        className="mobility-scroll-viewport"
        role="region"
        aria-label={label}
        tabIndex={0}
        ref={scroll.viewport}
        onScroll={scroll.measure}
      >
        <div
          className="mobility-list mobility-list-vertical"
          ref={scroll.content}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
