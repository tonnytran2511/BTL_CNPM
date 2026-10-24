import { useEffect, useSyncExternalStore } from "react";
import type { Role } from "@emobility/contracts";

function subscribe(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
const readHash = () => window.location.hash;

/** Bookmarkable navigation without adding a router dependency. */
export function useAppPage(role?: Role) {
  const hash = useSyncExternalStore(subscribe, readHash);
  const page =
    role !== "operator"
      ? "overview"
      : hash === "#/simulation" || hash === "#/simulation/guide"
        ? "simulation"
        : hash === "#/hubs/manage"
          ? "hub-management"
          : hash === "#/operations"
            ? "operations"
            : "overview";
  useEffect(() => {
    document.getElementById("main")?.focus();
    window.scrollTo(0, 0);
  }, [page]);
  return page;
}
