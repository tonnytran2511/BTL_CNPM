import { useRef } from "react";

/** Native modal manages keyboard focus, Escape and return to the opener. */
export function useGuideDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  return {
    ref,
    open: () => ref.current?.showModal(),
    close: () => ref.current?.close(),
  };
}
