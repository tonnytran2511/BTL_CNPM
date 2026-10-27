import { useState } from "react";

export function useSimulationView() {
  const [view, setView] = useState<"scenarios" | "legacy">(() =>
    window.location.hash === "#/simulation/guide" ? "legacy" : "scenarios",
  );
  return {
    view,
    select: (value: string) => {
      if (value === "scenarios" || value === "legacy") setView(value);
    },
  };
}
