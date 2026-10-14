/** Browser timers accept a signed 32-bit delay in milliseconds. */
export function parseRequestTimeout(value: unknown): number {
  const milliseconds = Number(value);
  if (
    !Number.isInteger(milliseconds) ||
    milliseconds <= 0 ||
    milliseconds > 2 ** 31 - 1
  )
    throw new Error("VITE_API_TIMEOUT_MS must be a positive 32-bit integer.");
  return milliseconds;
}
