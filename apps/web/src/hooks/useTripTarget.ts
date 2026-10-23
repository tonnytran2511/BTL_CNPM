import { useEffect, useState } from "react";

export function useTripTarget(userId?: string) {
  const [targets, setTargets] = useState<Record<string, string>>({});
  useEffect(() => setTargets({}), [userId]);
  return {
    targets,
    select: (tripId: string, hubId: string) =>
      setTargets((current) => ({ ...current, [tripId]: hubId })),
  };
}
