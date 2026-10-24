export interface PriorityPolicy {
  maximumWaitMinutes: number;
  urgencyWindowMinutes: number;
  lowBatteryPercent: number;
}
export interface PriorityCandidate {
  id: string;
  createdAt: string;
  requiredBy: string | null;
  batteryPercent: number;
}
/** Pure, deterministic BR-07 ordering; caller supplies DB clock and validated policy. */
export function prioritizeCharging<T extends PriorityCandidate>(
  items: readonly T[],
  policy: PriorityPolicy,
  now: number,
): T[] {
  const deadline = (v: T) =>
    v.requiredBy ? Date.parse(String(v.requiredBy)) : Infinity;
  const created = (v: T) => Date.parse(String(v.createdAt));
  const overdue = (v: T) =>
    now - created(v) >= policy.maximumWaitMinutes * 60000;
  const group = (v: T) =>
    deadline(v) <= now + policy.urgencyWindowMinutes * 60000
      ? 0
      : v.batteryPercent < policy.lowBatteryPercent
        ? 1
        : 2;
  return [...items].sort((a, b) => {
    const aOld = overdue(a),
      bOld = overdue(b);
    if (aOld !== bOld) return aOld ? -1 : 1;
    const id = () => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (aOld) return created(a) - created(b) || id();
    // Subtraction Infinity-Infinity is NaN, intentionally falling through to next tie breaker.
    return (
      group(a) - group(b) ||
      deadline(a) - deadline(b) ||
      a.batteryPercent - b.batteryPercent ||
      created(a) - created(b) ||
      id()
    );
  });
}
